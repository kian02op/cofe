/**
 * DemoClient — an in-browser mock implementing the exact supabase-js subset
 * used by our data layer (see js/data/api.js). Persists to localStorage and
 * is seeded with clearly-labeled demo data. Used ONLY when Supabase env is
 * not configured, so the UI can be fully evaluated without a backend.
 *
 * It also simulates the plan-limit triggers and the public_menu_* views so
 * behavior matches production semantics.
 */
import { buildSeed } from "./seed.js";
import { uuid } from "../core/utils.js";

const DB_KEY = "menookadeh_demo_db_v1";

function loadDb() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* corrupted -> reseed */ }
  const seeded = buildSeed();
  localStorage.setItem(DB_KEY, JSON.stringify(seeded));
  return seeded;
}

function serviceState(db, cafeId) {
  const cafe = db.cafes.find((c) => c.id === cafeId);
  if (!cafe) return "not_found";
  if (cafe.status === "suspended") return "suspended";
  if (cafe.status === "cancelled") return "cancelled";
  const s = db.subscriptions.find((x) => x.cafe_id === cafeId);
  if (s && ["active", "trial"].includes(s.status)) {
    if (!s.expires_at || new Date(s.expires_at) > new Date()) return "active";
    return "expired";
  }
  if (s && ["expired", "suspended", "cancelled"].includes(s.status)) return s.status;
  return "expired";
}

const VIEW_ACTIVE_TABLES = new Set([
  "public_menu_categories", "public_menu_products",
  "public_menu_product_translations", "public_menu_category_translations",
]);
const VIEW_MAP = {
  public_menu_cafes: {
    source: "cafes",
    filter: (row) => row.status !== "cancelled",
    transform: (row, db) => ({ ...row, service_state: serviceState(db, row.id) }),
  },
  public_menu_categories: { source: "categories", filter: (row, db) => row.is_visible && serviceState(db, row.cafe_id) === "active" },
  public_menu_products: { source: "products", filter: (row, db) => row.is_visible && serviceState(db, row.cafe_id) === "active" },
  public_menu_product_translations: { source: "product_translations", filter: (row, db) => serviceState(db, row.cafe_id) === "active" },
  public_menu_category_translations: { source: "category_translations", filter: (row, db) => serviceState(db, row.cafe_id) === "active" },
};

class Query {
  constructor(client, table) {
    this.c = client;
    this.table = table;
    this.filters = [];
    this.orderSpec = null;
    this.limitN = null;
    this.selectOpts = null;
    this.selectCols = "*";
    this.op = "select";
    this.payload = null;
    this.upsertOpts = null;
  }
  select(cols = "*", opts = null) { this.selectCols = cols; this.selectOpts = opts; return this; }
  eq(c, v) { this.filters.push((r) => r[c] === v); return this; }
  neq(c, v) { this.filters.push((r) => r[c] !== v); return this; }
  in(c, arr) { this.filters.push((r) => arr.includes(r[c])); return this; }
  gte(c, v) { this.filters.push((r) => String(r[c]) >= String(v)); return this; }
  lte(c, v) { this.filters.push((r) => String(r[c]) <= String(v)); return this; }
  ilike(c, v) {
    const needle = String(v).replaceAll("%", "").toLowerCase();
    this.filters.push((r) => String(r[c] ?? "").toLowerCase().includes(needle));
    return this;
  }
  or(expr) {
    // supports only "col.ilike.%v%,col2.ilike.%v%" (super-admin search)
    const parts = expr.split(",").map((s) => s.trim());
    const clause = (row) => parts.some((p) => {
      const m = p.match(/^(\w+)\.ilike\.(.+)$/);
      if (!m) return false;
      const needle = m[2].replaceAll("%", "").toLowerCase();
      return String(row[m[1]] ?? "").toLowerCase().includes(needle);
    });
    this.filters.push(clause);
    return this;
  }
  order(col, { ascending = true } = {}) { this.orderSpec = { col, ascending }; return this; }
  limit(n) { this.limitN = n; return this; }
  single() { this.wantSingle = true; return this; }
  maybeSingle() { this.wantMaybe = true; return this; }
  // -- mutation starters (instance level, supabase-js style) --
  insert(payload, opts) { return Query.insert(this.c, this.table, payload, opts); }
  upsert(payload, opts) { return Query.upsert(this.c, this.table, payload, opts); }
  update(payload) { this.op = "update"; this.payload = payload; return this; }
  delete() { this.op = "delete"; return this; }

