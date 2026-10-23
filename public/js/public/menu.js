/**
 * Public cafe menu — mobile-first, RTL, themeable, searchable.
 * Reads ONLY public_menu_* views (no private data ever reaches this page).
 */
import { initApi, fetchPublicCafe, fetchPublicMenu, publicImageUrl } from "../data/api.js";
import { IS_DEMO } from "../core/config.js";
import { t, applyDocumentLang, setLang, getLang } from "../core/i18n.js";
import { el, setChildren, $, formatPrice, debounce } from "../core/utils.js";
import { toast, openModal } from "../core/ui.js";
import { icons } from "../core/icons.js";
import { trackMenuView, trackProductView, trackCategoryView } from "./track.js";

/* ---------- slug resolution (works with /cafe/:slug and ?slug=) ---------- */
function resolveSlug() {
  const qs = new URLSearchParams(location.search).get("slug");
  if (qs) return qs.trim().toLowerCase();
  const parts = location.pathname.split("/").filter(Boolean);
  const i = parts.indexOf("cafe");
  if (i >= 0 && parts[i + 1]) return parts[i + 1].toLowerCase();
  return "";
}

/* ---------- state ---------- */
let cafe = null;
let menu = null;
let lang = "fa";
let activeCat = "all";
let query = "";

const stateRoot = $("#menu-state");
const contentRoot = $("#menu-content");

function showState(kind, title, desc) {
  contentRoot.classList.add("hidden");
  stateRoot.className = `menu-state ${kind}`;
  setChildren(stateRoot,
    el("div", { class: "card" },
      el("div", { class: "emoji-art", html: kind === "notfound" ? icons.search : icons.alert }),
      el("h2", {}, title),
      el("p", { class: "muted" }, desc),
      el("a", { class: "btn btn-outline mt-2", href: "/" }, t("back")),
    ),
  );
}

/* ---------- theme ---------- */
function applyTheme(theme = {}, headerStyle, bg) {
  const root = $("#menu-root");
  if (theme.primary) root.style.setProperty("--primary", theme.primary);
  if (theme.radius != null) root.style.setProperty("--radius", `${theme.radius}px`);
  if (theme.font_scale) root.style.setProperty("--font-scale", theme.font_scale);
  const mode = bg || theme.bg || "cream";
  root.classList.toggle("theme-dark", mode === "dark");
  root.classList.toggle("theme-white", mode === "white");
  if (headerStyle || theme.header_style) {
    root.classList.toggle("header-plain", (headerStyle || theme.header_style) === "plain");
  }
  if (theme.card_style) root.classList.toggle("cards-outlined", theme.card_style === "outlined");
}

/* ---------- helpers ---------- */
const norm = (s) =>
  String(s || "").toLowerCase().replace(/[يﻱ]/g, "ی").replace(/[ك]/g, "ک").trim();

function trName(item, list) {
  const tr = list.find((x) => x.lang === lang && x.product_id === item.id) ||
             list.find((x) => x.lang === lang && x.category_id === item.id);
  return tr?.name ?? item.name;
}
function trDesc(item, list) {
  const tr = list.find((x) => x.lang === lang && x.product_id === item.id);
  return tr?.description ?? item.description;
}

