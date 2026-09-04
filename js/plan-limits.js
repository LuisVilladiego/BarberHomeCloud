/**
 * PlanLimits — enforcement de cuotas según plan (Confirmafy-style).
 * Nunca hardcodear límites en componentes; usar BusinessModel.isWithinLimit.
 */
(function () {
  const MESSAGES = {
    appointments:
      "Este negocio alcanzó el límite de citas del mes. Mejora el plan para seguir recibiendo reservas.",
    clients: "Alcanzaste el límite de clientes de tu plan. Mejora el plan para agregar más.",
    barbers: "Alcanzaste el límite de barberos de tu plan. Mejora el plan para agregar más.",
  };

  function planForContext(options = {}) {
    if (options.plan) {
      return typeof options.plan === "object"
        ? options.plan
        : window.BusinessModel?.findPlan?.(options.plan);
    }
    if (options.negocio?.plan_id) {
      return window.BusinessModel?.findPlan?.(options.negocio.plan_id);
    }
    const billing = window.Billing?.cached?.();
    const biz = window.Tenant?.cached?.();
    const planId = options.planId || billing?.planId || biz?.plan_id;
    if (planId) return window.BusinessModel?.findPlan?.(planId);
    const cached = window.BusinessModel?.readSubscriptionCache?.()?.planId;
    if (cached) return window.BusinessModel?.findPlan?.(cached);
    return window.BusinessModel?.findPlan?.("free");
  }

  function monthBounds(date = new Date()) {
    const start = new Date(date.getFullYear(), date.getMonth(), 1);
    const end = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
    return { start, end };
  }

  function isCancelledStatus(status) {
    const s = String(status || "").toLowerCase();
    return s.includes("cancel");
  }

  function countLocalAppointmentsThisMonth(negocioId) {
    const { start, end } = monthBounds();
    const list = window.BookingStore?.loadBookings?.() || [];
    return list.filter((b) => {
      if (negocioId && b.negocioId && b.negocioId !== negocioId) return false;
      if (window.BookingStore?.isActive && !window.BookingStore.isActive(b)) return false;
      if (isCancelledStatus(b.status)) return false;
      if (!b.date) return false;
      const d = new Date(`${b.date}T12:00:00`);
      return d >= start && d <= end;
    }).length;
  }

  function countLocalClients(negocioId) {
    try {
      const users = JSON.parse(localStorage.getItem("gestionweb.loyalty_users") || "[]");
      if (!Array.isArray(users)) return 0;
      return users.filter((u) => !negocioId || !u.negocioId || u.negocioId === negocioId).length;
    } catch {
      return 0;
    }
  }

  async function countAppointmentsThisMonth(negocioId) {
    const nid = negocioId || window.Tenant?.currentId?.() || "";
    if (window.SupabaseData?.countCitasMes && nid) {
      try {
        const remote = await window.SupabaseData.countCitasMes(nid);
        if (typeof remote === "number") return remote;
      } catch {
        /* fallback local */
      }
    }
    return countLocalAppointmentsThisMonth(nid);
  }

  async function countClients(negocioId) {
    const nid = negocioId || window.Tenant?.currentId?.() || "";
    if (window.SupabaseData?.countClientes && nid) {
      try {
        const remote = await window.SupabaseData.countClientes(nid);
        if (typeof remote === "number") return remote;
      } catch {
        /* fallback local */
      }
    }
    return countLocalClients(nid);
  }

  function countActiveBarbers() {
    return window.BarberService?.countActive?.() || 0;
  }

  function limitMessage(metric, plan) {
    const maxKey = {
      appointments: "maxAppointments",
      clients: "maxClients",
      barbers: "maxBarbers",
    }[metric];
    const max = plan?.[maxKey];
    const base = MESSAGES[metric] || "Límite del plan alcanzado.";
    if (max == null) return base;
    return `${base} (máx. ${max})`;
  }

  async function checkLimit(metric, options = {}) {
    const plan = planForContext(options);
    const negocioId = options.negocioId || window.Tenant?.currentId?.() || "";
    let count = 0;

    if (metric === "appointments") count = await countAppointmentsThisMonth(negocioId);
    else if (metric === "clients") count = await countClients(negocioId);
    else if (metric === "barbers") count = countActiveBarbers();

    const ok = window.BusinessModel?.isWithinLimit?.(metric, count, plan) !== false;
    const maxKey = {
      appointments: "maxAppointments",
      clients: "maxClients",
      barbers: "maxBarbers",
    }[metric];

    return {
      ok,
      metric,
      count,
      max: plan?.[maxKey] ?? null,
      planId: plan?.id || "",
      message: ok ? "" : limitMessage(metric, plan),
    };
  }

  async function canAddAppointment(options = {}) {
    return checkLimit("appointments", options);
  }

  async function canAddClient(options = {}) {
    return checkLimit("clients", options);
  }

  async function canAddBarber(options = {}) {
    return checkLimit("barbers", options);
  }

  async function usageSummary(negocioId) {
    const plan = planForContext({ negocioId });
    const [appointments, clients] = await Promise.all([
      countAppointmentsThisMonth(negocioId),
      countClients(negocioId),
    ]);
    const barbers = countActiveBarbers();
    return {
      planId: plan?.id,
      planLabel: plan?.label || plan?.name,
      appointments: { count: appointments, max: plan?.maxAppointments ?? null },
      clients: { count: clients, max: plan?.maxClients ?? null },
      barbers: { count: barbers, max: plan?.maxBarbers ?? null },
    };
  }

  window.PlanLimits = {
    canAddAppointment,
    canAddBarber,
    canAddClient,
    checkLimit,
    countActiveBarbers,
    countAppointmentsThisMonth,
    countClients,
    countLocalAppointmentsThisMonth,
    usageSummary,
  };
})();
