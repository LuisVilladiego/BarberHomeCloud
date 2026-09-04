/**
 * WhatsApp vía Twilio (servidor).
 * Variables: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM
 * OTP: TWILIO_WHATSAPP_CONTENT_SID + TWILIO_WHATSAPP_CONTENT_MODE=auth
 * Citas: TWILIO_WHATSAPP_UTILITY_CONTENT_SID (plantilla utility aprobada).
 */

const SANDBOX_WHATSAPP_FROM = "whatsapp:+14155238886";

function whatsappAddress(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.startsWith("whatsapp:")) return raw;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  return `whatsapp:+${digits}`;
}

function twilioConfig() {
  const accountSid = String(process.env.TWILIO_ACCOUNT_SID || "").trim();
  const authToken = String(process.env.TWILIO_AUTH_TOKEN || "").trim();
  const from = whatsappAddress(
    process.env.TWILIO_WHATSAPP_FROM || process.env.TWILIO_FROM_NUMBER || ""
  );
  if (!accountSid || !authToken || !from) return null;
  return { accountSid, authToken, from };
}

function isSandboxFrom(fromAddress) {
  return whatsappAddress(fromAddress) === SANDBOX_WHATSAPP_FROM;
}

function resolveAuthContentSid() {
  return String(process.env.TWILIO_WHATSAPP_CONTENT_SID || "").trim();
}

function resolveUtilityContentSid() {
  return String(process.env.TWILIO_WHATSAPP_UTILITY_CONTENT_SID || "").trim();
}

function formatTwilioError(err) {
  const code = Number(err?.code || err?.twilio?.code || 0);
  const msg = String(err?.message || err?.twilio?.message || "").trim();

  if (code === 20003 || /compliance profile/i.test(msg)) {
    return "WhatsApp no está habilitado: completa la verificación KYC en Twilio Trust Hub.";
  }
  if (code === 21656 || /Content Variables/i.test(msg)) {
    return "Las variables de la plantilla de WhatsApp no coinciden. Revisa TWILIO_WHATSAPP_UTILITY_CONTENT_SID.";
  }
  if (code === 21655 || /ContentSid is Invalid/i.test(msg)) {
    return "La plantilla de WhatsApp no es válida. Revisa TWILIO_WHATSAPP_CONTENT_SID.";
  }
  if (code === 63016 || /template.*not.*exist|not yet approved/i.test(msg)) {
    return "La plantilla de WhatsApp aún no está aprobada por Meta.";
  }
  if (code === 63007 || /not a valid WhatsApp/i.test(msg)) {
    return "El número remitente no está registrado como sender de WhatsApp en Twilio.";
  }
  if (code === 572002 || /verified recipient/i.test(msg)) {
    return "El número destino debe estar verificado en Twilio o unido al sandbox de WhatsApp.";
  }
  if (/join.*sandbox|sandbox.*join/i.test(msg)) {
    return "Para pruebas, envía el mensaje join al sandbox de WhatsApp desde tu celular.";
  }

  return msg || "No se pudo enviar el WhatsApp.";
}

function buildAuthContentVariables({ code, businessName, contentSid }) {
  const mode = String(process.env.TWILIO_WHATSAPP_CONTENT_MODE || "").trim().toLowerCase();
  const brand = String(businessName || "Gestiónweb").trim();

  if (mode === "auth") {
    return JSON.stringify({ 1: String(code || "") });
  }

  const custom = String(process.env.TWILIO_WHATSAPP_CONTENT_VARIABLES || "").trim();
  if (custom) {
    return custom
      .replace(/\{\{code\}\}/g, String(code || ""))
      .replace(/\{\{brand\}\}/g, brand);
  }

  return JSON.stringify({ 1: String(code || ""), 2: brand });
}