/* ---------- header ---------- */
function renderHeader() {
  const header = $("#menu-header");
  const logoUrl = publicImageUrl(cafe.logo_path);
  const coverUrl = publicImageUrl(cafe.cover_image_path);
  const plain = $("#menu-root").classList.contains("header-plain");

  const contact = [];
  if (cafe.phone) {
    contact.push(el("a", {
      class: "contact-pill", href: `tel:${cafe.phone}`,
    }, el("span", { class: "ic", html: icons.phone }),
       el("span", { class: "ltr-num" }, cafe.phone)));
  }
  if (cafe.address) {
    const mapHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cafe.address)}`;
    contact.push(el("a", { class: "contact-pill", href: mapHref, target: "_blank", rel: "noopener" },
      el("span", { class: "ic", html: icons.pin }), cafe.address));
  }
  for (const row of cafe.opening_hours ?? []) {
    if (row?.label || row?.value) {
      contact.push(el("span", { class: "contact-pill" },
        el("span", { class: "ic", html: icons.clock }), `${row.label ?? ""} ${row.value ?? ""}`.trim()));
    }
  }
  const social = cafe.social_links ?? {};
  if (social.instagram) {
    contact.push(el("a", { class: "contact-pill", href: social.instagram, target: "_blank", rel: "noopener" },
      el("span", { class: "ic", html: icons.instagram }), t("contact_instagram")));
  }
  if (social.telegram) {
    contact.push(el("a", { class: "contact-pill", href: social.telegram, target: "_blank", rel: "noopener" },
      el("span", { class: "ic", html: icons.telegram }), t("contact_telegram")));
  }
  if (social.website) {
    contact.push(el("a", { class: "contact-pill", href: social.website, target: "_blank", rel: "noopener" },
      el("span", { class: "ic", html: icons.globe }), t("contact_website")));
  }

  const langSwitch = (cafe.languages?.length ?? 1) > 1
    ? el("div", { class: "menu-lang", role: "group", "aria-label": "Language" },
        ...cafe.languages.map((l) => el("button", {
          class: `chip ${l === lang ? "active" : ""}`,
          onclick: () => switchLang(l),
        }, l === "fa" ? "فارسی" : "English")))
    : null;

  setChildren(header,
    !plain && coverUrl ? el("div", { class: "menu-cover" }, el("img", { src: coverUrl, alt: "", loading: "lazy" })) : null,
    el("div", { class: "menu-head-inner container" },
      el("div", { class: "menu-logo-wrap" },
        logoUrl
          ? el("img", { class: "menu-logo", src: logoUrl, alt: cafe.name })
          : el("div", { class: "menu-logo-fallback" }, (cafe.name || "?").trim().charAt(0))),
      el("div", { class: "menu-title-row" },
        el("h1", { class: "menu-name" }, cafe.name),
        langSwitch),
      cafe.description ? el("p", { class: "menu-desc" }, cafe.description) : null,
      contact.length ? el("div", { class: "menu-contact" }, contact) : null,
    ),
  );
}

/* ---------- nav (search + categories) ---------- */
function renderNav() {
  const nav = $("#menu-nav");
  const cats = menu.categories.filter((c) => c.id !== null);
  setChildren(nav,
    el("div", { class: "menu-nav-inner container" },
      el("div", { class: "search-box" },
        el("span", { class: "ic", html: icons.search }),
        el("input", {
          class: "input", type: "search", id: "menu-search",
          placeholder: t("menu_search_ph"),
          "aria-label": t("search"),
          oninput: debounce((e) => {
            query = e.target.value;
            renderSections();
          }, 220),
        }),
        el("button", {
          class: "search-clear hidden", id: "search-clear", "aria-label": t("close"),
          onclick: (e) => {
            const inp = $("#menu-search");
            inp.value = ""; query = ""; e.target.classList.add("hidden");
            renderSections();
          },
        }, "×"),
      ),
      el("div", { class: "cat-scroll", id: "cat-scroll" },
        el("button", {
          class: `chip ${activeCat === "all" ? "active" : ""}`,
          onclick: () => selectCat("all"),
        }, t("all")),
        ...cats.map((c) => el("button", {
          class: `chip ${activeCat === c.id ? "active" : ""}`,
          "data-cat": c.id,
          onclick: () => selectCat(c.id),
        }, trName(c, menu.categoryTranslations))),
      ),
    ),
  );

  const inp = $("#menu-search");
  inp.addEventListener("input", (e) => {
    $("#search-clear").classList.toggle("hidden", !e.target.value);
  });
}

function selectCat(id) {
  activeCat = id;
  query = "";
  const inp = $("#menu-search");
  if (inp) inp.value = "";
  renderSections();
  if (id !== "all") {
    const sec = $(`#sec-${id}`);
    sec?.scrollIntoView({ behavior: "smooth", block: "start" });
    trackCategoryView(cafe.slug, id, lang);
  }
  renderNavChips();
}

