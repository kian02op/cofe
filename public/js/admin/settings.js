/** Cafe settings: identity, branding uploads, contact, languages, currency. */
import {
  updateCafe, uploadImage, deleteImage, publicImageUrl,
} from "../data/api.js";
import { t } from "../core/i18n.js";
import { el, setChildren, $, isValidSlug, mapDbError } from "../core/utils.js";
import { toastSuccess, toastError, setBusy, confirmDialog as cd } from "../core/ui.js";
import { icons } from "../core/icons.js";

function imgField(label, currentPath, kind, ctx, maxMB, onNewPath) {
  let path = currentPath;
  let newFile = null;
  const preview = el("img", { class: "img-preview", alt: "", src: path ? publicImageUrl(path) : "" });
  if (!path) preview.style.visibility = "hidden";
  const fileInput = el("input", { type: "file", accept: "image/jpeg,image/png,image/webp", class: "hidden" });
  const progress = el("span", { class: "upload-progress" });
  const pick = el("button", { class: "btn btn-outline btn-sm", type: "button", onclick: () => fileInput.click() },
    el("span", { html: icons.upload }), "انتخاب تصویر");
  const removeB = el("button", {
    class: "btn btn-ghost btn-sm", type: "button", style: "color:var(--danger)",
    onclick: () => { newFile = null; path = null; preview.removeAttribute("src"); preview.style.visibility = "hidden"; },
  }, "حذف");
  fileInput.addEventListener("change", () => {
    const f = fileInput.files?.[0];
    if (!f) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(f.type)) { toastError(t("image_bad_type")); return; }
    if (f.size > maxMB * 1024 * 1024) { toastError(t("image_too_large")); return; }
    newFile = f;
    preview.src = URL.createObjectURL(f);
    preview.style.visibility = "visible";
  });
  return { preview, fileInput, progress, pick, removeB, label,
    async commit() {
      if (newFile) {
        const old = path;
        const { path: newPath, error } = await uploadImage(ctx.cafe.id, kind, newFile, maxMB);
        if (error) { throw error; }
        await onNewPath(newPath);
        if (old && old !== newPath) await deleteImage(old);
        path = newPath;
        newFile = null;
      }
    },
    current: () => path };
}

