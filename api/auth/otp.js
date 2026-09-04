const { sendOtpEmail, isConfigured } = require("../_lib/mail");
const { issueOtpToken, verifyOtpToken, sixDigitCode, isValidEmail } = require("../_lib/otp");

async function handleSend(req, res) {
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

  const code = /^\d{6}$/.test(providedCode) ? providedCode : sixDigitCode();

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
      productLabel: type === "verify" ? "Gestiónweb.app" : undefined,
    });
  } catch (sendErr) {
    console.error("[auth/otp send] mail", sendErr);
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
}

async function handleVerify(req, res) {
  const body = req.body || {};
  const email = String(body.email || "").trim();
  const code = String(body.code || "").replace(/\D/g, "");
  const otpToken = String(body.otpToken || "");
  const type = String(body.type || "verify").toLowerCase();

  const verified = verifyOtpToken(otpToken, { email, code, type });
  if (!verified.ok) {
    return res.status(400).json({ ok: false, message: verified.message });
  }
  return res.status(200).json({ ok: true, message: "Código verificado." });
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, message: "Método no permitido" });
  }

  const action = String(req.body?.action || "send").toLowerCase();

  try {
    if (action === "send" || action === "send-code") {
      return await handleSend(req, res);
    }
    if (action === "verify" || action === "verify-code") {
      return await handleVerify(req, res);
    }
    return res.status(400).json({ ok: false, message: "Acción no permitida." });
  } catch (err) {
    console.error("[auth/otp]", action, err);
    return res.status(500).json({
      ok: false,
      message: err?.message || "No se pudo procesar la solicitud.",
    });
  }
};
