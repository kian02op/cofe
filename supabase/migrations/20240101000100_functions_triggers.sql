-- ============================================================================
-- Migration 0002 — Security helper functions, triggers, plan-limit enforcement
-- ============================================================================

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger trg_cafes_updated_at            before update on public.cafes                 for each row execute function public.set_updated_at();
create trigger trg_profiles_updated_at         before update on public.profiles              for each row execute function public.set_updated_at();
create trigger trg_memberships_updated_at      before update on public.cafe_memberships      for each row execute function public.set_updated_at();
create trigger trg_categories_updated_at       before update on public.categories            for each row execute function public.set_updated_at();
create trigger trg_products_updated_at         before update on public.products              for each row execute function public.set_updated_at();
create trigger trg_product_tr_updated_at       before update on public.product_translations  for each row execute function public.set_updated_at();
create trigger trg_category_tr_updated_at      before update on public.category_translations for each row execute function public.set_updated_at();
create trigger trg_subscriptions_updated_at    before update on public.subscriptions         for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Authorization helpers (SECURITY DEFINER — read-only, no user input)
-- ---------------------------------------------------------------------------

create function public.is_super_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and platform_role = 'super_admin'
  );
$$;

create function public.is_cafe_member(p_cafe_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.cafe_memberships
    where user_id = auth.uid() and cafe_id = p_cafe_id
  );
$$;

-- ---------------------------------------------------------------------------
-- Service state (subscription enforcement for public access)
-- Policy (documented in README):
--   active    -> public menu + dashboard work normally
--   expired   -> public menu shows "subscription expired" message; dashboard write-locked
--   suspended -> public menu disabled; dashboard read-only for subscription info
--   cancelled -> access removed immediately (data retained, restorable by owner)
-- ---------------------------------------------------------------------------

create function public.cafe_service_state(p_cafe_id uuid) returns text
language sql stable security definer set search_path = public as $$
  select case
    when c.id is null then 'not_found'
    when c.status = 'suspended' then 'suspended'
    when c.status = 'cancelled' then 'cancelled'
    when s.status in ('active','trial')
         and (s.expires_at is null or s.expires_at > now()) then 'active'
    when s.status in ('active','trial','expired') then 'expired'
    when s.status = 'suspended' then 'suspended'
    when s.status = 'cancelled' then 'cancelled'
    else 'expired'
  end
  from public.cafes c
  left join public.subscriptions s on s.cafe_id = c.id
  where c.id = p_cafe_id;
$$;

-- ---------------------------------------------------------------------------
-- Slug validation (shared rule; also implemented client-side in utils.js)
-- ---------------------------------------------------------------------------

create function public.is_valid_slug(p_slug text) returns boolean
language sql immutable as $$
  select p_slug ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$'
         and p_slug !~ '--'
         and p_slug not in (
           'admin','login','superadmin','api','cafe','qr-print','assets',
           'js','css','images','img','docs','static','_redirects','index.html'
         );
$$;

create function public.enforce_cafe_slug() returns trigger
language plpgsql as $$
begin
  if new.slug is null or not public.is_valid_slug(new.slug::text) then
    raise exception 'INVALID_SLUG';
  end if;
  return new;
end $$;

create trigger trg_cafes_slug before insert or update of slug on public.cafes
  for each row execute function public.enforce_cafe_slug();

-- ---------------------------------------------------------------------------
-- New auth user -> profile (default platform_role = 'user')
-- NOTE: no automatic super-admin. Super admins are promoted manually via SQL
-- (see docs: "Create the first super administrator securely").
-- ---------------------------------------------------------------------------

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Block profile role changes coming from normal clients.
-- platform_role is only changed via SQL editor / service role.
create function public.protect_platform_role() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.platform_role <> old.platform_role and not auth.jwt()::jsonb ->> 'role' = 'service_role' then
    raise exception 'PLATFORM_ROLE_IS_IMMUTABLE';
  end if;
  return new;
end $$;

create trigger trg_profiles_protect_role before update on public.profiles
  for each row execute function public.protect_platform_role();

-- ---------------------------------------------------------------------------
-- Plan limits (single source of truth: public.plan_limits, seeded in 0005)
-- Enforcement happens in the DATABASE so it cannot be bypassed by
-- manipulating frontend requests.
-- ---------------------------------------------------------------------------

