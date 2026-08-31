const { sendBookingAlert, sendRedeemAlert, isConfigured } = require("../_lib/mail");
const { ownerEmailForNegocio } = require("../_lib/supabase");
const { hasSubscriptionAccess, normalizeStatus } = require("../_lib/business-model");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, message: "Método no permitido" });
  }

  try {
    const body = req.body || {};
    const kind = String(body.kind || "booking").toLowerCase();
    const slug = body.slug || body.booking?.slug || "";
    const negocioId = body.negocioId || body.booking?.negocioId || body.redeem?.negocioId || "";
    const booking = body.booking || null;
    const redeem = body.redeem || null;

    const { email, negocio } = await ownerEmailForNegocio({ slug, negocioId });
    if (!negocio) {
      return res.status(404).json({ ok: false, message: "Negocio no encontrado." });
    }

    const active = hasSubscriptionAccess(
      normalizeStatus(negocio.subscription_status),
      negocio.current_period_end
    );
    if (!active) {
      return res.status(200).json({ ok: false, skipped: true, message: "Membresía inactiva." });
    }

    if (!email) {
      return res.status(200).json({
        ok: false,
        message: "No hay correo del dueño de la membresía para este negocio.",
      });
    }

    if (!isConfigured()) {
      return res.status(503).json({ ok: false, message: "Correo no configurado en el servidor." });
    }

    if (kind === "redeem") {
      if (!redeem) {
        return res.status(400).json({ ok: false, message: "Faltan datos del canje." });
      }
      const result = await sendRedeemAlert({ toEmail: email, redeem });
      return res.status(200).json({ ...result, to: email });
    }

    if (!booking) {
      return res.status(400).json({ ok: false, message: "Faltan datos de la reserva." });
    }

    const result = await sendBookingAlert({
      toEmail: email,
      booking,
      businessName: booking.business || negocio.name || "BarberCloud",
    });
    return res.status(200).json({ ...result, to: email });
  } catch (err) {
    console.error("[booking/notify]", err);
    return res.status(500).json({
      ok: false,
      message: err?.message || "No se pudo enviar el aviso.",
    });
  }
};
