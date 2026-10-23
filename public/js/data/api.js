/**
 * Data access layer — the ONLY module that talks to the backend.
 * Uses the supabase-js v2 client in production, DemoClient when Supabase
 * is not configured. All queries are written identically for both.
 */
import { IS_DEMO, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_JS_CDN, BUCKET } from "../core/config.js";
import { demoClient } from "../demo/client.js";

export let sb = null;

export async function initApi() {
  if (sb) return sb;
  if (IS_DEMO) {
    sb = demoClient;
    return sb;
  }
  const mod = await import(/* @vite-ignore */ SUPABASE_JS_CDN);
  sb = mod.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  return sb;
}

/* ============================ Auth ============================ */

export async function signIn(email, password) {
  return sb.auth.signInWithPassword({ email: email.trim(), password });
}
export async function signOut() {
  return sb.auth.signOut();
}
export async function getUser() {
  const { data } = await sb.auth.getUser();
  return data?.user ?? null;
}

/* ========================= Public menu ======================== */

export async function fetchPublicCafe(slug) {
  return sb.from("public_menu_cafes").select("*").eq("slug", slug).maybeSingle();
}

export async function fetchPublicMenu(cafeId) {
  const [cats, prods, ptr, ctr] = await Promise.all([
    sb.from("public_menu_categories").select("*").eq("cafe_id", cafeId).order("display_order"),
    sb.from("public_menu_products").select("*").eq("cafe_id", cafeId).order("display_order"),
    sb.from("public_menu_product_translations").select("*").eq("cafe_id", cafeId),
    sb.from("public_menu_category_translations").select("*").eq("cafe_id", cafeId),
  ]);
  const err = cats.error || prods.error || ptr.error || ctr.error;
  if (err) return { error: err };
  return {
    data: {
      categories: cats.data ?? [],
      products: prods.data ?? [],
      productTranslations: ptr.data ?? [],
      categoryTranslations: ctr.data ?? [],
    },
    error: null,
  };
}

export function publicImageUrl(path) {
  if (!path) return null;
  if (/^(https?:|data:|\/)/.test(path)) return path;
  return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

/* ====================== Admin context ========================= */

export async function getProfile(userId) {
  const { data } = await sb.from("profiles").select("*").eq("id", userId).maybeSingle();
  return data;
}

/**
 * Loads everything the cafe dashboard needs for the signed-in user.
 * MVP supports one cafe per admin (Base plan = one admin account).
 */
export async function loadAdminContext() {
  const user = await getUser();
  if (!user) return { user: null };
  const profile = await getProfile(user.id);
  const { data: memberships } = await sb
    .from("cafe_memberships").select("cafe_id, role").eq("user_id", user.id);
  let cafe = null, subscription = null, limits = null, membership = null;
  if (memberships?.length) {
    membership = memberships[0];
    cafe = (await sb.from("cafes").select("*").eq("id", membership.cafe_id).maybeSingle()).data;
    subscription = (await sb.from("subscriptions").select("*").eq("cafe_id", membership.cafe_id).maybeSingle()).data;
    const plan = subscription?.plan_code || "base";
    limits = (await sb.from("plan_limits").select("*").eq("plan_code", plan).maybeSingle()).data;
  }
  let usage = { products: 0, categories: 0 };
  if (cafe) {
    const [pc, cc] = await Promise.all([
      sb.from("products").select("id", { count: "exact", head: true }).eq("cafe_id", cafe.id),
      sb.from("categories").select("id", { count: "exact", head: true }).eq("cafe_id", cafe.id),
    ]);
    usage = { products: pc.count ?? 0, categories: cc.count ?? 0 };
  }
  return { user, profile, cafe, membership, subscription, limits, usage, isSuper: profile?.platform_role === "super_admin" };
}

/* ===================== Categories CRUD ======================== */

export const listCategories = (cafeId) =>
  sb.from("categories").select("*").eq("cafe_id", cafeId).order("display_order");

export const createCategory = (row) =>
  sb.from("categories").insert(row).select().single();

export const updateCategory = (id, patch) =>
  sb.from("categories").update(patch).eq("id", id).select().single();

export const deleteCategory = (id) =>
  sb.from("categories").delete().eq("id", id);

/* ======================= Products CRUD ======================== */

export const listProducts = (cafeId) =>
  sb.from("products").select("*").eq("cafe_id", cafeId).order("display_order");

export const createProduct = (row) =>
  sb.from("products").insert(row).select().single();

export const updateProduct = (id, patch) =>
  sb.from("products").update(patch).eq("id", id).select().single();

export const deleteProduct = (id) =>
  sb.from("products").delete().eq("id", id);

/** Sequential reorder (MVP volumes make this fine; avoids RPC). */
export async function reorder(list) {
  for (let i = 0; i < list.length; i++) {
    const id = list[i].id ?? list[i];
    await sb.from(list[i].category_id !== undefined ? "products" : "products")
      .update({ display_order: i + 1 }).eq("id", id);
  }
}

/* ======================= Translations ========================= */

export async function upsertProductTranslation(productId, cafeId, lang, name, description) {
  const { data: existing } = await sb
    .from("product_translations").select("id")
    .eq("product_id", productId).eq("lang", lang).maybeSingle();
  if (existing) {
    return sb.from("product_translations")
      .update({ name, description }).eq("id", existing.id).select().single();
  }
  return sb.from("product_translations")
    .insert({ product_id: productId, cafe_id: cafeId, lang, name, description })
    .select().single();
}

export async function deleteProductTranslation(productId, lang) {
  return sb.from("product_translations")
    .delete().eq("product_id", productId).eq("lang", lang);
}

export const listProductTranslations = (cafeId) =>
  sb.from("product_translations").select("*").eq("cafe_id", cafeId);

export async function upsertCategoryTranslation(categoryId, cafeId, lang, name) {
  const { data: existing } = await sb
    .from("category_translations").select("id")
    .eq("category_id", categoryId).eq("lang", lang).maybeSingle();
  if (existing) {
    return sb.from("category_translations").update({ name }).eq("id", existing.id).select().single();
  }
  return sb.from("category_translations")
    .insert({ category_id: categoryId, cafe_id: cafeId, lang, name }).select().single();
}

export const listCategoryTranslations = (cafeId) =>
  sb.from("category_translations").select("*").eq("cafe_id", cafeId);

/* ========================== Storage =========================== */

export async function uploadImage(cafeId, kind, file, maxMB = 2) {
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `cafes/${cafeId}/${kind}/${uuid()}.${ext}`;
  const { error } = await sb.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    cacheControl: "31536000",
  });
  return { path, error };
}

