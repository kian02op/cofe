/**
 * Platform super-admin panel: cafe management + manual subscriptions.
 * All privileged mutations go through RLS policies (super-admin only) and,
 * for auth-user creation, through the `admin-create-user` Edge Function.
 */
import {
  initApi, listAllCafes, listAllSubscriptions, countRows, createCafe,
  createSubscription, updateCafe, updateSubscription, deleteCafe,
  getPlanLimits, createAdminUser,
} from "../data/api.js";
import { IS_DEMO } from "../core/config.js";
import { t, applyDocumentLang } from "../core/i18n.js";
import { el, setChildren, $, isValidSlug, formatDate, mapDbError, debounce } from "../core/utils.js";
import { toastSuccess, toastError, openModal, confirmDialog, setBusy, skeletonRows } from "../core/ui.js";
import { icons } from "../core/icons.js";
import { showDemoBanner } from "../core/demo-banner.js";
import { logout, requireSuperAdmin } from "../auth/auth.js";

applyDocumentLang("fa");
showDemoBanner(IS_DEMO);
document.querySelector("[data-brand-name]").textContent = t("brand");
document.querySelector("[data-role-badge]").textContent = t("sa_superadmin_badge");
document.querySelector("[data-l-logout]").textContent = t("logout");
$("#btn-logout").addEventListener("click", () => logout());

const faNum = (n) => Number(n ?? 0).toLocaleString("fa-IR");
let limits = [];

function stateOf(cafe, sub) {
  if (cafe.status === "suspended") return "suspended";
  if (cafe.status === "cancelled") return "cancelled";
  if (sub && ["active", "trial"].includes(sub.status) && (!sub.expires_at || new Date(sub.expires_at) > new Date())) return "active";
  if (sub && ["expired", "suspended", "cancelled"].includes(sub.status)) return sub.status;
  return "expired";
}

/* ---------------- new cafe + admin account ---------------- */
function openNewCafeModal(reload) {
  const fName = el("input", { class: "input", maxlength: 120, required: true });
  const fSlug = el("input", { class: "input", dir: "ltr", maxlength: 63, required: true });
  const fDesc = el("textarea", { class: "textarea", placeholder: t("optional") });
  const fAdminEmail = el("input", { class: "input", dir: "ltr", type: "email", required: true });
  const fAdminPass = el("input", { class: "input", dir: "ltr", type: "password", minLength: 8, required: true });
  const fAdminName = el("input", { class: "input", maxlength: 80 });
  const fPlan = el("select", { class: "select" },
    ...limits.map((l) => el("option", { value: l.plan_code }, t(l.plan_code === "professional" ? "plan_professional" : "plan_base"))));
  const fExpiry = el("input", { class: "input", dir: "ltr", type: "date", value: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10) });

  const saveBtn = el("button", { class: "btn btn-primary", type: "submit" }, t("save"));
  const form = el("form", { novalidate: true },
    el("fieldset", {},
      el("legend", {}, t("sa_new_cafe")),
      el("div", { class: "grid-2" },
        el("div", { class: "field" }, el("label", {}, t("s_name"), " *"), fName),
        el("div", { class: "field" }, el("label", {}, t("s_slug"), " *"), fSlug)),
      el("div", { class: "field" }, el("label", {}, t("s_desc")), fDesc),
      el("div", { class: "grid-2" },
        el("div", { class: "field" }, el("label", {}, t("sa_set_plan")), fPlan),
        el("div", { class: "field" }, el("label", {}, t("sa_set_expiry")), fExpiry))),
    el("fieldset", {},
      el("legend", {}, t("sa_create_admin")),
      el("div", { class: "grid-3" },
        el("div", { class: "field" }, el("label", {}, t("sa_admin_email"), " *"), fAdminEmail),
        el("div", { class: "field" }, el("label", {}, t("sa_admin_password"), " *"), fAdminPass),
        el("div", { class: "field" }, el("label", {}, t("sa_admin_name")), fAdminName))),
    el("div", { class: "modal-foot", style: "border:none;padding:0" },
      el("button", { class: "btn btn-outline", type: "button", onclick: () => m.close() }, t("cancel")),
      saveBtn));
  const m = openModal({ title: t("sa_new_cafe"), body: form, wide: true });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const slug = fSlug.value.trim().toLowerCase();
    let valid = true;
    if (!fName.value.trim()) { fName.classList.add("invalid"); valid = false; }
    if (!isValidSlug(slug)) { fSlug.classList.add("invalid"); valid = false; }
    if (!valid) { toastError(t("s_slug_hint")); return; }
    setBusy(saveBtn, true, t("loading"));
    try {
      const { data: cafe, error: cErr } = await createCafe({
        name: fName.value.trim(),
        slug,
        description: fDesc.value.trim() || null,
      });
      if (cErr) throw cErr;
      const { error: sErr } = await createSubscription({
        cafe_id: cafe.id,
        plan_code: fPlan.value,
        status: "trial",
        starts_at: new Date().toISOString(),
        expires_at: fExpiry.value ? new Date(fExpiry.value + "T23:59:59Z").toISOString() : null,
      });
      if (sErr) throw sErr;
      if (fAdminEmail.value.trim()) {
        if (fAdminPass.value.length < 8) throw { message: "WEAK_PASSWORD" };
        const { error: uErr } = await createAdminUser({
          email: fAdminEmail.value.trim(),
          password: fAdminPass.value,
          display_name: fAdminName.value.trim() || fAdminEmail.value.split("@")[0],
          cafe_id: cafe.id,
        });
        if (uErr) {
          toastError(t(mapDbError(uErr)));
        }
      }
      toastSuccess(t("sa_created"));
      m.close();
      await reload();
    } catch (err) {
      setBusy(saveBtn, false);
      const msg = mapDbError(err);
      toastError(msg === "slug_taken" ? t("slug_taken") : t(msg));
    }
  });
}

