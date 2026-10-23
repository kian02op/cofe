/** Analytics: visits chart, top categories/products. Base = 7-day basic; Pro = full. */
import { fetchAnalyticsDaily, listProducts, listCategories } from "../data/api.js";
import { t } from "../core/i18n.js";
import { el, setChildren, mapDbError } from "../core/utils.js";
import { barChart, emptyState } from "../core/ui.js";
import { icons } from "../core/icons.js";

const faNum = (n) => Number(n).toLocaleString("fa-IR");
const dayLabel = (iso, lang) => {
  const d = new Date(iso + "T00:00:00Z");
  return lang === "en"
    ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })
    : d.toLocaleDateString("fa-IR", { day: "numeric", month: "short" });
};

function topList(container, rows, emptyText) {
  if (!rows.length) {
    setChildren(container, el("p", { class: "muted small", style: "text-align:center" }, emptyText));
    return;
  }
  const max = Math.max(...rows.map((r) => r.count));
  setChildren(container, el("div", { class: "rank-list" }, ...rows.map((r, i) =>
    el("div", { class: "rank-row" },
      el("span", { class: "pos num" }, faNum(i + 1)),
      el("div", { class: "bar-wrap" },
        el("div", { class: "nm" }, r.name),
        el("div", { class: "bar", style: `width:${Math.max(6, (r.count / max) * 100)}%` })),
      el("span", { class: "ct num" }, faNum(r.count))))));
}

export async function renderAnalytics(root, ctx, { serviceState }) {
  const isPro = ctx.limits?.features?.advanced_analytics === true;
  let days = isPro ? 30 : 7;

  const chartBox = el("div", { class: "chart-box" });
  const topCat = el("div", {});
  const topProd = el("div", {});
  const totals = el("div", { class: "stat-grid", style: "margin-bottom:1rem" });
  const rangeTabs = el("div", { class: "range-tabs" });

  async function load() {
    chartBox.textContent = "";
    chartBox.append(el("div", { class: "skeleton", style: "height:180px" }));
    const from = new Date(Date.now() - (days - 1) * 86400000).toISOString().slice(0, 10);
    const to = new Date().toISOString().slice(0, 10);
    const { data, error } = await fetchAnalyticsDaily(ctx.cafe.id, from, to);
    if (error) {
      chartBox.textContent = "";
      chartBox.append(el("p", { class: "muted" }, t(mapDbError(error))));
      return;
    }
    const rows = data ?? [];

    // daily visits series
    const byDay = new Map();
    for (let i = days - 1; i >= 0; i--) {
      const iso = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      byDay.set(iso, 0);
    }
    let totalVisits = 0, totalViews = 0;
    const perCat = new Map(), perProd = new Map();
    for (const r of rows) {
      const n = Number(r.events ?? 0);
      const v = Number(r.visits ?? 0);
      if (r.event_type === "menu_view") {
        totalVisits += v;
        byDay.set(r.visit_date, (byDay.get(r.visit_date) ?? 0) + v);
      } else if (r.event_type === "product_view") {
        totalViews += n;
        if (r.category_id) perCat.set(r.category_id, (perCat.get(r.category_id) ?? 0) + n);
        if (r.product_id) perProd.set(r.product_id, (perProd.get(r.product_id) ?? 0) + n);
      }
    }
    const series = [...byDay.entries()].map(([iso, v]) => ({ label: dayLabel(iso, "fa"), value: v }));

    totals.textContent = "";
    totals.append(
      el("div", { class: "card stat-card" }, el("div", { class: "lbl" }, t("an_visits")), el("div", { class: "val num" }, faNum(totalVisits))),
      el("div", { class: "card stat-card" }, el("div", { class: "lbl" }, t("an_views")), el("div", { class: "val num" }, faNum(totalViews))),
    );

    chartBox.textContent = "";
    if (!rows.length) {
      chartBox.append(emptyState(chartBox, { title: t("an_empty") }));
    } else {
      barChart(chartBox, series, { height: 190, formatValue: faNum });
    }

    // top lists (Pro only)
    if (isPro) {
      const [prods, cats] = await Promise.all([listProducts(ctx.cafe.id), listCategories(ctx.cafe.id)]);
      const pName = new Map((prods.data ?? []).map((p) => [p.id, p.name]));
      const cName = new Map((cats.data ?? []).map((c) => [c.id, c.name]));
      const catRows = [...perCat.entries()].map(([id, count]) => ({ name: cName.get(id) ?? "—", count }))
        .sort((a, b) => b.count - a.count).slice(0, 5);
      const prodRows = [...perProd.entries()].map(([id, count]) => ({ name: pName.get(id) ?? "—", count }))
        .sort((a, b) => b.count - a.count).slice(0, 5);
      topList(topCat, catRows, t("an_empty"));
      topList(topProd, prodRows, t("an_empty"));
    }
    drawRangeTabs();
  }

  function drawRangeTabs() {
    const options = [[7, t("an_last_7")], [30, t("an_last_30")], [90, t("an_last_90")]];
    setChildren(rangeTabs, ...options.map(([d, label]) =>
      el("button", {
        class: `chip ${days === d ? "active" : ""}`,
        disabled: !isPro,
        title: !isPro ? t("an_locked") : "",
        onclick: () => { days = d; load(); },
      }, label)));
  }

  setChildren(root,
    el("div", { class: "section-head" }, el("h2", {}, t("analytics_title")), rangeTabs),
    totals,
    el("div", { class: "card chart-card" },
      el("h3", { style: "margin-bottom:.8rem" }, t("an_visits")),
      chartBox),
    isPro ? el("div", { class: "grid-2 mt-2" },
      el("div", { class: "card chart-card" }, el("h3", {}, t("an_top_categories")), topCat),
      el("div", { class: "card chart-card" }, el("h3", {}, t("an_top_products")), topProd))
      : el("div", { class: "locked-panel mt-2" },
          el("div", { class: "ic", html: icons.lock }),
          el("p", { style: "font-weight:700;margin:.4rem 0" }, t("an_locked")),
          el("a", { class: "btn btn-sm btn-outline", href: "#/subscription" }, t("upgrade"))),
    el("p", { class: "muted small mt-2", style: "text-align:center" }, t("an_privacy")),
  );

  await load();
  void serviceState;
}