create function public.cafe_plan_code(p_cafe_id uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select s.plan_code from public.subscriptions s where s.cafe_id = p_cafe_id),
    'base'
  );
$$;

create function public.enforce_active_service_on_menu_writes() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_cafe uuid := coalesce(new.cafe_id, old.cafe_id);
  v_state text := public.cafe_service_state(v_cafe);
begin
  -- Platform owner can always fix data (restore, reactivate, ...)
  if public.is_super_admin() then
    return coalesce(new, old);
  end if;
  if v_state <> 'active' then
    raise exception 'CAFE_SERVICE_%', upper(v_state);
  end if;
  return coalesce(new, old);
end $$;

create trigger trg_products_service_write before insert or update or delete on public.products
  for each row execute function public.enforce_active_service_on_menu_writes();
create trigger trg_categories_service_write before insert or update or delete on public.categories
  for each row execute function public.enforce_active_service_on_menu_writes();
create trigger trg_product_tr_service_write before insert or update or delete on public.product_translations
  for each row execute function public.enforce_active_service_on_menu_writes();
create trigger trg_category_tr_service_write before insert or update or delete on public.category_translations
  for each row execute function public.enforce_active_service_on_menu_writes();

create function public.enforce_product_limits() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_cafe  uuid := new.cafe_id;
  v_count integer;
  v_max   integer;
begin
  if public.is_super_admin() then return new; end if;

  if new.badge is not null then
    if not coalesce(
      (select (l.features->>'badges')::boolean from public.plan_limits l
        where l.plan_code = public.cafe_plan_code(v_cafe)), false) then
      raise exception 'PLAN_FEATURE_BADGES_LOCKED';
    end if;
  end if;

  select l.max_products into v_max from public.plan_limits l
    where l.plan_code = public.cafe_plan_code(v_cafe);
  select count(*) into v_count from public.products where cafe_id = v_cafe;
  if v_count >= v_max then
    raise exception 'PLAN_LIMIT_PRODUCTS_REACHED';
  end if;
  return new;
end $$;

create trigger trg_products_plan_limit before insert on public.products
  for each row execute function public.enforce_product_limits();

create function public.enforce_category_limits() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
  v_max   integer;
begin
  if public.is_super_admin() then return new; end if;
  select l.max_categories into v_max from public.plan_limits l
    where l.plan_code = public.cafe_plan_code(new.cafe_id);
  select count(*) into v_count from public.categories where cafe_id = new.cafe_id;
  if v_count >= v_max then
    raise exception 'PLAN_LIMIT_CATEGORIES_REACHED';
  end if;
  return new;
end $$;

create trigger trg_categories_plan_limit before insert on public.categories
  for each row execute function public.enforce_category_limits();

create function public.enforce_cafe_language_limits() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_max integer;
begin
  if public.is_super_admin() then return new; end if;
  select l.max_languages into v_max from public.plan_limits l
    where l.plan_code = public.cafe_plan_code(new.id);
  if new.languages is null or array_length(new.languages, 1) is null
     or array_length(new.languages, 1) > v_max then
    raise exception 'PLAN_LIMIT_LANGUAGES_REACHED';
  end if;
  if not (new.default_language = any (new.languages)) then
    raise exception 'DEFAULT_LANGUAGE_MUST_BE_ENABLED';
  end if;
  return new;
end $$;

create trigger trg_cafes_language_limit before insert or update of languages, default_language on public.cafes
  for each row execute function public.enforce_cafe_language_limits();

-- Translation cafe_id must always match its parent row (anti tenant-mixing guard)
create function public.enforce_translation_cafe() returns trigger
language plpgsql as $$
declare v_ok boolean;
begin
  if tg_table_name = 'product_translations' then
    select exists(select 1 from public.products p
                  where p.id = new.product_id and p.cafe_id = new.cafe_id) into v_ok;
  else
    select exists(select 1 from public.categories c
                  where c.id = new.category_id and c.cafe_id = new.cafe_id) into v_ok;
  end if;
  if not v_ok then raise exception 'TRANSLATION_CAFE_MISMATCH'; end if;
  return new;
end $$;

create trigger trg_product_tr_cafe before insert or update on public.product_translations
  for each row execute function public.enforce_translation_cafe();
create trigger trg_category_tr_cafe before insert or update on public.category_translations
  for each row execute function public.enforce_translation_cafe();
