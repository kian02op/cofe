/** Appearance editor: live theme preview. Base = standard options, Pro = extended. */
import { updateCafe } from "../data/api.js";
import { t } from "../core/i18n.js";
import { el, setChildren, mapDbError } from "../core/utils.js";
import { toastSuccess, toastError, setBusy } from "../core/ui.js";

const PRESETS = ["#7c4a2d", "#5d4037", "#a1552f", "#c2410c", "#b45309", "#4d7c0f", "#0f766e", "#1d4ed8", "#7c3aed", "#be185d", "#334155", "#18181b"];

export async function renderAppearance(root, ctx, { refresh }) {
  const cafe = ctx.cafe;
  const theme = { ...cafe.theme_settings };
  const isPro = ctx.limits?.features?.extended_theme === true;

  const preview = el("div", { class: "theme-preview" });
  function drawPreview() {
    preview.style.setProperty("--tp-primary", theme.primary || "#7c4a2d");
    preview.style.setProperty("--tp-radius", `${theme.radius ?? 14}px`);
    preview.style.setProperty("--tp-bg", theme.bg === "dark" ? "#171310" : theme.bg === "white" ? "#fff" : "#faf7f2");
    setChildren(preview,
      el("div", { class: "tp-head" },
        el("div", { class: "tp-logo" }),
        el("div", {},
          el("div", { style: "font-weight:800" }, cafe.name),
          el("div", { class: "small muted" }, "پیش‌نمایش زنده"))),
      el("div", { class: "tp-body" },
        el("div", { class: "tp-card" }, el("div", { class: "tp-thumb" }),
          el("div", { style: "flex:1" },
            el("div", { style: "font-weight:700;font-size:.9rem" }, "کاپوچینو"),
            el("div", { class: "small muted" }, "نمونه محصول")),
          el("div", { style: "font-weight:800;color:var(--tp-primary)" }, "۱۲۰٬۰۰۰ تومان")),
        el("div", { class: "tp-card" }, el("div", { class: "tp-thumb" }),
          el("div", { style: "flex:1" },
            el("div", { style: "font-weight:700;font-size:.9rem" }, "چیزکیک"),
            el("div", { class: "small muted" }, "نمونه محصول")),
          el("div", { style: "font-weight:800;color:var(--tp-primary)" }, "۱۸۰٬۰۰۰ تومان"))));
  }
  drawPreview();

  /* controls */
  const swatches = el("div", { class: "swatches", role: "radiogroup", "aria-label": t("ap_primary") });
  function drawSwatches() {
    setChildren(swatches, ...PRESETS.map((c) =>
      el("button", {
        type: "button", class: `swatch ${theme.primary === c ? "active" : ""}`,
        style: `background:${c}`, "aria-label": c,
        onclick: () => { theme.primary = c; drawSwatches(); drawPreview(); },
      }, theme.primary === c ? el("span", { class: "tick", html: "✓" }) : null)));
  }
  drawSwatches();
  const customColor = el("input", {
    type: "color", value: theme.primary || "#7c4a2d",
    style: "width:42px;height:42px;padding:2px;border-radius:12px;border:1px solid var(--border-strong);cursor:pointer",
    "aria-label": t("ap_primary"),
    oninput: (e) => { theme.primary = e.target.value; drawSwatches(); drawPreview(); },
  });

  const radius = el("input", { type: "range", min: "0", max: "24", value: String(theme.radius ?? 14) });
  radius.addEventListener("input", () => { theme.radius = Number(radius.value); radiusOut.value = radius.value; drawPreview(); });
  const radiusOut = el("output", {}, String(theme.radius ?? 14));

  const font = el("input", { type: "range", min: "90", max: "115", step: "5", value: String(Math.round((theme.font_scale ?? 1) * 100)) });
  font.addEventListener("input", () => { theme.font_scale = Number(font.value) / 100; fontOut.value = `${font.value}%`; drawPreview(); });
  const fontOut = el("output", {}, `${Math.round((theme.font_scale ?? 1) * 100)}%`);

  // Pro controls
  const headerStyle = el("select", { class: "select", disabled: !isPro },
    el("option", { value: "cover", selected: (theme.header_style ?? "cover") === "cover" }, t("ap_header_cover")),
    el("option", { value: "plain", selected: theme.header_style === "plain" }, t("ap_header_plain")));
  headerStyle.addEventListener("change", () => { theme.header_style = headerStyle.value; drawPreview(); });

  const bg = el("select", { class: "select", disabled: !isPro },
    el("option", { value: "cream", selected: (theme.bg ?? "cream") === "cream" }, t("ap_bg_cream")),
    el("option", { value: "white", selected: theme.bg === "white" }, t("ap_bg_white")),
    el("option", { value: "dark", selected: theme.bg === "dark" }, t("ap_bg_dark")));
  bg.addEventListener("change", () => { theme.bg = bg.value; drawPreview(); });

  const cardStyle = el("select", { class: "select", disabled: !isPro },
    el("option", { value: "soft", selected: (theme.card_style ?? "soft") === "soft" }, "سایه‌دار"),
    el("option", { value: "outlined", selected: theme.card_style === "outlined" }, "خط‌دار"));
  cardStyle.addEventListener("change", () => { theme.card_style = cardStyle.value; drawPreview(); });

  const proHint = !isPro ? el("p", { class: "hint" }, el("span", { html: "🔒 " }), t("ap_pro_locked")) : null;

  const saveBtn = el("button", { class: "btn btn-primary btn-lg" }, t("save"));
  saveBtn.addEventListener("click", async () => {
    setBusy(saveBtn, true, t("loading"));
    const { error } = await updateCafe(cafe.id, { theme_settings: theme });
    setBusy(saveBtn, false);
    if (error) { toastError(t(mapDbError(error))); return; }
    toastSuccess(t("ap_saved"));
    await refresh();
  });

  setChildren(root,
    el("div", { class: "grid-2", style: "align-items:start" },
      el("div", { class: "card card-pad stack" },
        el("h3", {}, t("appearance_title")),
        el("div", { class: "field" }, el("label", {}, t("ap_primary")), swatches,
          el("div", { class: "row mt-1" }, customColor, el("span", { class: "small muted" }, "رنگ سفارشی"))),
        el("div", { class: "field" }, el("label", {}, t("ap_radius")),
          el("div", { class: "range-row" }, radius, radiusOut)),
        el("div", { class: "field" }, el("label", {}, t("ap_font")),
          el("div", { class: "range-row" }, font, fontOut)),
        el("div", { class: "field" }, el("label", {}, t("ap_header")), headerStyle),
        el("div", { class: "field" }, el("label", {}, t("ap_bg")), bg),
        el("div", { class: "field" }, el("label", {}, "سبک کارت محصولات"), cardStyle),
        proHint,
        saveBtn),
      el("div", {}, preview)),
  );
}
