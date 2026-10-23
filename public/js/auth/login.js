/** Login page: sign-in only. There is NO public signup — cafe admin accounts
 * are created by the platform super administrator. */
import { initApi, getUser, getProfile } from "../data/api.js";
import { IS_DEMO } from "../core/config.js";
import { t, applyDocumentLang } from "../core/i18n.js";
import { $ } from "../core/utils.js";
import { toastError, setBusy } from "../core/ui.js";
import { loginAndRedirect } from "./auth.js";

applyDocumentLang("fa");
document.querySelector("[data-login-title]").textContent = t("login_title");
document.querySelector("[data-l-email]").textContent = t("login_email");
document.querySelector("[data-l-password]").textContent = t("login_password");
document.querySelector("[data-login-submit]").textContent = t("login_submit");
document.querySelector("[data-brand-name]").textContent = t("brand");
document.querySelector("[data-brand-icon]").textContent = "م";

const errBox = document.querySelector("[data-login-error]");
const form = document.querySelector("[data-login-form]");
const submitBtn = document.querySelector("[data-login-submit]");

if (IS_DEMO) {
  const hint = document.querySelector("[data-demo-hint]");
  hint.classList.remove("hidden");
  hint.innerHTML = `<strong>${t("login_demo_hint")}</strong><br>
    مدیر کافه: <code class="mono">admin@demo.cafe</code> / <code class="mono">demo1234</code><br>
    مدیر پلتفرم: <code class="mono">super@demo.cafe</code> / <code class="mono">super1234</code><br>
    <span class="small">کافه دوم: <code class="mono">admin2@demo.cafe</code> / <code class="mono">demo1234</code></span>`;
}

// already signed in? route by role
initApi().then(async () => {
  const user = await getUser();
  if (!user) return;
  const profile = await getProfile(user.id);
  location.replace(profile?.platform_role === "super_admin" ? "/superadmin" : "/admin");
});

const next = new URLSearchParams(location.search).get("next") || "";

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errBox.classList.add("hidden");
  const email = form.email.value.trim();
  const password = form.password.value;
  if (!email || !password) {
    errBox.textContent = t("login_failed");
    errBox.classList.remove("hidden");
    return;
  }
  setBusy(submitBtn, true, t("loading"));
  try {
    const { error } = await loginAndRedirect(email, password, next);
    if (error) {
      errBox.textContent = t("login_failed");
      errBox.classList.remove("hidden");
      setBusy(submitBtn, false);
    }
  } catch (err) {
    toastError(t("network_error"));
    setBusy(submitBtn, false);
  }
});
