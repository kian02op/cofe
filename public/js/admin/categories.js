/** Categories: CRUD, reorder, visibility, safe delete (reassign or delete products). */
import {
  listCategories, listProducts, createCategory, updateCategory, deleteCategory,
  updateProduct, deleteProduct, reorder, listCategoryTranslations, upsertCategoryTranslation,
} from "../data/api.js";
import { t } from "../core/i18n.js";
import { el, setChildren, $, mapDbError } from "../core/utils.js";
import { toastSuccess, toastError, openModal, confirmDialog, setBusy, emptyState, skeletonRows } from "../core/ui.js";
import { icons } from "../core/icons.js";

let state = { categories: [], products: [], translations: [] };

function rowEl(c, ctx, reload) {
  const idx = state.categories.findIndex((x) => x.id === c.id);
  const count = state.products.filter((p) => p.category_id === c.id).length;
  return el("div", { class: "pl-row" },
    el("div", { class: "order-btns" },
      el("button", { disabled: idx <= 0, html: icons.chevronUp, "aria-label": "بالا", onclick: () => move(c, -1, reload) }),
      el("button", { disabled: idx >= state.categories.length - 1, html: icons.chevronDown, "aria-label": "پایین", onclick: () => move(c, 1, reload) })),
    el("div", { class: "pl-info" },
      el("div", { class: "pl-name" }, c.name,
        !c.is_visible ? el("span", { class: "badge badge-unavailable" }, "مخفی") : null),
      el("div", { class: "pl-meta num" }, `${count.toLocaleString("fa-IR")} محصول`)),
    el("label", { class: "mini-switch", title: t("c_visible") },
      el("input", {
        type: "checkbox", checked: c.is_visible,
        onchange: async (e) => {
          const { error } = await updateCategory(c.id, { is_visible: e.target.checked });
          if (error) { toastError(t(mapDbError(error))); e.target.checked = !e.target.checked; return; }
          c.is_visible = e.target.checked;
          toastSuccess(t("c_updated"));
        },
      }),
      el("span", { class: "track" })),
    el("div", { class: "pl-actions" },
      el("button", { class: "btn btn-ghost btn-sm", html: icons.edit, "aria-label": t("edit"), onclick: () => openForm(ctx, c, reload) }),
      el("button", { class: "btn btn-ghost btn-sm", style: "color:var(--danger)", html: icons.trash, "aria-label": t("delete"), onclick: () => remove(c, reload) }),
    ),
  );
}

async function move(c, dir, reload) {
  const idx = state.categories.findIndex((x) => x.id === c.id);
  const other = state.categories[idx + dir];
  if (!other) return;
  const a = c.display_order, b = other.display_order;
  await updateCategory(c.id, { display_order: b === a ? b + dir : b });
  await updateCategory(other.id, { display_order: a });
  await reload();
}

async function remove(c, reload) {
  const products = state.products.filter((p) => p.category_id === c.id);
  if (products.length) {
    // Deliberate choice required: reassign or delete the products first
    const chosen = await chooseAction(c, products);
    if (!chosen) return;
    if (chosen.mode === "delete") {
      for (const p of products) {
        await deleteProduct(p.id);
        if (p.image_path) await deleteImageSafe(p.image_path);
      }
    } else {
      for (const p of products) await updateProduct(p.id, { category_id: chosen.target });
    }
  } else {
    const ok = await confirmDialog({
      title: t("c_delete_title"),
      message: `دسته «${c.name}» حذف شود؟`,
      confirmText: t("delete"), danger: true,
    });
    if (!ok) return;
  }

  const { error } = await deleteCategory(c.id);
  if (error) { toastError(t(mapDbError(error))); return; }
  toastSuccess(t("c_deleted"));
  await reload();
}

function deleteImageSafe(path) {
  if (!path || /^(https?:|data:|\/)/.test(path)) return Promise.resolve();
  return import("../data/api.js").then((m) => m.deleteImage(path));
}

