/**
 * CORREO BarberHome (OTP + aviso de reservas)
 * -----------------------------------------
 * 1) Ve a https://script.google.com → abre tu proyecto (o crea uno nuevo)
 * 2) Reemplaza TODO el código por este archivo y Guarda
 * 3) Implementar → Administrar implementaciones → lápiz → Nueva versión → Implementar
 *    (o Nueva implementación → App web)
 *      - Ejecutar como: Yo
 *      - Quién tiene acceso: Cualquier persona
 * 4) Copia la URL /exec en js/email-config.js → appsScriptUrl
 * 5) SECRET debe coincidir con appsScriptSecret
 *
 * Tipos de POST:
 *  - type: "verify"  → código al cliente (activar cuenta)
 *  - type: "recover" → código al cliente (recuperar contraseña)
 *  - type: "booking" → aviso de reserva al admin
 *  - type: "redeem"  → aviso de canje de puntos por producto al admin
 */

var SECRET = "barberhome-otp-2026";

function doPost(e) {
  try {
    var raw = (e && e.postData && e.postData.contents) || "{}";
    if (raw.length > 50000) {
      return json_({ ok: false, message: "Payload demasiado grande" });
    }
    var data = JSON.parse(raw);

    if (!secretsMatch_(data.secret, SECRET)) {
      return json_({ ok: false, message: "No autorizado" });
    }

    var type = String(data.type || "verify").toLowerCase();
    if (["verify", "recover", "booking", "redeem"].indexOf(type) < 0) {
      return json_({ ok: false, message: "Tipo no permitido" });
    }
    if (type === "booking") {
      return sendBookingAlert_(data);
    }
    if (type === "redeem") {
      return sendRedeemAlert_(data);
    }
    if (type === "recover") {
      return sendRecoverCode_(data);
    }
    return sendVerifyCode_(data);
  } catch (err) {
    return json_({ ok: false, message: "Error interno" });
  }
}

function doGet(e) {
  try {
    var p = (e && e.parameter) || {};
    var type = String(p.type || "").toLowerCase();
    if (type && p.to_email && p.secret) {
      return doPost({
        postData: { contents: JSON.stringify(p) },
        parameter: p,
      });
    }
    return json_({
      ok: true,
      message:
        "BarberHome mail OK. Usa POST type=verify, recover, booking o redeem.",
    });
  } catch (err) {
    return json_({ ok: false, message: "Error interno" });
  }
}

function sendVerifyCode_(data) {
  var to = String(data.to_email || "").trim();
  var name = String(data.to_name || "cliente").trim();
  var code = String(data.code || "").trim();
  var fromName = String(data.from_name || "BarberHome").trim();

  if (!to || !code) {
    return json_({ ok: false, message: "Faltan to_email o code" });
  }
  if (!isValidEmail_(to)) {
    return json_({ ok: false, message: "Correo inválido" });
  }
  if (!/^\d{4,8}$/.test(code)) {
    return json_({ ok: false, message: "Código inválido" });
  }

  var product = String(data.product_label || "Puntos BarberHome").trim();
  var subject = "Tu código " + product + ": " + code;
  var body =
    "Hola " +
    name +
    ",\n\n" +
    "Tu código de verificación de " +
    product +
    " es: " +
    code +
    "\n\n" +
    "Escríbelo en la app para continuar.\n" +
    "Si no solicitaste este código, ignora este mensaje.\n\n" +
    "— " +
    fromName;

  var html =
    '<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#111827">' +
    "<p>Hola <strong>" +
    escapeHtml_(name) +
    "</strong>,</p>" +
    "<p>Tu código de verificación de <strong>" +
    escapeHtml_(product) +
    "</strong> es:</p>" +
    '<p style="font-size:32px;letter-spacing:6px;font-weight:700;margin:24px 0;color:#5b21b6">' +
    escapeHtml_(code) +
    "</p>" +
    "<p>Escríbelo en la app para continuar.</p>" +
    '<p style="color:#6b7280;font-size:13px">Si no solicitaste este código, ignora este mensaje.</p>' +
    "<p>— " +
    escapeHtml_(fromName) +
    "</p>" +
    "</div>";

  MailApp.sendEmail({
    to: to,
    subject: subject,
    body: body,
    htmlBody: html,
    name: fromName,
  });

  return json_({ ok: true, message: "Código enviado" });
}