/* ---------------- subscription management ---------------- */
function openSubModal(cafe, sub, reload) {
  const fPlan = el("select", { class: "select" },
    ...limits.map((l) => el("option", { value: l.plan_code, selected: sub?.plan_code === l.plan_code },
      t(l.plan_code === "professional" ? "plan_professional" : "plan_base"))));
  const fStatus = el("select", { class: "select" },
    ...["trial", "active", "expired", "suspended", "cancelled"].map((s) =>
      el("option", { value: s, selected: sub?.status === s }, t("st_" + s))));
  const fExpiry = el("input", {
    class: "input", dir: "ltr", type: "date",
    value: sub?.expires_at ? new Date(sub.expires_at).toISOString().slice(0, 10) : "",
  });
  const fNoExpiry = el("input", { type: "checkbox", checked: !sub?.expires_at, onchange: (e) => { fExpiry.disabled = e.target.checked; } });

  const saveBtn = el("button", { class: "btn btn-primary", type: "submit" }, t("save"));
  const form = el("form", { novalidate: true },
    el("div", { class: "grid-2" },
      el("div", { class: "field" }, el("label", {}, t("sa_set_plan")), fPlan),
      el("div", { class: "field" }, el("label", {}, t("sub_status")), fStatus)),
    el("div", { class: "field" },
      el("label", {}, t("sub_expires")), fExpiry,
      el("label", { class: "row mt-1", style: "gap:.5rem;cursor:pointer" }, fNoExpiry, el("span", { class: "small" }, t("sub_no_expiry")))),
    el("div", { class: "quick-actions" },
      ...[["30", t("sa_extend_30")], ["90", t("sa_extend_90")], ["365", t("sa_extend_365")]].map(([d, label]) =>
        el("button", {
          class: "btn btn-outline btn-sm", type: "button",
          onclick: () => {
            const base = sub?.expires_at && new Date(sub.expires_at) > new Date() ? new Date(sub.expires_at) : new Date();
            base.setDate(base.getDate() + Number(d));
            fExpiry.value = base.toISOString().slice(0, 10);
            fNoExpiry.checked = false;
            fExpiry.disabled = false;
          },
        }, label))),
    el("div", { class: "modal-foot", style: "border:none;padding:0" },
      el("button", { class: "btn btn-outline", type: "button", onclick: () => m.close() }, t("cancel")),
      saveBtn));
  const m = openModal({ title: `${t("sa_sub")} — ${cafe.name}`, body: form });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    setBusy(saveBtn, true, t("loading"));
    try {
      const patch = {
        plan_code: fPlan.value,
        status: fStatus.value,
        expires_at: fNoExpiry.checked ? null : (fExpiry.value ? new Date(fExpiry.value + "T23:59:59Z").toISOString() : null),
      };
      if (sub) {
        const { error } = await updateSubscription(sub.id, patch);
        if (error) throw error;
      } else {
        const { error } = await createSubscription({ cafe_id: cafe.id, starts_at: new Date().toISOString(), ...patch });
        if (error) throw error;
      }
      toastSuccess(t("sa_sub_updated"));
      m.close();
      await reload();
    } catch (err) {
      setBusy(saveBtn, false);
      toastError(t(mapDbError(err)));
    }
  });
}

