/**
 * Modelo de negocio BarberCloud (referencia Confirmafy).
 * Planes, estados de suscripción, roles y límites — no hardcodear en componentes.
 */
(function () {
  const USD_TO_COP = 4000;
  const ANNUAL_DISCOUNT = 0.16;

  const SUBSCRIPTION_STATUS = {
    TRIAL: "trial",
    ACTIVE: "active",
    PAST_DUE: "past_due",
    CANCELED: "canceled",
    EXPIRED: "expired",
    SUSPENDED: "suspended",
  };

  const LEGACY_STATUS_MAP = {
    trialing: SUBSCRIPTION_STATUS.TRIAL,
    incomplete: SUBSCRIPTION_STATUS.EXPIRED,
    cancelled: SUBSCRIPTION_STATUS.CANCELED,
  };

  const ACCESS_STATUSES = new Set([
    SUBSCRIPTION_STATUS.TRIAL,
    SUBSCRIPTION_STATUS.ACTIVE,
    SUBSCRIPTION_STATUS.PAST_DUE,
  ]);

  const ROLES = {
    OWNER: "owner",
    ADMIN: "admin",
    BARBER: "barber",
    STAFF: "staff",
    CLIENT: "client",
  };

  const LEGACY_ROLE_MAP = {
    barbero: ROLES.BARBER,
  };

  const LEGACY_PLAN_MAP = {
    50: "basic",
    100: "pro",
    200: "pro",
    300: "business",
  };

  const PLANS = [
    {
      id: "free",
      name: "FREE",
      label: "Gratis",
      priceUsd: 0,
      maxBarbers: 1,
      maxClients: 50,
      maxAppointments: 30,
      whatsappEnabled: false,
      customSlug: true,
      analyticsEnabled: false,
      loyaltyEnabled: false,
      marketplaceEnabled: false,
      advancedSettings: false,
    },
    {
      id: "basic",
      name: "BASIC",
      label: "Basic",
      priceUsd: 12,
      maxBarbers: 2,
      maxClients: 200,
      maxAppointments: 50,
      whatsappEnabled: true,
      customSlug: true,
      analyticsEnabled: false,
      loyaltyEnabled: true,
      marketplaceEnabled: false,
      advancedSettings: false,
    },
    {
      id: "pro",
      name: "PRO",
      label: "Pro",
      priceUsd: 18,
      maxBarbers: 5,
      maxClients: 500,
      maxAppointments: 100,
      whatsappEnabled: true,
      customSlug: true,
      analyticsEnabled: true,
      loyaltyEnabled: true,
      marketplaceEnabled: true,
      advancedSettings: false,
    },
    {
      id: "business",
      name: "BUSINESS",
      label: "Business",
      priceUsd: 45,
      maxBarbers: 15,
      maxClients: null,
      maxAppointments: 300,
      whatsappEnabled: true,
      customSlug: true,
      analyticsEnabled: true,
      loyaltyEnabled: true,
      marketplaceEnabled: true,
      advancedSettings: true,
    },
  ].map((plan) => ({ ...plan, price: plan.priceUsd * USD_TO_COP }));

  const PAID_PLANS = PLANS.filter((p) => p.priceUsd > 0);

  const FEATURES_BY_PLAN = {
    free: ["Link de reservas", "Hasta 30 citas/mes", "1 barbero"],
    basic: ["WhatsApp automático", "Hasta 50 citas/mes", "2 barberos", "Autoagenda"],
    pro: ["Todo Basic", "Hasta 100 citas/mes", "5 barberos", "Reportes y analytics"],
    business: ["Todo Pro", "Hasta 300 citas/mes", "15 barberos", "Configuración avanzada"],
  };

  const PERMISSIONS = {
    [ROLES.OWNER]: ["billing", "subscription", "settings", "users", "barbers", "appointments", "clients", "analytics"],
    [ROLES.ADMIN]: ["barbers", "appointments", "clients", "analytics", "settings"],
    [ROLES.BARBER]: ["appointments.own", "clients.own", "analytics.own"],
    [ROLES.STAFF]: ["appointments", "clients"],
    [ROLES.CLIENT]: ["appointments.own", "points.own", "profile.own"],
  };

  function normalizePlanId(raw) {
    const id = String(raw || "pro").trim().toLowerCase();
    if (LEGACY_PLAN_MAP[id]) return LEGACY_PLAN_MAP[id];
    return PLANS.some((p) => p.id === id) ? id : "pro";
  }

  function findPlan(planId) {
    const id = normalizePlanId(planId);
    return PLANS.find((plan) => plan.id === id) || PLANS.find((p) => p.id === "pro");
  }

  function normalizeStatus(raw) {
    const s = String(raw || SUBSCRIPTION_STATUS.EXPIRED).toLowerCase();
    return LEGACY_STATUS_MAP[s] || s;
  }

  function normalizeRole(raw) {
    const r = String(raw || ROLES.STAFF).toLowerCase();
    return LEGACY_ROLE_MAP[r] || r;
  }

  function isPeriodActive(periodEnd) {
    if (!periodEnd) return false;
    return new Date(periodEnd).getTime() > Date.now();
  }

  function hasSubscriptionAccess(status, periodEnd) {
    const normalized = normalizeStatus(status);
    if (!isPeriodActive(periodEnd)) return false;
    if (ACCESS_STATUSES.has(normalized)) return true;
    // Cancelado al final del período: acceso hasta current_period_end.
    if (normalized === SUBSCRIPTION_STATUS.CANCELED) return true;
    return false;
  }

  /**
   * Experiencia de UI según Confirmafy:
   * trial/active/past_due/canceled → producto real
   * expired/suspended/none → maqueta restringida (sin datos del negocio)
   */
  function membershipExperience(status, periodEnd, options = {}) {
    const normalized = normalizeStatus(status);
    const access = hasSubscriptionAccess(status, periodEnd);
    const cancelAtPeriodEnd = !!options.cancelAtPeriodEnd;
    if (access && normalized === SUBSCRIPTION_STATUS.TRIAL) return "trial";
    if (access && normalized === SUBSCRIPTION_STATUS.PAST_DUE) return "past_due";
    if (access && (normalized === SUBSCRIPTION_STATUS.CANCELED || cancelAtPeriodEnd)) {
      return "canceled";
    }
    if (access) return "active";
    if (normalized === SUBSCRIPTION_STATUS.SUSPENDED) return "suspended";
    if (periodEnd) return "expired";
    return "none";
  }

  function isRestrictedExperience(experience) {
    return experience === "expired" || experience === "suspended" || experience === "none";
  }

  function membershipCopy(experience, extras = {}) {
    const days = Number(extras.daysLeft) || 0;
    const endLabel = extras.endLabel || "el final del período";
    const dayWord = days === 1 ? "día" : "días";
    const map = {
      trial: {
        kicker: "Prueba gratis",
        title: days > 0 ? `Te quedan ${days} ${dayWord} de prueba` : "Tu prueba está por terminar",
        detail: "Usa el panel de verdad: configura tu barbería y recibe reservas. Activa un plan para no pausar el enlace público.",
        cta: "Elegir plan",
        href: "suscripcion.html?need=1",
        chip: days > 0 ? `Prueba · ${days}d` : "Prueba",
        tone: "trial",
      },
      active: {
        kicker: "Plan activo",
        title: "Tu barbería está en marcha",
        detail: "El enlace público recibe reservas y el panel está desbloqueado según tu plan.",
        cta: "Ver plan",
        href: "suscripcion.html",
        chip: extras.planLabel || "Activo",
        tone: "ok",
      },
      past_due: {
        kicker: "Periodo de gracia",
        title: "Pago pendiente",
        detail: "Sigues operando por ahora. Si el pago no se regulariza, se pausa el enlace público. Tus datos no se borran.",
        cta: "Pagar ahora",
        href: "suscripcion.html?need=1",
        chip: "Pago pendiente",
        tone: "warn",
      },
      canceled: {
        kicker: "Cancelación programada",
        title: `Acceso hasta ${endLabel}`,
        detail: `Tu plan sigue activo hasta ${endLabel}. Después se pausan las reservas públicas y se conservan tus datos.`,
        cta: "Reactivar plan",
        href: "suscripcion.html",
        chip: "Cancela pronto",
        tone: "info",
      },
      expired: {
        kicker: "Suscripción vencida",
        title: "Tu barbería está en pausa",
        detail: "El enlace público está desactivado. Esto es una vista de ejemplo: no mostramos tus calendarios ni clientes. Renueva para recuperar el negocio.",
        cta: "Renovar ahora",
        href: "suscripcion.html?need=1",
        chip: "Vencido",
        tone: "danger",
      },
      suspended: {
        kicker: "Cuenta suspendida",
        title: "El panel quedó en modo demostración",
        detail: "No se muestran datos reales del negocio. Renueva o escribe a soporte para reactivar la cuenta. Nada se borra de inmediato.",
        cta: "Reactivar",
        href: "suscripcion.html?need=1",
        chip: "Suspendido",
        tone: "danger",
      },
      none: {
        kicker: "Sin plan",
        title: "Así se ve BarberCloud",
        detail: "Esta es una maqueta de ejemplo. Elige un plan para publicar tu URL, recibir reservas y usar tus propios calendarios.",
        cta: "Elegir plan",
        href: "suscripcion.html?need=1",
        chip: "Sin plan",
        tone: "neutral",
      },
    };
    return map[experience] || map.none;
  }

  function readSubscriptionCache() {
    try {
      const billing = JSON.parse(localStorage.getItem("barbercloud.billing") || "null");
      if (billing?.status) {
        return {
          planId: billing.planId,
          status: billing.status,
          periodStart: billing.periodStart,
          periodEnd: billing.periodEnd,
          lastPaymentAt: billing.lastPaymentAt,
        };
      }
      const sub = JSON.parse(localStorage.getItem("barbercloud.subscription") || "{}");
      const biz = window.Tenant?.cached?.();
      return {
        planId: sub.planId || biz?.plan_id || "pro",
        status: sub.status || biz?.subscription_status || SUBSCRIPTION_STATUS.EXPIRED,
        periodStart: sub.periodStart || biz?.current_period_start || null,
        periodEnd: sub.periodEnd || biz?.current_period_end || null,
        lastPaymentAt: sub.lastPaymentAt || biz?.last_payment_at || null,
        cancelAtPeriodEnd: !!(sub.cancelAtPeriodEnd || biz?.cancel_at_period_end),
      };
    } catch {
      return { planId: "pro", status: SUBSCRIPTION_STATUS.EXPIRED };
    }
  }

  function currentPlan() {
    const sub = readSubscriptionCache();
    return findPlan(sub.planId);
  }

  function canUseFeature(feature, planOrId) {
    const plan = typeof planOrId === "object" ? planOrId : findPlan(planOrId);
    if (!plan) return false;
    const map = {
      whatsapp: plan.whatsappEnabled,
      customSlug: plan.customSlug,
      analytics: plan.analyticsEnabled,
      loyalty: plan.loyaltyEnabled,
      marketplace: plan.marketplaceEnabled,
      advancedSettings: plan.advancedSettings,
    };
    return !!map[feature];
  }

  function isWithinLimit(metric, count, planOrId) {
    const plan = typeof planOrId === "object" ? planOrId : findPlan(planOrId);
    if (!plan) return true;
    const limits = {
      barbers: plan.maxBarbers,
      clients: plan.maxClients,
      appointments: plan.maxAppointments,
    };
    const max = limits[metric];
    if (max == null) return true;
    return Number(count) < max;
  }

  function statusLabel(status) {
    const s = normalizeStatus(status);
    const labels = {
      [SUBSCRIPTION_STATUS.TRIAL]: { text: "Prueba gratis", tone: "ok" },
      [SUBSCRIPTION_STATUS.ACTIVE]: { text: "Activo", tone: "ok" },
      [SUBSCRIPTION_STATUS.PAST_DUE]: { text: "Pago pendiente", tone: "paused" },
      [SUBSCRIPTION_STATUS.CANCELED]: { text: "Cancelado", tone: "paused" },
      [SUBSCRIPTION_STATUS.EXPIRED]: { text: "Vencido", tone: "paused" },
      [SUBSCRIPTION_STATUS.SUSPENDED]: { text: "Suspendido", tone: "paused" },
    };
    return labels[s] || { text: "Sin activar", tone: "paused" };
  }

  function onboardingChecklist() {
    const auto = window.Tenant?.readAutoagendaCache?.() || {};
    const ctx = window.Tenant?.getBusinessContext?.() || {};
    const barbers = window.BarberService?.list?.() || auto.barbers || [];
    const days = auto.schedules?.[0]?.days || {};
    const hasSchedule = Object.values(days).some((d) => d?.enabled);
    return {
      profile: !!(ctx.title && ctx.slug),
      schedule: hasSchedule,
      barber: barbers.some((b) => b?.active !== false),
      page: !!(ctx.slug && (auto.appointmentTypes?.length || auto.services?.length)),
      bookings: false,
    };
  }

  function onboardingComplete() {
    const c = onboardingChecklist();
    return c.profile && c.schedule && c.barber && c.page;
  }

  function roleCan(role, permission) {
    const r = normalizeRole(role);
    const list = PERMISSIONS[r] || [];
    if (list.includes(permission)) return true;
    const prefix = String(permission).split(".")[0];
    return list.includes(prefix);
  }

  window.BusinessModel = {
    ACCESS_STATUSES,
    ANNUAL_DISCOUNT,
    FEATURES_BY_PLAN,
    LEGACY_PLAN_MAP,
    LEGACY_ROLE_MAP,
    LEGACY_STATUS_MAP,
    PAID_PLANS,
    PERMISSIONS,
    PLANS,
    ROLES,
    SUBSCRIPTION_STATUS,
    USD_TO_COP,
    canUseFeature,
    currentPlan,
    findPlan,
    hasSubscriptionAccess,
    isPeriodActive,
    isRestrictedExperience,
    isWithinLimit,
    membershipCopy,
    membershipExperience,
    normalizePlanId,
    normalizeRole,
    normalizeStatus,
    onboardingChecklist,
    onboardingComplete,
    readSubscriptionCache,
    roleCan,
    statusLabel,
  };
})();
