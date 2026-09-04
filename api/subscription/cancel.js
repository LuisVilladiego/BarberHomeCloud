const { negocioOfOwner, updateNegocio, userFromToken } = require("../_lib/supabase");
const {
  SUBSCRIPTION_STATUS,
  hasSubscriptionAccess,
  normalizeStatus,
} = require("../_lib/business-model");

function bearer(req) {
  const raw = req.headers.authorization || req.headers.Authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(String(raw));
  return match ? match[1].trim() : "";
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

    const negocio = await negocioOfOwner(user.id);
    if (!negocio?.id) {
      return res.status(404).json({ error: "No encontramos tu negocio." });
    }

    if (negocio.owner_id !== user.id) {
      return res.status(403).json({ error: "Solo el dueño puede cancelar la suscripción." });
    }

    if (!hasSubscriptionAccess(negocio.subscription_status, negocio.current_period_end)) {
      return res.status(409).json({
        ok: false,
        error: "Tu suscripción no está activa, así que no hay nada que cancelar.",
      });
    }

    const alreadyCanceled =
      !!negocio.cancel_at_period_end ||
      normalizeStatus(negocio.subscription_status) === SUBSCRIPTION_STATUS.CANCELED;

    if (alreadyCanceled) {
      return res.status(200).json({
        ok: true,
        alreadyCanceled: true,
        negocio,
        periodEnd: negocio.current_period_end,
      });
    }

    const updated = await updateNegocio(negocio.id, {
      subscription_status: SUBSCRIPTION_STATUS.CANCELED,
      cancel_at_period_end: true,
    });

    return res.status(200).json({
      ok: true,
      negocio: updated,
      periodEnd: updated?.current_period_end || negocio.current_period_end,
    });
  } catch (err) {
    console.error("[subscription/cancel]", err);
    return res.status(500).json({ error: "No se pudo cancelar la suscripción", detail: err?.message });
  }
};
