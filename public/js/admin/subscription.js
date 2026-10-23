/** Subscription page: plan, status, dates, usage meters, upgrade hint. */
import { t } from "../core/i18n.js";
import { el, setChildren, formatDate, daysUntil } from "../core/utils.js";
import { icons } from "../core/icons.js";

const faNum = (n) => Number(n).toLocaleString("fa-IR");

function statusBadge(status) {
  return el("span", { class: `badge badge-status-${status}` }, t("st_" + status));
}

function usageRow(label, used, max) {
  const pct = Math.min(100, Math.round((used / Math.max(max, 1)) * 100));
  return el("div", { class: "limit-row" },
    el("div", { class: "lr-head" },
      el("span", {}, label),
      el("span", { class: "num" }, `${faNum(used)} ${t("of")} ${faNum(max)}`)),
    el("div", { class: `meter ${pct >= 100 ? "full" : pct >= 80 ? "warn" : ""}` },
      el("span", { style: `width:${pct}%` })));
}

export async function renderSubscription(root, ctx, { serviceState, refresh }) {
  const s = ctx.subscription;
  const plan = s?.plan_code === "professional" ? t("plan_professional") : t("plan_base");
  const daysLeft = daysUntil(s?.expires_at);
  void refresh;

  setChildren(root,
    el("div", { class: "card card-pad" },
      el("div", { class: "sub-hero" },
        el("span", { class: "plan-pill" }, plan),
        statusBadge(serviceState),
        el("div", { style: "flex:1" }),
        el("a", { class: "btn btn-outline btn-sm", href: "#/analytics" }, t("nav_analytics"))),
      el("dl", { class: "kv mt-2" },
        el("dt", {}, t("sub_starts")), el("dd", { class: "num" }, formatDate(s?.starts_at, "fa")),
        el("dt", {}, t("sub_expires")), el("dd", { class: "num" },
          s?.expires_at ? `${formatDate(s.expires_at, "fa")}${daysLeft != null && serviceState === "active" ? ` (${faNum(daysLeft)} ${t("ov_days_left")})` : ""}` : t("sub_no_expiry"))),
      el("div", { class: "mt-2", style: "background:var(--info-soft);color:var(--info);border-radius:12px;padding:.7rem .9rem;font-size:.88rem;font-weight:600" },
        el("span", { html: icons.alert, style: "vertical-align:middle" }), ` ${t("sub_renew_hint")}`)),

    el("div", { class: "card card-pad mt-2" },
      el("h3", {}, t("sub_usage")),
      usageRow(t("nav_products"), ctx.usage.products, ctx.limits?.max_products ?? 50),
      usageRow(t("nav_categories"), ctx.usage.categories, ctx.limits?.max_categories ?? 10),
      usageRow("زبان‌ها", ctx.cafe.languages?.length ?? 1, ctx.limits?.max_languages ?? 1)),

    el("div", { class: "card card-pad mt-2" },
      el("h3", {}, "مقایسه پلن‌ها"),
      el("div", { class: "table-wrap" },
        el("table", { class: "data" },
          el("thead", {}, el("tr", {},
            el("th", {}, "امکان"), el("th", {}, t("plan_base")), el("th", {}, t("plan_professional")))),
          el("tbody", {},
            ...[
              ["محصولات فعال", "۵۰", "۲۰۰"],
              ["دسته‌بندی", "۱۰", "۳۰"],
              ["زبان منو", "۱", "۳"],
              ["برچسب (محبوب/جدید/ویژه)", "—", "✓"],
              ["تم پیشرفته", "—", "✓"],
              ["تحلیل پیشرفته", "—", "✓"],
              ["حجم تصویر", "۵۰ مگابایت", "۵۰۰ مگابایت"],
            ].map(([f, b, p]) => el("tr", {}, el("td", {}, f), el("td", { class: "num" }, b), el("td", { class: "num" }, p))))))));
}
