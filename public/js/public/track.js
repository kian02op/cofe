/** Analytics beacon — privacy-conscious, minimal, deduped server-side. */
import { trackEvent } from "../data/api.js";

function source() {
  if (sessionStorage.getItem("mk_src")) return sessionStorage.getItem("mk_src");
  const src = new URLSearchParams(location.search).get("src");
  const val = ["qr", "direct", "share"].includes(src) ? src : "direct";
  sessionStorage.setItem("mk_src", val);
  return val;
}

/** One menu_view per session per day (server also dedupes by visitor hash). */
export function trackMenuView(slug, lang) {
  const key = `mk_mv_${slug}_${new Date().toISOString().slice(0, 10)}`;
  if (sessionStorage.getItem(key)) return;
  sessionStorage.setItem(key, "1");
  trackEvent({ slug, event_type: "menu_view", lang, source: source() });
}

export function trackProductView(slug, productId, lang) {
  trackEvent({ slug, event_type: "product_view", product_id: productId, lang, source: source() });
}

export function trackCategoryView(slug, categoryId, lang) {
  trackEvent({ slug, event_type: "category_view", category_id: categoryId, lang, source: source() });
}
