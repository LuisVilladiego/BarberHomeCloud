const { rest, negocioById, negocioBySlug, updateNegocio } = require("./supabase");
const { isConfigured, sendBusinessWhatsApp } = require("./sms");
const {
  renderMessage,
  sampleBooking,
  bookingAppointmentMs,
  clampSendNotBefore730,
  isActiveBooking,
} = require("./message-templates");
const { toE164 } = require("./otp");
const { hasSubscriptionAccess, normalizeStatus } = require("./business-model");

const DEFAULT_CALENDAR_ID = "barberhome";

function defaultCalendarConfig(negocio) {
  const name = negocio?.name || "Mi negocio";
  return {
    businessName: name,
    paused: false,
    sendHoursBefore: "24",
    secondReminder: false,
    secondHoursBefore: "12",
    createMsgEnabled: true,
    createMsgDelay: "0",
    createMsgTitle: `Confirmación de cita ${name}`,
    createMsgBody: `Hola {{nombreCliente}}, se ha confirmado tu cita con ${name}. Información de tu cita:`,
    createShowDateTime: "both",
    msgTitle: `Recordatorio de cita ${name}`,
    msgBody: `Hola {{nombreCliente}}, recuerda tu cita en ${name}.`,
    showDateTime: "both",
    afterMsgEnabled: true,
    afterMsgDelay: "0.5",
    afterMsgTitle: name,
    afterMsgBody: `Gracias por confiar en ${name} 💈`,
    timeFormat: "12",
    timezone: "America/Bogota",
  };
}

function readCalendarConfigs(negocio) {
  const settings =
    negocio?.settings && typeof negocio.settings === "object" ? negocio.settings : {};
  const stored = settings.calendar_messages;
  if (stored && typeof stored === "object" && !Array.isArray(stored)) return stored;
  return {};
}

function calendarConfigFor(negocio, calendarId) {
  const all = readCalendarConfigs(negocio);
  const id = calendarId || DEFAULT_CALENDAR_ID;
  const base = defaultCalendarConfig(negocio);
  return { ...base, ...(all[id] || all.barberhome || {}) };
}

async function persistCalendarConfigs(negocioId, calendarMessages) {
  if (!negocioId) throw new Error("Falta negocio.");
  const negocio = await negocioById(negocioId);
  if (!negocio) throw new Error("Negocio no encontrado.");
  const settings =
    negocio.settings && typeof negocio.settings === "object" ? negocio.settings : {};
  const next = {
    ...settings,
    calendar_messages: calendarMessages && typeof calendarMessages === "object" ? calendarMessages : {},
  };
  await updateNegocio(negocioId, { settings: next });
  return next.calendar_messages;
}

function bookingFromRow(row) {
  if (!row) return null;
  const meta = row.meta && typeof row.meta === "object" ? row.meta : {};
  return {
    id: row.id,
    name: row.name || "Cliente",
    phone: row.phone || "",
    date: row.date,
    time: row.time,
    duration: row.duration || 60,
    serviceName: row.service_name || row.serviceName || "Cita",
    status: row.status || "",
    business: row.business || "",
    calendarId: row.calendar_id || row.calendarId || DEFAULT_CALENDAR_ID,
    slug: row.slug || "",
    negocioId: row.negocio_id || row.negocioId || "",
    countryCode: meta.countryCode || row.countryCode || "+57",
    lifecycleStatus: meta.lifecycleStatus || row.lifecycleStatus || "",
    confirmationStatus: meta.confirmationStatus || row.confirmationStatus || "",
    createdAt: meta.createdAt || row.createdAt || row.created_at || null,
    waMessages: meta.waMessages && typeof meta.waMessages === "object" ? meta.waMessages : {},
  };
}

function phoneE164FromBooking(booking) {
  const cc = String(booking?.countryCode || "+57").trim();
  const local = String(booking?.phone || "").replace(/\D/g, "");
  if (!local) return "";
  try {
    return toE164(cc, local);
  } catch {
    return "";
  }
}

