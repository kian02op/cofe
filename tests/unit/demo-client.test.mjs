/**
 * Demo-client behavior tests: CRUD chains, plan-limit simulation,
 * tenant scoping of public views, and auth gating. These mirror the
 * production semantics that RLS/DB triggers enforce server-side.
 * Run: node --test tests/unit/
 */
import { test } from "node:test";
import assert from "node:assert/strict";

// Minimal browser shims so the demo client can load under Node
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => store.get(k) ?? null,
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
globalThis.sessionStorage = {
  getItem: (k) => store.get(`s:${k}`) ?? null,
  setItem: (k, v) => store.set(`s:${k}`, String(v)),
  removeItem: (k) => store.delete(`s:${k}`),
};
if (!globalThis.crypto) globalThis.crypto = { randomUUID: () => "u" + Math.random().toString(16).slice(2) };

const { DemoClient } = await import("../../public/js/demo/client.js");

const db = new DemoClient();
// deterministic seed id lookups
const seed = db.db;

test("seed contains two isolated cafes with subscriptions", () => {
  assert.equal(seed.cafes.length, 2);
  assert.equal(seed.subscriptions.length, 2);
  const slugs = seed.cafes.map((c) => c.slug);
  assert.ok(slugs.includes("demo-cafe") && slugs.includes("cafe-shahr"));
});

test("public_menu_products view only exposes visible products of active cafes", async () => {
  const { data } = await db.from("public_menu_products").select("*").eq("cafe_id", seed.cafes[0].id);
  const products = data;
  assert.ok(products.length > 0);
  assert.ok(products.every((p) => p.is_visible === true));
  // the unavailable-but-visible product still appears with is_available=false
  assert.ok(products.some((p) => p.is_available === false));
});

test("suspended cafe products disappear from public view", async () => {
  const cafe2 = seed.cafes[1];
  cafe2.status = "suspended";
  const { data } = await db.from("public_menu_products").select("*").eq("cafe_id", cafe2.id);
  assert.equal(data.length, 0);
  cafe2.status = "active"; // restore
});

test("plan limit trigger: inserting beyond max_categories raises PLAN_LIMIT_CATEGORIES_REACHED", async () => {
  const cafe1 = seed.cafes[0];
  const limits = seed.plan_limits.find((l) => l.plan_code === "professional");
  const before = seed.categories.filter((c) => c.cafe_id === cafe1.id).length;
  // temporarily lower the limit to test the boundary without 30 inserts
  limits.max_categories = before;
  const res = await db.from("categories").insert({ cafe_id: cafe1.id, name: "X", display_order: 99 });
  assert.equal(res.error?.message, "PLAN_LIMIT_CATEGORIES_REACHED");
  limits.max_categories = 30;
});

test("service-state lock: expired subscription blocks product writes", async () => {
  const cafe1 = seed.cafes[0];
  const sub = seed.subscriptions.find((s) => s.cafe_id === cafe1.id);
  const original = sub.expires_at;
  sub.expires_at = new Date(Date.now() - 86400000).toISOString(); // yesterday
  const res = await db.from("products").insert({ cafe_id: cafe1.id, name: "t", price_minor: 1 });
  assert.equal(res.error?.message, "CAFE_SERVICE_EXPIRED");
  sub.expires_at = original; // restore
});

test("badge feature lock on base plan", async () => {
  const cafe2 = seed.cafes[1]; // base plan
  const res = await db.from("products").insert({ cafe_id: cafe2.id, name: "t2", price_minor: 1, badge: "popular" });
  assert.equal(res.error?.message, "PLAN_FEATURE_BADGES_LOCKED");
});

test("product CRUD roundtrip works", async () => {
  const cafe2 = seed.cafes[1];
  const ins = await db.from("products").insert({ cafe_id: cafe2.id, name: "چای دمس", price_minor: 500 }).select().single();
  assert.equal(ins.error, null);
  assert.ok(ins.data.id);
  const upd = await db.from("products").update({ price_minor: 700 }).eq("id", ins.data.id).select().single();
  assert.equal(upd.data.price_minor, 700);
  const del = await db.from("products").delete().eq("id", ins.data.id);
  assert.equal(del.error, null);
  const after = await db.from("products").select("id").eq("id", ins.data.id).maybeSingle();
  assert.equal(after.data, null);
});

test("count aggregation via head:true", async () => {
  const cafe1 = seed.cafes[0];
  const { count, data } = await db.from("products").select("id", { count: "exact", head: true }).eq("cafe_id", cafe1.id);
  assert.equal(data, null);
  assert.ok(count >= 15);
});

test("auth: wrong credentials rejected, correct accepted; profile roles enforced", async () => {
  const bad = await db.auth.signInWithPassword({ email: "super@demo.cafe", password: "nope" });
  assert.ok(bad.error);
  const ok = await db.auth.signInWithPassword({ email: "admin@demo.cafe", password: "demo1234" });
  assert.equal(ok.error, null);

  const forbidden = await db.functions.invoke("admin-create-user", {
    body: { email: "x@y.zz", password: "12345678", display_name: "X" },
  });
  assert.equal(forbidden.data, null);
  assert.equal(forbidden.error.message, "FORBIDDEN_NOT_SUPER_ADMIN");

  await db.auth.signOut();
  const superIn = await db.auth.signInWithPassword({ email: "super@demo.cafe", password: "super1234" });
  assert.equal(superIn.error, null);
  const allowed = await db.functions.invoke("admin-create-user", {
    body: { email: "new-admin@demo.cafe", password: "12345678", display_name: "New", cafe_id: seed.cafes[1].id },
  });
  assert.equal(allowed.error, null);
  assert.ok(allowed.data.user_id);
  assert.ok(seed.cafe_memberships.some((m) => m.user_id === allowed.data.user_id && m.cafe_id === seed.cafes[1].id));
  await db.auth.signOut();
});