/* ---------------- edit cafe ---------------- */
function openEditModal(cafe, reload) {
  const fName = el("input", { class: "input", value: cafe.name, maxlength: 120 });
  const fSlug = el("input", { class: "input", dir: "ltr", value: cafe.slug, maxlength: 63 });
  const fStatus = el("select", { class: "select" },
    el("option", { value: "active", selected: cafe.status === "active" }, t("st_active")),
    el("option", { value: "suspended", selected: cafe.status === "suspended" }, t("st_suspended")),
    el("option", { value: "cancelled", selected: cafe.status === "cancelled" }, t("st_cancelled")));
  const saveBtn = el("button", { class: "btn btn-primary", type: "submit" }, t("save"));
  const form = el("form", { novalidate: true },
    el("div", { class: "field" }, el("label", {}, t("s_name")), fName),
    el("div", { class: "field" }, el("label", {}, t("s_slug")), fSlug),
    el("div", { class: "field" }, el("label", {}, t("sub_status")), fStatus),
    el("div", { class: "modal-foot", style: "border:none;padding:0" },
      el("button", { class: "btn btn-outline", type: "button", onclick: () => m.close() }, t("cancel")),
      saveBtn));
  const m = openModal({ title: t("sa_edit"), body: form });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const slug = fSlug.value.trim().toLowerCase();
    if (!fName.value.trim() || !isValidSlug(slug)) { toastError(t("s_slug_hint")); return; }
    setBusy(saveBtn, true, t("loading"));
    const { error } = await updateCafe(cafe.id, { name: fName.value.trim(), slug, status: fStatus.value });
    setBusy(saveBtn, false);
    if (error) { toastError(t(mapDbError(error))); return; }
    toastSuccess(t("sa_updated"));
    m.close();
    await reload();
  });
}

/* ---------------- table ---------------- */
async function cafeRow(cafe, sub, counts, reload) {
  const state = stateOf(cafe, sub);
  const isActive = state === "active";
  return el("tr", {},
    el("td", {},
      el("div", { class: "pl-name" }, cafe.name),
      el("div", { class: "pl-meta ltr-num", dir: "ltr" }, `/cafe/${cafe.slug}`)),
    el("td", {}, t(sub?.plan_code === "professional" ? "plan_professional" : "plan_base")),
    el("td", {}, el("span", { class: `badge badge-status-${state}` }, t("st_" + state))),
    el("td", { class: "num" }, sub?.expires_at ? formatDate(sub.expires_at, "fa") : t("sub_no_expiry")),
    el("td", { class: "num" }, faNum(counts.products)),
    el("td", { class: "num" }, faNum(counts.categories)),
    el("td", {},
      el("div", { class: "cafe-row-actions" },
        el("button", { class: "btn btn-ghost btn-sm", title: t("sa_contact_visit"), onclick: () => window.open(`/cafe/${cafe.slug}`, "_blank"), html: icons.external }),
        el("button", { class: "btn btn-ghost btn-sm", title: t("sa_edit"), onclick: () => openEditModal(cafe, reload), html: icons.edit }),
        el("button", { class: "btn btn-ghost btn-sm", title: t("sa_sub"), onclick: () => openSubModal(cafe, sub, reload), html: icons.card }),
        el("button", {
          class: "btn btn-ghost btn-sm", title: isActive ? t("sa_suspend") : t("sa_activate"),
          style: isActive ? "color:var(--warn)" : "color:var(--success)",
          html: isActive ? icons.lock : icons.check,
          onclick: async () => {
            const ok = await confirmDialog({
              title: isActive ? t("sa_suspend") : t("sa_activate"),
              message: isActive ? t("sa_confirm_suspend", { name: cafe.name }) : t("sa_confirm_activate", { name: cafe.name }),
              confirmText: isActive ? t("sa_suspend") : t("sa_activate"),
              danger: isActive,
            });
            if (!ok) return;
            const { error } = await updateCafe(cafe.id, { status: isActive ? "suspended" : "active" });
            if (error) { toastError(t(mapDbError(error))); return; }
            toastSuccess(t("sa_updated"));
            await reload();
          },
        }),
        el("button", {
          class: "btn btn-ghost btn-sm", title: t("sa_cancel_sub"), style: "color:var(--danger)",
          html: icons.trash,
          onclick: async () => {
            const ok = await confirmDialog({
              title: t("sa_cancel_sub"),
              message: t("sa_confirm_cancel", { name: cafe.name }),
              confirmText: t("confirm"), danger: true,
            });
            if (!ok) return;
            const { error } = await updateCafe(cafe.id, { status: "cancelled" });
            if (error) { toastError(t(mapDbError(error))); return; }
            toastSuccess(t("sa_updated"));
            await reload();
          },
        }))));
}

