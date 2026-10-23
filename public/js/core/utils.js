/** Shared utilities: safe DOM building, formatting, validation. */

/* ---------- DOM ---------- */

/** Build an element. attrs: class, dataset via `data-*`, event handlers via `on:*`. */
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v; // ONLY for trusted static markup
    else if (k === "textContent") node.textContent = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else if (k === "value") node.value = v;
    else if (k === "checked" || k === "disabled" || k === "selected" || k === "required") node[k] = !!v;
    else node.setAttribute(k, v === true ? "" : String(v));
  }
  append(node, children);
  return node;
}

function append(parent, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    parent.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
}

/** Clear and set children (text or nodes). Never use innerHTML with user data. */
export function setChildren(node, ...children) {
  node.textContent = "";
  append(node, children);
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function debounce(fn, ms = 300) {
  let h;
  return (...args) => {
    clearTimeout(h);
    h = setTimeout(() => fn(...args), ms);
  };
}

/* ---------- Formatting ---------- */

/**
 * Price formatting. Prices are stored as integer minor units (price_minor).
 * Cafe-level display model:
 *  - currency_display set (e.g. "تومان") -> number = price_minor / price_divisor
 *  - otherwise -> Intl standard currency format from currency_code.
 */
export function formatPrice(cafe, minor, lang = "fa") {
  const n = Number(minor ?? 0);
  const locale = lang === "en" ? "en-US" : "fa-IR";
  if (cafe.currency_display) {
    const value = n / (cafe.price_divisor || 1);
    return `${value.toLocaleString(locale)} ${cafe.currency_display}`;
  }
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: cafe.currency_code || "IRR",
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `${n.toLocaleString(locale)} ${cafe.currency_code || ""}`;
  }
}

/** Parse price display input (accepts Persian/Arabic digits too) into minor units. */
export function parsePriceInput(text) {
  const normalized = String(text ?? "")
    .replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d))
    .replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d))
    .replace(/[,\s٬]/g, "");
  const n = Number(normalized);
  return Number.isFinite(n) ? Math.round(n) : NaN;
}

export function formatDate(iso, lang = "fa", withTime = false) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    const locale = lang === "en" ? "en-GB" : "fa-IR";
    const opts = withTime
      ? { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }
      : { year: "numeric", month: "short", day: "numeric" };
    return d.toLocaleDateString(locale, opts);
  } catch {
    return String(iso);
  }
}

export function daysUntil(iso) {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
}

/* ---------- Validation (mirrors DB triggers / is_valid_slug) ---------- */

export const RESERVED_SLUGS = new Set([
  "admin", "login", "superadmin", "api", "cafe", "qr-print", "assets",
  "js", "css", "images", "img", "docs", "static", "_redirects", "index.html",
]);

export function isValidSlug(slug) {
  return (
    typeof slug === "string" &&
    /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(slug) &&
    !slug.includes("--") &&
    !RESERVED_SLUGS.has(slug)
  );
}

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
export function validateImage(file, maxMB = 2) {
  if (!IMAGE_TYPES.has(file.type)) return { ok: false, code: "image_bad_type" };
  if (file.size > maxMB * 1024 * 1024) return { ok: false, code: "image_too_large" };
  return { ok: true };
}

export function uuid() {
  return crypto.randomUUID?.() ?? "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/* ---------- Error mapping (DB messages -> i18n keys) ---------- */

export function mapDbError(err) {
  const msg = String(err?.message || err?.code || "");
  if (msg.includes("PLAN_LIMIT_PRODUCTS")) return "limit_products_max";
  if (msg.includes("PLAN_LIMIT_CATEGORIES")) return "limit_categories";
  if (msg.includes("PLAN_LIMIT_LANGUAGES")) return "limit_languages";
  if (msg.includes("PLAN_FEATURE_BADGES")) return "feature_badges";
  if (msg.includes("CAFE_SERVICE_SUSPENDED")) return "menu_suspended_t";
  if (msg.includes("CAFE_SERVICE_EXPIRED")) return "menu_expired_t";
  if (msg.includes("CAFE_SERVICE_CANCELLED")) return "menu_cancelled_t";
  if (msg.includes("duplicate") || msg.includes("unique")) return "slug_taken";
  if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) return "network_error";
  return "error_generic";
}
