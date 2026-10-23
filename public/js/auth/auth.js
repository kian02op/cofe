/** Auth guard + login/logout helpers shared by dashboard pages. */
import { initApi, getUser, getProfile, signIn, signOut } from "../data/api.js";
import { applyDocumentLang, t } from "../core/i18n.js";

export async function ensureReady() {
  applyDocumentLang("fa");
  await initApi();
}

/** Redirects to /login when there is no session. Returns {user, profile}. */
export async function requireSession() {
  await ensureReady();
  const user = await getUser();
  if (!user) {
    location.replace(`/login?next=${encodeURIComponent(location.pathname + location.hash)}`);
    return null;
  }
  const profile = await getProfile(user.id);
  return { user, profile };
}

/** Super-admin guard: must be signed in AND have platform_role = super_admin. */
export async function requireSuperAdmin() {
  const session = await requireSession();
  if (!session) return null;
  if (session.profile?.platform_role !== "super_admin") {
    location.replace("/admin");
    return null;
  }
  return session;
}

/** After sign-in, route by role (no public signup route exists anywhere). */
export async function loginAndRedirect(email, password, nextUrl) {
  const { error } = await signIn(email, password);
  if (error) return { error };
  const user = await getUser();
  const profile = await getProfile(user.id);
  if (profile?.platform_role === "super_admin") {
    location.replace(nextUrl || "/superadmin");
  } else {
    location.replace(nextUrl || "/admin");
  }
  return { error: null };
}

export async function logout() {
  await signOut();
  location.replace("/login");
}