  // -- mutation starters return a new Query --
  static insert(client, table, payload, opts) {
    const q = new Query(client, table);
    q.op = "insert";
    q.payload = payload;
    q.insertOpts = opts;
    return q;
  }
  static upsert(client, table, payload, opts) {
    const q = Query.insert(client, table, payload, opts);
    q.op = "upsert";
    q.upsertOpts = opts;
    return q;
  }

  async _run() {
    const db = this.c.db;
    // resolve view -> source table
    let table = this.table;
    let viewFilter = null;
    const viewMap = VIEW_MAP[table] ?? null;
    if (viewMap) {
      viewFilter = viewMap.filter;
      table = viewMap.source;
    }
    if (!Array.isArray(db[table])) {
      if (table === "analytics_daily") {
        // materialize the security_invoker aggregation view on the fly
        const groups = new Map();
        for (const e of db.analytics_events) {
          const key = [e.cafe_id, e.event_type, e.product_id ?? "", e.category_id ?? "", e.visit_date].join("|");
          let g = groups.get(key);
          if (!g) {
            g = { cafe_id: e.cafe_id, event_type: e.event_type, product_id: e.product_id ?? null, category_id: e.category_id ?? null, visit_date: e.visit_date, events: 0, _hashes: new Set() };
            groups.set(key, g);
          }
          g.events++;
          g._hashes.add(e.visitor_hash ?? Math.random().toString(36).slice(2));
        }
        db.__analytics_daily = [...groups.values()].map((g) => {
          const { _hashes, ...row } = g;
          row.visits = _hashes.size;
          return row;
        });
        table = "__analytics_daily";
      } else {
        return { data: null, error: { message: `Unknown table ${table}` } };
      }
    }

    if (this.op === "select") {
      let rows = db[table].filter(viewFilter ? (r) => viewFilter(r, db) : () => true);
      if (viewMap?.transform) rows = rows.map((r) => viewMap.transform(r, db));
      for (const f of this.filters) rows = rows.filter(f);
      if (this.orderSpec) {
        const { col, ascending } = this.orderSpec;
        rows = [...rows].sort((a, b) => {
          const av = a[col], bv = b[col];
          const cmp = av === bv ? 0 : av > bv ? 1 : -1;
          return ascending ? cmp : -cmp;
        });
      }
      if (this.selectOpts?.count === "exact") {
        if (this.selectOpts?.head) return { data: null, count: rows.length, error: null };
        return { data: rows, count: rows.length, error: null };
      }
      if (this.limitN) rows = rows.slice(0, this.limitN);
      if (this.wantSingle) {
        const row = rows[0];
        if (!row) return { data: null, error: { code: "PGRST116", message: "no rows" } };
        return { data: row, error: null };
      }
      if (this.wantMaybe) return { data: rows[0] ?? null, error: null };
      return { data: rows, error: null };
    }

    if (this.op === "insert") {
      const payload = Array.isArray(this.payload) ? this.payload : [this.payload];
      const created = [];
      for (const item of payload) {
        const err = this.c.beforeWrite(table, item);
        if (err) return { data: null, error: { message: err } };
        const row = {
          id: uuid(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          ...item,
        };
        db[table].push(row);
        created.push(row);
      }
      this.c.save();
      const data = Array.isArray(this.payload) ? created : created[0];
      if (this.wantSingle) return { data, error: data ? null : { code: "PGRST116", message: "no rows" } };
      if (this.wantMaybe) return { data: data ?? null, error: null };
      return { data: this.selectCols ? data : null, error: null };
    }

    if (this.op === "upsert") {
      const payload = Array.isArray(this.payload) ? this.payload : [this.payload];
      const conflictCols = (this.upsertOpts?.onConflict || "").split(",").map((s) => s.trim());
      const out = [];
      for (const item of payload) {
        const existing = conflictCols.length
          ? db[table].find((r) => conflictCols.every((c) => r[c] === item[c]))
          : db[table].find((r) => r.id === item.id);
        if (existing) {
          const err = this.c.beforeWrite(table, { ...existing, ...item });
          if (err) return { data: null, error: { message: err } };
          Object.assign(existing, item, { updated_at: new Date().toISOString() });
          out.push(existing);
        } else {
          const err = this.c.beforeWrite(table, item);
          if (err) return { data: null, error: { message: err } };
          const row = { id: uuid(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...item };
          db[table].push(row);
          out.push(row);
        }
      }
      this.c.save();
      return { data: Array.isArray(this.payload) ? out : out[0], error: null };
    }

    if (this.op === "update") {
      const targets = db[table].filter((r) => this.filters.every((f) => f(r)));
      if (!targets.length) return { data: this.wantSingle ? null : [], error: this.wantSingle ? { code: "PGRST116", message: "no rows" } : null };
      for (const row of targets) {
        const merged = { ...row, ...this.payload };
        const err = this.c.beforeWrite(table, merged);
        if (err) return { data: null, error: { message: err } };
        Object.assign(row, this.payload, { updated_at: new Date().toISOString() });
      }
      this.c.save();
      if (this.wantSingle) return { data: targets[0], error: null };
      if (this.wantMaybe) return { data: targets[0] ?? null, error: null };
      return { data: targets, error: null };
    }

    if (this.op === "delete") {
      const before = db[table].length;
      const victims = db[table].filter((r) => this.filters.every((f) => f(r)));
      db[table] = db[table].filter((r) => !this.filters.every((f) => f(r)));
      if (victims.length) {
        // cascade simulation
        for (const v of victims) {
          if (table === "cafes") {
            for (const t of ["categories", "products", "subscriptions", "analytics_events", "cafe_memberships"]) {
              db[t] = db[t].filter((r) => r.cafe_id !== v.id);
            }
            db.product_translations = db.product_translations.filter((r) => r.cafe_id !== v.id);
            db.category_translations = db.category_translations.filter((r) => r.cafe_id !== v.id);
          }
          if (table === "categories") {
            db.products = db.products.map((r) => (r.category_id === v.id ? { ...r, category_id: null } : r));
          }
          if (table === "products") {
            db.product_translations = db.product_translations.filter((r) => r.product_id !== v.id);
          }
        }
      }
      this.c.save();
      return { data: victims, error: before === db[table].length && !victims.length ? { message: "no rows deleted" } : null };
    }
    return { data: null, error: { message: "unsupported op" } };
  }

  then(resolve, reject) { return this._run().then(resolve, reject); }
}

export class DemoClient {
  constructor() {
    this.db = loadDb();
    this.SESSION_KEY = "menookadeh_demo_session";
    this.storage = {
      from: () => ({
        upload: async (path, file) => {
          const dataUrl = await new Promise((res, rej) => {
            const fr = new FileReader();
            fr.onload = () => res(fr.result);
            fr.onerror = () => rej(new Error("read failed"));
            fr.readAsDataURL(file);
          });
          this.db._blobs[path] = dataUrl; // session-only (not persisted)
          return { data: { path }, error: null };
        },
        getPublicUrl: (path) => ({
          data: { publicUrl: this.db._blobs[path] || path },
        }),
        remove: async (paths) => {
          for (const p of paths) delete this.db._blobs[p];
          return { data: {}, error: null };
        },
        list: async () => ({ data: [], error: null }),
      }),
    };
    this.functions = {
      invoke: async (name, { body } = {}) => {
        if (name === "track") return { data: this.track(body), error: null };
        if (name === "admin-create-user") return this.demoCreateUser(body);
        return { data: null, error: { message: "unknown function" } };
      },
    };
    this.auth = {
      signInWithPassword: async ({ email, password }) => {
        const u = this.db.demo_users.find(
          (x) => x.email.toLowerCase() === String(email).toLowerCase().trim() && x.password === password,
        );
        if (!u) return { data: {}, error: { message: "Invalid login credentials" } };
        const session = { user: { id: u.id, email: u.email } };
        this.db._session = session;
        this.save();
        return { data: session, error: null };
      },
      getUser: async () => {
        const s = this.db._session;
        return { data: { user: s?.user ?? null }, error: null };
      },
      signOut: async () => {
        this.db._session = null;
        this.save();
        return { error: null };
      },
    };
  }

  save() {
    try {
      localStorage.setItem(DB_KEY, JSON.stringify(this.db));
    } catch (e) {
      // localStorage quota — blobs too large; drop session blobs and retry once
      this.db._blobs = {};
      try { localStorage.setItem(DB_KEY, JSON.stringify(this.db)); } catch { /* ignore */ }
    }
  }

  track(body) {
    const cafe = this.db.cafes.find((c) => c.slug === String(body?.slug || "").toLowerCase());
    if (!cafe || serviceState(this.db, cafe.id) !== "active") return { ok: true, skipped: true };
    const today = new Date().toISOString().slice(0, 10);
    const vh = `sess-${sessionStorage.getItem("demo_visitor") || (() => { const v = uuid(); sessionStorage.setItem("demo_visitor", v); return v; })()}`;
    if (body.event_type === "menu_view") {
      const dup = this.db.analytics_events.some(
        (e) => e.cafe_id === cafe.id && e.event_type === "menu_view" && e.visit_date === today && e.visitor_hash === vh,
      );
      if (dup) return { ok: true, deduped: true };
    }
    this.db.analytics_events.push({
      id: uuid(), cafe_id: cafe.id, event_type: String(body.event_type),
      product_id: body.product_id || null, category_id: body.category_id || null,
      visit_date: today, visitor_hash: vh, metadata: { lang: body.lang || null, source: body.source || "direct" },
      occurred_at: new Date().toISOString(),
    });
    this.save();
    return { ok: true };
  }

  demoCreateUser(body) {
    const caller = this.db._session?.user;
    const prof = caller && this.db.profiles.find((p) => p.id === caller.id);
    if (!prof || prof.platform_role !== "super_admin") {
      return { data: null, error: { message: "FORBIDDEN_NOT_SUPER_ADMIN" } };
    }
    const email = String(body?.email || "").toLowerCase().trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { data: null, error: { message: "INVALID_EMAIL" } };
    if (String(body?.password || "").length < 8) return { data: null, error: { message: "WEAK_PASSWORD" } };
    if (this.db.demo_users.some((u) => u.email === email)) return { data: null, error: { message: "EMAIL_ALREADY_EXISTS" } };
    const id = uuid();
    this.db.demo_users.push({ id, email, password: body.password });
    this.db.profiles.push({ id, display_name: body.display_name || email.split("@")[0], platform_role: "user" });
    if (body.cafe_id) {
      this.db.cafe_memberships.push({ id: uuid(), cafe_id: body.cafe_id, user_id: id, role: "admin" });
    }
    this.save();
    return { data: { user_id: id, email }, error: null };
  }

  /**
   * Simulates DB triggers: plan limits + service-state write locks, so demo
   * shows the same upgrade prompts / lock messages as production.
   */
  beforeWrite(table, row) {
    const cafeId = row.cafe_id;
    if (!cafeId) return null;
    const state = serviceState(this.db, cafeId);
    if (["categories", "products", "product_translations", "category_translations"].includes(table) && state !== "active") {
      return `CAFE_SERVICE_${state.toUpperCase()}`;
    }
    if (table === "products" || table === "categories") {
      const sub = this.db.subscriptions.find((s) => s.cafe_id === cafeId);
      const plan = sub?.plan_code || "base";
      const limits = this.db.plan_limits.find((l) => l.plan_code === plan);
      if (table === "products" && row.badge) {
        if (!limits?.features?.badges) return "PLAN_FEATURE_BADGES_LOCKED";
      }
      const max = table === "products" ? limits?.max_products : limits?.max_categories;
      if (max != null && this.db[table].filter((r) => r.cafe_id === cafeId).length >= max) {
        return table === "products" ? "PLAN_LIMIT_PRODUCTS_REACHED" : "PLAN_LIMIT_CATEGORIES_REACHED";
      }
    }
    if (table === "cafes" && row.languages) {
      const sub = this.db.subscriptions.find((s) => s.cafe_id === cafeId);
      const plan = sub?.plan_code || "base";
      const limits = this.db.plan_limits.find((l) => l.plan_code === plan);
      if (limits && row.languages.length > limits.max_languages) return "PLAN_LIMIT_LANGUAGES_REACHED";
    }
    return null;
  }

  from(table) { return new Query(this, table); }
}

export const demoClient = new DemoClient();