export async function renderSuperAdmin() {
  const main = $("#main");
  main.textContent = "";
  main.append(el("div", { class: "skeleton", style: "height:200px" }));

  await initApi();
  limits = (await getPlanLimits()).data ?? [];

  const searchInput = el("input", { class: "input", type: "search", placeholder: t("sa_search_ph"), style: "border-radius:999px" });
  const statusSel = el("select", { class: "select" },
    el("option", { value: "" }, t("all")),
    ...["active", "expired", "suspended", "cancelled"].map((s) => el("option", { value: s }, t("st_" + s))));
  const statsBox = el("div", { class: "stat-grid", style: "margin-bottom:1.2rem" });
  const tableBox = el("div", {});

  let cafes = [], subs = [], subBy = {};

  async function reload() {
    const [{ data }, { data: subsData }] = await Promise.all([
      listAllCafes({ search: searchInput.value.trim() }),
      listAllSubscriptions(),
    ]);
    cafes = data ?? [];
    subs = subsData ?? [];
    subBy = Object.fromEntries(subs.map((s) => [s.cafe_id, s]));
    draw();
  }

  async function draw() {
    // stats over all cafes (ignores current search filter)
    const states = cafes.map((c) => stateOf(c, subBy[c.id]));
    setChildren(statsBox,
      el("div", { class: "card stat-card" }, el("div", { class: "lbl" }, t("sa_stats_cafes")), el("div", { class: "val num" }, faNum(cafes.length))),
      el("div", { class: "card stat-card" }, el("div", { class: "lbl" }, t("sa_stats_active")), el("div", { class: "val num" }, faNum(states.filter((s) => s === "active").length))),
      el("div", { class: "card stat-card" }, el("div", { class: "lbl" }, t("sa_stats_expired")), el("div", { class: "val num" }, faNum(states.filter((s) => s === "expired").length))),
      el("div", { class: "card stat-card" }, el("div", { class: "lbl" }, t("sa_stats_suspended")), el("div", { class: "val num" }, faNum(states.filter((s) => s === "suspended").length))),
    );

    tableBox.textContent = "";
    if (!cafes.length) {
      tableBox.append(el("div", { class: "state-block" }, el("h3", {}, t("sa_no_cafes"))));
      return;
    }
    const tbody = el("tbody");
    tableBox.append(
      el("div", { class: "table-wrap" },
        el("table", { class: "data" },
          el("thead", {}, el("tr", {},
            el("th", {}, t("sa_th_cafe")), el("th", {}, t("sa_th_plan")), el("th", {}, t("sa_th_status")),
            el("th", {}, t("sa_th_expires")), el("th", {}, t("sa_th_products")), el("th", {}, t("sa_th_categories")),
            el("th", {}, t("sa_th_actions")))),
          tbody)));
    const rows = el("div", { class: "skeleton", style: "height:60px;margin-top:.6rem" });
    tableBox.append(rows);

    const withCounts = await Promise.all(cafes.map(async (c) => {
      const [p, k] = await Promise.all([countRows("products", c.id), countRows("categories", c.id)]);
      return { c, counts: { products: p.count ?? 0, categories: k.count ?? 0 } };
    }));
    tbody.textContent = "";
    for (const { c, counts } of withCounts) {
      tbody.append(await cafeRow(c, subBy[c.id], counts, reload));
    }
    rows.remove();
  }

  searchInput.addEventListener("input", debounce(reload, 300));
  statusSel.addEventListener("change", reload);

  main.textContent = "";
  setChildren(main,
    el("div", { class: "section-head" },
      el("h2", {}, t("sa_title")),
      el("button", { class: "btn btn-primary", onclick: () => openNewCafeModal(reload) },
        el("span", { html: icons.plus }), t("sa_new_cafe"))),
    statsBox,
    el("div", { class: "toolbar" }, searchInput, statusSel),
    tableBox,
    IS_DEMO ? el("p", { class: "muted small mt-2", style: "text-align:center" }, "حالت نمایشی: حساب‌های مدیر جدید فقط به‌صورت محلی ساخته می‌شوند.") : null,
  );

  await reload();
}

requireSuperAdmin().then((session) => {
  if (session) renderSuperAdmin();
});