function buildUtilityContentVariables({ customerName, businessName, title, body, datePart, timePart }) {
  const custom = String(process.env.TWILIO_WHATSAPP_UTILITY_VARIABLES || "").trim();
  const name = String(customerName || "Cliente").trim() || "Cliente";
  const brand = String(businessName || "Gestiónweb").trim() || "Gestiónweb";
  const message = String(body || title || "Tienes una actualización de tu cita.").trim();
  const date = String(datePart || "por confirmar").trim() || "por confirmar";
  const time = String(timePart || "por confirmar").trim() || "por confirmar";

  if (custom) {
    return custom
      .replace(/\{\{1\}\}/g, name.slice(0, 200))
      .replace(/\{\{2\}\}/g, brand.slice(0, 200))
      .replace(/\{\{3\}\}/g, message.slice(0, 900))
      .replace(/\{\{4\}\}/g, date.slice(0, 120))
      .replace(/\{\{5\}\}/g, time.slice(0, 80))
      .replace(/\{\{nombreCliente\}\}/g, name)
      .replace(/\{\{negocio\}\}/g, brand)
      .replace(/\{\{date\}\}/g, date)
      .replace(/\{\{time\}\}/g, time);
  }

  return JSON.stringify({
    1: name.slice(0, 200),
    2: brand.slice(0, 200),
    3: message.slice(0, 900),
    4: date.slice(0, 120),
    5: time.slice(0, 80),
  });
}

async function twilioSendMessage(params) {
  const cfg = twilioConfig();
  if (!cfg) {
    throw new Error("WhatsApp no configurado en el servidor.");
  }

  const auth = Buffer.from(`${cfg.accountSid}:${cfg.authToken}`).toString("base64");
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${cfg.accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    }
  );

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(formatTwilioError({ code: data?.code, message: data?.message, twilio: data }));
    err.code = data?.code;
    err.twilio = data;
    throw err;
  }
  return { ok: true, message: "WhatsApp enviado.", sid: data?.sid || "" };
}

async function sendWhatsApp({ to, body, contentSid, contentVariables }) {
  const cfg = twilioConfig();
  if (!cfg) {
    throw new Error("WhatsApp no configurado en el servidor.");
  }

  const toAddress = whatsappAddress(to);
  if (!/^whatsapp:\+[1-9]\d{7,14}$/.test(toAddress)) {
    throw new Error("Número de WhatsApp inválido.");
  }

  const params = new URLSearchParams();
  params.set("To", toAddress);
  params.set("From", cfg.from);

  const sid = String(contentSid || "").trim();
  if (sid) {
    params.set("ContentSid", sid);
    if (contentVariables) params.set("ContentVariables", contentVariables);
  } else if (body) {
    params.set("Body", String(body || "").slice(0, 1024));
  } else {
    throw new Error(
      "Falta TWILIO_WHATSAPP_UTILITY_CONTENT_SID. WhatsApp de producción exige plantilla aprobada."
    );
  }

  return twilioSendMessage(params);
}

async function sendBusinessWhatsApp({
  toE164,
  title,
  body,
  datePart,
  timePart,
  businessName,
  customerName,
}) {
  const cfg = twilioConfig();
  const brand = String(businessName || "Gestiónweb").trim();
  const text = String(body || title || "").trim() || `${brand}: recordatorio de cita`;
  const utilitySid = resolveUtilityContentSid();

  if (utilitySid) {
    const contentVariables = buildUtilityContentVariables({
      customerName,
      businessName: brand,
      title,
      body: text,
      datePart,
      timePart,
    });
    return sendWhatsApp({ to: toE164, contentSid: utilitySid, contentVariables });
  }

  if (isSandboxFrom(cfg?.from)) {
    return sendWhatsApp({ to: toE164, body: text.slice(0, 1024) });
  }

  throw new Error(
    "Falta TWILIO_WHATSAPP_UTILITY_CONTENT_SID. En producción WhatsApp no permite texto libre fuera de una conversación abierta."
  );
}

async function sendLookupCode({ toE164, code, businessName }) {
  const cfg = twilioConfig();
  const contentSid = resolveAuthContentSid();
  if (contentSid) {
    const contentVariables = buildAuthContentVariables({
      code,
      businessName,
      contentSid,
    });
    return sendWhatsApp({ to: toE164, contentSid, contentVariables });
  }

  if (isSandboxFrom(cfg?.from)) {
    const brand = String(businessName || "Gestiónweb").trim();
    const body = `${brand}: tu código para consultar reservas es ${code}. Válido 10 min. No lo compartas.`;
    return sendWhatsApp({ to: toE164, body });
  }

  throw new Error(
    "Falta TWILIO_WHATSAPP_CONTENT_SID. El código de consulta requiere plantilla Authentication aprobada."
  );
}

module.exports = {
  isConfigured: () => !!twilioConfig(),
  sendLookupCode,
  sendBusinessWhatsApp,
  sendWhatsApp,
};
