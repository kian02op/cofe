// ============================================================================
// Edge Function: admin-create-user
// Privileged operation: creates an auth user + profile (+ optional cafe
// membership). ONLY callable by a platform super administrator.
//
// Deploy:
//   supabase functions deploy admin-create-user --no-verify-jwt=false
//
// The service_role key is injected automatically inside Edge Runtime and is
// NEVER exposed to the browser.
// ============================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGINS") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

// Basic input validation (server-side, mirrors client rules)
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const SLUG_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "UNAUTHORIZED" }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    // 1) Verify the caller's JWT and super-admin status server-side.
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user) return json({ error: "UNAUTHORIZED" }, 401);

    const { data: profile } = await admin
      .from("profiles")
      .select("platform_role")
      .eq("id", userData.user.id)
      .single();
    if (profile?.platform_role !== "super_admin") {
      return json({ error: "FORBIDDEN_NOT_SUPER_ADMIN" }, 403);
    }

    // 2) Validate payload
    const body = await req.json().catch(() => null);
    if (!body) return json({ error: "INVALID_JSON" }, 400);

    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const displayName = String(body.display_name ?? "").trim() || email.split("@")[0];
    const cafeId = body.cafe_id ? String(body.cafe_id) : null;

    if (!EMAIL_RE.test(email)) return json({ error: "INVALID_EMAIL" }, 400);
    if (password.length < 8) return json({ error: "WEAK_PASSWORD" }, 400);
    if (displayName.length > 80) return json({ error: "INVALID_DISPLAY_NAME" }, 400);

    if (cafeId) {
      const { data: cafe } = await admin.from("cafes").select("id").eq("id", cafeId).single();
      if (!cafe) return json({ error: "CAFE_NOT_FOUND" }, 404);
    }

    // 3) Create the auth user (email_confirm=true => no invite email needed;
    //    change to false if you prefer invite-flow emails).
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: displayName },
    });
    if (createErr) {
      const msg = createErr.message?.includes("already")
        ? "EMAIL_ALREADY_EXISTS"
        : "USER_CREATE_FAILED";
      return json({ error: msg, detail: createErr.message }, 400);
    }

    // 4) Membership
    if (cafeId && created.user) {
      const { error: mErr } = await admin.from("cafe_memberships").insert({
        cafe_id: cafeId,
        user_id: created.user.id,
        role: "admin",
      });
      if (mErr) {
        // Do not leave a user without its purpose; report clearly.
        return json({ error: "MEMBERSHIP_FAILED", user_id: created.user.id, detail: mErr.message }, 400);
      }
    }

    return json({ user_id: created.user?.id, email, cafe_id: cafeId });
  } catch (_e) {
    return json({ error: "INTERNAL_ERROR" }, 500);
  }
});
