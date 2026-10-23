/**
 * Products management: list, search/filter, create/edit modal with image
 * upload, availability toggle, reorder, delete confirm, plan-limit prompts.
 */
import {
  listProducts, listCategories, createProduct, updateProduct, deleteProduct,
  reorder, uploadImage, deleteImage, publicImageUrl, listProductTranslations,
  upsertProductTranslation,
} from "../data/api.js";
import { t } from "../core/i18n.js";
import { el, setChildren, $, parsePriceInput, formatPrice, validateImage, mapDbError } from "../core/utils.js";
import { toastSuccess, toastError, openModal, confirmDialog, setBusy, emptyState, skeletonRows } from "../core/ui.js";
import { icons } from "../core/icons.js";

let state = { products: [], categories: [], translations: [], q: "", cat: "", avail: "" };

function limitMessage() {
  const max = state.maxProducts;
  return t("limit_products", { max });
}

/* ---------- row ---------- */
function rowEl(p, ctx, reload) {
  const imgUrl = publicImageUrl(p.image_path);
  const idx = state.filtered.findIndex((x) => x.id === p.id);
  const up = el("button", { disabled: idx <= 0, "aria-label": "بالا", onclick: () => move(p, -1, reload) , html: icons.chevronUp});
  const down = el("button", { disabled: idx < 0 || idx >= state.filtered.length - 1, "aria-label": "پایین", onclick: () => move(p, 1, reload), html: icons.chevronDown });
  return el("div", { class: "pl-row" },
    el("div", { class: "order-btns" }, up, down),
    imgUrl
      ? el("img", { class: "pl-img", src: imgUrl, alt: "", loading: "lazy" })
      : el("div", { class: "pl-img placeholder", html: icons.image }),
    el("div", { class: "pl-info" },
      el("div", { class: "pl-name" }, p.name,
        p.badge ? el("span", { class: `badge badge-${p.badge}` }, t(p.badge === "popular" ? "popular" : p.badge === "new" ? "new_badge" : "special")) : null,
        !p.is_visible ? el("span", { class: "badge badge-unavailable" }, "مخفی") : null),
      el("div", { class: "pl-meta" },
        el("span", {}, state.categories.find((c) => c.id === p.category_id)?.name || "بدون دسته"),
        el("span", { class: "num" }, `#${p.display_order}`))),
    el("div", { class: "pl-price num" }, formatPrice(ctx.cafe, p.price_minor, "fa")),
    el("label", { class: "mini-switch", title: t("p_available") },
      el("input", {
        type: "checkbox", checked: p.is_available,
        onchange: async (e) => {
          const { error } = await updateProduct(p.id, { is_available: e.target.checked });
          if (error) { toastError(t(mapDbError(error))); e.target.checked = !e.target.checked; return; }
          p.is_available = e.target.checked;
          toastSuccess(t("p_updated"));
        },
      }),
      el("span", { class: "track" })),
    el("div", { class: "pl-actions" },
      el("button", { class: "btn btn-ghost btn-sm", "aria-label": t("edit"), onclick: () => openForm(ctx, p, reload), html: icons.edit }),
      el("button", { class: "btn btn-ghost btn-sm", style: "color:var(--danger)", "aria-label": t("delete"), onclick: () => remove(p, reload), html: icons.trash }),
    ),
  );
}

async function move(p, dir, reload) {
  const list = state.filtered;
  const idx = list.findIndex((x) => x.id === p.id);
  const swapWith = list[idx + dir];
  if (!swapWith) return;
  // swap display orders (use fractional-free ints: swap values)
  const a = p.display_order, b = swapWith.display_order;
  await updateProduct(p.id, { display_order: b === a ? b + dir : b });
  await updateProduct(swapWith.id, { display_order: a });
  await reload();
}

async function remove(p, reload) {
  const ok = await confirmDialog({
    title: t("delete"),
    message: t("p_delete_confirm", { name: p.name }),
    confirmText: t("delete"),
    danger: true,
  });
  if (!ok) return;
  const { error } = await deleteProduct(p.id);
  if (error) { toastError(t(mapDbError(error))); return; }
  if (p.image_path) await deleteImage(p.image_path); // avoid orphaned files
  toastSuccess(t("p_deleted"));
  await reload();
}