function renderNavChips() {
  const scroll = $("#cat-scroll");
  if (!scroll) return;
  for (const chip of scroll.querySelectorAll(".chip")) {
    const catId = chip.dataset.cat || "all";
    chip.classList.toggle("active", catId === activeCat);
  }
}

/* ---------- product card ---------- */
function productCard(p) {
  const name = trName(p, menu.productTranslations);
  const desc = trDesc(p, menu.productTranslations);
  const unavailable = !p.is_available;
  const imgUrl = publicImageUrl(p.image_path);
  const badgeMap = { popular: t("popular"), new: t("new_badge"), special: t("special") };

  const card = el("button", { class: `product-card ${unavailable ? "unavailable" : ""}`, onclick: () => openProduct(p) },
    imgUrl
      ? el("img", { class: "product-thumb", src: imgUrl, alt: name, loading: "lazy", decoding: "async" })
      : el("div", { class: "product-thumb placeholder", html: icons.cup }),
    el("div", { class: "product-info" },
      el("div", { class: "product-name" }, name,
        p.badge ? el("span", { class: `badge badge-${p.badge}` }, badgeMap[p.badge]) : null),
      desc ? el("div", { class: "product-desc" }, desc) : null,
      el("div", { class: "product-price num" }, formatPrice(cafe, p.price_minor, lang)),
    ),
    unavailable ? el("span", { class: "badge badge-unavailable avail-tag" }, t("menu_unavailable")) : null,
  );
  return card;
}

/* ---------- sections ---------- */
function visibleProducts() {
  let list = menu.products;
  if (cafe.hide_unavailable) list = list.filter((p) => p.is_available);
  return list;
}

function renderSections() {
  const root = $("#menu-sections");
  const all = visibleProducts();

  if (!menu.products.length) {
    setChildren(root, el("div", { class: "state-block" },
      el("div", { class: "empty-art", html: icons.cup }),
      el("h3", {}, t("menu_empty_t")), el("p", {}, t("menu_empty_d"))));
    return;
  }

  // search mode -> flat results grid
  if (query.trim()) {
    const q = norm(query);
    const hits = all.filter((p) =>
      norm(trName(p, menu.productTranslations)).includes(q) ||
      norm(trDesc(p, menu.productTranslations)).includes(q));
    setChildren(root,
      el("section", { class: "cat-section" },
        el("h2", {}, t("search"), el("span", { class: "count num" }, `(${hits.length.toLocaleString(getLang() === "en" ? "en-US" : "fa-IR")})`)),
        hits.length
          ? el("div", { class: "product-grid" }, ...hits.map(productCard))
          : el("div", { class: "state-block" },
              el("div", { class: "empty-art", html: icons.search }),
              el("h3", {}, t("menu_search_empty_t")), el("p", {}, t("menu_search_empty_d")))));
    return;
  }

  const cats = activeCat === "all"
    ? menu.categories.filter((c) => c.id !== null)
    : menu.categories.filter((c) => c.id === activeCat);

  const sections = [];
  const noCat = all.filter((p) => !p.category_id);
  if (activeCat === "all" && noCat.length) {
    sections.push(el("section", { class: "cat-section" },
      el("h2", {}, t("all")),
      el("div", { class: "product-grid" }, ...noCat.map(productCard))));
  }
  for (const c of cats) {
    const items = all.filter((p) => p.category_id === c.id);
    if (!items.length) continue;
    sections.push(el("section", { class: "cat-section", id: `sec-${c.id}` },
      el("h2", {}, trName(c, menu.categoryTranslations),
        el("span", { class: "count num" }, items.length.toLocaleString(getLang() === "en" ? "en-US" : "fa-IR"))),
      el("div", { class: "product-grid" }, ...items.map(productCard))));
  }
  setChildren(root, sections);
}

