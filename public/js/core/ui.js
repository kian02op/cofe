/** UI kit: toasts, dialogs, modals, busy states, empty states, small SVG chart. */
import { el, $ } from "./utils.js";
import { t } from "./i18n.js";

/* ---------- Toast ---------- */
let toastRegion;
function ensureRegion() {
  if (!toastRegion) {
    toastRegion = el("div", { class: "toast-region", role: "status", "aria-live": "polite" });
    document.body.append(toastRegion);
  }
  return toastRegion;
}

const ICONS = {
  success: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6 9 17l-5-5"/></svg>',
  error: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.01"/></svg>',
  info: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.01"/></svg>',
};

export function toast(message, type = "info", ms = 3200) {
  const region = ensureRegion();
  const item = el(
    "div",
    { class: `toast ${type}` },
    el("span", { class: "icon", html: ICONS[type] || ICONS.info }),
    el("span", {}, message),
  );
  region.append(item);
  setTimeout(() => {
    item.style.opacity = "0";
    item.style.transition = "opacity .25s";
    setTimeout(() => item.remove(), 260);
  }, ms);
}
export const toastSuccess = (m) => toast(m, "success");
export const toastError = (m) => toast(m, "error", 4200);

/* ---------- Busy button ---------- */
export function setBusy(btn, busy, busyText) {
  if (!btn) return;
  if (busy) {
    btn.dataset.label = btn.innerHTML;
    btn.setAttribute("aria-busy", "true");
    btn.innerHTML = "";
    btn.append(el("span", { class: "spinner" }), " ", busyText || t("loading"));
  } else {
    btn.removeAttribute("aria-busy");
    btn.innerHTML = btn.dataset.label || "";
  }
}

/* ---------- Modal ---------- */
let openStack = [];
export function openModal({ title, body, footer, onClose, wide }) {
  const prev = document.activeElement;
  const closeBtn = el("button", {
    class: "icon-btn",
    "aria-label": t("close"),
    html: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    onclick: () => close(),
  });
  const box = el(
    "div",
    { class: "modal", role: "dialog", "aria-modal": "true", style: wide ? "max-width:760px" : "" },
    el("div", { class: "modal-head" }, el("h3", {}, title), closeBtn),
    el("div", { class: "modal-body" }, body),
    footer ? el("div", { class: "modal-foot" }, footer) : null,
  );
  const overlay = el(
    "div",
    { class: "modal-overlay" },
    box,
  );
  overlay.addEventListener("mousedown", (e) => {
    if (e.target === overlay) close();
  });
  function close() {
    overlay.remove();
    openStack = openStack.filter((o) => o !== close);
    document.body.style.overflow = openStack.length ? "hidden" : "";
    prev?.focus?.();
    onClose?.();
  }
  document.body.append(overlay);
  document.body.style.overflow = "hidden";
  openStack.push(close);
  const onKey = (e) => {
    if (e.key === "Escape") {
      const last = openStack[openStack.length - 1];
      if (last === close) close();
    }
  };
  document.addEventListener("keydown", onKey, { once: false });
  overlay._cleanupKey = () => document.removeEventListener("keydown", onKey);
  const origClose = close;
  // remove key handler on close
  close = () => {
    overlay._cleanupKey?.();
    origClose();
  };
  closeBtn.addEventListener("click", close);
  return { close, root: box };
}

/* ---------- Confirm dialog ---------- */
export function confirmDialog({ title, message, confirmText, cancelText, danger = false }) {
  return new Promise((resolve) => {
    let result = false;
    const okBtn = el("button", {
      class: `btn ${danger ? "btn-danger" : "btn-primary"}`,
      onclick: () => { result = true; m.close(); },
    }, confirmText || t("confirm"));
    const noBtn = el("button", {
      class: "btn btn-outline",
      onclick: () => { result = false; m.close(); },
    }, cancelText || t("cancel"));
    const m = openModal({
      title,
      body: el("p", { style: "margin:0" }, message),
      footer: [noBtn, okBtn],
      onClose: () => resolve(result),
    });
  });
}