function chooseAction(c, products) {
  return new Promise((resolve) => {
    let mode = "move";
    let target = "";
    const moveSel = el("select", { class: "select" },
      el("option", { value: "" }, t("c_move_to")),
      ...state.categories.filter((x) => x.id !== c.id).map((x) => el("option", { value: x.id }, x.name)));
    const body = el("div", {},
      el("p", {}, t("c_delete_has_products", { count: products.length.toLocaleString("fa-IR") })),
      el("div", { class: "stack", style: "gap:.7rem" },
        el("label", { class: "row", style: "gap:.6rem;cursor:pointer" },
          el("input", { type: "radio", name: "delmode", value: "move", checked: true, onchange: () => { mode = "move"; } }),
          el("span", {}, t("c_delete_move"))),
        moveSel,
        el("label", { class: "row", style: "gap:.6rem;cursor:pointer" },
          el("input", { type: "radio", name: "delmode", value: "delete", onchange: () => { mode = "delete"; } }),
          el("span", {}, t("c_delete_also")))));
    const okBtn = el("button", {
      class: "btn btn-danger",
      onclick: async () => {
        if (mode === "move" && !target) { toastError(t("c_move_to")); return; }
        m.close();
        resolve({ mode, target });
      },
    }, t("delete"));
    moveSel.addEventListener("change", () => { target = moveSel.value; });
    const m = openModal({
      title: t("c_delete_title"),
      body,
      footer: [el("button", { class: "btn btn-outline", onclick: () => { m.close(); resolve(null); } }, t("cancel")), okBtn],
      onClose: () => resolve(null),
    });
  });
}

function openForm(ctx, category, reload) {
  const isEdit = !!category;
  const fName = el("input", { class: "input", value: category?.name ?? "", maxlength: 80, required: true });
  const nameEn = el("input", { class: "input", dir: "ltr", maxlength: 80, placeholder: "English name (optional)" });
  if (isEdit) {
    const tr = state.translations.find((x) => x.category_id === category.id && x.lang === "en");
    if (tr) nameEn.value = tr.name;
  }
  const showEn = (ctx.cafe.languages ?? []).includes("en");
  const saveBtn = el("button", { class: "btn btn-primary", type: "submit" }, t("save"));

  const form = el("form", { novalidate: true },
    el("div", { class: "field" }, el("label", {}, t("c_name"), " *"), fName),
    showEn ? el("div", { class: "field" }, el("label", {}, "Name (EN)"), nameEn) : null,
    el("div", { class: "modal-foot", style: "border:none;padding:0" },
      el("button", { class: "btn btn-outline", type: "button", onclick: () => m.close() }, t("cancel")),
      saveBtn));
  const m = openModal({ title: isEdit ? t("edit") : t("add_category"), body: form });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!fName.value.trim()) { fName.classList.add("invalid"); return; }
    setBusy(saveBtn, true, t("loading"));
    try {
      let saved;
      if (isEdit) {
        const { data, error } = await updateCategory(category.id, { name: fName.value.trim() });
        if (error) throw error;
        saved = data;
      } else {
        const { data, error } = await createCategory({
          cafe_id: ctx.cafe.id,
          name: fName.value.trim(),
          display_order: state.categories.length + 1,
        });
        if (error) throw error;
        saved = data;
      }
      if (showEn && nameEn.value.trim()) {
        await upsertCategoryTranslation(saved.id, ctx.cafe.id, "en", nameEn.value.trim());
      }
      toastSuccess(isEdit ? t("c_updated") : t("c_created"));
      m.close();
      await reload();
    } catch (err) {
      setBusy(saveBtn, false);
      toastError(t(mapDbError(err)));
    }
  });
}

export async function renderCategories(root, ctx) {
  const reload = async () => {
    const [c, p, tr] = await Promise.all([
      listCategories(ctx.cafe.id), listProducts(ctx.cafe.id), listCategoryTranslations(ctx.cafe.id),
    ]);
    state.categories = (c.data ?? []).sort((a, b) => a.display_order - b.display_order);
    state.products = p.data ?? [];
    state.translations = tr.data ?? [];
    draw();
  };

  function draw() {
    const listRoot = $("#cat-list", root);
    if (!state.categories.length) {
      emptyState(listRoot, { title: t("c_empty_t"), desc: t("c_empty_d") });
      return;
    }
    setChildren(listRoot, el("div", { class: "pl-list" }, ...state.categories.map((c) => rowEl(c, ctx, reload))));
  }

  setChildren(root,
    el("div", { class: "section-head" },
      el("h2", {}, t("categories_title")),
      el("button", {
        class: "btn btn-primary",
        onclick: () => {
          if (ctx.limits && state.categories.length >= ctx.limits.max_categories) {
            toastError(t("limit_categories", { max: ctx.limits.max_categories }));
            return;
          }
          openForm(ctx, null, reload);
        },
      }, el("span", { html: icons.plus }), t("add_category"))),
    el("div", { id: "cat-list" }));

  skeletonRows($("#cat-list", root), 3);
  await reload();
}