export async function deleteImage(path) {
  if (!path || /^(https?:|data:|\/)/.test(path)) return { error: null }; // demo/static asset
  return sb.storage.from(BUCKET).remove([path]);
}

/* ========================= Analytics ========================== */

/** Fire-and-forget tracking (validated server-side by the `track` function). */
export async function trackEvent(payload) {
  try {
    await sb.functions.invoke("track", { body: payload });
  } catch { /* analytics must never break the menu */ }
}

export async function fetchAnalyticsDaily(cafeId, fromISO, toISO) {
  return sb.from("analytics_daily")
    .select("*")
    .eq("cafe_id", cafeId)
    .gte("visit_date", fromISO)
    .lte("visit_date", toISO);
}

/* ======================= Super admin ========================== */

export async function listAllCafes({ search = "", status = "" } = {}) {
  let q = sb.from("cafes").select("*").order("created_at", { ascending: false });
  if (search) q = q.or(`name.ilike.%${search}%,slug.ilike.%${search}%`);
  const { data, error } = await q;
  if (error) return { data, error };
  let rows = data ?? [];
  if (status) {
    const subs = (await sb.from("subscriptions").select("cafe_id, plan_code, status, expires_at")).data ?? [];
    const subsBy = Object.fromEntries(subs.map((s) => [s.cafe_id, s]));
    rows = rows.filter((c) => {
      const s = subsBy[c.id];
      const st = c.status === "suspended" ? "suspended"
        : c.status === "cancelled" ? "cancelled"
        : s?.status && ["active", "trial"].includes(s.status) && (!s.expires_at || new Date(s.expires_at) > new Date())
          ? "active" : "expired";
      return st === status;
    });
  }
  return { data: rows, error: null };
}

export const listAllSubscriptions = () =>
  sb.from("subscriptions").select("*");

export const countRows = (table, cafeId) =>
  sb.from(table).select("id", { count: "exact", head: true }).eq("cafe_id", cafeId);

export const createCafe = (row) =>
  sb.from("cafes").insert(row).select().single();

export const createSubscription = (row) =>
  sb.from("subscriptions").insert(row).select().single();

export const updateCafe = (id, patch) =>
  sb.from("cafes").update(patch).eq("id", id).select().single();

export const updateSubscription = (id, patch) =>
  sb.from("subscriptions").update(patch).eq("id", id).select().single();

export const deleteCafe = (id) =>
  sb.from("cafes").delete().eq("id", id);

export const getPlanLimits = () =>
  sb.from("plan_limits").select("*");

export const createAdminUser = (body) =>
  sb.functions.invoke("admin-create-user", { body });

export const findMembership = (cafeId) =>
  sb.from("cafe_memberships").select("user_id").eq("cafe_id", cafeId);
