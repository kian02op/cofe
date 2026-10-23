-- ============================================================================
-- Migration 0001 — Initial schema
-- Multi-Tenant Cafe Digital Menu SaaS (MVP)
--
-- Conventions:
--   * Money is stored as INTEGER MINOR UNITS (price_minor) to avoid floating
--     point rounding errors. Display currency/label/divisor is cafe-level.
--   * Slugs are citext (case-insensitive) and validated by trigger.
--   * All tables have created_at / updated_at (updated_at maintained by trigger).
--   * Localized content lives in *_translations tables (extensible format).
-- ============================================================================

create extension if not exists citext;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.cafes (
  id                uuid primary key default gen_random_uuid(),
  name              text not null check (char_length(btrim(name)) between 2 and 120),
  slug              citext not null unique,
  description       text,
  logo_path         text,
  cover_image_path  text,
  address           text,
  phone             text,
  opening_hours     jsonb not null default '[]'::jsonb,   -- [{label:"شنبه تا چهارشنبه", value:"۸:۰۰ تا ۲۲:۰۰"}]
  social_links      jsonb not null default '{}'::jsonb,   -- {"instagram":"...","telegram":"...","website":"..."}
  default_language  text not null default 'fa' check (default_language in ('fa','en')),
  languages         text[] not null default '{fa}' check (array_length(languages,1) >= 1),
  currency_code     text not null default 'IRR' check (char_length(currency_code) = 3),
  currency_display  text,                                  -- e.g. "تومان" ; when null -> Intl currency format
  price_divisor     integer not null default 1 check (price_divisor >= 1), -- e.g. 10 to show Rial prices as Toman
  theme_settings    jsonb not null default '{}'::jsonb,    -- {primary:"#..",radius:12,font_scale:1,...}
  hide_unavailable  boolean not null default false,        -- hide unavailable products from public menu
  status            text not null default 'active'
                      check (status in ('active','suspended','cancelled')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  display_name   text,
  platform_role  text not null default 'user' check (platform_role in ('user','super_admin')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table public.cafe_memberships (
  id          uuid primary key default gen_random_uuid(),
  cafe_id     uuid not null references public.cafes (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  role        text not null default 'admin' check (role in ('admin')),
  created_at  timestamptz not null default now(),
  unique (cafe_id, user_id)
);

create table public.categories (
  id             uuid primary key default gen_random_uuid(),
  cafe_id        uuid not null references public.cafes (id) on delete cascade,
  name           text not null check (char_length(btrim(name)) between 1 and 80),
  description    text,
  display_order  integer not null default 0,
  is_visible     boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (cafe_id, name)
);

create table public.products (
  id             uuid primary key default gen_random_uuid(),
  cafe_id        uuid not null references public.cafes (id) on delete cascade,
  category_id    uuid references public.categories (id) on delete restrict, -- deliberate: app asks admin first
  name           text not null check (char_length(btrim(name)) between 1 and 160),
  description    text,
  price_minor    bigint not null check (price_minor >= 0),
  image_path     text,
  is_available   boolean not null default true,
  is_visible     boolean not null default true,
  badge          text check (badge in ('popular','new','special')),  -- Professional feature
  display_order  integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table public.product_translations (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references public.products (id) on delete cascade,
  cafe_id      uuid not null references public.cafes (id) on delete cascade, -- denormalized for RLS
  lang         text not null check (lang in ('fa','en')),
  name         text not null check (char_length(btrim(name)) between 1 and 160),
  description  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (product_id, lang)
);

create table public.category_translations (
  id           uuid primary key default gen_random_uuid(),
  category_id  uuid not null references public.categories (id) on delete cascade,
  cafe_id      uuid not null references public.cafes (id) on delete cascade, -- denormalized for RLS
  lang         text not null check (lang in ('fa','en')),
  name         text not null check (char_length(btrim(name)) between 1 and 80),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (category_id, lang)
);

create table public.subscriptions (
  id          uuid primary key default gen_random_uuid(),
  cafe_id     uuid not null unique references public.cafes (id) on delete cascade,
  plan_code   text not null default 'base' check (plan_code in ('base','professional')),
  status      text not null default 'trial'
                check (status in ('trial','active','expired','suspended','cancelled')),
  starts_at   timestamptz not null default now(),
  expires_at  timestamptz,             -- null = no expiration (documented policy)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.plan_limits (
  plan_code         text primary key check (plan_code in ('base','professional')),
  max_products      integer not null,
  max_categories    integer not null,
  max_languages     integer not null,
  max_image_file_mb integer not null,
  storage_quota_mb  integer not null,
  features          jsonb not null default '{}'::jsonb
  -- features: {"badges":true,"advanced_analytics":true,"extended_theme":true}
);

create table public.analytics_events (
  id           uuid primary key default gen_random_uuid(),
  cafe_id      uuid not null references public.cafes (id) on delete cascade,
  event_type   text not null check (event_type in ('menu_view','product_view','category_view','search')),
  product_id   uuid references public.products (id) on delete set null,
  category_id  uuid references public.categories (id) on delete set null,
  visit_date   date not null default (now() at time zone 'utc')::date,
  visitor_hash text,                              -- salted daily hash, NOT an IP/UA (no PII)
  metadata     jsonb not null default '{}'::jsonb,-- {lang, source} only
  occurred_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes (frequent lookups)
-- ---------------------------------------------------------------------------

create index idx_categories_cafe        on public.categories (cafe_id, display_order);
create index idx_products_cafe          on public.products (cafe_id, display_order);
create index idx_products_category      on public.products (cafe_id, category_id);
create index idx_products_visibility    on public.products (cafe_id, is_visible, is_available);
create index idx_memberships_user       on public.cafe_memberships (user_id);
create index idx_memberships_cafe       on public.cafe_memberships (cafe_id);
create index idx_subscriptions_cafe     on public.subscriptions (cafe_id, status);
create index idx_product_tr_lang        on public.product_translations (cafe_id, lang);
create index idx_category_tr_lang       on public.category_translations (cafe_id, lang);
create index idx_analytics_cafe_date    on public.analytics_events (cafe_id, occurred_at desc);
create index idx_analytics_cafe_type    on public.analytics_events (cafe_id, event_type, visit_date);
-- One menu_view per visitor per day (deduplication of "visits"):
create unique index uq_analytics_daily_visit
  on public.analytics_events (cafe_id, event_type, visit_date, visitor_hash)
  where event_type = 'menu_view' and visitor_hash is not null;
