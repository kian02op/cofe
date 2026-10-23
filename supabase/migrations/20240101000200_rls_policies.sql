-- ============================================================================
-- Migration 0003 — Row Level Security + public data views + grants
--
-- Model:
--   * anon            -> ONLY the public_menu_* views (already filtered by
--                        service state & visibility). NO direct table access.
--   * authenticated   -> direct tables, but every statement passes RLS which
--                        restricts rows to the user's own cafe membership
--                        (or super admin).
--   * service_role    -> Edge Functions only (bypasses RLS), never shipped to
--                        the browser.
--
-- The public_menu_* views are intentionally owner-privileged views (they run
-- as `postgres` and bypass RLS) exposing ONLY public columns of ONLY rows the
-- public is meant to see. This is the documented separation between public
-- menu data and private management data.
-- ============================================================================

alter table public.cafes                 enable row level security;
alter table public.profiles              enable row level security;
alter table public.cafe_memberships      enable row level security;
alter table public.categories            enable row level security;
alter table public.products              enable row level security;
alter table public.product_translations  enable row level security;
alter table public.category_translations enable row level security;
alter table public.subscriptions         enable row level security;
alter table public.plan_limits           enable row level security;
alter table public.analytics_events      enable row level security;

-- ---------------------------------------------------------------------------
-- cafes
-- ---------------------------------------------------------------------------
create policy cafes_select on public.cafes for select to authenticated
  using (public.is_cafe_member(id) or public.is_super_admin());
create policy cafes_insert on public.cafes for insert to authenticated
  with check (public.is_super_admin());
create policy cafes_update on public.cafes for update to authenticated
  using (public.is_cafe_member(id) or public.is_super_admin())
  with check (public.is_cafe_member(id) or public.is_super_admin());
create policy cafes_delete on public.cafes for delete to authenticated
  using (public.is_super_admin());

-- Members may not flip their own cafe status (platform owner decision)
revoke update (status) on public.cafes from authenticated;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_super_admin());
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
-- Only display_name is updatable by users (column grant below); the
-- protect_platform_role trigger additionally blocks role changes.

-- ---------------------------------------------------------------------------
-- cafe_memberships
-- ---------------------------------------------------------------------------
create policy memberships_select on public.cafe_memberships for select to authenticated
  using (user_id = auth.uid() or public.is_super_admin());
create policy memberships_insert on public.cafe_memberships for insert to authenticated
  with check (public.is_super_admin());
create policy memberships_delete on public.cafe_memberships for delete to authenticated
  using (public.is_super_admin());

-- ---------------------------------------------------------------------------
-- categories
-- ---------------------------------------------------------------------------
create policy categories_select on public.categories for select to authenticated
  using (public.is_cafe_member(cafe_id) or public.is_super_admin());
create policy categories_insert on public.categories for insert to authenticated
  with check (public.is_cafe_member(cafe_id));
create policy categories_update on public.categories for update to authenticated
  using (public.is_cafe_member(cafe_id) or public.is_super_admin())
  with check (public.is_cafe_member(cafe_id) or public.is_super_admin());
create policy categories_delete on public.categories for delete to authenticated
  using (public.is_cafe_member(cafe_id) or public.is_super_admin());

-- ---------------------------------------------------------------------------
-- products
-- ---------------------------------------------------------------------------
create policy products_select on public.products for select to authenticated
  using (public.is_cafe_member(cafe_id) or public.is_super_admin());
create policy products_insert on public.products for insert to authenticated
  with check (public.is_cafe_member(cafe_id));
create policy products_update on public.products for update to authenticated
  using (public.is_cafe_member(cafe_id) or public.is_super_admin())
  with check (public.is_cafe_member(cafe_id) or public.is_super_admin());
create policy products_delete on public.products for delete to authenticated
  using (public.is_cafe_member(cafe_id) or public.is_super_admin());

-- ---------------------------------------------------------------------------
-- translations
-- ---------------------------------------------------------------------------
create policy product_tr_select on public.product_translations for select to authenticated
  using (public.is_cafe_member(cafe_id) or public.is_super_admin());
create policy product_tr_insert on public.product_translations for insert to authenticated
  with check (public.is_cafe_member(cafe_id));
create policy product_tr_update on public.product_translations for update to authenticated
  using (public.is_cafe_member(cafe_id)) with check (public.is_cafe_member(cafe_id));
