const { sendBookingAlert, sendRedeemAlert, isConfigured } = require("../_lib/mail");
const { ownerEmailForNegocio } = require("../_lib/supabase");
const {
  persistCalendarConfigs,
  sendWhatsAppMessage,
  processAllScheduledMessages,
  resolveNegocio,
  bookingFromRow,
} = require("../_lib/whatsapp-messages");
const { isConfigured: whatsappConfigured } = require("../_lib/sms");

function bearer(req) {
  const raw = req.headers.authorization || req.headers.Authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(String(raw));
  return match ? match[1].trim() : "";
}

function isCron(req) {
  if (String(req.headers["x-vercel-cron"] || "") === "1") return true;
  const secret = String(process.env.CRON_SECRET || "").trim();
  if (!secret) return false;
  return bearer(req) === secret;
}

async function handleWhatsAppSync(body) {
  const negocioId = String(body.negocioId || "").trim();
  const calendarMessages = body.calendarMessages;
  if (!negocioId || !calendarMessages) {
    return { status: 400, payload: { ok: false, message: "Faltan datos de configuración." } };
  }
  await persistCalendarConfigs(negocioId, calendarMessages);
  return { status: 200, payload: { ok: true, message: "Configuración sincronizada." } };
}

async function handleWhatsAppSend(body) {
  const slug = body.slug || body.booking?.slug || "";
  const negocioId = body.negocioId || body.booking?.negocioId || "";
  const negocio = await resolveNegocio({ slug, negocioId });
  if (!negocio) {
    return { status: 404, payload: { ok: false, message: "Negocio no encontrado." } };
  }

  const type = String(body.messageType || body.type || "test").toLowerCase();
  const booking = body.booking ? bookingFromRow(body.booking) : null;
  const testPhone = String(body.testPhone || body.phone || "").replace(/\D/g, "");
  const testCountryCode = String(body.testCountryCode || body.countryCode || "+57").trim();

  const result = await sendWhatsAppMessage({
    negocio,
    booking,
    type,
    testPhone: testPhone || undefined,
    testCountryCode,
    respectDelay: !!body.respectDelay,
  });
  return { status: result.ok ? 200 : 502, payload: result };
}

async function handleWhatsAppCron() {
  if (!whatsappConfigured()) {
    return { status: 503, payload: { ok: false, message: "WhatsApp no configurado." } };
  }
  const out = await processAllScheduledMessages();
  return { status: 200, payload: out };
}

async function handleEmailNotify(body) {
  const kind = String(body.kind || "booking").toLowerCase();
  const slug = body.slug || body.booking?.slug || "";
  const negocioId = body.negocioId || body.booking?.negocioId || body.redeem?.negocioId || "";
  const booking = body.booking || null;
  const redeem = body.redeem || null;

  const { email, negocio } = await ownerEmailForNegocio({ slug, negocioId });
  if (!negocio) {
    return {
      status: 404,
      payload: { ok: false, fallback: true, message: "Negocio no encontrado." },
    };
  }

  if (!email) {
    return {
      status: 200,
      payload: {
        ok: false,
        fallback: true,
        message: "No hay correo del dueño de la membresía para este negocio.",
      },
    };
  }

  if (!isConfigured()) {
    return {
      status: 200,
      payload: { ok: false, fallback: true, to: email, message: "Correo no configurado en el servidor." },
    };
  }

  if (kind === "redeem") {
    if (!redeem) {
      return { status: 400, payload: { ok: false, message: "Faltan datos del canje." } };
    }
    const result = await sendRedeemAlert({ toEmail: email, redeem });
    return { status: 200, payload: { ...result, to: email } };
  }

  if (!booking) {
    return { status: 400, payload: { ok: false, message: "Faltan datos de la reserva." } };
  }

  const result = await sendBookingAlert({
    toEmail: email,
    booking,
    businessName: booking.business || negocio.name || "BarberCloud",
  });
  return { status: 200, payload: { ...result, to: email } };
}

module.exports = async function handler(req, res) {
  const kind = String(req.query?.kind || req.body?.kind || "booking").toLowerCase();
  const allowGetCron = kind === "whatsapp-cron" && req.method === "GET" && isCron(req);

  if (req.method !== "POST" && !allowGetCron) {
    res.setHeader("Allow", "POST, GET");
    return res.status(405).json({ ok: false, message: "Método no permitido" });
  }

  try {
    const body = req.body || {};

    if (kind === "whatsapp-sync") {
      const out = await handleWhatsAppSync(body);
      return res.status(out.status).json(out.payload);
    }

    if (kind === "whatsapp-send") {
      const out = await handleWhatsAppSend(body);
      return res.status(out.status).json(out.payload);
    }

    if (kind === "whatsapp-cron") {
      if (!isCron(req)) {
        return res.status(401).json({ ok: false, message: "No autorizado." });
      }
      const out = await handleWhatsAppCron();
      return res.status(out.status).json(out.payload);
    }

    const out = await handleEmailNotify(body);
    return res.status(out.status).json(out.payload);
  } catch (err) {
    console.error("[booking/notify]", kind, err);
    return res.status(500).json({
      ok: false,
      message: err?.message || "No se pudo completar la solicitud.",
    });
  }
};