export async function renderSettings(root, ctx, { refresh }) {
  const cafe = ctx.cafe;
  const maxMB = ctx.limits?.max_image_file_mb ?? 2;
  const isProLangs = (ctx.limits?.max_languages ?? 1) > 1;

  const fName = el("input", { class: "input", value: cafe.name ?? "", maxlength: 120, required: true });
  const fSlug = el("input", { class: "input", dir: "ltr", value: cafe.slug ?? "", maxlength: 63 });
  const fDesc = el("textarea", { class: "textarea", textContent: cafe.description ?? "" });
  const fAddress = el("input", { class: "input", value: cafe.address ?? "" });
  const fPhone = el("input", { class: "input", dir: "ltr", value: cafe.phone ?? "", inputmode: "tel" });

  // opening hours rows
  const hoursRows = [];
  const hoursWrap = el("div", { class: "stack", style: "gap:.5rem" });
  function addHoursRow(label = "", value = "") {
    const l = el("input", { class: "input", value: label, placeholder: t("s_hours_label"), maxlength: 60 });
    const v = el("input", { class: "input", value: value, placeholder: t("s_hours_value"), maxlength: 60 });
    const del = el("button", { class: "btn btn-ghost btn-sm", type: "button", style: "color:var(--danger)", html: icons.trash, onclick: () => { row.remove(); hoursRows.splice(hoursRows.indexOf(pair), 1); } });
    const row = el("div", { class: "input-row" }, l, v, del);
    const pair = { l, v };
    hoursRows.push(pair);
    hoursWrap.append(row);
  }
  for (const row of cafe.opening_hours ?? []) addHoursRow(row.label ?? "", row.value ?? "");
  if (!(cafe.opening_hours ?? []).length) addHoursRow();

  // socials
  const fInstagram = el("input", { class: "input", dir: "ltr", value: cafe.social_links?.instagram ?? "", placeholder: "https://instagram.com/…" });
  const fTelegram = el("input", { class: "input", dir: "ltr", value: cafe.social_links?.telegram ?? "", placeholder: "https://t.me/…" });
  const fWebsite = el("input", { class: "input", dir: "ltr", value: cafe.social_links?.website ?? "", placeholder: "https://…" });

  // language
  const fDefaultLang = el("select", { class: "select" },
    el("option", { value: "fa", selected: cafe.default_language === "fa" }, "فارسی"),
    el("option", { value: "en", selected: cafe.default_language === "en" }, "English"));
  const langChecks = {};
  const langBox = el("div", { class: "stack", style: "gap:.5rem" });
  for (const l of ["fa", "en"]) {
    const cb = el("input", {
      type: "checkbox", checked: (cafe.languages ?? ["fa"]).includes(l), disabled: l === "fa" || !isProLangs,
      onchange: () => updateLangHint(),
    });
    langChecks[l] = cb;
    langBox.append(el("label", { class: "row", style: "gap:.6rem;cursor:pointer" }, cb,
      el("span", {}, l === "fa" ? "فارسی" : "English"),
      l === "en" && !isProLangs ? el("span", { class: "badge", style: "background:var(--warn-soft);color:var(--warn)" }, t("plan_professional")) : null));
  }
  function updateLangHint() {
    const enabled = Object.entries(langChecks).filter(([, cb]) => cb.checked).map(([l]) => l);
    if (enabled.length > (ctx.limits?.max_languages ?? 1)) {
      const last = Object.entries(langChecks).reverse().find(([, cb]) => cb.checked);
      if (last) last[1].checked = false;
      toastError(t("limit_languages", { max: ctx.limits?.max_languages ?? 1 }));
    }
  }

  // currency
  const fCurrency = el("select", { class: "select" },
    ...["IRR", "USD", "EUR", "AED", "TRY"].map((c) =>
      el("option", { value: c, selected: cafe.currency_code === c }, c)));
  const fCurrencyDisplay = el("input", { class: "input", value: cafe.currency_display ?? "", placeholder: "تومان" });
  const fDivisor = el("input", { class: "input num", dir: "ltr", type: "number", min: "1", value: String(cafe.price_divisor ?? 1) });
  const fHideUn = el("input", { type: "checkbox", checked: !!cafe.hide_unavailable });

  const logoF = imgField(t("s_logo"), cafe.logo_path, "branding", ctx, maxMB, async (p) => { await updateCafe(cafe.id, { logo_path: p }); });
  const coverF = imgField(t("s_cover"), cafe.cover_image_path, "branding", ctx, maxMB, async (p) => { await updateCafe(cafe.id, { cover_image_path: p }); });

  const saveBtn = el("button", { class: "btn btn-primary btn-lg" }, t("save"));

  const form = el("div", { class: "stack", style: "gap:1.4rem" },
    el("div", { class: "card card-pad" },
      el("h3", {}, t("settings_title")),
      el("div", { class: "grid-2" },
        el("div", { class: "field" }, el("label", {}, t("s_name"), " *"), fName),
        el("div", { class: "field" },
          el("label", {}, t("s_slug")),
          fSlug,
          el("div", { class: "hint ltr-num" }, `${location.origin}/cafe/${cafe.slug}`),
          el("div", { class: "hint" }, t("s_slug_hint")))),
      el("div", { class: "field" }, el("label", {}, t("s_desc")), fDesc),
      el("div", { class: "grid-2" },
        el("div", { class: "field" }, el("label", {}, t("s_logo")), el("div", { class: "img-upload" }, logoF.preview, el("div", { class: "actions" }, logoF.pick, logoF.removeB, logoF.fileInput))),
        el("div", { class: "field" }, el("label", {}, t("s_cover")), el("div", { class: "img-upload" }, coverF.preview, el("div", { class: "actions" }, coverF.pick, coverF.removeB, coverF.fileInput))))),

    el("div", { class: "card card-pad" },
      el("h3", {}, "تماس و اطلاعات"),
      el("div", { class: "grid-2" },
        el("div", { class: "field" }, el("label", {}, t("s_phone")), fPhone),
        el("div", { class: "field" }, el("label", {}, t("s_address")), fAddress)),
      el("div", { class: "field" },
        el("label", {}, t("s_hours")),
        el("div", { class: "hint", style: "margin-bottom:.5rem" }, t("s_hours_hint")),
        hoursWrap,
        el("button", { class: "btn btn-outline btn-sm mt-1", type: "button", onclick: () => addHoursRow() },
          el("span", { html: icons.plus }), t("add_row"))),
      el("div", { class: "grid-3" },
        el("div", { class: "field" }, el("label", {}, t("contact_instagram")), fInstagram),
        el("div", { class: "field" }, el("label", {}, t("contact_telegram")), fTelegram),
        el("div", { class: "field" }, el("label", {}, t("contact_website")), fWebsite))),

    el("div", { class: "card card-pad" },
      el("h3", {}, "زبان و ارز"),
      el("div", { class: "grid-2" },
        el("div", { class: "field" }, el("label", {}, t("s_language")), fDefaultLang),
        el("div", { class: "field" }, el("label", {}, t("s_languages")), langBox)),
      el("div", { class: "grid-3" },
        el("div", { class: "field" }, el("label", {}, t("s_currency")), fCurrency),
        el("div", { class: "field" },
          el("label", {}, t("s_currency_display")), fCurrencyDisplay,
          el("div", { class: "hint" }, t("s_currency_display_hint"))),
        el("div", { class: "field" },
          el("label", {}, t("s_divisor")), fDivisor,
          el("div", { class: "hint" }, t("s_divisor_hint")))),
      el("label", { class: "switch" }, fHideUn, el("span", { class: "track" }), el("span", {}, t("s_hide_unavailable")))),

    el("div", { class: "row" }, saveBtn));

  setChildren(root, form);

  saveBtn.addEventListener("click", async () => {
    // validation
    if (!fName.value.trim()) { fName.classList.add("invalid"); toastError(t("err_name_required")); return; }
    fName.classList.remove("invalid");
    const slug = fSlug.value.trim().toLowerCase();
    if (!isValidSlug(slug)) { fSlug.classList.add("invalid"); toastError(t("s_slug_hint")); return; }
    fSlug.classList.remove("invalid");
    const divisor = Math.max(1, parseInt(fDivisor.value || "1", 10));

    const slugChanged = slug !== cafe.slug;
    if (slugChanged) {
      const ok = await cd({
        title: t("s_slug"),
        message: t("s_slug_confirm"),
        confirmText: t("confirm"), danger: true,
      });
      if (!ok) return;
    }

    setBusy(saveBtn, true, t("loading"));
    try {
      const enabledLangs = Object.entries(langChecks).filter(([, cb]) => cb.checked).map(([l]) => l);
      const { error } = await updateCafe(cafe.id, {
        name: fName.value.trim(),
        slug,
        description: fDesc.value.trim() || null,
        address: fAddress.value.trim() || null,
        phone: fPhone.value.trim() || null,
        opening_hours: hoursRows.filter((r) => r.l.value.trim() || r.v.value.trim())
          .map((r) => ({ label: r.l.value.trim(), value: r.v.value.trim() })),
        social_links: {
          ...(fInstagram.value.trim() ? { instagram: fInstagram.value.trim() } : {}),
          ...(fTelegram.value.trim() ? { telegram: fTelegram.value.trim() } : {}),
          ...(fWebsite.value.trim() ? { website: fWebsite.value.trim() } : {}),
        },
        default_language: fDefaultLang.value,
        languages: enabledLangs.length ? enabledLangs : ["fa"],
        currency_code: fCurrency.value,
        currency_display: fCurrencyDisplay.value.trim() || null,
        price_divisor: divisor,
        hide_unavailable: fHideUn.checked,
      });
      if (error) throw error;

      await logoF.commit();
      await coverF.commit();

      toastSuccess(t("s_saved"));
      await refresh();
    } catch (err) {
      setBusy(saveBtn, false);
      const msg = mapDbError(err);
      if (msg === "slug_taken") toastError(t("slug_taken"));
      else toastError(t(msg));
    }
  });
  void confirmDialog;
}
