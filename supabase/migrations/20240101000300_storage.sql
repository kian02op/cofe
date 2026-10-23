-- ============================================================================
-- Migration 0004 — Storage: public "cafe-assets" bucket, policies, quotas
--
-- Layout (paths are tenant-scoped by cafe id):
--   cafe-assets/cafes/{cafe_id}/branding/{filename}
--   cafe-assets/cafes/{cafe_id}/products/{filename}
--
-- The bucket is PUBLIC (read): menu images must render on public pages
-- without exposing any private file — only images intended for the menu are
-- ever stored here. All other data stays in the database behind RLS.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit)
values ('cafe-assets', 'cafe-assets', true, 4194304) -- 4 MB hard cap (plan quota checked below)
on conflict (id) do nothing;

-- Helper: extract cafe uuid from path "cafes/{uuid}/..."
create function public.cafe_id_from_path(p_path text) returns uuid
language sql immutable as $$
  select case
    when p_path ~ '^cafes/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
    then (split_part(p_path, '/', 2))::uuid
    else null
  end;
$$;

-- ---------------------------------------------------------------------------
-- Storage RLS policies
-- ---------------------------------------------------------------------------
create policy "cafe assets public read"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'cafe-assets');

create policy "cafe members upload own assets"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'cafe-assets'
    and public.is_cafe_member(public.cafe_id_from_path(name))
  );

create policy "cafe members update own assets"
  on storage.objects for update to authenticated
  using (bucket_id = 'cafe-assets'
         and (public.is_cafe_member(public.cafe_id_from_path(name)) or public.is_super_admin()))
  with check (bucket_id = 'cafe-assets'
         and public.is_cafe_member(public.cafe_id_from_path(name)));

create policy "cafe members delete own assets"
  on storage.objects for delete to authenticated
  using (bucket_id = 'cafe-assets'
         and (public.is_cafe_member(public.cafe_id_from_path(name)) or public.is_super_admin()));

-- ---------------------------------------------------------------------------
-- Upload validation: MIME type, per-file size, cumulative per-cafe quota.
-- Runs inside the database on every storage insert, so it cannot be skipped
-- by crafting client requests.
-- ---------------------------------------------------------------------------

create function public.enforce_cafe_asset_rules() returns trigger
language plpgsql security definer set search_path = public, storage as $$
declare
  v_cafe       uuid;
  v_mime       text;
  v_size       bigint;
  v_file_mb    integer;
  v_quota_mb   integer;
  v_used_bytes bigint;
begin
  if new.bucket_id is distinct from 'cafe-assets' then
    return new;
  end if;

  v_cafe := public.cafe_id_from_path(new.name);
  if v_cafe is null or not public.is_cafe_member(v_cafe) then
    raise exception 'ASSET_PATH_NOT_ALLOWED';
  end if;

  v_mime := coalesce(new.metadata->>'mimetype', '');
  if v_mime not in ('image/jpeg','image/png','image/webp') then
    raise exception 'UNSUPPORTED_IMAGE_TYPE'; -- SVG/animated/arbitrary files are rejected
  end if;

  v_size := coalesce((new.metadata->>'size')::bigint, 0);

  select l.max_image_file_mb, l.storage_quota_mb
    into v_file_mb, v_quota_mb
  from public.plan_limits l
  where l.plan_code = public.cafe_plan_code(v_cafe);

  if v_size > v_file_mb * 1024 * 1024 then
    raise exception 'IMAGE_FILE_TOO_LARGE';
  end if;

  select coalesce(sum((o.metadata->>'size')::bigint), 0)
    into v_used_bytes
  from storage.objects o
  where o.bucket_id = 'cafe-assets'
    and o.name like 'cafes/' || v_cafe::text || '/%'
    and o.id is distinct from new.id;

  if v_used_bytes + v_size > v_quota_mb * 1024 * 1024 then
    raise exception 'STORAGE_QUOTA_EXCEEDED';
  end if;

  return new;
end $$;

create trigger trg_cafe_asset_rules
  before insert on storage.objects
  for each row execute function public.enforce_cafe_asset_rules();

-- ---------------------------------------------------------------------------
-- Orphan cleanup (run manually or on a schedule; safe by construction):
--   delete from storage.objects
--   where bucket_id = 'cafe-assets'
--     and not exists (select 1 from public.cafes c where cafes/cafe_id path match ...)
-- See docs/DEPLOYMENT.md for the full cleanup script.
-- ---------------------------------------------------------------------------
