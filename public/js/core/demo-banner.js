/** Demo-mode banner (shown only when Supabase env is not configured). */
import { el, $ } from "./utils.js";

export function showDemoBanner(isDemo) {
  if (!isDemo) return;
  const host = document.querySelector("[data-demo-banner]");
  if (!host) return;
  host.className = "demo-banner";
  host.setAttribute("role", "note");
  host.textContent = "حالت نمایشی: این نسخه بدون اتصال به Supabase اجرا می‌شود و داده‌ها نمونه/محلی هستند.";
}
