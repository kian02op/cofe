-- ============================================================================
-- RLS / tenant-isolation tests (pgTAP)
-- Run with: pg_prove -d postgres supabase/tests/rls_tests.sql
-- or paste into Supabase SQL editor after installing pgTAP
--   (create extension pgtap;)
--
-- IMPORTANT: tests create+drop their own fixtures and reset state at the end.
-- ============================================================================

begin;
create extension if not exists pgtap;

select plan(9);

-- Fixtures -----------------------------------------------------------------
insert into auth.users (id, email, encrypted_password, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 't-admin-a@test.local', 'x', '{"display_name":"Admin A"}'),
  ('22222222-2222-2222-2222-222222222222', 't-admin-b@test.local', 'x', '{"display_name":"Admin B"}'),
  ('33333333-3333-3333-3333-333333333333', 't-super@test.local',   'x', '{"display_name":"Super"}'),
  ('44444444-4444-4444-4444-444444444444', 't-nobody@test.local',  'x', '{"display_name":"Nobody"}')
on conflict (id) do nothing;

insert into public.profiles (id, platform_role) values
  ('11111111-1111-1111-1111-111111111111', 'user'),
  ('22222222-2222-2222-2222-222222222222', 'user'),
  ('33333333-3333-3333-3333-333333333333', 'super_admin'),
  ('44444444-4444-4444-4444-444444444444', 'user')
on conflict (id) do nothing;

insert into public.cafes (id, name, slug) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Cafe A', 'test-cafe-a'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'Cafe B', 'test-cafe-b');

insert into public.subscriptions (cafe_id, plan_code, status, expires_at) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'base', 'active', now() + interval '30 days'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'base', 'active', now() + interval '30 days');

insert into public.cafe_memberships (cafe_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'admin'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'admin');

insert into public.categories (id, cafe_id, name) values
  ('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Cat A1'),
  ('cccccccc-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000002', 'Cat B1');

insert into public.products (id, cafe_id, category_id, name, price_minor) values
  ('dddddddd-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'Latte A', 100),
  ('dddddddd-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000002', 'Latte B', 100);

-- Tests --------------------------------------------------------------------

-- 1) Admin A sees only own cafe rows
select set_claim('11111111-1111-1111-1111-111111111111', 'role', 'authenticated');
select set_claim('11111111-1111-1111-1111-111111111111', 'sub',  '11111111-1111-1111-1111-111111111111');
select is(
  (select count(*)::int from public.products where cafe_id = 'aaaaaaaa-0000-0000-0000-000000000002'),
  0, 'admin A cannot see cafe B products');

-- 2) Admin A cannot update cafe B product
select throws_ok(
  $t$ update public.products set price_minor = 1 where id = 'dddddddd-0000-0000-0000-000000000002' $t$,
  'new row violates row-level security policy for table "products"',
  'admin A cannot modify cafe B product');

-- 3) Normal user cannot promote self to super admin
select throws_ok(
  $t$ update public.profiles set platform_role = 'super_admin' where id = '11111111-1111-1111-1111-111111111111' $t$,
  'PLATFORM_ROLE_IS_IMMUTABLE',
  'platform_role is immutable from client');

-- 4) Unauthenticated anon sees no base-table rows (grants revoked)
select is(
  (select has_table_privilege('anon', 'public.products', 'SELECT')),
  false, 'anon has no direct SELECT on products');

-- 5) anon CAN read public view
select is(
  (select has_table_privilege('anon', 'public.public_menu_products', 'SELECT')),
  true, 'anon can read public_menu_products view');

-- 6) Plan limit: Base (50) blocked on 51st insert by Admin A
select set_claim('11111111-1111-1111-1111-111111111111', 'role', 'authenticated');
select set_claim('11111111-1111-1111-1111-111111111111', 'sub',  '11111111-1111-1111-1111-111111111111');
insert into public.products (cafe_id, category_id, name, price_minor)
select 'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'Filler ' || g, g
from generate_series(1, 49) g;
select throws_ok(
  $t$ insert into public.products (cafe_id, category_id, name, price_minor)
      values ('aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'Overflow', 1) $t$,
  'PLAN_LIMIT_PRODUCTS_REACHED',
  'base plan product limit enforced in DB');

-- 7) Expired subscription blocks menu writes
update public.subscriptions set expires_at = now() - interval '1 day'
  where cafe_id = 'aaaaaaaa-0000-0000-0000-000000000001';
select throws_ok(
  $t$ insert into public.products (cafe_id, category_id, name, price_minor)
      values ('aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'After expiry', 1) $t$,
  'CAFE_SERVICE_EXPIRED',
  'expired subscription blocks product writes');

-- 8) Suspended cafe hidden from public menu view
update public.cafes set status = 'suspended' where id = 'aaaaaaaa-0000-0000-0000-000000000002';
select is(
  (select count(*)::int from public.public_menu_products
    where cafe_id = 'aaaaaaaa-0000-0000-0000-000000000002'),
  0, 'suspended cafe products not in public view');

-- 9) anon cannot insert analytics directly
select is(
  (select has_table_privilege('anon', 'public.analytics_events', 'INSERT')),
  false, 'anon cannot write analytics directly');

-- Cleanup -------------------------------------------------------------------
select set_claim('33333333-3333-3333-3333-333333333333', 'role', 'service_role');
delete from public.cafes where id like 'aaaaaaaa-%';
delete from auth.users where id like '11111111-%' or id like '22222222-%' or id like '33333333-%' or id like '44444444-%';

select * from finish();
rollback;