/* ---------- Empty / state blocks ---------- */
export function emptyState(container, { title, desc, actions = [], art = "" }) {
  const block = el(
    "div",
    { class: "state-block" },
    art
      ? el("div", { class: "empty-art", html: art })
      : el("div", { class: "empty-art", html: CUP_ART }),
    el("h3", {}, title),
    desc ? el("p", {}, desc) : null,
    actions.length ? el("div", { class: "quick-actions", style: "justify-content:center" }, ...actions) : null,
  );
  container.textContent = "";
  container.append(block);
  return block;
}

export const CUP_ART = '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M17 8h1a3 3 0 0 1 0 6h-1"/><path d="M3 8h14v7a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V8Z"/><path d="M6 2v2M10 2v2M14 2v2"/></svg>';

/* ---------- Skeleton row ---------- */
export function skeletonRows(container, n = 3, cls = "skel-card") {
  container.textContent = "";
  for (let i = 0; i < n; i++) {
    container.append(el("div", { class: `skeleton ${cls}`, style: `animation-delay:${i * 0.12}s` }));
  }
}

/* ---------- Tiny SVG bar chart (dependency-free) ---------- */
/**
 * data: [{label, value}]; draws rounded bars + labels, RTL-safe.
 */
export function barChart(container, data, { height = 180, formatValue = (v) => String(v) } = {}) {
  container.textContent = "";
  if (!data.length) return;
  const W = 640, H = height, pad = { t: 14, b: 30, s: 10, e: 10 };
  const max = Math.max(...data.map((d) => d.value), 1);
  const innerW = W - pad.s - pad.e;
  const innerH = H - pad.t - pad.b;
  const n = data.length;
  const slot = innerW / n;
  const barW = Math.min(38, slot * 0.62);
  const rtl = document.documentElement.dir === "rtl";

  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("class", "chart-svg");
  svg.setAttribute("role", "img");

  const gridLines = 3;
  for (let i = 1; i <= gridLines; i++) {
    const y = pad.t + innerH - (innerH * i) / (gridLines + 0.4);
    const line = document.createElementNS(svgNS, "line");
    line.setAttribute("x1", pad.s); line.setAttribute("x2", W - pad.e);
    line.setAttribute("y1", y); line.setAttribute("y2", y);
    line.setAttribute("stroke", "var(--border)"); line.setAttribute("stroke-dasharray", "4 5");
    svg.append(line);
  }

  data.forEach((d, i) => {
    const h = Math.max(2, (d.value / max) * innerH);
    const xCenter = pad.s + slot * i + slot / 2;
    const x = xCenter - barW / 2;
    const y = pad.t + innerH - h;
    const rect = document.createElementNS(svgNS, "rect");
    rect.setAttribute("x", rtl ? W - pad.e - (x - pad.s) - barW : x);
    rect.setAttribute("y", y);
    rect.setAttribute("width", barW);
    rect.setAttribute("height", h);
    rect.setAttribute("rx", Math.min(7, barW / 2.4));
    rect.setAttribute("fill", "var(--primary)");
    rect.setAttribute("opacity", "0.85");
    svg.append(rect);

    const valText = document.createElementNS(svgNS, "text");
    valText.setAttribute("x", rtl ? W - pad.e - (xCenter - pad.s) : xCenter);
    valText.setAttribute("y", y - 6);
    valText.setAttribute("text-anchor", "middle");
    valText.setAttribute("font-size", "11");
    valText.setAttribute("font-weight", "700");
    valText.setAttribute("fill", "var(--text-2)");
    valText.textContent = formatValue(d.value);
    svg.append(valText);

    const lbl = document.createElementNS(svgNS, "text");
    lbl.setAttribute("x", rtl ? W - pad.e - (xCenter - pad.s) : xCenter);
    lbl.setAttribute("y", H - 9);
    lbl.setAttribute("text-anchor", "middle");
    lbl.setAttribute("font-size", "11");
    lbl.setAttribute("fill", "var(--text-3)");
    lbl.textContent = d.label;
    svg.append(lbl);
  });

  container.append(svg);
}
