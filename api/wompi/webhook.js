const { verifyEvent } = require("../_lib/wompi");
const { negocioById, pagoByReference, updateNegocio, updatePago } = require("../_lib/supabase");

/** Suma meses sin desbordar en meses cortos (31 ene → 28/29 feb). */
function addMonths(date, months) {
  const next = new Date(date.getTime());
  const day = next.getDate();
  next.setMonth(next.getMonth() + months);
  if (next.getDate() < day) next.setDate(0);
  return next;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Método no permitido" });
  }

  const secret = process.env.WOMPI_EVENTS_SECRET;
  if (!secret) {
    console.error("[wompi/webhook] falta WOMPI_EVENTS_SECRET");
    return res.status(500).json({ error: "Webhook no configurado" });
  }

  let event;
  try {
    event = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  } catch {
    return res.status(400).json({ error: "JSON inválido" });
  }

  if (!verifyEvent(event, req.headers["x-event-checksum"], secret)) {
    console.warn("[wompi/webhook] checksum inválido");
    return res.status(401).json({ error: "Firma inválida" });
  }

  const transaction = event?.data?.transaction;
  if (event.event !== "transaction.updated" || !transaction?.reference) {
    return res.status(200).json({ ok: true, ignored: true });
  }

  try {
    const pago = await pagoByReference(transaction.reference);
    if (!pago) {
      console.warn("[wompi/webhook] referencia desconocida", transaction.reference);
      return res.status(200).json({ ok: true, ignored: true });
    }

    // Reintentos de Wompi: si ya se aplicó el pago, no volver a extender el periodo.
    if (pago.status === "APPROVED") {
      return res.status(200).json({ ok: true, duplicate: true });
    }

    const status = String(transaction.status || "").toUpperCase();
    const paidEnough = Number(transaction.amount_in_cents) >= Number(pago.amount_in_cents);
    const sameCurrency =
      String(transaction.currency || "").toUpperCase() === String(pago.currency).toUpperCase();
    const approved = status === "APPROVED" && paidEnough && sameCurrency;

    // Mensual o anual se guardó en raw al crear el checkout. Hay que conservarlo:
    // PSE puede mandar varios transaction.updated y si el primero lo borrara, el
    // pago anual acabaría dando un solo mes.
    const billingPeriod = pago.raw?.billingPeriod === "annual" ? "annual" : "monthly";

    const patch = {
      status: approved ? "APPROVED" : status || "ERROR",
      wompi_transaction_id: transaction.id || null,
      payment_method: transaction.payment_method_type || "",
      raw: { ...transaction, billingPeriod },
    };

    if (!approved) {
      await updatePago(pago.reference, patch);
      if (status === "APPROVED") {
        console.warn("[wompi/webhook] monto o moneda no coinciden", pago.reference);
      }
      return res.status(200).json({ ok: true, approved: false, status });
    }

    const negocio = await negocioById(pago.negocio_id);
    const now = new Date();
    const previousEnd = negocio?.current_period_end ? new Date(negocio.current_period_end) : null;
    // Pagar antes de vencer no debe perder los días restantes.
    const start = previousEnd && previousEnd > now ? previousEnd : now;
    const end = addMonths(start, billingPeriod === "annual" ? 12 : 1);

    await updatePago(pago.reference, {
      ...patch,
      period_start: start.toISOString(),
      period_end: end.toISOString(),
    });

    await updateNegocio(pago.negocio_id, {
      subscription_status: "active",
      plan_id: pago.plan_id,
      current_period_start: start.toISOString(),
      current_period_end: end.toISOString(),
      last_payment_at: now.toISOString(),
      cancel_at_period_end: false,
    });

    return res.status(200).json({ ok: true, approved: true, periodEnd: end.toISOString() });
  } catch (err) {
    console.error("[wompi/webhook]", err);
    return res.status(500).json({ error: "Error procesando el evento" });
  }
};
