// ============================================================================
// Edge Function: track — privacy-conscious analytics ingestion
//
// * Accepts ONLY whitelisted event types with valid UUIDs.
// * Resolves the cafe by slug and only records events for service-active cafes.
// * Never stores IP / user-agent / precise location. A per-day salted hash
//   (visitor_hash) is used ONLY to deduplicate menu_view into "visits".
// * Abuse controls: in-memory per-IP rate limit + per-cafe daily event cap.
//   (In-memory limits reset per isolate; they are a first layer — the unique
//   daily-visit index is the durable guard against view inflation.)
//
// Deploy:
//   supabase functions deploy track --no-verify-jwt
//   # public endpoint: called with the PUBLIC anon key, no user session.
// ============================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGINS") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const EVENT_TYPES = new Set(["menu_view", "product_view", "category_view", "search"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAILY_EVENT_CAP = 5000; // per cafe — abuse ceiling
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 30; // events per IP per window

// --- tiny in-memory rate limiter (per isolate) ------------------------------
const hits = new Map<string, number[]>();
function rateLimited(key: string): boolean {
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (arr.length >= RATE_MAX) {
    hits.set(key, arr);
    return true;
  }
  arr.push(now);
  hits.set(key, arr);
  return false;
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    if (rateLimited(ip)) return json({ error: "RATE_LIMITED" }, 429);

    const body = await req.json().catch(() => null);
    if (!body) return json({ error: "INVALID_JSON" }, 400);

    const slug = String(body.slug ?? "").trim().toLowerCase();
    const eventType = String(body.event_type ?? "");
    const productId = body.product_id ? String(body.product_id) : null;
    const categoryId = body.category_id ? String(body.category_id) : null;
    const lang = ["fa", "en"].includes(body.lang) ? body.lang : null;
    const source = ["qr", "direct", "share"].includes(body.source) ? body.source : "direct";

    if (!slug || !EVENT_TYPES.has(eventType)) return json({ error: "INVALID_EVENT" }, 400);
    if (productId && !UUID_RE.test(productId)) return json({ error: "INVALID_EVENT" }, 400);
    if (categoryId && !UUID_RE.test(categoryId)) return json({ error: "INVALID_EVENT" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const { data: cafe } = await admin
      .from("cafes")
      .select("id, status")
      .eq("slug", slug)
      .single();
    if (!cafe) return json({ error: "CAFE_NOT_FOUND" }, 404);

    // Record only for service-active cafes (mirrors cafe_service_state).
    const { data: sub } = await admin
      .from("subscriptions")
      .select("status, expires_at")
      .eq("cafe_id", cafe.id)
      .maybeSingle();
    const state =
      cafe.status === "suspended" ? "suspended"
      : cafe.status === "cancelled" ? "cancelled"
      : sub?.status && ["active", "trial"].includes(sub.status) &&
          (sub.expires_at == null || new Date(sub.expires_at) > new Date())
        ? "active"
        : sub?.status === "suspended" ? "suspended" : "expired";
    if (state !== "active") return json({ ok: true, skipped: state });

    // Daily cap per cafe (cheap count query)
    const today = new Date().toISOString().slice(0, 10);
    const { count } = await admin
      .from("analytics_events")
      .select("id", { count: "exact", head: true })
      .eq("cafe_id", cafe.id)
      .eq("visit_date", today);
    if ((count ?? 0) >= DAILY_EVENT_CAP) return json({ ok: true, skipped: "daily_cap" });

    // visitor_hash = SHA-256(ip + ua + date + pepper) — daily-rotating, non-identifying
    const pepper = Deno.env.get("ANALYTICS_PEPPER") ?? "dev-pepper";
    const ua = req.headers.get("user-agent") ?? "";
    const visitorHash = await sha256Hex(`${ip}|${ua}|${today}|${pepper}`);

    const { error } = await admin.from("analytics_events").upsert(
      {
        cafe_id: cafe.id,
        event_type: eventType,
        product_id: eventType === "product_view" ? productId : null,
        category_id: eventType === "category_view" ? categoryId : null,
        visit_date: today,
        visitor_hash: visitorHash,
        metadata: { lang, source },
        occurred_at: new Date().toISOString(),
      },
      {
        onConflict: "cafe_id,event_type,visit_date,visitor_hash",
        ignoreDuplicates: true, // dedupe repeated menu_view from same visitor/day
      },
    );
    if (error) return json({ error: "INSERT_FAILED" }, 500);

    return json({ ok: true });
  } catch (_e) {
    return json({ error: "INTERNAL_ERROR" }, 500);
  }
});
