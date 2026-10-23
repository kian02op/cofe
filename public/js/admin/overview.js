/** Overview: stat cards + quick actions. */
import { el, setChildren, formatDate, daysUntil } from "../core/utils.js";
import { t } from "../core/i18n.js";
import { icons } from "../core/icons.js";
import { listProducts, listCategories, fetchAnalyticsDaily } from "../data/api.js";

function statCard(label, value, sub) {
  return el("div", { class: "card stat-card" },
    el("div", { class: "lbl" }, label),
    el("div", { class: "val num" }, value),
    sub ? el("div", { class: "sub" }, sub) : null);
}

export async function renderOverview(root, ctx, { publicMenuUrl, serviceState }) {
  root.textContent = "";
  root.append(el("div", { class: "row", style: "margin-bottom:1rem" },
    el("div", { class: "skeleton", style: "height:130px;flex:1" })));

  const [prods, cats, daily] = await Promise.all([
    listProducts(ctx.cafe.id),
    listCategories(ctx.cafe.id),
    fetchAnalyticsDaily(
      ctx.cafe.id,
      new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10),
      new Date().toISOString().slice(0, 10)),
  ]);

  const activeProducts = (prods.data ?? []).filter((p) => p.is_available && p.is_visible).length;
  const events = daily.data ?? [];
  const visits7 = events.filter((e) => e.event_type === "menu_view").reduce((s, e) => s + Number(e.visits ?? 0), 0);
  const state = serviceState;
  const daysLeft = daysUntil(ctx.subscription?.expires_at);
  const planLabel = t(ctx.subscription?.plan_code === "professional" ? "plan_professional" : "plan_base");

  root.textContent = "";
  setChildren(root,
    el("div", { class: "quick-actions" },
      el("button", { class: "btn btn-primary", onclick: () => { sessionStorage.setItem("mk_open_product_form", "1"); location.hash = "#/products"; } },
        el("span", { html: icons.plus }), t("qa_add_product")),
      el("a", { class: "btn btn-outline", href: publicMenuUrl(), target: "_blank", rel: "noopener" },
        el("span", { html: icons.external }), t("qa_open_menu")),
      el("button", { class: "btn btn-outline", onclick: () => { location.hash = "#/qr"; } },
        el("span", { html: icons.qr }), t("qa_qr")),
    ),
    el("div", { class: "stat-grid" },
      statCard(t("ov_plan"), planLabel,
        state === "active"
          ? (daysLeft != null ? `${daysLeft.toLocaleString("fa-IR")} ${t("ov_days_left")}` : t("sub_no_expiry"))
          : t("st_" + state)),
      statCard(t("ov_active_products"), activeProducts.toLocaleString("fa-IR"),
        `${(prods.data ?? []).length.toLocaleString("fa-IR")} در مجموع`),
      statCard(t("ov_categories"), (cats.data ?? []).length.toLocaleString("fa-IR")),
      statCard(t("ov_visits_7"), visits7.toLocaleString("fa-IR"), t("an_privacy")),
    ),
  );
}
