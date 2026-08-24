const { rest } = require("../_lib/supabase");
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

  try {
    const limit = Math.min(100, Math.max(1, Number(req.query?.limit) || 50));
    let rows = [];
    try {
      rows = await rest("pagos", {
        query: {
          select:
            "id,negocio_id,reference,plan_id,amount_in_cents,currency,status,payment_method,period_start,period_end,wompi_transaction_id,created_at",
          order: "created_at.desc",
          limit,
        },
      });
    } catch (err) {
      console.error("[admin/pagos list]", err);
      return res.status(200).json({ ok: true, pagos: [], warning: err?.message || "Sin acceso a pagos" });
    }

    const pagos = Array.isArray(rows) ? rows : [];
    const negocioIds = [...new Set(pagos.map((p) => p.negocio_id).filter(Boolean))];
    const negocios = negocioIds.length
      ? await rest("negocios", {
          query: {
            select: "id,name,slug",
            id: `in.(${negocioIds.join(",")})`,
          },
        })
      : [];

    const negocioMap = {};
    (Array.isArray(negocios) ? negocios : []).forEach((n) => {
      negocioMap[n.id] = n;
    });

    return res.status(200).json({
      ok: true,
      pagos: pagos.map((p) => ({
        ...p,
        negocio_name: negocioMap[p.negocio_id]?.name || "—",
        negocio_slug: negocioMap[p.negocio_id]?.slug || "",
        amount_cop: Math.round(Number(p.amount_in_cents || 0) / 100),
      })),
    });
  } catch (err) {
    console.error("[admin/pagos]", err);
    return res.status(500).json({ error: "No se pudo cargar pagos", detail: err?.message });
  }
};
