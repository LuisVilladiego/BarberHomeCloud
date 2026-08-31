const { verifyOtpToken } = require("../_lib/otp");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, message: "Método no permitido" });
  }

  try {
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
  } catch (err) {
    return res.status(500).json({ ok: false, message: err?.message || "No se pudo verificar el código." });
  }
};
