const { config } = require("../_lib/supabase");
const { verifyOtpToken } = require("../_lib/otp");

async function adminUserByEmail(email) {
  const { url, serviceKey } = config();
  const needle = String(email || "").trim().toLowerCase();
  if (!needle) return null;

  const byParam = await fetch(`${url}/auth/v1/admin/users?email=${encodeURIComponent(needle)}`, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
  });
  const paramData = await byParam.json().catch(() => null);
  if (byParam.ok) {
    const users = paramData?.users || (Array.isArray(paramData) ? paramData : []);
    const hit = users.find((u) => String(u.email || "").toLowerCase() === needle);
    if (hit) return hit;
  }

  for (let page = 1; page <= 5; page += 1) {
    const res = await fetch(`${url}/auth/v1/admin/users?page=${page}&per_page=200`, {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(data?.message || data?.error || `Auth admin ${res.status}`);
    }
    const users = data?.users || [];
    const hit = users.find((u) => String(u.email || "").toLowerCase() === needle);
    if (hit) return hit;
    if (users.length < 200) break;
  }
  return null;
}

async function adminUpdatePassword(userId, password) {
  const { url, serviceKey } = config();
  const res = await fetch(`${url}/auth/v1/admin/users/${userId}`, {
    method: "PUT",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ password }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.message || data?.error || `No se pudo actualizar la contraseña (${res.status})`);
  }
  return data;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, message: "Método no permitido" });
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ ok: false, message: "Supabase no configurado en el servidor." });
  }

  try {
    const body = req.body || {};
    const email = String(body.email || "").trim();
    const code = String(body.code || "").replace(/\D/g, "");
    const password = String(body.password || "");
    const otpToken = String(body.otpToken || "");

    if (!email || !code || !otpToken) {
      return res.status(400).json({ ok: false, message: "Faltan datos para restablecer la contraseña." });
    }
    if (password.length < 6) {
      return res.status(400).json({ ok: false, message: "La contraseña debe tener al menos 6 caracteres." });
    }

    const verified = verifyOtpToken(otpToken, { email, code, type: "recover" });
    if (!verified.ok) {
      return res.status(400).json({ ok: false, message: verified.message });
    }

    const user = await adminUserByEmail(verified.email);
    if (!user?.id) {
      return res.status(404).json({
        ok: false,
        message: "No encontramos una cuenta con ese correo. Revisa el email o crea una cuenta nueva.",
      });
    }

    await adminUpdatePassword(user.id, password);
    return res.status(200).json({ ok: true, message: "Contraseña actualizada." });
  } catch (err) {
    console.error("[reset-password]", err);
    return res.status(500).json({
      ok: false,
      message: err?.message || "No se pudo restablecer la contraseña.",
    });
  }
};
