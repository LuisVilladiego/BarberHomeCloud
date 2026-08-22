const {
  insertNegocio,
  negocioOfOwner,
  provisionalSlug,
  updateNegocio,
  userFromToken,
} = require("../_lib/supabase");
const {
  hasSubscriptionAccess,
  normalizePlanId,
} = require("../_lib/business-model");

const TRIAL_DAYS = 7;

function bearer(req) {
  const raw = req.headers.authorization || req.headers.Authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(String(raw));
  return match ? match[1].trim() : "";
}

function subscriptionActive(negocio) {
  return hasSubscriptionAccess(
    negocio?.subscription_status,
    negocio?.current_period_end
  );
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Método no permitido" });
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: "Supabase no configurado en el servidor" });
  }

  try {
    const user = await userFromToken(bearer(req));
    if (!user) return res.status(401).json({ error: "Sesión no válida" });

    let negocio = await negocioOfOwner(user.id);

    if (!negocio) {
      const slug = provisionalSlug(user);
      const name =
        String(user.user_metadata?.name || "").trim() ||
        String(user.email || "").split("@")[0] ||
        "Mi barbería";
      negocio = await insertNegocio({
        slug,
        name,
        owner_id: user.id,
        autoagenda: {},
        onboarding_completed: false,
      });
    }

    if (!negocio?.id) {
      return res.status(500).json({ error: "No se pudo crear la barbería" });
    }

    if (subscriptionActive(negocio)) {
      return res.status(200).json({
        ok: true,
        negocio,
        alreadyActive: true,
        status: negocio.subscription_status,
        periodEnd: negocio.current_period_end,
      });
    }

    const hadPaidPlan = !!negocio.last_payment_at;
    if (hadPaidPlan) {
      return res.status(409).json({
        ok: false,
        error: "Tu prueba ya terminó. Elige un plan para reactivar BarberCloud.",
      });
    }

    const now = new Date();
    const end = new Date(now.getTime() + TRIAL_DAYS * 86400000);

    negocio = await updateNegocio(negocio.id, {
      subscription_status: "trial",
      plan_id: normalizePlanId(negocio.plan_id || "pro"),
      current_period_start: now.toISOString(),
      current_period_end: end.toISOString(),
    });

    return res.status(200).json({
      ok: true,
      negocio,
      status: "trial",
      periodEnd: end.toISOString(),
      trialDays: TRIAL_DAYS,
    });
  } catch (err) {
    console.error("[trial/start]", err);
    return res.status(500).json({ error: "No se pudo iniciar la prueba", detail: err?.message });
  }
};
