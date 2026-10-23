-- ============================================================================
-- DEMO SEED (OPTIONAL, CLEARLY IDENTIFIED DEMO DATA — not production data)
-- Creates one demo cafe with categories/products so a fresh project has
-- something to show. Run AFTER migrations 0001-0005.
--
-- NOTE: This file does NOT create auth users (Supabase auth users must be
-- created via the Dashboard or the admin API). After creating a user in the
-- Dashboard, assign it to the demo cafe with the INSERT shown in the NOTICE.
-- ============================================================================

do $$
declare
  v_cafe uuid;
  v_cat_coffee uuid;
  v_cat_hot    uuid;
  v_cat_cold   uuid;
  v_cat_cake   uuid;
  v_cat_dessert uuid;
  v_cat_special uuid;
begin
  insert into public.cafes (name, slug, description, phone, currency_code, currency_display, price_divisor, default_language, languages, opening_hours, social_links, status)
  values (
    'کافه نمونه (دمو)', 'demo-cafe',
    'یک کافه دمو برای آشنایی با پلتفرم. این داده‌ها نمونه هستند و باید پیش از استفاده واقعی حذف شوند.',
    '۰۲۱-۱۲۳۴۵۶۷۸', 'IRR', 'تومان', 1, 'fa', '{fa}',
    '[{"label":"همه روزه","value":"۸:۰۰ تا ۲۳:۰۰"}]'::jsonb,
    '{"instagram":"https://instagram.com/example"}'::jsonb,
    'active'
  )
  returning id into v_cafe;

  insert into public.subscriptions (cafe_id, plan_code, status, starts_at, expires_at)
  values (v_cafe, 'professional', 'active', now(), now() + interval '365 days');

  insert into public.categories (cafe_id, name, display_order) values (v_cafe, 'قهوه', 1)
    returning id into v_cat_coffee;
  insert into public.categories (cafe_id, name, display_order) values (v_cafe, 'نوشیدنی گرم', 2)
    returning id into v_cat_hot;
  insert into public.categories (cafe_id, name, display_order) values (v_cafe, 'نوشیدنی سرد', 3)
    returning id into v_cat_cold;
  insert into public.categories (cafe_id, name, display_order) values (v_cafe, 'کیک', 4)
    returning id into v_cat_cake;
  insert into public.categories (cafe_id, name, display_order) values (v_cafe, 'دسر', 5)
    returning id into v_cat_dessert;
  insert into public.categories (cafe_id, name, display_order) values (v_cafe, 'پیشنهاد ویژه', 6)
    returning id into v_cat_special;

  insert into public.products (cafe_id, category_id, name, description, price_minor, is_available, badge, display_order) values
    (v_cafe, v_cat_coffee,  'اسپرسو', 'یک شات قهوه غلیظ و تازه', 8500000, true, null, 1),
    (v_cafe, v_cat_coffee,  'کاپوچینو', 'اسپرسو با شیر بخارپز و فوم مخملی', 12000000, true, 'popular', 2),
    (v_cafe, v_cat_coffee,  'لاته', 'شیر ابریشمی با لاته آرت', 13500000, true, null, 3),
    (v_cafe, v_cat_hot,     'چای ماسالا', 'چای هندی با ادویه و شیر', 9500000, true, null, 1),
    (v_cafe, v_cat_hot,     'دمنوش به و نعنا', 'آرام‌بخش و خوش‌عطر', 8000000, false, null, 2),
    (v_cafe, v_cat_cold,    'آیس لاته', 'لاته سرد با یخ', 14500000, true, 'new', 1),
    (v_cafe, v_cat_cold,    'موخیتو', 'نعنا، لیموترش و سودا', 13000000, true, null, 2),
    (v_cafe, v_cat_cake,    'چیزکیک نیویورکی', 'با سس توت‌فرنگی', 18000000, true, 'special', 1),
    (v_cafe, v_cat_dessert, 'تییرامیسو', 'دسر ایتالیایی کلاسیک', 16500000, true, 'popular', 1),
    (v_cafe, v_cat_dessert, 'براونی', 'شکلات تلخ با گردو', 14000000, true, null, 2),
    (v_cafe, v_cat_special, 'کمبو صبحانه', 'قهوه + کیک روز', 22000000, true, 'special', 1);

  raise notice 'DEMO cafe created (id=%, slug=demo-cafe).', v_cafe;
  raise notice 'Assign your admin user with:';
  raise notice '  insert into public.cafe_memberships (cafe_id, user_id, role)';
  raise notice '  values (''%''::uuid, ''<AUTH_USER_UUID>'', ''admin'');', v_cafe;
end $$;