/* ---------- create / edit form ---------- */
function openForm(ctx, product, reload) {
  const isEdit = !!product;
  const canBadge = ctx.limits?.features?.badges === true;
  const maxMB = ctx.limits?.max_image_file_mb ?? 2;

  const fName = el("input", { class: "input", value: product?.name ?? "", required: true, maxlength: 160 });
  const fDesc = el("textarea", { class: "textarea", textContent: product?.description ?? "" });
  const fPrice = el("input", {
    class: "input num", type: "text", inputmode: "numeric", dir: "ltr", style: "text-align:end",
    value: product ? String(product.price_minor / (ctx.cafe.price_divisor || 1)) : "",
  });
  const catOpts = [{ id: "", name: "بدون دسته" }, ...state.categories];
  const fCat = el("select", { class: "select" },
    ...catOpts.map((c) => el("option", { value: c.id, selected: (product?.category_id ?? "") === c.id }, c.name)));
  const fAvail = el("input", { type: "checkbox", checked: product?.is_available ?? true });
  const fVis = el("input", { type: "checkbox", checked: product?.is_visible ?? true });
  const fBadge = el("select", { class: "select", disabled: !canBadge },
    el("option", { value: "" }, t("badge_none")),
    el("option", { value: "popular", selected: product?.badge === "popular" }, t("popular")),
    el("option", { value: "new", selected: product?.badge === "new" }, t("new_badge")),
    el("option", { value: "special", selected: product?.badge === "special" }, t("special")));

  // image picker
  let currentImagePath = product?.image_path ?? null;
  let newFile = null;
  const preview = el("img", { class: "img-preview", alt: "", src: currentImagePath ? publicImageUrl(currentImagePath) : "" });
  if (!currentImagePath) preview.style.visibility = "hidden";
  const fileInput = el("input", { type: "file", accept: "image/jpeg,image/png,image/webp", class: "hidden" });
  const progress = el("span", { class: "upload-progress" });
  const pickBtn = el("button", { class: "btn btn-outline btn-sm", onclick: () => fileInput.click(), type: "button" },
    el("span", { html: icons.upload }), "انتخاب تصویر");
  const removeBtn = el("button", {
    class: "btn btn-ghost btn-sm", style: "color:var(--danger)", type: "button",
    onclick: () => { newFile = null; currentImagePath = null; preview.removeAttribute("src"); preview.style.visibility = "hidden"; progress.textContent = ""; },
  }, "حذف تصویر");
  fileInput.addEventListener("change", () => {
    const f = fileInput.files?.[0];
    if (!f) return;
    const v = validateImage(f, maxMB);
    if (!v.ok) { toastError(t(v.code)); fileInput.value = ""; return; }
    newFile = f;
    preview.src = URL.createObjectURL(f);
    preview.style.visibility = "visible";
    progress.textContent = "";
  });

  const nameEn = el("input", { class: "input", dir: "ltr", maxlength: 160, value: "", placeholder: "English name (optional)" });
  const descEn = el("textarea", { class: "textarea", dir: "ltr", placeholder: "English description (optional)" });
  if (isEdit && product) {
    const tr = state.translations.find((x) => x.product_id === product.id && x.lang === "en");
    if (tr) { nameEn.value = tr.name; descEn.value = tr.description ?? ""; }
  }
  const showEn = (ctx.cafe.languages ?? []).includes("en");

  const saveBtn = el("button", { class: "btn btn-primary", type: "submit" }, t("save"));
  const form = el("form", { novalidate: true },
    el("div", { class: "field" }, el("label", {}, t("p_name"), " *"), fName),
    el("div", { class: "field" }, el("label", {}, t("p_desc")), fDesc),
    el("div", { class: "grid-2" },
      el("div", { class: "field" },
        el("label", {}, `${t("p_price")} (${ctx.cafe.currency_display || ctx.cafe.currency_code}) *`),
        fPrice),
      el("div", { class: "field" }, el("label", {}, t("p_category")), fCat)),
    el("div", { class: "field" },
      el("label", {}, t("p_image")),
      el("div", { class: "img-upload" },
        preview,
        el("div", { class: "actions" }, pickBtn, removeBtn, progress, fileInput))),
    el("div", { class: "grid-2" },
      el("div", { class: "field" }, el("label", {}, t("p_badge")), fBadge,
        !canBadge ? el("div", { class: "hint" }, t("feature_badges")) : null),
      el("div", { class: "field" },
        el("label", {}, "وضعیت"),
        el("div", { class: "stack", style: "gap:.5rem" },
          el("label", { class: "switch" }, fAvail, el("span", { class: "track" }), el("span", {}, t("p_available"))),
          el("label", { class: "switch" }, fVis, el("span", { class: "track" }), el("span", {}, t("p_visible")))))),
    showEn ? el("fieldset", {},
      el("legend", {}, "ترجمه انگلیسی"),
      el("div", { class: "field" }, el("label", {}, "Name (EN)"), nameEn),
      el("div", { class: "field" }, el("label", {}, "Description (EN)"), descEn)) : null,
    el("div", { class: "modal-foot", style: "border:none;padding:0" },
      el("button", { class: "btn btn-outline", type: "button", onclick: () => m.close() }, t("cancel")),
      saveBtn),
  );

  const m = openModal({ title: isEdit ? t("edit_product") : t("add_product"), body: form });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    // validation
    let valid = true;
    if (!fName.value.trim()) { fName.classList.add("invalid"); valid = false; } else fName.classList.remove("invalid");
    const price = parsePriceInput(fPrice.value) * (ctx.cafe.price_divisor || 1);
    if (!(Number.isFinite(price) && price >= 0)) { fPrice.classList.add("invalid"); valid = false; } else fPrice.classList.remove("invalid");
    if (!valid) { toastError(t("err_name_required")); return; }

    setBusy(saveBtn, true, t("loading"));
    try {
      const payload = {
        cafe_id: ctx.cafe.id,
        category_id: fCat.value || null,
        name: fName.value.trim(),
        description: fDesc.value.trim() || null,
        price_minor: price,
        is_available: fAvail.checked,
        is_visible: fVis.checked,
        badge: canBadge && fBadge.value ? fBadge.value : null,
      };

      let saved = product;
      if (isEdit) {
        const { data, error } = await updateProduct(product.id, payload);
        if (error) throw error;
        saved = data;
      } else {
        payload.display_order = state.products.filter((p) => p.category_id === payload.category_id).length + 1;
        const { data, error } = await createProduct(payload);
        if (error) throw error;
        saved = data;
      }

      // image upload/replace (after row save; delete old object to avoid orphans)
      if (newFile) {
        const oldPath = currentImagePath;
        const { path, error: upErr } = await uploadImage(ctx.cafe.id, "products", newFile, maxMB);
        if (upErr) { toastError(t(mapDbError(upErr))); }
        else {
          await updateProduct(saved.id, { image_path: path });
          if (oldPath && oldPath !== path) await deleteImage(oldPath);
          toastSuccess(t("image_uploaded"));
        }
      }

      // english translation
      if (showEn) {
        const hasEn = nameEn.value.trim().length > 0;
        if (hasEn) {
          await upsertProductTranslation(saved.id, ctx.cafe.id, "en", nameEn.value.trim(), descEn.value.trim() || null);
        }
      }

      toastSuccess(isEdit ? t("p_updated") : t("p_created"));
      m.close();
      await reload();
    } catch (err) {
      setBusy(saveBtn, false);
      toastError(t(mapDbError(err)));
    }
  });
}

