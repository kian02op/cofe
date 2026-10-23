# چک‌لیست امنیتی

## Authentication و نقش‌ها
- [x] ثبت‌نام عمومی وجود ندارد («Allow new users to sign up» در Supabase خاموش شود).
- [x] ارتقا به `super_admin` فقط با SQL/service-role ممکن است؛ تریگر `protect_platform_role` تغییر از سمت کلاینت را با خطا مسدود می‌کند (تست pgTAP #3).
- [x] ساخت کاربر/عضویت فقط از Edge Function `admin-create-user` با بررسی سمت سرورِ نقش ابرمدیر فراخوان.
- [ ] گذرواژه اولیه ابرمدیر/مدیران بعد از اولین ورود تعویض شود (فرآیند انسانی).

## Row Level Security
- [x] RLS روی تمام ۱۰ جدول فعال؛ anon فقط select روی `public_menu_*` دارد (تست pgTAP #4 و #5).
- [x] همه پالیسی‌ها بر اساس `is_cafe_member()` / `is_super_admin()` (SECURITY DEFINER، بدون ورودی کاربر).
- [x] کافه A نمی‌تواند داده کافه B را بخواند/بنویسد (تست pgTAP #1 و #2).
- [x] جدول `subscriptions` برای مدیر کافه فقط-خواندنی است؛ نوشتن فقط ابرمدیر.
- [x] `analytics_events` هیچ مسیر نوشتن عمومی ندارد؛ فقط Edge Function با service_role.

## اعتبارسنجی و یکپارچگی
- [x] سقف پلن (محصول/دسته/زبان/برچسب) در تریگرهای دیتابیس اعمال می‌شود؛ دور زدن فرانت بی‌اثر است (تست pgTAP #6).
- [x] قفل نوشتن منو برای کافه‌های منقضی/معلق/لغوشده در دیتابیس (تست pgTAP #7، #8).
- [x] `cafe_id` ترجمه‌ها با والدش اعتبارسنجی می‌شود (ضد نشت بین‌کافه‌ای).
- [x] slug: فرمت + رزرو‌شده‌ها (admin, api, ...) + یکتایی citext؛ در فرانت و دیتابیس.
- [x] قیمت‌ها به‌صورت عدد صحیح minor unit ذخیره می‌شوند (بدون خطای float).

## Storage
- [x] آپلود فقط مسیر `cafes/{cafe_id}/...` برای عضو همان کافه.
- [x] نوع فایل فقط jpg/png/webp (SVG مسدود — ضد XSS)؛ بررسی در تریگر دیتابیس.
- [x] سقف حجم هر فایل + سهمیه تجمعی هر کافه در تریگر `enforce_cafe_asset_rules`.
- [x] حذف فایل قدیمی هنگام جایگزینی + اسکریپت orphan cleanup.

## فرانت‌اند
- [x] هیچ رندری با innerHTML برای داده کاربر انجام نمی‌شود (helper `el()` با textContent).
- [x] `service_role` در هیچ فایل فرانت نیست؛ فقط anon key عمومی در `config.js`.
- [ ] هدرهای CSP روی CDN تنظیم شود (پیشنهاد در ادامه).
- [x] لینک‌های خروجی `rel="noopener"`؛ فرم‌ها با novalidate دستی و پیام خطای امن (بدون جزئیات دیتابیس).

## ترویجان public endpoints
- [x] `track`: whitelist نوع رویداد، اعتبارسنجی UUID، rate-limit درون‌حافظه‌ای، سقف روزانه ۵۰۰۰ رخداد/کافه، dedup بازدید با هش روزانه.
- [ ] در صورت حمله گسترده: Cloudflare WAF rate rule روی `/functions/v1/track`.

## لاگ و حادثه
- [ ] Logs Edge Functions در Supabase Dashboard بازبینی دوره‌ای شود.
- [ ] Supabase Auth → گزارش ورودهای ناموفق.

## پیشنهاد CSP (روی Cloudflare Pages → Headers)
```
/*
  Content-Security-Policy: default-src 'self'; img-src 'self' https://*.supabase.co data: blob:; script-src 'self' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; connect-src 'self' https://*.supabase.co; frame-ancestors 'none'
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
```