function sendRecoverCode_(data) {
  var to = String(data.to_email || "").trim();
  var name = String(data.to_name || "cliente").trim();
  var code = String(data.code || "").trim();
  var fromName = String(data.from_name || "BarberHome").trim();

  if (!to || !code) {
    return json_({ ok: false, message: "Faltan to_email o code" });
  }
  if (!isValidEmail_(to)) {
    return json_({ ok: false, message: "Correo inválido" });
  }
  if (!/^\d{4,8}$/.test(code)) {
    return json_({ ok: false, message: "Código inválido" });
  }

  var subject = "Recupera tu contraseña Puntos BarberHome: " + code;
  var body =
    "Hola " +
    name +
    ",\n\n" +
    "Recibimos una solicitud para recuperar tu contraseña de Puntos BarberHome.\n" +
    "Tu código es: " +
    code +
    "\n\n" +
    "Escríbelo en la app para crear una contraseña nueva.\n" +
    "Si no solicitaste esto, ignora este mensaje.\n\n" +
    "— " +
    fromName;

  var html =
    '<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#111827">' +
    "<p>Hola <strong>" +
    escapeHtml_(name) +
    "</strong>,</p>" +
    "<p>Usa este código para <strong>recuperar tu contraseña</strong> de Puntos BarberHome:</p>" +
    '<p style="font-size:32px;letter-spacing:6px;font-weight:700;margin:24px 0;color:#5b21b6">' +
    escapeHtml_(code) +
    "</p>" +
    "<p>Escríbelo en la app para crear una contraseña nueva.</p>" +
    '<p style="color:#6b7280;font-size:13px">Si no solicitaste esto, ignora este mensaje.</p>' +
    "<p>— " +
    escapeHtml_(fromName) +
    "</p>" +
    "</div>";

  MailApp.sendEmail({
    to: to,
    subject: subject,
    body: body,
    htmlBody: html,
    name: fromName,
  });

  return json_({ ok: true, message: "Código de recuperación enviado" });
}

function sendBookingAlert_(data) {
  var to = String(data.to_email || data.admin_email || "").trim();
  var fromName = String(data.from_name || "BarberHome").trim();
  var booking = data.booking || {};

  if (!to) {
    return json_({ ok: false, message: "Falta admin_email / to_email" });
  }

  var client = String(booking.name || data.client_name || "Cliente").trim();
  var phone = String(booking.phone || data.client_phone || "—").trim();
  var fingerprint = String(
    booking.clientFingerprint || data.client_fingerprint || ""
  ).trim();
  var service = String(booking.serviceName || data.service || "Cita").trim();
  var date = String(booking.date || data.date || "—").trim();
  var time = String(booking.time || data.time || "—").trim();
  var duration = String(booking.duration || data.duration || "—");
  var price = booking.price != null ? booking.price : data.price;
  var notes = String(booking.notes || data.notes || "").trim();
  var status = String(booking.status || "pending_confirmation").trim();
  var source = String(booking.source || "public").trim();
  var business = String(booking.business || fromName).trim();
  var bookingId = String(booking.id || "").trim();

  var priceText =
    price === "" || price == null
      ? "—"
      : "$ " + Number(price).toLocaleString("es-CO");

  var subject =
    "Nueva reserva · " + service + " · " + date + " " + time + " · " + client;

  var body =
    "Nueva reserva en " +
    business +
    "\n\n" +
    "Cliente: " +
    client +
    "\n" +
    "WhatsApp: " +
    phone +
    "\n" +
    "Servicio: " +
    service +
    "\n" +
    "Fecha: " +
    date +
    "\n" +
    "Hora: " +
    time +
    "\n" +
    "Duración: " +
    duration +
    " min\n" +
    "Precio: " +
    priceText +
    "\n" +
    "Estado: " +
    status +
    "\n" +
    "Origen: " +
    source +
    "\n" +
    (bookingId ? "ID: " + bookingId + "\n" : "") +
    (fingerprint ? "Dispositivo: " + fingerprint + "\n" : "") +
    (notes ? "Notas: " + notes + "\n" : "") +
    "\n— BarberCloud";

  var html =
    '<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111827">' +
    '<p style="font-size:18px;font-weight:700;margin:0 0 8px">Nueva reserva</p>' +
    '<p style="color:#6b7280;margin:0 0 20px">' +
    escapeHtml_(business) +
    "</p>" +
    '<table style="width:100%;border-collapse:collapse;font-size:14px">' +
    row_("Cliente", client) +
    row_("WhatsApp", phone) +
    row_("Servicio", service) +
    row_("Fecha", date) +
    row_("Hora", time) +
    row_("Duración", duration + " min") +
    row_("Precio", priceText) +
    row_("Estado", status) +
    row_("Origen", source) +
    (bookingId ? row_("ID", bookingId) : "") +
    (fingerprint ? row_("Dispositivo", fingerprint) : "") +
    (notes ? row_("Notas", notes) : "") +
    "</table>" +
    '<p style="color:#6b7280;font-size:12px;margin-top:24px">Aviso automático de BarberCloud</p>' +
    "</div>";

  MailApp.sendEmail({
    to: to,
    subject: subject,
    body: body,
    htmlBody: html,
    name: fromName,
  });

  return json_({ ok: true, message: "Aviso de reserva enviado" });
}

