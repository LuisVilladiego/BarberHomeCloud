const { verifyPhoneOtpToken, toE164, isValidPhoneLocal } = require("../_lib/otp");
const { upcomingBookingsByPhone } = require("../_lib/bookings-lookup");

function statusLabel(status) {
  const s = String(status || "").toLowerCase();
  if (s === "pending_confirmation" || s.includes("pending")) return "Pendiente de confirmación";
  if (s === "confirmed") return "Confirmada";
  if (s === "completed") return "Completada";
  if (s.includes("cancel")) return "Cancelada";
  return "Agendada";
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, message: "Método no permitido" });
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(503).json({ ok: false, message: "Consulta no disponible temporalmente." });
  }

  try {
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
  } catch (err) {
    console.error("[lookup-verify]", err);
    return res.status(500).json({
      ok: false,
      message: err?.message || "No se pudo verificar el código.",
    });
  }
};
