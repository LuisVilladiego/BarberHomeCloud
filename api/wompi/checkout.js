const { amountInCents, findPlan } = require("../_lib/plans");
const { buildCheckoutUrl, integritySignature, newReference } = require("../_lib/wompi");
const { insertPago, negocioOfOwner, userFromToken } = require("../_lib/supabase");

function bearer(req) {
  const raw = req.headers.authorization || req.headers.Authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(String(raw));
  return match ? match[1].trim() : "";
}

function baseUrl(req) {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/+$/, "");
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const proto = req.headers["x-forwarded-proto"] || "https";
  return `${proto}://${host}`;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Método no permitido" });
  }

  const publicKey = process.env.WOMPI_PUBLIC_KEY;
  const integritySecret = process.env.WOMPI_INTEGRITY_SECRET;
  if (!publicKey || !integritySecret) {
    return res.status(500).json({ error: "Wompi no está configurado en el servidor" });
  }

  try {
    const user = await userFromToken(bearer(req));
    if (!user) return res.status(401).json({ error: "Sesión no válida" });

    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const plan = findPlan(body.planId);
    if (!plan) return res.status(400).json({ error: "Plan no válido" });

    const negocio = await negocioOfOwner(user.id);
    if (!negocio) return res.status(409).json({ error: "Todavía no tienes una barbería creada" });

    const currency = "COP";
    const cents = amountInCents(plan);
    const reference = newReference(negocio.id, plan.id);

    await insertPago({
      negocio_id: negocio.id,
      reference,
      plan_id: plan.id,
      amount_in_cents: cents,
      currency,
      status: "PENDING",
    });

    const signature = integritySignature({
      reference,
      amountInCents: cents,
      currency,
      secret: integritySecret,
    });

    const checkoutUrl = buildCheckoutUrl({
      "public-key": publicKey,
      currency,
      "amount-in-cents": cents,
      reference,
      "signature:integrity": signature,
      "redirect-url": `${baseUrl(req)}/suscripcion.html?ref=${encodeURIComponent(reference)}`,
      "customer-data:email": user.email || "",
      "customer-data:full-name": negocio.name || "",
    });

    return res.status(200).json({
      checkoutUrl,
      reference,
      amountInCents: cents,
      currency,
      planId: plan.id,
    });
  } catch (err) {
    console.error("[wompi/checkout]", err);
    return res.status(500).json({ error: "No se pudo iniciar el pago" });
  }
};
