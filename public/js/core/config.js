/**
 * Runtime configuration.
 *
 * Production: `config.js` (loaded before modules) sets window.APP_CONFIG.
 * These two values are PUBLIC by design (Supabase anon key is a public
 * identifier protected by RLS — it is NOT a secret). The service_role key
 * must NEVER be placed here; it lives only in Edge Function secrets.
 *
 * If SUPABASE_URL / SUPABASE_ANON_KEY are empty, the app runs in clearly
 * labeled DEMO MODE (in-browser mock database) so the UI can be evaluated
 * without any backend.
 */
const cfg = typeof window !== "undefined" ? window.APP_CONFIG || {} : {};

export const SUPABASE_URL = cfg.SUPABASE_URL || "";
export const SUPABASE_ANON_KEY = cfg.SUPABASE_ANON_KEY || "";
export const SITE_URL = cfg.SITE_URL || (typeof location !== "undefined" ? location.origin : "");
export const IS_DEMO = !(SUPABASE_URL && SUPABASE_ANON_KEY);

/** supabase-js v2 ESM bundle (loaded only in production mode) */
export const SUPABASE_JS_CDN = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

export const BUCKET = "cafe-assets";
