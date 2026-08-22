const { userFromToken } = require("./supabase");

function bearer(req) {
  const raw = req.headers.authorization || req.headers.Authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(String(raw));
  return match ? match[1].trim() : "";
}

const DEFAULT_PLATFORM_ADMIN_EMAILS = ["adminbarbercloud@gmail.com"];

function platformAdminEmails() {
  const fromEnv = String(process.env.PLATFORM_ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  if (fromEnv.length) return fromEnv;
  return DEFAULT_PLATFORM_ADMIN_EMAILS;
}

async function requirePlatformAdmin(req) {
  const emails = platformAdminEmails();
  const user = await userFromToken(bearer(req));
  if (!user?.id) {
    return { ok: false, status: 401, error: "Sesión no válida." };
  }

  const email = String(user.email || "").trim().toLowerCase();
  if (!emails.includes(email)) {
    return { ok: false, status: 403, error: "No tienes acceso al panel de plataforma." };
  }

  return { ok: true, user, email };
}

module.exports = {
  bearer,
  platformAdminEmails,
  requirePlatformAdmin,
};
