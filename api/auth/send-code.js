const { sendOtpEmail, isConfigured } = require("../_lib/mail");
const { issueOtpToken, sixDigitCode, isValidEmail } = require("../_lib/otp");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, message: "Método no permitido" });
  }

  try {
    const body = req.body || {};
    const email = String(body.email || "").trim();
    const name = String(body.name || "cliente").trim();
    const type = String(body.type || "verify").toLowerCase();
    const providedCode = String(body.code || "").replace(/\D/g, "");

    if (!isValidEmail(email)) {
      return res.status(400).json({ ok: false, message: "Correo inválido." });
    }
    if (type !== "verify" && type !== "recover") {
      return res.status(400).json({ ok: false, message: "Tipo de código no permitido." });
    }

    const code =
      /^\d{6}$/.test(providedCode) ? providedCode : sixDigitCode();

    if (!isConfigured()) {
      const otpToken = issueOtpToken({ email, code, type });
      return res.status(200).json({
        ok: false,
        demo: true,
        otpToken,
        message: "Correo no configurado en el servidor. Usa el código de respaldo.",
        code,
      });
    }

    try {
      await sendOtpEmail({
        toEmail: email,
        toName: name,
        code,
        type,
        productLabel: type === "verify" ? "BarberCloud" : undefined,
      });
    } catch (sendErr) {
      console.error("[send-code] mail", sendErr);
      const otpToken = issueOtpToken({ email, code, type });
      return res.status(200).json({
        ok: false,
        demo: true,
        otpToken,
        code,
        message: sendErr?.message || "No se pudo enviar el correo. Usa el código de respaldo.",
      });
    }

    const otpToken = issueOtpToken({ email, code, type });
    return res.status(200).json({
      ok: true,
      demo: false,
      otpToken,
      message: "Código enviado al correo.",
    });
  } catch (err) {
    console.error("[send-code]", err);
    return res.status(500).json({
      ok: false,
      demo: true,
      message: err?.message || "No se pudo enviar el correo.",
    });
  }
};
