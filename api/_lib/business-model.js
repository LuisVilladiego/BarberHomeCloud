/**
 * Modelo de negocio BarberCloud (referencia Confirmafy).
 * Fuente autoritativa en servidor: planes, estados, roles y límites.
 */
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

/** IDs antiguos basados en volumen de citas → tier actual. */
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

function normalizeRole(raw) {
  const r = String(raw || ROLES.STAFF).toLowerCase();
  return LEGACY_ROLE_MAP[r] || r;
}

function amountForPlan(plan, billingPeriod = "monthly") {
  const monthly = Number(plan.price) || 0;
  if (billingPeriod === "annual") return Math.round(monthly * 12 * (1 - ANNUAL_DISCOUNT));
  return monthly;
}

function amountInCents(plan, billingPeriod = "monthly") {
  return Math.round(amountForPlan(plan, billingPeriod) * 100);
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

module.exports = {
  ACCESS_STATUSES,
  ANNUAL_DISCOUNT,
  LEGACY_PLAN_MAP,
  LEGACY_ROLE_MAP,
  LEGACY_STATUS_MAP,
  PLANS,
  ROLES,
  SUBSCRIPTION_STATUS,
  USD_TO_COP,
  amountForPlan,
  amountInCents,
  canUseFeature,
  findPlan,
  hasSubscriptionAccess,
  isPeriodActive,
  isRestrictedExperience,
  isWithinLimit,
  membershipExperience,
  normalizePlanId,
  normalizeRole,
  normalizeStatus,
};
