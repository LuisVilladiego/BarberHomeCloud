/**
 * Planes Gestiónweb.app para la UI.
 * Definición y límites en js/business-model.js; precios deben coincidir con api/_lib/plans.js.
 */
(function () {
  function bm() {
    return window.BusinessModel;
  }

  function plansSource() {
    return bm()?.PAID_PLANS || [];
  }

  function find(planId) {
    return bm()?.findPlan?.(planId) || null;
  }

  function monthlyUsd(plan) {
    return Number(plan?.priceUsd) || 0;
  }

  function displayUsd(plan, period = "monthly") {
    const base = monthlyUsd(plan);
    const discount = bm()?.ANNUAL_DISCOUNT || 0.16;
    if (period === "annual") return Math.round(base * (1 - discount) * 100) / 100;
    return base;
  }

  function displayCop(plan, period = "monthly") {
    const monthly = Number(plan?.price) || 0;
    const discount = bm()?.ANNUAL_DISCOUNT || 0.16;
    if (period === "annual") return Math.round(monthly * (1 - discount));
    return monthly;
  }

  function chargeCop(plan, period = "monthly") {
    const monthly = Number(plan?.price) || 0;
    const discount = bm()?.ANNUAL_DISCOUNT || 0.16;
    if (period === "annual") return Math.round(monthly * 12 * (1 - discount));
    return monthly;
  }

  function formatMoney(amount) {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      maximumFractionDigits: 0,
    }).format(Number(amount) || 0);
  }

  function formatUsd(amount) {
    const value = Number(amount) || 0;
    const rounded = Number.isInteger(value) ? value : Math.round(value * 100) / 100;
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: Number.isInteger(rounded) ? 0 : 2,
    }).format(rounded);
  }

  function priceLabel(plan, period = "monthly") {
    if (!plan?.priceUsd) return "Gratis";
    const cop = formatMoney(displayCop(plan, period));
    const usd = formatUsd(displayUsd(plan, period));
    if (period === "annual") {
      return `${cop} al mes (~${usd} USD) · facturado anualmente`;
    }
    return `${cop} al mes (~${usd} USD)`;
  }

  function planFeatures(plan) {
    const id = bm()?.normalizePlanId?.(plan?.id) || plan?.id;
    return bm()?.FEATURES_BY_PLAN?.[id] || [];
  }

  function planSummary(plan) {
    const max = plan?.maxAppointments;
    const barbers = plan?.maxBarbers;
    return `${plan?.label || plan?.name} · hasta ${max} citas/mes · ${barbers} barbero${barbers === 1 ? "" : "s"}`;
  }

  window.Plans = {
    get ANNUAL_DISCOUNT() {
      return bm()?.ANNUAL_DISCOUNT || 0.16;
    },
    get FEATURES() {
      return planFeatures(find("pro"));
    },
    get PLANS() {
      return plansSource();
    },
    get USD_TO_COP() {
      return bm()?.USD_TO_COP || 4000;
    },
    chargeCop,
    displayCop,
    displayUsd,
    find,
    formatMoney,
    formatUsd,
    monthlyUsd,
    planFeatures,
    planSummary,
    priceLabel,
  };
})();
