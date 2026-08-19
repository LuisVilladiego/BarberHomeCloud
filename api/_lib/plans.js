/**
 * Planes BarberCloud. Esta copia es la autoritativa: el monto que se cobra
 * siempre sale de aquí, nunca del navegador.
 * Si cambias precios, actualiza también js/plans.js (solo para mostrar).
 */
const USD_TO_COP = 4000;
const ANNUAL_DISCOUNT = 0.16;

const PLANS = [
  { id: "50", limit: 50, priceUsd: 12, label: "50 citas al mes" },
  { id: "100", limit: 100, priceUsd: 18, label: "100 citas al mes" },
  { id: "200", limit: 200, priceUsd: 31, label: "200 citas al mes" },
  { id: "300", limit: 300, priceUsd: 45, label: "300 citas al mes" },
].map((plan) => ({ ...plan, price: plan.priceUsd * USD_TO_COP }));

function findPlan(planId) {
  return PLANS.find((plan) => plan.id === String(planId)) || null;
}

function amountForPlan(plan, billingPeriod = "monthly") {
  const monthly = Number(plan.price) || 0;
  if (billingPeriod === "annual") return Math.round(monthly * 12 * (1 - ANNUAL_DISCOUNT));
  return monthly;
}

function amountInCents(plan, billingPeriod = "monthly") {
  return Math.round(amountForPlan(plan, billingPeriod) * 100);
}

module.exports = { ANNUAL_DISCOUNT, PLANS, USD_TO_COP, amountForPlan, amountInCents, findPlan };
