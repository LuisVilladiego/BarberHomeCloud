/**
 * Planes BarberCloud — delega en business-model.js (fuente autoritativa del servidor).
 */
const {
  ANNUAL_DISCOUNT,
  PLANS,
  USD_TO_COP,
  amountForPlan,
  amountInCents,
  findPlan,
  normalizePlanId,
} = require("./business-model");

module.exports = {
  ANNUAL_DISCOUNT,
  PLANS,
  USD_TO_COP,
  amountForPlan,
  amountInCents,
  findPlan,
  normalizePlanId,
};
