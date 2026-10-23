/**
 * PUBLIC RUNTIME CONFIG (safe to expose).
 * Fill these from your Supabase project settings -> API:
 *   SUPABASE_URL     e.g. https://xyzcompany.supabase.co
 *   SUPABASE_ANON_KEY  the "anon public" key (NOT the service_role key!)
 *   SITE_URL         your production origin, e.g. https://menu.example.com
 *
 * IMPORTANT:
 *  - The anon key is a PUBLIC identifier; security comes from RLS policies.
 *  - The service_role key must NEVER be placed here or in any browser code.
 *    It only lives in Supabase Edge Function secrets.
 *  - While these are empty, the app runs in DEMO MODE with local sample data.
 */
window.APP_CONFIG = {
  SUPABASE_URL: "https://svqayntnmxoaltcfjoka.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN2cWF5bnRubXhvYWx0Y2Zqb2thIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI3NDMxMzEsImV4cCI6MjEwODMxOTEzMX0.IPRHeuPfAMDJwwt_1IrWeFb8hmenHPPu9EETbnLazVk",
  SITE_URL: "https://cofe.milad8080yt.workers.dev/",
};
