/**
 * Estado de suscripción. La verdad está en Supabase (columnas escritas solo por
 * el webhook de Wompi); localStorage se usa como caché para pintar rápido.
 */
(function () {
  const CACHE_KEY = "barbercloud.billing";

  function db() {
    return window.SupabaseClient?.getClient?.() || null;
  }

  function enabled() {
    return !!window.SupabaseClient?.isConfigured?.() && !!db();
  }

  function fromNegocio(row) {
    if (!row) return null;
    return {
      negocioId: row.id,
      status: row.subscription_status || "incomplete",
      planId: row.plan_id || "100",
      periodStart: row.current_period_start || null,
      periodEnd: row.current_period_end || null,
      lastPaymentAt: row.last_payment_at || null,
    };
  }

  function isActive(state) {
    const s = state || cached();
    if (!s) return false;
    const status = String(s.status || "").toLowerCase();
    if (status !== "active" && status !== "trialing") return false;
    if (!s.periodEnd) return false;
    return new Date(s.periodEnd).getTime() > Date.now();
  }

  /** Periodo de prueba gratuito (no confundir con membresía pagada `active`). */
  function isTrialing(state) {
    const s = state || cached();
    if (!s) return false;
    if (String(s.status || "").toLowerCase() !== "trialing") return false;
    return isActive(s);
  }

  function daysLeft(state) {
    const s = state || cached();
    if (!s?.periodEnd) return 0;
    const diff = new Date(s.periodEnd).getTime() - Date.now();
    return diff <= 0 ? 0 : Math.ceil(diff / 86400000);
  }

  function cached() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function cache(state) {
    try {
      if (state) localStorage.setItem(CACHE_KEY, JSON.stringify(state));
      else localStorage.removeItem(CACHE_KEY);
      window.dispatchEvent(new CustomEvent("barbercloud:billing-updated"));
    } catch {
      /* ignore */
    }
  }

  /** Relee el negocio desde Supabase y alinea todas las cachés locales. */
  async function refresh() {
    if (!enabled()) return cached();
    const row = await window.SupabaseData?.fetchOwnNegocio?.();
    const state = fromNegocio(row);
    cache(state);
    if (row) {
      window.Tenant?.setCurrent?.(row);
      window.Tenant?.hydrateNegocioCaches?.(row);
    }
    return state;
  }

  async function accessToken() {
    const client = db();
    if (!client) return "";
    try {
      const { data } = await client.auth.getSession();
      return data?.session?.access_token || "";
    } catch {
      return "";
    }
  }

  /** Pide la referencia y la firma al backend, que decide el monto. */
  async function startCheckout(planId, billingPeriod = "monthly") {
    const token = await accessToken();
    if (!token) return { ok: false, message: "Inicia sesión para pagar." };

    try {
      const res = await fetch("/api/wompi/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ planId, billingPeriod }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.checkoutUrl) {
        const base = data?.error || "No se pudo iniciar el pago.";
        return { ok: false, message: data?.detail ? `${base} (${data.detail})` : base };
      }
      return { ok: true, ...data };
    } catch (err) {
      console.warn("[billing] checkout", err);
      return { ok: false, message: "No se pudo conectar con la pasarela de pago." };
    }
  }

  async function fetchPagos(limit = 12) {
    const client = db();
    const nid = window.Tenant?.currentId?.();
    if (!client || !nid) return [];
    const { data, error } = await client
      .from("pagos")
      .select("*")
      .eq("negocio_id", nid)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) {
      console.warn("[billing] pagos", error.message);
      return [];
    }
    return data || [];
  }

  async function pagoByReference(reference) {
    const client = db();
    if (!client || !reference) return null;
    const { data, error } = await client
      .from("pagos")
      .select("*")
      .eq("reference", reference)
      .maybeSingle();
    if (error) {
      console.warn("[billing] pago", error.message);
      return null;
    }
    return data || null;
  }

  /** Al volver de Wompi el webhook puede tardar unos segundos en llegar. */
  async function waitForPayment(reference, options = {}) {
    const attempts = Number(options.attempts) || 12;
    const delayMs = Number(options.delayMs) || 1500;
    let last = null;
    for (let i = 0; i < attempts; i += 1) {
      last = await pagoByReference(reference);
      if (last && String(last.status).toUpperCase() !== "PENDING") return last;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    return last;
  }

  /**
   * true solo dentro del panel del barbero cuando no hay pago vigente.
   * En la página pública devuelve false: allí manda RLS, no esta caché.
   */
  function blocksWrites() {
    if (!document.querySelector(".sidebar")) return false;
    const state = cached();
    if (!state) return false;
    const nid = window.Tenant?.currentId?.();
    if (!nid || state.negocioId !== nid) return false;
    return !isActive(state);
  }

  /** Corta una acción de escritura y avisa. Devuelve true si está bloqueada. */
  function guard(message) {
    if (!blocksWrites()) return false;
    window.AppShell?.toast?.(
      message || "Suscripción vencida: renueva el pago para volver a editar."
    );
    return true;
  }

  function statusLabel(state) {
    const s = state || cached();
    if (isActive(s)) return { text: "Activo", tone: "ok" };
    const status = String(s?.status || "incomplete").toLowerCase();
    if (status === "canceled" || status === "cancelled") {
      return { text: "Cancelado", tone: "paused" };
    }
    if (s?.periodEnd) return { text: "Vencido por falta de pago", tone: "paused" };
    return { text: "Sin activar", tone: "paused" };
  }

  window.Billing = {
    CACHE_KEY,
    blocksWrites,
    cache,
    cached,
    daysLeft,
    enabled,
    fetchPagos,
    fromNegocio,
    guard,
    isActive,
    isTrialing,
    pagoByReference,
    refresh,
    startCheckout,
    statusLabel,
    waitForPayment,
  };
})();
