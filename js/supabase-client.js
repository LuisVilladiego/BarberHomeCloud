/**
 * Cliente Supabase compartido (CDN global `supabase.createClient`).
 */
(function () {
  let client = null;

  function cfg() {
    return window.SupabaseConfig || {};
  }

  function isConfigured() {
    const c = cfg();
    return !!(c.enabled && c.url && c.anonKey && String(c.url).includes("supabase.co"));
  }

  function getClient() {
    if (!isConfigured()) return null;
    if (client) return client;
    const createClient = window.supabase?.createClient;
    if (typeof createClient !== "function") {
      console.warn("[Supabase] Falta el script CDN @supabase/supabase-js");
      return null;
    }
    client = createClient(String(cfg().url).trim(), String(cfg().anonKey).trim(), {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: "implicit",
        storageKey: "gestionweb.auth",
      },
    });
    return client;
  }

  window.SupabaseClient = {
    isConfigured,
    getClient,
  };
})();
