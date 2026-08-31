const { sendLookupCode, isConfigured } = require("../_lib/sms");
const {
  issuePhoneOtpToken,
  verifyPhoneOtpToken,
  sixDigitCode,
  toE164,
  isValidPhoneLocal,
} = require("../_lib/otp");
const { upcomingBookingsByPhone } = require("../_lib/bookings-lookup");
const { hasSubscriptionAccess, normalizeStatus } = require("../_lib/business-model");

function statusLabel(status) {
  const s = String(status || "").toLowerCase();
  if (s === "pending_confirmation" || s.includes("pending")) return "Pendiente de confirmación";
  if (s === "confirmed") return "Confirmada";
  if (s === "completed") return "Completada";
  if (s.includes("cancel")) return "Cancelada";
  return "Agendada";
}

async function handleSendCode(req, res) {
  const body = req.body || {};
  const slug = String(body.slug || "").trim().toLowerCase();
  const negocioId = String(body.negocioId || "").trim();
  const countryCode = String(body.countryCode || "+57").trim();
  const localPhone = String(body.phone || "").replace(/\D/g, "");

  if (!slug && !negocioId) {
    return res.status(400).json({ ok: false, message: "Falta el negocio." });
  }
  if (!isValidPhoneLocal(localPhone)) {
    return res.status(400).json({ ok: false, message: "Escribe un número de teléfono válido." });
  }

  const phoneE164 = toE164(countryCode, localPhone);
  const { negocio, bookings } = await upcomingBookingsByPhone({ slug, negocioId, phoneE164 });

  if (!negocio) {
    return res.status(404).json({ ok: false, message: "Negocio no encontrado." });
  }

  const active = hasSubscriptionAccess(
    normalizeStatus(negocio.subscription_status),
    negocio.current_period_end
  );
  if (!active) {
    return res.status(200).json({ ok: false, message: "Las reservas de este negocio están pausadas." });
  }

  if (!bookings.length) {
    return res.status(200).json({
      ok: false,
      hasBookings: false,
      message: "No encontramos reservas desde hoy con ese número.",
    });
  }

  const code = sixDigitCode();
  const otpToken = issuePhoneOtpToken({
    phone: phoneE164,
    code,
    slug: negocio.slug || slug,
    negocioId: negocio.id,
    type: "lookup",
  });

  const businessName = negocio.name || "BarberCloud";
  let delivery = { ok: false, demo: true };

  if (isConfigured()) {
    try {
      delivery = await sendLookupCode({ toE164: phoneE164, code, businessName });
    } catch (sendErr) {
      console.error("[booking/lookup send-code]", sendErr);
      delivery = {
        ok: false,
        demo: true,
        message: sendErr?.message || "No se pudo enviar el WhatsApp.",
      };
    }
  }

  if (!delivery.ok && !delivery.demo) {
    return res.status(500).json({ ok: false, message: delivery.message || "No se pudo enviar el WhatsApp." });
  }

  const useDemoFallback = !delivery.ok && delivery.demo;

  return res.status(200).json({
    ok: true,
    hasBookings: true,
    otpToken,
    demo: useDemoFallback || !!delivery.demo,
    code: useDemoFallback || delivery.demo ? code : undefined,
    message: useDemoFallback
      ? `No pudimos enviar el WhatsApp (${delivery.message || "error"}). Usa el código de respaldo en pantalla.`
      : delivery.demo
        ? "WhatsApp no configurado. Usa el código de respaldo en pantalla."
        : "Te enviamos un código por WhatsApp. Revísalo e ingrésalo abajo.",
  });
}

async function handleVerify(req, res) {
  const body = req.body || {};
  const slug = String(body.slug || "").trim().toLowerCase();
  const negocioId = String(body.negocioId || "").trim();
  const countryCode = String(body.countryCode || "+57").trim();
  const localPhone = String(body.phone || "").replace(/\D/g, "");
  const code = String(body.code || "").replace(/\D/g, "");
  const otpToken = String(body.otpToken || "");

  if (!otpToken || !code) {
    return res.status(400).json({ ok: false, message: "Faltan datos de verificación." });
  }
  if (!isValidPhoneLocal(localPhone)) {
    return res.status(400).json({ ok: false, message: "Número inválido." });
  }

  const phoneE164 = toE164(countryCode, localPhone);
  const verified = verifyPhoneOtpToken(otpToken, {
    phone: phoneE164,
    code,
    slug,
    negocioId,
    type: "lookup",
  });

  if (!verified.ok) {
    return res.status(400).json({ ok: false, message: verified.message });
  }

  const { bookings } = await upcomingBookingsByPhone({
    slug: verified.slug || slug,
    negocioId: verified.negocioId || negocioId,
    phoneE164,
  });

  return res.status(200).json({
    ok: true,
    bookings: bookings.map((b) => ({
      ...b,
      statusLabel: statusLabel(b.status),
    })),
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, message: "Método no permitido" });
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(503).json({ ok: false, message: "Consulta no disponible temporalmente." });
  }

  const action = String(req.body?.action || "send-code").toLowerCase();

  try {
    if (action === "send-code" || action === "send") {
      return await handleSendCode(req, res);
    }
    if (action === "verify") {
      return await handleVerify(req, res);
    }
    return res.status(400).json({ ok: false, message: "Acción no permitida." });
  } catch (err) {
    console.error("[booking/lookup]", action, err);
    return res.status(500).json({
      ok: false,
      message: err?.message || "No se pudo completar la consulta.",
    });
  }
};