/* ---------- main render ---------- */
export async function renderProducts(root, ctx, { refresh }) {
  const reload = async () => {
    const [p, c, tr] = await Promise.all([
      listProducts(ctx.cafe.id), listCategories(ctx.cafe.id), listProductTranslations(ctx.cafe.id),
    ]);
    state.products = p.data ?? [];
    state.categories = c.data ?? [];
    state.translations = tr.data ?? [];
    state.maxProducts = ctx.limits?.max_products;
    applyFilters();
  };

  function applyFilters() {
    let list = [...state.products];
    if (state.q) {
      const q = state.q.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q));
    }
    if (state.cat) list = list.filter((p) => p.category_id === state.cat);
    if (state.avail === "avail") list = list.filter((p) => p.is_available);
    if (state.avail === "unavail") list = list.filter((p) => !p.is_available);
    list.sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
    state.filtered = list;
    drawList();
  }

  function drawList() {
    const listRoot = $("#pl-list", root);
    if (!state.filtered.length) {
      emptyState(listRoot, {
        title: state.q || state.cat || state.avail ? t("menu_search_empty_t") : t("p_empty_t"),
        desc: state.q || state.cat || state.avail ? t("menu_search_empty_d") : t("p_empty_d"),
      });
      return;
    }
    setChildren(listRoot, el("div", { class: "pl-list" }, ...state.filtered.map((p) => rowEl(p, ctx, reload))));
  }

  // toolbar
  const search = el("input", {
    class: "input", type: "search", placeholder: t("search"), style: "border-radius:999px",
    oninput: (e) => { state.q = e.target.value.trim(); applyFilters(); },
  });
  const catSel = el("select", {
    class: "select",
    onchange: (e) => { state.cat = e.target.value; applyFilters(); },
  },
    el("option", { value: "" }, t("filter_all_categories")),
    ...state.categories.map((c) => el("option", { value: c.id }, c.name)));
  const availSel = el("select", {
    class: "select",
    onchange: (e) => { state.avail = e.target.value; applyFilters(); },
  },
    el("option", { value: "" }, t("all")),
    el("option", { value: "avail" }, t("filter_available")),
    el("option", { value: "unavail" }, t("filter_unavailable")));

  setChildren(root,
    el("div", { class: "section-head" },
      el("h2", {}, t("products_title")),
      el("button", { class: "btn btn-primary", onclick: () => openForm(ctx, null, reload) },
        el("span", { html: icons.plus }), t("add_product"))),
    el("div", { class: "toolbar" }, search, catSel, availSel),
    el("div", { id: "pl-list" }),
  );

  skeletonRows($("#pl-list", root), 4);
  await reload();

  if (sessionStorage.getItem("mk_open_product_form")) {
    sessionStorage.removeItem("mk_open_product_form");
    if (state.categories.length === 0) {
      toastError(t("c_empty_d"));
      location.hash = "#/categories";
    } else {
      openForm(ctx, null, reload);
    }
  }
  void refresh;
}