create policy product_tr_delete on public.product_translations for delete to authenticated
  using (public.is_cafe_member(cafe_id));

create policy category_tr_select on public.category_translations for select to authenticated
  using (public.is_cafe_member(cafe_id) or public.is_super_admin());
create policy category_tr_insert on public.category_translations for insert to authenticated
  with check (public.is_cafe_member(cafe_id));
create policy category_tr_update on public.category_translations for update to authenticated
  using (public.is_cafe_member(cafe_id)) with check (public.is_cafe_member(cafe_id));
create policy category_tr_delete on public.category_translations for delete to authenticated
  using (public.is_cafe_member(cafe_id));

-- ---------------------------------------------------------------------------
-- subscriptions (read by member; managed ONLY by super admin / service role)
-- ---------------------------------------------------------------------------
create policy subscriptions_select on public.subscriptions for select to authenticated
  using (public.is_cafe_member(cafe_id) or public.is_super_admin());
create policy subscriptions_insert on public.subscriptions for insert to authenticated
  with check (public.is_super_admin());
create policy subscriptions_update on public.subscriptions for update to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
create policy subscriptions_delete on public.subscriptions for delete to authenticated
  using (public.is_super_admin());

-- ---------------------------------------------------------------------------
-- plan_limits (non-sensitive configuration, readable by authenticated users)
-- ---------------------------------------------------------------------------
create policy plan_limits_select on public.plan_limits for select to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- analytics_events (NO public writes — Edge Function with service role only)
-- ---------------------------------------------------------------------------
create policy analytics_select on public.analytics_events for select to authenticated
  using (public.is_cafe_member(cafe_id) or public.is_super_admin());

-- ---------------------------------------------------------------------------
-- Public data views (the ONLY thing anon can touch)
-- ---------------------------------------------------------------------------

create view public.public_menu_cafes as
  select
    c.id, c.name, c.slug, c.description, c.logo_path, c.cover_image_path,
    c.address, c.phone, c.opening_hours, c.social_links,
    c.default_language, c.languages, c.currency_code, c.currency_display,
    c.price_divisor, c.theme_settings, c.hide_unavailable,
    public.cafe_service_state(c.id) as service_state
  from public.cafes c
  where c.status <> 'cancelled';

create view public.public_menu_categories as
  select cat.id, cat.cafe_id, cat.name, cat.description, cat.display_order
  from public.categories cat
  where cat.is_visible
    and public.cafe_service_state(cat.cafe_id) = 'active';

create view public.public_menu_products as
  select p.id, p.cafe_id, p.category_id, p.name, p.description,
         p.price_minor, p.image_path, p.is_available, p.badge, p.display_order,
         p.updated_at
  from public.products p
  where p.is_visible
    and public.cafe_service_state(p.cafe_id) = 'active';

create view public.public_menu_product_translations as
  select t.id, t.product_id, t.cafe_id, t.lang, t.name, t.description
  from public.product_translations t
  where public.cafe_service_state(t.cafe_id) = 'active';

create view public.public_menu_category_translations as
  select t.id, t.category_id, t.cafe_id, t.lang, t.name
  from public.category_translations t
  where public.cafe_service_state(t.cafe_id) = 'active';

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon;

-- anon/authenticated: views only
grant select on public.public_menu_cafes,
                public.public_menu_categories,
                public.public_menu_products,
                public.public_menu_product_translations,
                public.public_menu_category_translations
  to anon, authenticated;

-- authenticated: row-filtered CRUD via RLS
grant select, insert, update, delete on public.cafes                to authenticated;
grant select                     on public.profiles                 to authenticated;
grant update (display_name, updated_at) on public.profiles          to authenticated;
grant select, insert, delete            on public.cafe_memberships  to authenticated;
grant select, insert, update, delete on public.categories            to authenticated;
grant select, insert, update, delete on public.products              to authenticated;
grant select, insert, update, delete on public.product_translations  to authenticated;
grant select, insert, update, delete on public.category_translations to authenticated;
grant select                     on public.subscriptions            to authenticated;
grant select                     on public.plan_limits              to authenticated;
grant select                     on public.analytics_events         to authenticated;

grant execute on function public.is_super_admin(),
                             public.is_cafe_member(uuid),
                             public.cafe_service_state(uuid),
                             public.cafe_plan_code(uuid)
  to anon, authenticated;
