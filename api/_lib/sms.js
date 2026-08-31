/**
 * WhatsApp vía Twilio (servidor).
 * Variables: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM
 * (TWILIO_FROM_NUMBER también sirve como alias del remitente).
 */

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

async function sendWhatsApp({ to, body }) {
  const cfg = twilioConfig();
  if (!cfg) {
    return { ok: false, demo: true, message: "WhatsApp no configurado en el servidor." };
  }

  const toAddress = whatsappAddress(to);
  if (!/^whatsapp:\+[1-9]\d{7,14}$/.test(toAddress)) {
    throw new Error("Número de WhatsApp inválido.");
  }

  const params = new URLSearchParams();
  params.set("To", toAddress);
  params.set("From", cfg.from);
  params.set("Body", String(body || "").slice(0, 1024));

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
    throw new Error(data?.message || `Twilio respondió ${res.status}`);
  }
  return { ok: true, demo: false, message: "WhatsApp enviado.", sid: data?.sid || "" };
}

async function sendLookupCode({ toE164, code, businessName }) {
  const brand = String(businessName || "BarberCloud").trim();
  const body = `${brand}: tu código para consultar reservas es ${code}. Válido 10 min. No lo compartas.`;
  return sendWhatsApp({ to: toE164, body });
}

module.exports = {
  isConfigured: () => !!twilioConfig(),
  sendLookupCode,
  sendWhatsApp,
};
