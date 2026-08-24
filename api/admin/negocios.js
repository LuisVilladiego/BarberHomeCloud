const { config, negocioById, rest, updateNegocio } = require("../_lib/supabase");
const { requirePlatformAdmin } = require("../_lib/platform-admin");
const {
  SUBSCRIPTION_STATUS,
  findPlan,
  hasSubscriptionAccess,
  normalizePlanId,
  normalizeStatus,
} = require("../_lib/business-model");

const ALLOWED_STATUSES = new Set(Object.values(SUBSCRIPTION_STATUS));

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

function parseIso(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

module.exports = async function handler(req, res) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: "Supabase no configurado en el servidor" });
  }

  const gate = await requirePlatformAdmin(req);
  if (!gate.ok) {
    return res.status(gate.status).json({ error: gate.error });
  }

  if (req.method === "GET") {
    try {
      const q = String(req.query?.q || "").trim().toLowerCase();
      const statusFilter = String(req.query?.status || "").trim().toLowerCase();
      const planFilter = String(req.query?.plan || "").trim().toLowerCase();

      const rows = await rest("negocios", {
        query: {
          select:
            "id,slug,name,plan_id,subscription_status,cancel_at_period_end,current_period_start,current_period_end,last_payment_at,owner_id,onboarding_completed,created_at,updated_at",
          order: "updated_at.desc",
        },
      });

      let list = Array.isArray(rows) ? rows : [];

      if (q) {
        list = list.filter(
          (n) =>
            String(n.name || "").toLowerCase().includes(q) ||
            String(n.slug || "").toLowerCase().includes(q) ||
            String(n.id || "").toLowerCase().includes(q)
        );
      }
      if (statusFilter) {
        list = list.filter((n) => normalizeStatus(n.subscription_status) === statusFilter);
      }
      if (planFilter) {
        list = list.filter((n) => normalizePlanId(n.plan_id) === normalizePlanId(planFilter));
      }

      const ownerIds = [...new Set(list.map((n) => n.owner_id).filter(Boolean))];
      const ownerEmails = {};
      await Promise.all(
        ownerIds.slice(0, 50).map(async (id) => {
          ownerEmails[id] = await fetchOwnerEmail(id);
        })
      );

      return res.status(200).json({
        ok: true,
        negocios: list.map((n) => ({
          ...n,
          plan_id: normalizePlanId(n.plan_id),
          subscription_status: normalizeStatus(n.subscription_status),
          owner_email: ownerEmails[n.owner_id] || null,
          access_active: hasSubscriptionAccess(n.subscription_status, n.current_period_end),
          plan_label: findPlan(n.plan_id)?.label || n.plan_id,
        })),
      });
    } catch (err) {
      console.error("[admin/negocios GET]", err);
      return res.status(500).json({ error: "No se pudo listar negocios", detail: err?.message });
    }
  }

  if (req.method === "PATCH") {
    try {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
      const id = String(body.id || "").trim();
      if (!id) return res.status(400).json({ error: "Falta id del negocio." });

      const current = await negocioById(id);
      if (!current) return res.status(404).json({ error: "Negocio no encontrado." });

      const patch = {};

      if (body.plan_id != null) patch.plan_id = normalizePlanId(body.plan_id);
      if (body.subscription_status != null) {
        const status = normalizeStatus(body.subscription_status);
        if (!ALLOWED_STATUSES.has(status)) {
          return res.status(400).json({ error: "Estado de suscripción inválido." });
        }
        patch.subscription_status = status;
      }
      if (body.cancel_at_period_end != null) {
        patch.cancel_at_period_end = !!body.cancel_at_period_end;
      }
      if (body.current_period_start !== undefined) {
        patch.current_period_start = parseIso(body.current_period_start);
      }
      if (body.current_period_end !== undefined) {
        patch.current_period_end = parseIso(body.current_period_end);
      }
      if (body.last_payment_at !== undefined) {
        patch.last_payment_at = parseIso(body.last_payment_at);
      }

      if (!Object.keys(patch).length) {
        return res.status(400).json({ error: "No hay cambios para guardar." });
      }

      const updated = await updateNegocio(id, patch);
      const ownerEmail = await fetchOwnerEmail(updated?.owner_id);

      return res.status(200).json({
        ok: true,
        negocio: {
          ...updated,
          owner_email: ownerEmail,
          access_active: hasSubscriptionAccess(
            updated.subscription_status,
            updated.current_period_end
          ),
          plan_label: findPlan(updated.plan_id)?.label || updated.plan_id,
        },
      });
    } catch (err) {
      console.error("[admin/negocios PATCH]", err);
      return res.status(500).json({ error: "No se pudo actualizar el negocio", detail: err?.message });
    }
  }

  res.setHeader("Allow", "GET, PATCH");
  return res.status(405).json({ error: "Método no permitido" });
};