async function markMessageSent(bookingId, type, extra = {}) {
  if (!bookingId) return;
  let rows = [];
  try {
    rows = await rest("citas", {
      query: { select: "id,meta", id: `eq.${bookingId}`, limit: 1 },
    });
  } catch (err) {
    console.error("[whatsapp] read cita", err);
    return;
  }
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) return;
  const meta = row.meta && typeof row.meta === "object" ? { ...row.meta } : {};
  const wa = meta.waMessages && typeof meta.waMessages === "object" ? { ...meta.waMessages } : {};
  const stamp = new Date().toISOString();
  if (type === "confirmation") wa.confirmationSentAt = stamp;
  if (type === "reminder") wa.reminderSentAt = stamp;
  if (type === "reminder2") wa.secondReminderSentAt = stamp;
  if (type === "after") wa.afterSentAt = stamp;
  if (extra.sid) wa.lastSid = extra.sid;
  meta.waMessages = wa;
  try {
    await rest("citas", {
      method: "PATCH",
      query: { id: `eq.${bookingId}` },
      headers: { Prefer: "return=minimal" },
      body: { meta, updated_at: stamp },
    });
  } catch (err) {
    console.error("[whatsapp] patch cita", err);
  }
}

async function sendWhatsAppMessage({ negocio, booking, type, testPhone, testCountryCode, respectDelay }) {
  if (!isConfigured()) {
    return { ok: false, message: "WhatsApp no configurado en el servidor." };
  }
  if (!hasSubscriptionAccess(normalizeStatus(negocio?.subscription_status), negocio?.current_period_end)) {
    return { ok: false, message: "El plan de este negocio no incluye WhatsApp activo." };
  }

  const cfg = calendarConfigFor(negocio, booking?.calendarId);
  if (cfg.paused) {
    return { ok: false, message: "Los mensajes están pausados para este calendario." };
  }

  if (respectDelay && booking && String(type).toLowerCase() === "confirmation") {
    if (!shouldSendConfirmation(booking, cfg, Date.now())) {
      return { ok: true, queued: true, message: "Confirmación programada según el retraso configurado." };
    }
  }

  if (booking?.id && type === "confirmation" && booking?.waMessages?.confirmationSentAt) {
    return { ok: true, skipped: true, message: "La confirmación ya fue enviada." };
  }
  if (booking?.id && type === "reminder" && booking?.waMessages?.reminderSentAt) {
    return { ok: true, skipped: true, message: "El recordatorio ya fue enviado." };
  }
  if (booking?.id && type === "reminder2" && booking?.waMessages?.secondReminderSentAt) {
    return { ok: true, skipped: true, message: "El segundo recordatorio ya fue enviado." };
  }
  if (booking?.id && type === "after" && booking?.waMessages?.afterSentAt) {
    return { ok: true, skipped: true, message: "El mensaje post-cita ya fue enviado." };
  }

  const rendered = renderMessage(type, cfg, booking || sampleBooking(cfg));
  if (!rendered.enabled && type !== "test") {
    return { ok: false, message: "Este tipo de mensaje está desactivado en la configuración." };
  }
  if (!rendered.text) {
    return { ok: false, message: "La plantilla del mensaje está vacía." };
  }

  const dest =
    testPhone && testCountryCode
      ? toE164(testCountryCode, String(testPhone).replace(/\D/g, ""))
      : phoneE164FromBooking(booking);
  if (!dest) {
    return { ok: false, message: "El cliente no tiene WhatsApp válido." };
  }

  try {
    const delivery = await sendBusinessWhatsApp({
      toE164: dest,
      title: rendered.title,
      body: rendered.text,
      datePart: rendered.datePart,
      timePart: rendered.timePart,
      businessName: negocio?.name || cfg.businessName || "Gestiónweb",
      customerName: booking?.name || "Cliente",
    });
    if (booking?.id && type !== "test") {
      await markMessageSent(booking.id, type, { sid: delivery.sid });
    }
    return { ok: true, message: "WhatsApp enviado.", sid: delivery.sid, preview: rendered.text };
  } catch (err) {
    console.error("[whatsapp] send", type, dest, err);
    return { ok: false, message: err?.message || "No se pudo enviar el WhatsApp." };
  }
}

function shouldSendConfirmation(booking, cfg, nowMs) {
  if (!cfg.createMsgEnabled) return false;
  if (booking?.waMessages?.confirmationSentAt) return false;
  const createdMs = booking?.createdAt ? new Date(booking.createdAt).getTime() : nowMs;
  const delayMin = Number(cfg.createMsgDelay || 0) || 0;
  return nowMs >= createdMs + delayMin * 60 * 1000;
}