/* ---------- product modal ---------- */
function openProduct(p) {
  const name = trName(p, menu.productTranslations);
  const desc = trDesc(p, menu.productTranslations);
  const imgUrl = publicImageUrl(p.image_path);
  const badgeMap = { popular: t("popular"), new: t("new_badge"), special: t("special") };
  trackProductView(cafe.slug, p.id, lang);

  const { root } = openModal({ title: name });
  setChildren(root.querySelector(".modal-body"),
    imgUrl ? el("img", { class: "pd-img", src: imgUrl, alt: name }) : null,
    el("div", { class: "pd-badge-row" },
      p.badge ? el("span", { class: `badge badge-${p.badge}` }, badgeMap[p.badge]) : null,
      !p.is_available ? el("span", { class: "badge badge-unavailable" }, t("menu_unavailable")) : null),
    desc ? el("p", { class: "pd-desc" }, desc) : null,
    el("div", { class: "pd-price num" }, formatPrice(cafe, p.price_minor, lang)),
    !p.is_available ? el("div", { class: "pd-unavailable-note" }, t("menu_unavailable")) : null,
  );
  void close;
}

/* ---------- language ---------- */
async function switchLang(l) {
  lang = l;
  localStorage.setItem(`mk_lang_${cafe.id}`, l);
  setLang(l);
  applyDocumentLang(l);
  renderHeader();
  renderNav();
  renderSections();
}

/* ---------- boot ---------- */
async function boot() {
  const slug = resolveSlug();
  if (!slug) {
    showState("notfound", t("menu_notfound_t"), t("menu_notfound_d"));
    return;
  }
  await initApi();

  // skeleton
  setChildren(stateRoot, el("div", { class: "card", style: "max-width:480px;width:100%" },
    ...Array.from({ length: 3 }, () => el("div", { class: "skeleton skel-card", style: "margin-bottom:12px" }))));

  const { data: c, error } = await fetchPublicCafe(slug);
  if (error) {
    showState("notfound", t("menu_load_err"), t("error_generic"));
    return;
  }
  if (!c) {
    showState("notfound", t("menu_notfound_t"), t("menu_notfound_d"));
    return;
  }
  cafe = c;

  if (cafe.service_state === "expired") {
    showState("expired", t("menu_expired_t"), t("menu_expired_d"));
    return;
  }
  if (cafe.service_state === "suspended") {
    showState("suspended", t("menu_suspended_t"), t("menu_suspended_d"));
    return;
  }
  if (cafe.service_state === "cancelled") {
    showState("cancelled", t("menu_cancelled_t"), t("menu_cancelled_d"));
    return;
  }

  const { data, error: mErr } = await fetchPublicMenu(cafe.id);
  if (mErr) {
    showState("notfound", t("menu_load_err"), t("error_generic"));
    return;
  }
  menu = data;

  lang = localStorage.getItem(`mk_lang_${cafe.id}`);
  if (!lang || !cafe.languages.includes(lang)) lang = cafe.default_language || "fa";
  setLang(lang);
  applyDocumentLang(lang);

  applyTheme(cafe.theme_settings);
  renderHeader();
  renderNav();
  renderSections();

  contentRoot.classList.remove("hidden");
  stateRoot.textContent = "";

  setChildren($("#menu-footer"),
    el("div", {}, t("powered_by")),
    IS_DEMO ? el("div", { class: "small" }, "حالت نمایشی — داده‌ها نمونه هستند") : null);

  trackMenuView(cafe.slug, lang);

  // scroll-spy for category chips
  const chips = $("#cat-scroll");
  const observer = new IntersectionObserver((entries) => {
    if (query.trim()) return;
    for (const e of entries) {
      if (e.isIntersecting) {
        activeCat = e.target.id.replace("sec-", "");
        renderNavChips();
      }
    }
  }, { rootMargin: "-30% 0px -60% 0px" });
  for (const sec of document.querySelectorAll(".cat-section[id]")) observer.observe(sec);
  void chips;
}

boot();
