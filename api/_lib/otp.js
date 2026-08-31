const crypto = require("crypto");

const DEFAULT_TTL_MS = 10 * 60 * 1000;

function otpSecret() {
  return (
    process.env.OTP_SECRET ||
    process.env.APPS_SCRIPT_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    ""
  );
}

function sign(body) {
  return crypto.createHmac("sha256", otpSecret()).update(body).digest("base64url");
}

function issueOtpToken({ email, code, type = "verify", ttlMs = DEFAULT_TTL_MS }) {
  if (!otpSecret()) throw new Error("OTP_SECRET no configurado");
  const payload = {
    email: String(email || "").trim().toLowerCase(),
    code: String(code || "").trim(),
    type: String(type || "verify").toLowerCase(),
    exp: Date.now() + ttlMs,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

function verifyOtpToken(token, { email, code, type }) {
  if (!token || !otpSecret()) return { ok: false, message: "Token inválido" };
  const parts = String(token).split(".");
  if (parts.length !== 2) return { ok: false, message: "Token inválido" };
  const [body, sig] = parts;
  if (!body || sign(body) !== sig) return { ok: false, message: "Token inválido" };

  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return { ok: false, message: "Token inválido" };
  }

  if (!payload?.email || !payload?.code) {
    return { ok: false, message: "Token inválido" };
  }
  if (Date.now() > Number(payload.exp || 0)) {
    return { ok: false, message: "El código venció. Solicita uno nuevo." };
  }
  const expectedEmail = String(email || "").trim().toLowerCase();
  if (payload.email !== expectedEmail) {
    return { ok: false, message: "El correo no coincide con la solicitud." };
  }
  if (String(type || "verify").toLowerCase() !== String(payload.type || "").toLowerCase()) {
    return { ok: false, message: "Tipo de código inválido." };
  }
  const entered = String(code || "").replace(/\D/g, "");
  const expected = String(payload.code || "").replace(/\D/g, "");
  if (entered !== expected) {
    return { ok: false, message: "Ese código no coincide. Revisa el correo." };
  }
  return { ok: true, email: payload.email };
}

function sixDigitCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function isValidEmail(value) {
  const email = String(value || "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

function issuePhoneOtpToken({ phone, code, slug, negocioId, type = "lookup", ttlMs = DEFAULT_TTL_MS }) {
  if (!otpSecret()) throw new Error("OTP_SECRET no configurado");
  const payload = {
    phone: normalizePhoneKey(phone),
    code: String(code || "").trim(),
    slug: String(slug || "").trim().toLowerCase(),
    negocioId: String(negocioId || "").trim(),
    type: String(type || "lookup").toLowerCase(),
    exp: Date.now() + ttlMs,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

function verifyPhoneOtpToken(token, { phone, code, slug, negocioId, type }) {
  if (!token || !otpSecret()) return { ok: false, message: "Token inválido" };
  const parts = String(token).split(".");
  if (parts.length !== 2) return { ok: false, message: "Token inválido" };
  const [body, sig] = parts;
  if (!body || sign(body) !== sig) return { ok: false, message: "Token inválido" };

  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return { ok: false, message: "Token inválido" };
  }

  if (!payload?.phone || !payload?.code) {
    return { ok: false, message: "Token inválido" };
  }
  if (Date.now() > Number(payload.exp || 0)) {
    return { ok: false, message: "El código venció. Solicita uno nuevo." };
  }
  if (normalizePhoneKey(phone) !== normalizePhoneKey(payload.phone)) {
    return { ok: false, message: "El número no coincide con la solicitud." };
  }
  if (String(slug || "").trim().toLowerCase() !== String(payload.slug || "").toLowerCase()) {
    return { ok: false, message: "Enlace de negocio inválido." };
  }
  if (negocioId && payload.negocioId && String(negocioId) !== String(payload.negocioId)) {
    return { ok: false, message: "Negocio inválido." };
  }
  if (String(type || "lookup").toLowerCase() !== String(payload.type || "").toLowerCase()) {
    return { ok: false, message: "Tipo de código inválido." };
  }
  const entered = String(code || "").replace(/\D/g, "");
  const expected = String(payload.code || "").replace(/\D/g, "");
  if (entered !== expected) {
    return { ok: false, message: "Ese código no coincide. Revisa WhatsApp." };
  }
  return { ok: true, phone: payload.phone, slug: payload.slug, negocioId: payload.negocioId };
}

function normalizePhoneKey(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length >= 10) return digits.slice(-10);
  return digits;
}

function toE164(countryCode, localPhone) {
  const cc = String(countryCode || "+57").replace(/\D/g, "");
  let local = String(localPhone || "").replace(/\D/g, "");
  if (local.startsWith(cc)) return `+${local}`;
  if (local.startsWith("0")) local = local.replace(/^0+/, "");
  return `+${cc}${local}`;
}

function isValidPhoneLocal(local) {
  const digits = String(local || "").replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
}

module.exports = {
  issueOtpToken,
  verifyOtpToken,
  issuePhoneOtpToken,
  verifyPhoneOtpToken,
  normalizePhoneKey,
  toE164,
  sixDigitCode,
  isValidEmail,
  isValidPhoneLocal,
};
