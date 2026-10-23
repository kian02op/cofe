# راهنمای استقرار (Deployment)

## ۰) پیش‌نیازها
- پروژه Supabase فعال + مایگریشن‌های اجراشده (بخش «راه‌اندازی واقعی» در README)
- Node.js ≥ 18 برای اسکریپت build
- اکانت Cloudflare (Pages)

## ۱) دیپلوی روی Cloudflare Pages

1. ریپو را در Cloudflare → Workers & Pages → Create → Pages → Connect to Git انتخاب کنید.
2. تنظیمات Build:
   - **Framework preset:** None
   - **Build command:** `node scripts/build.mjs`
   - **Build output directory:** `public`
3. Environment variables (Production):
   - `SUPABASE_URL = https://xxxx.supabase.co`
   - `SUPABASE_ANON_KEY = eyJ...` (کلید anon عمومی)
   - `SITE_URL = https://menu.example.com`
4. Deploy. فایل `public/_redirects` آدرس‌های تمیز (`/cafe/:slug`, `/login`, ...) را فعال می‌کند.

> سایت کاملاً استاتیک است؛ روی Netlify/Vercel/GitHub Pages هم می‌شود (برای Vercel مسیر `/cafe/:slug` را با rewrite مشابه `_redirects` بسازید).

## ۲) دامنه اختصاصی
1. Cloudflare Pages → Custom domains → دامنه را وصل کنید.
2. `SITE_URL` را در env به دامنه نهایی تغییر دهید و دوباره دیپلوی کنید.
3. Supabase:
   - `supabase secrets set ALLOWED_ORIGINS="https://menu.example.com"`
   - Authentication → URL Configuration → Site URL و Redirect URLs را با دامنه به‌روز کنید.

## ۳) Edge Functions روی محیط production

```bash
supabase link --project-ref <ref>
supabase functions deploy admin-create-user
supabase functions deploy track --no-verify-jwt
supabase secrets set ALLOWED_ORIGINS="https://menu.example.com"
supabase secrets set ANALYTICS_PEPPER="<رشته تصادفی ≥۳۲ کاراکتر>"
```

بررسی سلامت:

```bash
curl -X POST "https://xxxx.supabase.co/functions/v1/track" \
  -H "Authorization: Bearer <ANON_KEY>" -H "Content-Type: application/json" \
  -d '{"slug":"demo-cafe","event_type":"menu_view","source":"direct"}'
# پاسخ مورد انتظار: {"ok":true}
```

## ۴) اسکریپت build

`scripts/build.mjs` مقدارهای env را در `public/config.js` می‌نویسد تا نیازی به کامیت مقادیر واقعی نباشد:

```bash
cp .env.example .env   # پر کنید (این فایل gitignore شده)
node scripts/build.mjs
```

## ۵) پاک‌سازی تصاویر بی‌نشان (orphan cleanup)

ماهانه یا بعد از حذف انبوه محصولات، در SQL Editor:

```sql
-- فایل‌هایی که نه در products، نه در cafes ارجاع دارند
select o.name, (o.metadata->>'size')/1024 as kb
from storage.objects o
where o.bucket_id = 'cafe-assets'
  and not exists (select 1 from public.products p where p.image_path = o.name)
  and not exists (select 1 from public.cafes c
                  where c.logo_path = o.name or c.cover_image_path = o.name);

-- بعد از بازبینی خروجی:
delete from storage.objects o
where o.bucket_id = 'cafe-assets'
  and not exists (select 1 from public.products p where p.image_path = o.name)
  and not exists (select 1 from public.cafes c
                  where c.logo_path = o.name or c.cover_image_path = o.name);
```

## ۶) مانیتورینگ و نگهداری
- Supabase → Reports: مصرف DB/Storage/Functions را رصد کنید.
- `analytics_events` هر چند ماه یک‌بار آرشیو/پاک‌سازی کنید (مثلاً نگهداری ۱۸۰ روز):
```sql
delete from analytics_events where occurred_at < now() - interval '180 days';
```
- اشتراک‌های منقضی به‌صورت خودکار «expired» محسوب می‌شوند (محاسبه در لحظه)؛ نیاز به cron ندارید.

## ۷) چک‌لیست پس از استقرار
- [ ] `/` لندینگ باز می‌شود
- [ ] `/cafe/<slug>` منوی کافه واقعی را نشان می‌دهد
- [ ] ورود مدیر کافه و ابرمدیر کار می‌کند
- [ ] آپلود تصویر محصول روی دامنه production کار می‌کند (مسیر باکت)
- [ ] QR با `SITE_URL` نهایی ساخته می‌شود و اسکن می‌شود
- [ ] `track` رویداد ثبت می‌کند (آمار در داشبورد ظاهر شود)
