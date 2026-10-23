/**
 * DEMO SEED — clearly identified sample data for demo mode only.
 * NEVER used when a real Supabase project is configured.
 * Includes two cafes (to demonstrate tenant isolation), demo accounts,
 * and ~60 days of synthetic analytics rows.
 */

function d(n) {
  const dt = new Date();
  dt.setUTCDate(dt.getUTCDate() - n);
  return dt;
}

export function buildSeed() {
  const cafe1 = "6f1c2b3a-1111-4a11-9a01-00000000c001";
  const cafe2 = "6f1c2b3a-2222-4a22-9a02-00000000c002";
  const uSuper = "a0000000-0000-4000-8000-00000000aaaa";
  const uAdmin1 = "b0000000-0000-4000-8000-00000000bbbb";
  const uAdmin2 = "c0000000-0000-4000-8000-00000000cccc";

  const cats = [
    { id: "e1000000-0000-4000-8000-000000000001", cafe_id: cafe1, name: "قهوه", description: null, display_order: 1, is_visible: true },
    { id: "e1000000-0000-4000-8000-000000000002", cafe_id: cafe1, name: "نوشیدنی گرم", description: null, display_order: 2, is_visible: true },
    { id: "e1000000-0000-4000-8000-000000000003", cafe_id: cafe1, name: "نوشیدنی سرد", description: null, display_order: 3, is_visible: true },
    { id: "e1000000-0000-4000-8000-000000000004", cafe_id: cafe1, name: "کیک و دسر", description: null, display_order: 4, is_visible: true },
    { id: "e1000000-0000-4000-8000-000000000005", cafe_id: cafe1, name: "صبحانه", description: null, display_order: 5, is_visible: true },
    { id: "e1000000-0000-4000-8000-000000000006", cafe_id: cafe1, name: "پیشنهاد ویژه", description: null, display_order: 6, is_visible: true },
    { id: "e2000000-0000-4000-8000-000000000001", cafe_id: cafe2, name: "نوشیدنی", description: null, display_order: 1, is_visible: true },
    { id: "e2000000-0000-4000-8000-000000000002", cafe_id: cafe2, name: "دسر", description: null, display_order: 2, is_visible: true },
  ];
  const C = Object.fromEntries(cats.map((c) => [c.id, c]));

  const p = (id, cafe, cat, name, desc, price, avail, badge, order, img) => ({
    id, cafe_id: cafe, category_id: cat, name, description: desc, price_minor: price,
    image_path: img, is_available: avail, is_visible: true, badge, display_order: order,
  });

  const IMG = (n) => `/assets/img/products/${n}.svg`;
  const products = [
    p("f1000000-0000-4000-8000-000000000001", cafe1, "e1000000-0000-4000-8000-000000000001", "اسپرسو", "یک شات قهوه غلیظ با کرمای طلایی", 850000, true, null, 1, IMG("espresso")),
    p("f1000000-0000-4000-8000-000000000002", cafe1, "e1000000-0000-4000-8000-000000000001", "کاپوچینو", "اسپرسو با شیر بخارپز و فوم مخملی", 1200000, true, "popular", 2, IMG("cappuccino")),
    p("f1000000-0000-4000-8000-000000000003", cafe1, "e1000000-0000-4000-8000-000000000001", "لاته", "شیر ابریشمی با لاته آرت", 1350000, true, null, 3, IMG("latte")),
    p("f1000000-0000-4000-8000-000000000004", cafe1, "e1000000-0000-4000-8000-000000000001", "موکا", "اسپرسو، شکلات و شیر", 1400000, true, null, 4, IMG("mocha")),
    p("f1000000-0000-4000-8000-000000000005", cafe1, "e1000000-0000-4000-8000-000000000002", "چای ماسالا", "چای هندی با ادویه و شیر", 950000, true, null, 1, IMG("masala")),
    p("f1000000-0000-4000-8000-000000000006", cafe1, "e1000000-0000-4000-8000-000000000002", "هات چاکلت", "شکلات بلژیکی غلیظ", 1100000, true, null, 2, IMG("hot-chocolate")),
    p("f1000000-0000-4000-8000-000000000007", cafe1, "e1000000-0000-4000-8000-000000000002", "دمنوش به و نعنا", "آرام‌بخش و خوش‌عطر", 800000, false, null, 3, IMG("herbal")),
    p("f1000000-0000-4000-8000-000000000008", cafe1, "e1000000-0000-4000-8000-000000000003", "آیس آمریکانو", "اسپرسو سرد با یخ", 1200000, true, null, 1, IMG("americano")),
    p("f1000000-0000-4000-8000-000000000009", cafe1, "e1000000-0000-4000-8000-000000000003", "آیس لاته", "لاته سرد با شیر و یخ", 1450000, true, "new", 2, IMG("ice-latte")),
    p("f1000000-0000-4000-8000-00000000000a", cafe1, "e1000000-0000-4000-8000-000000000003", "موخیتو", "نعنا، لیموترش و سودا", 1300000, true, null, 3, IMG("mojito")),
    p("f1000000-0000-4000-8000-00000000000b", cafe1, "e1000000-0000-4000-8000-000000000003", "لیموناد زعفرانی", "لیموناد خانگی با زعفران", 1150000, true, null, 4, IMG("lemonade")),
    p("f1000000-0000-4000-8000-00000000000c", cafe1, "e1000000-0000-4000-8000-000000000004", "چیزکیک نیویورکی", "با سس توت‌فرنگی", 1800000, true, "special", 1, IMG("cheesecake")),
    p("f1000000-0000-4000-8000-00000000000d", cafe1, "e1000000-0000-4000-8000-000000000004", "تییرامیسو", "دسر ایتالیایی کلاسیک با قهوه", 1650000, true, "popular", 2, IMG("tiramisu")),
    p("f1000000-0000-4000-8000-00000000000e", cafe1, "e1000000-0000-4000-8000-000000000004", "براونی", "شکلات تلخ با گردو، سرو با بستنی", 1400000, true, null, 3, IMG("brownie")),
    p("f1000000-0000-4000-8000-00000000000f", cafe1, "e1000000-0000-4000-8000-000000000004", "اکلر", "خامه وانیلی و شکلات", 950000, false, null, 4, IMG("eclair")),
    p("f1000000-0000-4000-8000-000000000010", cafe1, "e1000000-0000-4000-8000-000000000005", "املت مخصوص", "املت قارچ و پنیر با نان تست", 1500000, true, null, 1, IMG("omelette")),
    p("f1000000-0000-4000-8000-000000000011", cafe1, "e1000000-0000-4000-8000-000000000006", "کمبو صبحانه لم", "قهوه + کیک روز + آب‌میوه", 2200000, true, "special", 1, IMG("combo")),
    p("f2000000-0000-4000-8000-000000000001", cafe2, "e2000000-0000-4000-8000-000000000001", "چای کوهی", "دمنوش گیاهی روز", 700000, true, null, 1, IMG("herbal")),
    p("f2000000-0000-4000-8000-000000000002", cafe2, "e2000000-0000-4000-8000-000000000001", "قهوه فوری", "نسکافه طلایی", 600000, true, null, 2, IMG("espresso")),
    p("f2000000-0000-4000-8000-000000000003", cafe2, "e2000000-0000-4000-8000-000000000002", "کیک خانگی", "کیک روز", 900000, false, null, 1, IMG("cheesecake")),
  ];

  const product_translations = [
    { id: "d1000000-0000-4000-8000-000000000001", product_id: "f1000000-0000-4000-8000-000000000001", cafe_id: cafe1, lang: "en", name: "Espresso", description: "A rich single shot with golden crema" },
    { id: "d1000000-0000-4000-8000-000000000002", product_id: "f1000000-0000-4000-8000-000000000002", cafe_id: cafe1, lang: "en", name: "Cappuccino", description: "Espresso with steamed milk and velvet foam" },
    { id: "d1000000-0000-4000-8000-000000000003", product_id: "f1000000-0000-4000-8000-000000000003", cafe_id: cafe1, lang: "en", name: "Latte", description: "Silky milk with latte art" },
    { id: "d1000000-0000-4000-8000-000000000004", product_id: "f1000000-0000-4000-8000-000000000009", cafe_id: cafe1, lang: "en", name: "Iced Latte", description: "Cold latte with milk and ice" },
    { id: "d1000000-0000-4000-8000-000000000005", product_id: "f1000000-0000-4000-8000-00000000000c", cafe_id: cafe1, lang: "en", name: "NY Cheesecake", description: "With strawberry sauce" },
    { id: "d1000000-0000-4000-8000-000000000006", product_id: "f1000000-0000-4000-8000-00000000000d", cafe_id: cafe1, lang: "en", name: "Tiramisu", description: "Classic Italian coffee dessert" },
  ];
  const category_translations = [
    { id: "d2000000-0000-4000-8000-000000000001", category_id: "e1000000-0000-4000-8000-000000000001", cafe_id: cafe1, lang: "en", name: "Coffee" },
    { id: "d2000000-0000-4000-8000-000000000002", category_id: "e1000000-0000-4000-8000-000000000002", cafe_id: cafe1, lang: "en", name: "Hot Drinks" },
    { id: "d2000000-0000-4000-8000-000000000003", category_id: "e1000000-0000-4000-8000-000000000003", cafe_id: cafe1, lang: "en", name: "Cold Drinks" },
    { id: "d2000000-0000-4000-8000-000000000004", category_id: "e1000000-0000-4000-8000-000000000004", cafe_id: cafe1, lang: "en", name: "Cakes & Desserts" },
    { id: "d2000000-0000-4000-8000-000000000005", category_id: "e1000000-0000-4000-8000-000000000005", cafe_id: cafe1, lang: "en", name: "Breakfast" },
    { id: "d2000000-0000-4000-8000-000000000006", category_id: "e1000000-0000-4000-8000-000000000006", cafe_id: cafe1, lang: "en", name: "Special Offers" },
  ];

  // ---- synthetic analytics (60 days cafe1 / 30 days cafe2) ----
  const events = [];
  const addEvent = (cafe, type, day, k, productId, categoryId) => {
    events.push({
      id: crypto.randomUUID(),
      cafe_id: cafe,
      event_type: type,
      product_id: productId ?? null,
      category_id: categoryId ?? null,
      visit_date: d(day).toISOString().slice(0, 10),
      visitor_hash: `h${day}-${k}`,
      metadata: { lang: "fa", source: k % 4 === 0 ? "qr" : "direct" },
      occurred_at: d(day).toISOString(),
    });
  };
  const topProducts = products.filter((x) => x.cafe_id === cafe1 && x.is_available).slice(0, 8);
  for (let day = 59; day >= 0; day--) {
    const visits = 18 + Math.floor(Math.abs(Math.sin(day * 2.7)) * 52); // deterministic pseudo-random
    for (let k = 0; k < visits; k++) {
      addEvent(cafe1, "menu_view", day, k);
      if (k % 3 === 0) {
        const pr = topProducts[(day * 7 + k) % topProducts.length];
        addEvent(cafe1, "product_view", day, `p${k}`, pr.id, pr.category_id);
      }
    }
    if (day % 6 === 0) addEvent(cafe1, "search", day, 999);
  }
  for (let day = 29; day >= 0; day--) {
    const visits = 5 + (day % 9);
    for (let k = 0; k < visits; k++) addEvent(cafe2, "menu_view", day, k);
  }

  return {
    cafes: [
      {
        id: cafe1, name: "کافه لم", slug: "demo-cafe",
        description: "یک کافه دنموی کامل با منوی حرفه‌ای، تم اختصاصی و چندزبانه. تمام داده‌های این صفحه نمایشی است.",
        logo_path: "/assets/img/logo-lam.svg", cover_image_path: "/assets/img/cover-lam.svg",
        address: "تهران، خیابان ولیعصر، نبش کوچه لطفعلی‌خان، پلاک ۱۲",
        phone: "02188776655",
        opening_hours: [
          { label: "شنبه تا چهارشنبه", value: "۸:۰۰ تا ۲۳:۰۰" },
          { label: "پنجشنبه و جمعه", value: "۹:۰۰ تا ۲۴:۰۰" },
        ],
        social_links: { instagram: "https://instagram.com/lam.cafe", telegram: "https://t.me/lamcafe" },
        default_language: "fa", languages: ["fa", "en"],
        currency_code: "IRR", currency_display: "تومان", price_divisor: 1,
        theme_settings: { primary: "#6f4e37", radius: 16, font_scale: 1, header_style: "cover", bg: "cream", card_style: "soft" },
        hide_unavailable: false, status: "active",
        created_at: d(120).toISOString(), updated_at: d(1).toISOString(),
      },
      {
        id: cafe2, name: "کافه شهر", slug: "cafe-shahr",
        description: "کافه‌ای ساده برای نمایش پلن پایه.",
        logo_path: "/assets/img/logo-shahr.svg", cover_image_path: null,
        address: "اصفهان، خیابان چهارباغ بالا", phone: "03136200000",
        opening_hours: [{ label: "همه روزه", value: "۱۰:۰۰ تا ۲۲:۰۰" }],
        social_links: {},
        default_language: "fa", languages: ["fa"],
        currency_code: "IRR", currency_display: "تومان", price_divisor: 1,
        theme_settings: { primary: "#7c4a2d", radius: 10, font_scale: 1, header_style: "plain", bg: "white", card_style: "outlined" },
        hide_unavailable: true, status: "active",
        created_at: d(60).toISOString(), updated_at: d(5).toISOString(),
      },
    ],
    profiles: [
      { id: uSuper, display_name: "مدیر پلتفرم", platform_role: "super_admin" },
      { id: uAdmin1, display_name: "مدیر کافه لم", platform_role: "user" },
      { id: uAdmin2, display_name: "مدیر کافه شهر", platform_role: "user" },
    ],
    demo_users: [
      // DEMO ONLY: plain-text passwords live in the browser's localStorage —
      // real deployments use Supabase Auth (bcrypt) instead.
      { id: uSuper, email: "super@demo.cafe", password: "super1234" },
      { id: uAdmin1, email: "admin@demo.cafe", password: "demo1234" },
      { id: uAdmin2, email: "admin2@demo.cafe", password: "demo1234" },
    ],
    cafe_memberships: [
      { id: crypto.randomUUID(), cafe_id: cafe1, user_id: uAdmin1, role: "admin" },
      { id: crypto.randomUUID(), cafe_id: cafe2, user_id: uAdmin2, role: "admin" },
    ],
    categories: cats,
    products,
    product_translations,
    category_translations,
    subscriptions: [
      { id: crypto.randomUUID(), cafe_id: cafe1, plan_code: "professional", status: "active", starts_at: d(60).toISOString(), expires_at: d(-305).toISOString() },
      { id: crypto.randomUUID(), cafe_id: cafe2, plan_code: "base", status: "active", starts_at: d(30).toISOString(), expires_at: d(-15).toISOString() },
    ],
    plan_limits: [
      { plan_code: "base", max_products: 50, max_categories: 10, max_languages: 1, max_image_file_mb: 2, storage_quota_mb: 50, features: { badges: false, advanced_analytics: false, extended_theme: false } },
      { plan_code: "professional", max_products: 200, max_categories: 30, max_languages: 3, max_image_file_mb: 4, storage_quota_mb: 500, features: { badges: true, advanced_analytics: true, extended_theme: true } },
    ],
    analytics_events: events,
    _session: null,
    _blobs: {}, // session-only data URLs for uploaded images
  };
}
