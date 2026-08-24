const { rest, config, listNegocios } = require("../_lib/supabase");
const { requirePlatformAdmin } = require("../_lib/platform-admin");
const { findPlan, hasSubscriptionAccess, normalizeStatus } = require("../_lib/business-model");

async function fetchOwnerEmail(ownerId) {
  if (!ownerId) return null;
  try {
    const { url, serviceKey } = config();
    const res = await fetch(`${url}/auth/v1/admin/users/${ownerId}`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    });
    if (!res.ok) return null;
    const user = await res.json();
    return user?.email || null;
  } catch {
    return null;
  }
}

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
    let list = [];
    try {
      list = await listNegocios();
    } catch (err) {
      console.error("[admin/overview negocios]", err);
    }
    const counts = {
      total: list.length,
      active: 0,
      trial: 0,
      past_due: 0,
      canceled: 0,
      expired: 0,
      suspended: 0,
      pending_cancel: 0,
      with_access: 0,
    };

    let mrrCop = 0;

    list.forEach((n) => {
      const status = normalizeStatus(n.subscription_status);
      if (Object.prototype.hasOwnProperty.call(counts, status)) counts[status] += 1;
      else counts.expired += 1;

      if (n.cancel_at_period_end) counts.pending_cancel += 1;

      if (hasSubscriptionAccess(n.subscription_status, n.current_period_end)) {
        counts.with_access += 1;
        const plan = findPlan(n.plan_id);
        mrrCop += Number(plan?.price) || 0;
      }
    });

    let payments = [];
    try {
      const pagos = await rest("pagos", {
        query: {
          select: "id,status,amount_in_cents,currency,created_at",
          order: "created_at.desc",
          limit: 200,
        },
      });
      payments = Array.isArray(pagos) ? pagos : [];
    } catch (err) {
      console.error("[admin/overview pagos]", err);
    }
    const approved = payments.filter((p) => String(p.status).toUpperCase() === "APPROVED");
    const revenue30d = approved
      .filter((p) => {
        const t = new Date(p.created_at).getTime();
        return t >= Date.now() - 30 * 86400000;
      })
      .reduce((sum, p) => sum + Number(p.amount_in_cents || 0) / 100, 0);

    const recent = list.slice(0, 8);
    const ownerEmails = {};
    await Promise.all(
      [...new Set(recent.map((n) => n.owner_id).filter(Boolean))].map(async (id) => {
        ownerEmails[id] = await fetchOwnerEmail(id);
      })
    );

    return res.status(200).json({
      ok: true,
      counts,
      mrrCop,
      revenue30dCop: Math.round(revenue30d),
      paymentsTotal: payments.length,
      paymentsApproved: approved.length,
      recentNegocios: recent.map((n) => ({
        ...n,
        owner_email: ownerEmails[n.owner_id] || null,
        access_active: hasSubscriptionAccess(n.subscription_status, n.current_period_end),
      })),
    });
  } catch (err) {
    console.error("[admin/overview]", err);
    return res.status(500).json({ error: "No se pudo cargar el resumen", detail: err?.message });
  }
};
