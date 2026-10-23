/** Landing page (Persian default) — renders hero, features and plans from i18n. */
import { IS_DEMO } from "../core/config.js";
import { t, applyDocumentLang } from "../core/i18n.js";
import { el, setChildren, $ } from "../core/utils.js";
import { icons } from "../core/icons.js";
import { showDemoBanner } from "../core/demo-banner.js";

applyDocumentLang("fa");
document.querySelector("[data-brand-name]").textContent = t("brand");
document.querySelector("[data-cta-login]").textContent = t("cta_login");
document.querySelector("[data-cta-demo]").textContent = t("cta_demo");
document.querySelector("[data-footer-note]").textContent = t("footer_note");
document.querySelector("[data-f-login]").textContent = t("login_title");
document.querySelector("[data-f-super]").textContent = t("cta_super");
showDemoBanner(IS_DEMO);

const features = [
  { ic: icons.cup, t: "f1_t", d: "f1_d" },
  { ic: icons.gear, t: "f2_t", d: "f2_d" },
  { ic: icons.qr, t: "f3_t", d: "f3_d" },
  { ic: icons.globe, t: "f4_t", d: "f4_d" },
  { ic: icons.chart, t: "f5_t", d: "f5_d" },
  { ic: icons.sparkle, t: "f6_t", d: "f6_d" },
];

const baseFeatures = ["pb_1", "pb_2", "pb_3", "pb_4", "pb_5", "pb_6"];
const proFeatures = ["pp_1", "pp_2", "pp_3", "pp_4", "pp_5", "pp_6", "pp_7"];

const tick = el("span", { class: "tick", html: icons.check });

function planCard(kind, title, priceKey, items) {
  return el("div", { class: "card card-pad plan-card" },
    kind === "pro" ? el("span", { class: "plan-ribbon" }, "پیشنهادی") : null,
    el("h3", {}, title),
    el("div", { class: "price muted", style: "font-size:.95rem;font-weight:600" }, t(priceKey)),
    el("ul", {}, ...items.map((k) =>
      el("li", {}, el("span", { class: "tick", html: icons.check }), t(k)))),
  );
}

setChildren($("#main"),
  el("section", { class: "hero container", style: "text-align:center" },
    el("h1", {}, t("hero_title")),
    el("p", { class: "lead" }, t("hero_lead")),
    el("div", { class: "hero-cta" },
      el("a", { class: "btn btn-primary btn-lg", href: "/cafe/demo-cafe" },
        el("span", { html: icons.cup }), t("cta_demo")),
      el("a", { class: "btn btn-outline btn-lg", href: "/login" }, t("cta_login"))),
  ),
  el("section", { class: "container" },
    el("h2", { style: "text-align:center;margin-bottom:1.4rem" }, t("features_title")),
    el("div", { class: "feature-grid" }, ...features.map((f) =>
      el("div", { class: "card" },
        el("div", { class: "ic", html: f.ic }),
        el("h3", {}, t(f.t)),
        el("p", { class: "muted", style: "font-size:.92rem;margin:0" }, t(f.d))))),
  ),
  el("section", { class: "container" },
    el("h2", { style: "text-align:center" }, t("plans_title")),
    el("p", { class: "muted", style: "text-align:center;margin-bottom:1.6rem" }, t("plans_lead")),
    el("div", { class: "plan-grid" },
      planCard("base", t("plan_base"), "plan_base_price", baseFeatures),
      planCard("pro", t("plan_professional"), "plan_pro_price", proFeatures)),
  ),
);
