-- ============================================================================
-- Migration 0005 — Plan configuration (single source of truth)
-- Change limits HERE (or via super admin later); never in app code.
-- ============================================================================

insert into public.plan_limits
  (plan_code, max_products, max_categories, max_languages, max_image_file_mb, storage_quota_mb, features)
values
  ('base',
   50,   -- max active products
   10,   -- max categories
   1,    -- one menu language
   2,    -- max image file size (MB)
   50,   -- storage quota (MB)
   '{"badges": false, "advanced_analytics": false, "extended_theme": false}'::jsonb),
  ('professional',
   200,  -- max active products
   30,   -- max categories
   3,    -- up to 3 menu languages
   4,    -- max image file size (MB)
   500,  -- storage quota (MB)
   '{"badges": true, "advanced_analytics": true, "extended_theme": true}'::jsonb)
on conflict (plan_code) do update set
  max_products      = excluded.max_products,
  max_categories    = excluded.max_categories,
  max_languages     = excluded.max_languages,
  max_image_file_mb = excluded.max_image_file_mb,
  storage_quota_mb  = excluded.storage_quota_mb,
  features          = excluded.features;
