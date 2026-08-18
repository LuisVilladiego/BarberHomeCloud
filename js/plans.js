/**
 * Planes BarberCloud para mostrar en la UI.
 * El monto que se cobra de verdad lo calcula el servidor en api/_lib/plans.js;
 * si cambias precios, actualiza los dos archivos.
 */
(function () {
  const USD_TO_COP = 4000;

  const PLANS = [
    { id: "50", limit: 50, priceUsd: 12, label: "50 citas al mes" },
    { id: "100", limit: 100, priceUsd: 18, label: "100 citas al mes" },
    { id: "200", limit: 200, priceUsd: 31, label: "200 citas al mes" },
    { id: "300", limit: 300, priceUsd: 45, label: "300 citas al mes" },
  ].map((plan) => ({ ...plan, price: plan.priceUsd * USD_TO_COP }));

  function find(planId) {
    return PLANS.find((plan) => plan.id === String(planId)) || null;
  }

  function formatMoney(amount) {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      maximumFractionDigits: 0,
    }).format(Number(amount) || 0);
  }

  window.Plans = { PLANS, USD_TO_COP, find, formatMoney };
})();
