/**
 * Cafe admin dashboard shell: auth guard, context loading, hash router,
 * responsive sidebar, and section mounting. Sections receive a shared ctx
 * and a refresh callback so plan/limits update after changes.
 */
import { initApi, loadAdminContext } from "../data/api.js";
import { IS_DEMO } from "../core/config.js";
import { t, applyDocumentLang } from "../core/i18n.js";
import { el, setChildren, $ } from "../core/utils.js";
import { toast, toastError, emptyState } from "../core/ui.js";
import { icons } from "../core/icons.js";
import { showDemoBanner } from "../core/demo-banner.js";
import { logout, requireSession } from "../auth/auth.js";

import { renderOverview } from "./overview.js";
import { renderProducts } from "./products.js";
import { renderCategories } from "./categories.js";
import { renderSettings } from "./settings.js";
import { renderAppearance } from "./appearance.js";
import { renderQr } from "./qr.js";
import { renderAnalytics } from "./analytics.js";
import { renderSubscription } from "./subscription.js";

applyDocumentLang("fa");
showDemoBanner(IS_DEMO);
document.querySelector("[data-brand-name]").textContent = t("brand");

const ICON_MAP = { menu: icons.menu, external: icons.external, logout: icons.logout };
for (const holder of document.querySelectorAll("[data-ic]")) {
  holder.innerHTML = ICON_MAP[holder.dataset.ic] || "";
}

const ROUTES = [
  { id: "overview", label: t("nav_overview"), ic: icons.cup, render: renderOverview },
  { id: "products", label: t("nav_products"), ic: icons.box, render: renderProducts },
  { id: "categories", label: t("nav_categories"), ic: icons.tag, render: renderCategories },
  { id: "settings", label: t("nav_settings"), ic: icons.gear, render: renderSettings },
  { id: "appearance", label: t("nav_appearance"), ic: icons.palette, render: renderAppearance },
  { id: "qr", label: t("nav_qr"), ic: icons.qr, render: renderQr },
  { id: "analytics", label: t("nav_analytics"), ic: icons.chart, render: renderAnalytics },
  { id: "subscription", label: t("nav_subscription"), ic: icons.card, render: renderSubscription },
];

let ctx = null;
let currentRoute = null;

function features() {
  return ctx?.limits?.features ?? {};
}

function currentServiceState() {
  // mirrors DB cafe_service_state()
  const s = ctx?.subscription;
  const c = ctx?.cafe;
  if (!c) return "not_found";
  if (c.status === "suspended") return "suspended";
  if (c.status === "cancelled") return "cancelled";
  if (s && ["active", "trial"].includes(s.status) && (!s.expires_at || new Date(s.expires_at) > new Date())) return "active";
  if (s && ["active", "trial", "expired"].includes(s.status)) return "expired";
  return s?.status || "expired";
}

function publicMenuUrl() {
  return `${location.origin}/cafe/${ctx.cafe.slug}`;
}

function renderSidebar() {
  const state = currentServiceState();
  // cafe chip
  setChildren($("#side-cafe"),
    el("div", { class: "cafe-chip" },
      ctx.cafe.logo_path
        ? el("img", { src: ctx.cafe.logo_path.startsWith("/") ? ctx.cafe.logo_path : publicMenuUrl(), alt: "", onerror: (e) => { e.target.style.display = "none"; } })
        : null,
      el("div", {},
        el("div", { class: "nm" }, ctx.cafe.name),
        el("div", { class: "pl" }, `${t("ov_plan")}: ${t(ctx.subscription?.plan_code === "professional" ? "plan_professional" : "plan_base")} · ${t("st_" + state)}`)),
    ),
  );
  // nav
  const active = currentRoute || "overview";
  setChildren($("#side-nav"), ...ROUTES.map((r) => {
    const locked =
      (r.id === "appearance" && !features().extended_theme) ||
      (r.id === "analytics" && !features().advanced_analytics);
    return el("button", {
      class: `nav-item ${active === r.id ? "active" : ""}`,
      onclick: () => { location.hash = `#/${r.id}`; closeSidebar(); },
    },
      el("span", { class: "ic", html: r.ic }),
      r.label,
      locked ? el("span", { class: "lock", html: icons.lock }) : null);
  }));
  setChildren($("#side-foot"),
    el("div", { class: "row-between" },
      el("span", { class: "muted small" }, ctx.profile?.display_name || ctx.user.email),
      el("button", { class: "btn btn-ghost btn-sm", onclick: () => logout() },
        el("span", { html: icons.logout }), t("logout"))),
    IS_DEMO ? el("div", { class: "muted small mt-1" }, "حالت نمایشی") : null,
  );
}

function closeSidebar() {
  $("#sidebar").classList.remove("open");
  $(".sidebar-backdrop")?.remove();
}

function openSidebar() {
  $("#sidebar").classList.add("open");
  const bd = el("div", { class: "sidebar-backdrop", onclick: closeSidebar });
  document.body.append(bd);
}

function handleRoute() {
  if (!ctx) return;
  const id = (location.hash || "#/overview").replace("#/", "").split("?")[0];
  const route = ROUTES.find((r) => r.id === id) || ROUTES[0];
  currentRoute = route.id;
  $("#page-title").textContent = route.label;
  renderSidebar();
  const main = $("#main-content");
  main.textContent = "";
  // Expired/suspended: dashboard limited to subscription info + settings view
  const state = currentServiceState();
  if (state !== "active" && !["subscription", "settings", "overview", "qr"].includes(route.id)) {
    setChildren(main, el("div", { class: "card card-pad" },
      el("div", { class: "row", style: "gap:.7rem" },
        el("span", { html: icons.lock, style: "color:var(--warn)" }),
        el("div", {},
          el("h3", {}, t("st_" + state)),
          el("p", { class: "muted", style: "margin:0" }, t("sub_renew_hint")))),
      el("button", { class: "btn btn-primary mt-2", onclick: () => { location.hash = "#/subscription"; } }, t("nav_subscription"))));
    return;
  }
  route.render(main, ctx, { refresh, publicMenuUrl, serviceState: state });
}

async function refresh() {
  ctx = await loadAdminContext();
  handleRoute();
}

window.addEventListener("hashchange", handleRoute);
$("#menu-toggle").addEventListener("click", openSidebar);
$("#btn-logout").addEventListener("click", () => logout());
$("#btn-public").addEventListener("click", () => {
  if (ctx?.cafe) window.open(publicMenuUrl(), "_blank");
});

(async function boot() {
  const session = await requireSession();
  if (!session) return;
  await initApi();
  ctx = await loadAdminContext();
  if (!ctx) return;

  if (!ctx.cafe) {
    emptyState($("#main-content"), {
      title: "کافه‌ای به حساب شما متصل نیست",
      desc: "این حساب کاربری به هیچ کافه‌ای متصل نیست. با مدیر پلتفرم تماس بگیرید.",
    });
    $("#page-title").textContent = t("brand");
    return;
  }
  handleRoute();
})();