function shouldSendReminder(booking, cfg, nowMs, type) {
  const apptMs = bookingAppointmentMs(booking);
  if (!apptMs || apptMs <= nowMs) return false;
  if (type === "reminder2") {
    if (!cfg.secondReminder) return false;
    if (booking?.waMessages?.secondReminderSentAt) return false;
    let sendAt = apptMs - (Number(cfg.secondHoursBefore || 12) || 12) * 3600000;
    sendAt = clampSendNotBefore730(sendAt, apptMs);
    return nowMs >= sendAt;
  }
  if (booking?.waMessages?.reminderSentAt) return false;
  let sendAt = apptMs - (Number(cfg.sendHoursBefore || 24) || 24) * 3600000;
  sendAt = clampSendNotBefore730(sendAt, apptMs);
  return nowMs >= sendAt;
}

function shouldSendAfter(booking, cfg, nowMs) {
  if (!cfg.afterMsgEnabled) return false;
  if (booking?.waMessages?.afterSentAt) return false;
  const lifecycle = String(booking?.lifecycleStatus || "").toLowerCase();
  const status = String(booking?.status || "").toLowerCase();
  const completed = lifecycle === "completed" || status === "completed";
  if (!completed) return false;
  const apptMs = bookingAppointmentMs(booking);
  if (!apptMs) return false;
  const delayH = Number(cfg.afterMsgDelay || 0.5) || 0.5;
  return nowMs >= apptMs + delayH * 3600000;
}

async function listBookingsForNegocio(negocioId) {
  const today = new Date();
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  try {
    const rows = await rest("citas", {
      query: {
        select: "id,name,phone,date,time,duration,service_name,status,business,calendar_id,slug,negocio_id,meta,created_at",
        negocio_id: `eq.${negocioId}`,
        date: `gte.${iso}`,
        order: "date.asc,time.asc",
        limit: 200,
      },
    });
    return (Array.isArray(rows) ? rows : []).map(bookingFromRow).filter(Boolean);
  } catch (err) {
    console.error("[whatsapp] list citas", negocioId, err);
    return [];
  }
}

async function processNegocioMessages(negocio) {
  if (!negocio?.id) return { sent: 0, skipped: 0, errors: 0 };
  if (!hasSubscriptionAccess(normalizeStatus(negocio.subscription_status), negocio.current_period_end)) {
    return { sent: 0, skipped: 0, errors: 0, reason: "plan_inactivo" };
  }
  const bookings = await listBookingsForNegocio(negocio.id);
  const nowMs = Date.now();
  let sent = 0;
  let skipped = 0;
  let errors = 0;

  for (const booking of bookings) {
    if (!isActiveBooking(booking) && !String(booking.status || "").includes("completed")) {
      skipped += 1;
      continue;
    }
    const cfg = calendarConfigFor(negocio, booking.calendarId);
    if (cfg.paused) {
      skipped += 1;
      continue;
    }

    const queue = [];
    if (shouldSendConfirmation(booking, cfg, nowMs)) queue.push("confirmation");
    if (isActiveBooking(booking) && shouldSendReminder(booking, cfg, nowMs, "reminder")) {
      queue.push("reminder");
    }
    if (isActiveBooking(booking) && shouldSendReminder(booking, cfg, nowMs, "reminder2")) {
      queue.push("reminder2");
    }
    if (shouldSendAfter(booking, cfg, nowMs)) queue.push("after");

    for (const type of queue) {
      const result = await sendWhatsAppMessage({ negocio, booking, type });
      if (result.ok) sent += 1;
      else errors += 1;
    }
    if (!queue.length) skipped += 1;
  }

  return { sent, skipped, errors, bookings: bookings.length };
}

async function processAllScheduledMessages() {
  let negocios = [];
  try {
    negocios = await rest("negocios", {
      query: {
        select: "id,name,subscription_status,current_period_end,settings",
        limit: 500,
      },
    });
  } catch (err) {
    console.error("[whatsapp] list negocios", err);
    return { ok: false, message: err?.message || "No se pudieron leer negocios." };
  }

  const results = [];
  for (const negocio of Array.isArray(negocios) ? negocios : []) {
    results.push({ id: negocio.id, ...(await processNegocioMessages(negocio)) });
  }
  return { ok: true, scanned: results.length, results };
}

async function resolveNegocio({ slug, negocioId }) {
  if (negocioId) {
    const byId = await negocioById(negocioId);
    if (byId) return byId;
  }
  if (slug) return negocioBySlug(slug);
  return null;
}

module.exports = {
  calendarConfigFor,
  persistCalendarConfigs,
  sendWhatsAppMessage,
  processAllScheduledMessages,
  resolveNegocio,
  bookingFromRow,
};
