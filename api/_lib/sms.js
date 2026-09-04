/**
 * WhatsApp vía Twilio (servidor).
 * Variables: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM
 * Plantilla: TWILIO_WHATSAPP_CONTENT_SID (HX...) — obligatoria fuera del sandbox.
 * Modo auth OTP: TWILIO_WHATSAPP_CONTENT_MODE=auth (solo variable {{1}} = código).
 */

const SANDBOX_WHATSAPP_FROM = "whatsapp:+14155238886";
/** Plantilla preaprobada del sandbox (recordatorio de cita). Solo para pruebas. */
const SANDBOX_DEFAULT_CONTENT_SID = "HXb5b62575e6e4ff6129ad7c8efe1f983e";

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

function resolveContentSid(fromAddress) {
  const configured = String(process.env.TWILIO_WHATSAPP_CONTENT_SID || "").trim();
  if (configured) return configured;
  if (fromAddress === SANDBOX_WHATSAPP_FROM) return SANDBOX_DEFAULT_CONTENT_SID;
  return "";
}

function formatTwilioError(err) {
  const code = Number(err?.code || err?.twilio?.code || 0);
  const msg = String(err?.message || err?.twilio?.message || "").trim();

  if (code === 20003 || /compliance profile/i.test(msg)) {
    return "WhatsApp no está habilitado: completa la verificación KYC en Twilio Trust Hub.";
  }
  if (code === 572002 || /verified recipient/i.test(msg)) {
    return "El número destino debe estar verificado en Twilio o unido al sandbox de WhatsApp.";
  }
  if (code === 21655 || /ContentSid is Invalid/i.test(msg)) {
    return "La plantilla de WhatsApp no es válida. Revisa TWILIO_WHATSAPP_CONTENT_SID.";
  }
  if (code === 63007 || /not a valid WhatsApp/i.test(msg)) {
    return "Este número no tiene WhatsApp o no está unido al sandbox de Twilio.";
  }
  if (/join.*sandbox|sandbox.*join/i.test(msg)) {
    return "Para pruebas, envía el mensaje join al sandbox de WhatsApp desde tu celular.";
  }

  return msg || "No se pudo enviar el WhatsApp.";
}

function buildContentVariables({ code, businessName, contentSid }) {
  const mode = String(process.env.TWILIO_WHATSAPP_CONTENT_MODE || "").trim().toLowerCase();
  const brand = String(businessName || "BarberCloud").trim();

  if (mode === "auth") {
    return JSON.stringify({ 1: String(code || "") });
  }

  const custom = String(process.env.TWILIO_WHATSAPP_CONTENT_VARIABLES || "").trim();
  if (custom) {
    return custom
      .replace(/\{\{code\}\}/g, String(code || ""))
      .replace(/\{\{brand\}\}/g, brand);
  }

  if (contentSid === SANDBOX_DEFAULT_CONTENT_SID) {
    return JSON.stringify({
      1: String(code || ""),
      2: `${brand} · consulta de reservas`,
    });
  }

  return JSON.stringify({ 1: String(code || ""), 2: brand });
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

  const sid = contentSid || resolveContentSid(cfg.from);
  if (sid) {
    params.set("ContentSid", sid);
    if (contentVariables) params.set("ContentVariables", contentVariables);
  } else if (body) {
    params.set("Body", String(body || "").slice(0, 1024));
  } else {
    throw new Error(
      "Falta TWILIO_WHATSAPP_CONTENT_SID. WhatsApp exige plantilla aprobada (ContentSid)."
    );
  }

  return twilioSendMessage(params);
}

function resolveUtilityContentSid(fromAddress) {
  const configured = String(process.env.TWILIO_WHATSAPP_UTILITY_CONTENT_SID || "").trim();
  if (configured) return configured;
  if (fromAddress === SANDBOX_WHATSAPP_FROM) return SANDBOX_DEFAULT_CONTENT_SID;
  return "";
}

function buildUtilityContentVariables({ title, body, datePart, timePart, contentSid }) {
  const full = String(body || "").trim();
  const custom = String(process.env.TWILIO_WHATSAPP_UTILITY_VARIABLES || "").trim();
  if (custom) {
    return custom
      .replace(/\{\{1\}\}/g, full.slice(0, 900))
      .replace(/\{\{2\}\}/g, String(title || "").slice(0, 200))
      .replace(/\{\{date\}\}/g, String(datePart || ""))
      .replace(/\{\{time\}\}/g, String(timePart || ""));
  }
  if (contentSid === SANDBOX_DEFAULT_CONTENT_SID) {
    return JSON.stringify({
      1: String(datePart || title || "Tu cita").slice(0, 200),
      2: String(full || timePart || title || "Recordatorio").slice(0, 900),
    });
  }
  return JSON.stringify({ 1: full.slice(0, 1024) });
}

async function sendBusinessWhatsApp({ toE164, title, body, datePart, timePart, businessName }) {
  const cfg = twilioConfig();
  const utilitySid = resolveUtilityContentSid(cfg?.from || "");
  const contentVariables = buildUtilityContentVariables({
    title,
    body,
    datePart,
    timePart,
    contentSid: utilitySid,
  });

  if (utilitySid) {
    return sendWhatsApp({ to: toE164, contentSid: utilitySid, contentVariables });
  }

  const brand = String(businessName || "BarberCloud").trim();
  const text = String(body || title || "").trim();
  const fallbackBody = text || `${brand}: recordatorio de cita`;
  return sendWhatsApp({ to: toE164, body: fallbackBody.slice(0, 1024) });
}

async function sendLookupCode({ toE164, code, businessName }) {
  const cfg = twilioConfig();
  const contentSid = resolveContentSid(cfg?.from || "");
  const contentVariables = buildContentVariables({
    code,
    businessName,
    contentSid,
  });

  if (contentSid) {
    return sendWhatsApp({ to: toE164, contentSid, contentVariables });
  }

  const brand = String(businessName || "BarberCloud").trim();
  const body = `${brand}: tu código para consultar reservas es ${code}. Válido 10 min. No lo compartas.`;
  return sendWhatsApp({ to: toE164, body });
}

module.exports = {
  isConfigured: () => !!twilioConfig(),
  sendLookupCode,
  sendBusinessWhatsApp,
  sendWhatsApp,
};
