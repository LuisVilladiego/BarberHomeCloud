/**
 * Envío de correo vía Google Apps Script (desde el servidor, no el navegador).
 */

function mailConfig() {
  const url = String(process.env.APPS_SCRIPT_URL || "").trim();
  const secret = String(process.env.APPS_SCRIPT_SECRET || "").trim();
  if (!url || !secret) return null;
  if (!/^https:\/\/script\.google\.com\//i.test(url)) return null;
  return { url, secret };
}

function isMailSent(data) {
  if (!data || data.ok !== true) return false;
  const message = String(data.message || "");
  return /enviad/i.test(message) || /sent/i.test(message);
}

async function readJsonSafe(res) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    if (/acceso denegado|access denied|sign in/i.test(text)) {
      return {
        ok: false,
        message:
          "Apps Script bloqueado (403). Vuelve a implementar la app web con acceso «Cualquier persona».",
      };
    }
    return null;
  }
}

async function postAppsScript(payload) {
  const cfg = mailConfig();
  if (!cfg) {
    throw new Error("Correo no configurado en el servidor (APPS_SCRIPT_URL / APPS_SCRIPT_SECRET).");
  }

  const bodyObj = {
    ...payload,
    secret: cfg.secret,
    from_name: payload.from_name || "BarberCloud",
  };
  const type = String(bodyObj.type || "verify").toLowerCase();

  const res = await fetch(cfg.url, {
    method: "POST",
    redirect: "follow",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(bodyObj),
  });
  const data = await readJsonSafe(res);

  if (isMailSent(data)) return data;

  if (res.status === 401 || res.status === 403) {
    throw new Error(
      data?.message || "Apps Script sin permiso. Implementa de nuevo con acceso «Cualquier persona»."
    );
  }
  if (data && data.ok === false) {
    throw new Error(data.message || "No se pudo enviar el correo");
  }
  throw new Error(data?.message || "No se pudo enviar el correo. Revisa spam o inténtalo de nuevo.");
}

async function sendOtpEmail({ toEmail, toName, code, type = "verify", productLabel }) {
  const payload = {
    type,
    to_email: String(toEmail || "").trim(),
    to_name: String(toName || "cliente").trim(),
    code: String(code || "").trim(),
  };
  if (type === "verify" && productLabel) {
    payload.product_label = productLabel;
  }
  await postAppsScript(payload);
  return { ok: true, message: "Código enviado al correo." };
}

function bookingPayload(booking, businessName) {
  return {
    id: booking?.id || "",
    name: booking?.name || "Cliente",
    phone: booking?.phone || "",
    serviceName: booking?.serviceName || "Cita",
    date: booking?.date || "",
    time: booking?.time || "",
    duration: booking?.duration || 60,
    price: booking?.price ?? 0,
    notes: booking?.notes || "",
    status: booking?.status || "pending_confirmation",
    source: booking?.source || "public",
    business: booking?.business || businessName || "BarberCloud",
    clientFingerprint: booking?.clientFingerprint || "",
  };
}

async function sendBookingAlert({ toEmail, booking, businessName }) {
  const payloadBooking = bookingPayload(booking, businessName);
  await postAppsScript({
    type: "booking",
    to_email: String(toEmail || "").trim(),
    admin_email: String(toEmail || "").trim(),
    client_name: payloadBooking.name,
    client_phone: payloadBooking.phone,
    client_fingerprint: payloadBooking.clientFingerprint,
    service: payloadBooking.serviceName,
    date: payloadBooking.date,
    time: payloadBooking.time,
    duration: payloadBooking.duration,
    price: payloadBooking.price,
    notes: payloadBooking.notes,
    booking: payloadBooking,
  });
  return { ok: true, message: "Aviso de reserva enviado" };
}

async function sendRedeemAlert({ toEmail, redeem }) {
  const customer = redeem?.customer || {};
  const payload = {
    id: redeem?.id || "",
    productName: redeem?.productName || "Producto",
    pointsCost: redeem?.pointsCost ?? 0,
    valueCop: redeem?.valueCop ?? 0,
    createdAt: redeem?.createdAt || new Date().toISOString(),
    customer: {
      name: customer.name || "Cliente",
      phone: customer.phone || "",
      email: customer.email || "",
      docType: customer.docType || "CC",
      docNumber: customer.docNumber || "",
    },
  };
  await postAppsScript({
    type: "redeem",
    to_email: String(toEmail || "").trim(),
    admin_email: String(toEmail || "").trim(),
    product_name: payload.productName,
    points_cost: payload.pointsCost,
    value_cop: payload.valueCop,
    client_name: payload.customer.name,
    client_phone: payload.customer.phone,
    client_email: payload.customer.email,
    client_doc: `${payload.customer.docType} ${payload.customer.docNumber}`.trim(),
    redeem: payload,
  });
  return { ok: true, message: "Aviso de canje enviado" };
}

async function sendTrialEmail({ toEmail, toName, daysLeft, periodEnd, copy }) {
  const name = String(toName || "barbero").trim();
  const days = Number(daysLeft) || 0;
  const payload = {
    to_email: String(toEmail || "").trim(),
    to_name: name,
    subject: copy?.subject || "Tu prueba de BarberCloud",
    headline: copy?.headline || "",
    message: copy?.body || "",
    html:
      copy?.html ||
      `<p>Hola ${name},</p><p>${copy?.body || ""}</p><p><a href="${copy?.href || ""}">${copy?.cta || "Abrir BarberCloud"}</a></p>`,
    text: copy?.body || "",
    days_left: days,
    period_end: periodEnd || "",
    cta_label: copy?.cta || "Abrir BarberCloud",
    cta_url: copy?.href || "",
  };
  try {
    await postAppsScript({ type: "trial", ...payload });
  } catch {
    await postAppsScript({ type: "notify", ...payload });
  }
  return { ok: true, message: "Aviso de prueba enviado" };
}

module.exports = {
  isConfigured: () => !!mailConfig(),
  sendOtpEmail,
  sendBookingAlert,
  sendRedeemAlert,
  sendTrialEmail,
};
