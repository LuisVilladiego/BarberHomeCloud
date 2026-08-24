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
    const BM = window.BusinessModel;
    return {
      negocioId: row.id,
      status: BM?.normalizeStatus?.(row.subscription_status) || row.subscription_status || "expired",
      planId: BM?.normalizePlanId?.(row.plan_id) || row.plan_id || "pro",
      periodStart: row.current_period_start || null,
      periodEnd: row.current_period_end || null,
      lastPaymentAt: row.last_payment_at || null,
      cancelAtPeriodEnd: !!row.cancel_at_period_end,
    };
  }

  function isActive(state) {
    const s = state || cached();
    if (!s) return false;
    if (window.BusinessModel?.hasSubscriptionAccess) {
      return window.BusinessModel.hasSubscriptionAccess(s.status, s.periodEnd);
    }
    const status = String(s.status || "").toLowerCase();
    if (status !== "active" && status !== "trialing" && status !== "trial" && status !== "past_due") {
      return false;
    }
    if (!s.periodEnd) return false;
    return new Date(s.periodEnd).getTime() > Date.now();
  }

  /** Periodo de prueba gratuito (no confundir con membresía pagada `active`). */
  function isTrialing(state) {
    const s = state || cached();
    if (!s) return false;
    const normalized = window.BusinessModel?.normalizeStatus?.(s.status) || s.status;
    if (normalized !== "trial") return false;
    return isActive(s);
  }

  /** Membresía de pago vigente. El trial no cuenta: ahí solo hay datos de demostración. */
  function hasPaidMembership(state) {
    const s = state || cached();
    if (!s || !isActive(s) || isTrialing(s)) return false;
    const normalized = window.BusinessModel?.normalizeStatus?.(s.status) || String(s.status || "").toLowerCase();
    return normalized === "active" || normalized === "past_due" || normalized === "canceled";
  }

  function isPendingCancellation(state) {
    const s = state || cached();
    if (!s || !isActive(s)) return false;
    const normalized = window.BusinessModel?.normalizeStatus?.(s.status) || s.status;
    return !!s.cancelAtPeriodEnd || normalized === "canceled";
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
    if (isActive(s)) {
      if (isPendingCancellation(s)) {
        return { text: "Cancela al final del período", tone: "paused" };
      }
      const normalized = window.BusinessModel?.normalizeStatus?.(s?.status) || s?.status;
      if (normalized === "trial") return { text: "Prueba gratis", tone: "ok" };
      return { text: "Activo", tone: "ok" };
    }
    if (window.BusinessModel?.statusLabel) {
      return window.BusinessModel.statusLabel(s?.status);
    }
    const status = String(s?.status || "expired").toLowerCase();
    if (status === "canceled" || status === "cancelled") {
      return { text: "Cancelado", tone: "paused" };
    }
    if (s?.periodEnd) return { text: "Vencido por falta de pago", tone: "paused" };
    return { text: "Sin activar", tone: "paused" };
  }

  /** Marca la suscripción para no renovar al final del período pagado. */
  async function cancelSubscription() {
    const current = cached();
    if (!isActive(current)) {
      return { ok: false, message: "Tu suscripción no está activa, así que no hay nada que cancelar." };
    }
    if (isPendingCancellation(current)) {
      return { ok: true, alreadyCanceled: true, periodEnd: current.periodEnd };
    }

    if (enabled()) {
      const token = await accessToken();
      if (!token) return { ok: false, message: "Inicia sesión para cancelar." };

      try {
        const res = await fetch("/api/subscription/cancel", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.ok) {
          return { ok: false, message: data?.error || "No se pudo cancelar la suscripción." };
        }
        if (data.negocio) {
          window.Tenant?.setCurrent?.(data.negocio);
          window.Tenant?.hydrateNegocioCaches?.(data.negocio);
        }
        await refresh();
        return {
          ok: true,
          alreadyCanceled: !!data.alreadyCanceled,
          periodEnd: data.periodEnd || current.periodEnd,
        };
      } catch (err) {
        console.warn("[billing] cancel", err);
        return { ok: false, message: "No se pudo conectar para cancelar." };
      }
    }

    const next = {
      ...(current || {}),
      status: "canceled",
      cancelAtPeriodEnd: true,
    };
    cache(next);
    try {
      const subRaw = JSON.parse(localStorage.getItem("barbercloud.subscription") || "{}");
      localStorage.setItem(
        "barbercloud.subscription",
        JSON.stringify({
          ...subRaw,
          planId: next.planId || subRaw.planId || "pro",
          status: "canceled",
          periodStart: next.periodStart || subRaw.periodStart || null,
          periodEnd: next.periodEnd || subRaw.periodEnd || null,
          cancelAtPeriodEnd: true,
          payment: subRaw.payment || { provider: "local" },
        })
      );
    } catch {
      /* ignore */
    }
    return { ok: true, local: true, periodEnd: next.periodEnd };
  }

  /** Inicia 7 días de prueba (Confirmafy-style) vía backend con service role. */
  async function startTrial() {
    if (!enabled()) {
      const now = new Date();
      const end = new Date(now.getTime() + 7 * 86400000);
      const local = {
        negocioId: window.Tenant?.currentId?.() || null,
        status: "trial",
        planId: "pro",
        periodStart: now.toISOString(),
        periodEnd: end.toISOString(),
        lastPaymentAt: null,
      };
      cache(local);
      try {
        localStorage.setItem(
          "barbercloud.subscription",
          JSON.stringify({
            planId: local.planId,
            status: local.status,
            periodStart: local.periodStart,
            periodEnd: local.periodEnd,
            cancelAtPeriodEnd: false,
            payment: { provider: "trial" },
          })
        );
      } catch {
        /* ignore */
      }
      return { ok: true, local: true, periodEnd: end.toISOString() };
    }

    const token = await accessToken();
    if (!token) return { ok: false, message: "Inicia sesión para empezar la prueba." };

    try {
      const res = await fetch("/api/trial/start", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        return { ok: false, message: data?.error || "No se pudo iniciar la prueba gratis." };
      }
      if (data.negocio) {
        window.Tenant?.setCurrent?.(data.negocio);
        window.Tenant?.hydrateNegocioCaches?.(data.negocio);
      }
      await refresh();
      return { ok: true, periodEnd: data.periodEnd, alreadyActive: !!data.alreadyActive };
    } catch (err) {
      console.warn("[billing] trial", err);
      return { ok: false, message: "No se pudo conectar para iniciar la prueba." };
    }
  }

  window.Billing = {
    CACHE_KEY,
    blocksWrites,
    cache,
    cached,
    cancelSubscription,
    daysLeft,
    enabled,
    fetchPagos,
    fromNegocio,
    guard,
    isActive,
    isPendingCancellation,
    isTrialing,
    hasPaidMembership,
    pagoByReference,
    refresh,
    startCheckout,
    startTrial,
    statusLabel,
    waitForPayment,
  };
})();
