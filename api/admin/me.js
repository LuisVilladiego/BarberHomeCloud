const { requirePlatformAdmin } = require("../_lib/platform-admin");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Método no permitido" });
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: "Supabase no configurado en el servidor" });
  }

  const gate = await requirePlatformAdmin(req);
  if (!gate.ok) {
    return res.status(gate.status).json({ error: gate.error });
  }

  return res.status(200).json({
    ok: true,
    email: gate.email,
    userId: gate.user.id,
  });
};