function sendRedeemAlert_(data) {
  var to = String(data.to_email || data.admin_email || "").trim();
  var fromName = String(data.from_name || "BarberHome").trim();
  var redeem = data.redeem || {};
  var customer = redeem.customer || {};

  if (!to) {
    return json_({ ok: false, message: "Falta admin_email / to_email" });
  }

  var product = String(redeem.productName || data.product_name || "Producto").trim();
  var points = String(
    redeem.pointsCost != null ? redeem.pointsCost : data.points_cost != null ? data.points_cost : "—"
  );
  var client = String(customer.name || data.client_name || "Cliente").trim();
  var phone = String(customer.phone || data.client_phone || "—").trim();
  var email = String(customer.email || data.client_email || "—").trim();
  var doc = String(
    data.client_doc ||
      ((customer.docType || "") + " " + (customer.docNumber || "")).trim() ||
      "—"
  ).trim();
  var redeemId = String(redeem.id || "").trim();

  var subject = "Canje de puntos · " + product + " · " + client;

  var body =
    "Nuevo canje de puntos en " +
    fromName +
    "\n\n" +
    "Producto: " +
    product +
    "\n" +
    "Puntos descontados: " +
    points +
    "\n" +
    "Cliente: " +
    client +
    "\n" +
    "Documento: " +
    doc +
    "\n" +
    "WhatsApp: " +
    phone +
    "\n" +
    "Correo: " +
    email +
    "\n" +
    (redeemId ? "ID: " + redeemId + "\n" : "") +
    "\nLos puntos ya fueron descontados. Entrega el producto y márcalo como entregado en Puntos.\n" +
    "\n— BarberCloud";

  var html =
    '<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111827">' +
    '<p style="font-size:18px;font-weight:700;margin:0 0 8px">Canje de puntos</p>' +
    '<p style="color:#6b7280;margin:0 0 20px">Los puntos ya fueron descontados. Entrega el producto.</p>' +
    '<table style="width:100%;border-collapse:collapse;font-size:14px">' +
    row_("Producto", product) +
    row_("Puntos", "−" + points) +
    row_("Cliente", client) +
    row_("Documento", doc) +
    row_("WhatsApp", phone) +
    row_("Correo", email) +
    (redeemId ? row_("ID", redeemId) : "") +
    "</table>" +
    '<p style="color:#6b7280;font-size:12px;margin-top:24px">Aviso automático de BarberCloud</p>' +
    "</div>";

  MailApp.sendEmail({
    to: to,
    subject: subject,
    body: body,
    htmlBody: html,
    name: fromName,
  });

  return json_({ ok: true, message: "Aviso de canje enviado" });
}

function row_(label, value) {
  return (
    "<tr>" +
    '<td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;width:34%">' +
    escapeHtml_(label) +
    "</td>" +
    '<td style="padding:8px 0;border-bottom:1px solid #e5e7eb;font-weight:600">' +
    escapeHtml_(value) +
    "</td>" +
    "</tr>"
  );
}

function escapeHtml_(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Comparación resistente a timing básico (Apps Script) */
function secretsMatch_(provided, expected) {
  var a = String(provided || "");
  var b = String(expected || "");
  if (!a || !b) return false;
  var len = Math.max(a.length, b.length);
  var diff = a.length === b.length ? 0 : 1;
  for (var i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

function isValidEmail_(value) {
  var email = String(value || "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

/** Últimos dígitos del WhatsApp para clave de rate-limit */
function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}
