/** QR code page: preview, PNG download, print-friendly version. */
import { t } from "../core/i18n.js";
import { el, setChildren } from "../core/utils.js";
import { icons } from "../core/icons.js";

function makeQr(url, sizePx) {
  // vendored qrcode-generator (MIT) exposes global `qrcode`
  const qr = window.qrcode(0, "M");
  qr.addData(url);
  qr.make();
  const count = qr.getModuleCount();
  const quiet = 2;
  const scale = Math.max(2, Math.floor(sizePx / (count + quiet * 2)));
  const realSize = (count + quiet * 2) * scale;
  const canvas = document.createElement("canvas");
  canvas.width = realSize;
  canvas.height = realSize;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, realSize, realSize);
  ctx.fillStyle = "#000000";
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (qr.isDark(r, c)) {
        ctx.fillRect((c + quiet) * scale, (r + quiet) * scale, scale, scale);
      }
    }
  }
  return canvas;
}

export async function renderQr(root, ctx, { publicMenuUrl }) {
  const url = publicMenuUrl();
  const stage = el("div", { class: "qr-stage" });
  const canvas = makeQr(url, 260);
  canvas.style.width = "260px";
  canvas.style.height = "260px";
  stage.append(canvas);

  const downloadBtn = el("button", { class: "btn btn-primary" },
    el("span", { html: icons.download }), t("qr_download_png"));
  downloadBtn.addEventListener("click", () => {
    const link = document.createElement("a");
    link.download = `qr-${ctx.cafe.slug}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  });

  const printBtn = el("button", {
    class: "btn btn-outline",
    onclick: () => window.open(`/qr-print?slug=${encodeURIComponent(ctx.cafe.slug)}`, "_blank"),
  }, el("span", { html: icons.printer }), t("qr_print"));

  setChildren(root,
    el("div", { class: "section-head" }, el("h2", {}, t("qr_title"))),
    el("div", { class: "card" },
      stage,
      el("div", { class: "qr-meta card-pad" },
        el("p", { class: "muted", style: "font-size:.9rem" }, t("qr_hint")),
        el("div", { class: "qr-url", dir: "ltr" }, url),
        el("div", { class: "quick-actions", style: "justify-content:center;margin-top:1rem" },
          downloadBtn, printBtn))));
}

/* ---------- print page logic (qr-print.html) ---------- */
export async function renderQrPrint() {
  const slug = new URLSearchParams(location.search).get("slug");
  const { initApi, fetchPublicCafe, publicImageUrl } = await import("../data/api.js");
  await initApi();
  const { data: cafe } = await fetchPublicCafe(slug);
  const root = document.getElementById("qr-print-root");
  if (!cafe) {
    root.textContent = "کافه پیدا نشد";
    return;
  }
  const url = `${location.origin}/cafe/${cafe.slug}`;
  const canvas = makeQr(url, 420);
  canvas.style.width = "min(420px, 80vw)";
  canvas.style.height = "auto";
  const logo = publicImageUrl(cafe.logo_path);
  setChildren(root,
    el("div", { style: "text-align:center;padding:2rem 1rem" },
      logo ? el("img", { src: logo, alt: "", style: "width:84px;height:84px;border-radius:22px;object-fit:cover;margin:0 auto 1rem" }) : null,
      el("h1", { style: "font-size:1.6rem;margin-bottom:.2rem" }, cafe.name),
      el("p", { class: "muted", style: "margin-bottom:1.6rem" }, t("qr_print_title")),
      canvas,
      el("p", { style: "font-weight:800;margin-top:1.4rem" }, t("qr_scan")),
      el("p", { class: "muted small ltr-num", dir: "ltr" }, url),
      el("button", {
        class: "btn btn-primary no-print mt-3", onclick: () => window.print(),
      }, el("span", { html: icons.printer }), t("print"))));
}
