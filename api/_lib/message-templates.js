/**
 * Renderiza plantillas WhatsApp configuradas en calendario-config.
 * Variables: {{nombreCliente}}
 */

const CLIENT_VAR = "{{nombreCliente}}";

function parseBookingDateTime(booking, timezone) {
  const dateStr = String(booking?.date || "").trim();
  const timeStr = String(booking?.time || "00:00").trim();
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = timeStr.split(":").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, hh || 0, mm || 0, 0, 0);
}

function formatDatePart(dt, timeFormat) {
  if (!dt) return "";
  return dt.toLocaleDateString("es-CO", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "America/Bogota",
  });
}

function formatTimePart(dt, timeFormat) {
  if (!dt) return "";
  return dt.toLocaleTimeString("es-CO", {
    hour: "numeric",
    minute: "2-digit",
    hour12: timeFormat !== "24",
    timeZone: "America/Bogota",
  });
}

function formatDateTimeLines(booking, cfg, modeOverride) {
  const mode = modeOverride || cfg?.showDateTime || "both";
  if (mode === "none") return "";
  const dt = parseBookingDateTime(booking, cfg?.timezone);
  if (!dt) return "";
  const datePart = formatDatePart(dt, cfg?.timeFormat);
  const timePart = formatTimePart(dt, cfg?.timeFormat);
  const lines = [];
  if (mode === "both" || mode === "date") lines.push(`📅 Fecha: ${datePart}`);
  if (mode === "both" || mode === "time") lines.push(`⏰ Hora: ${timePart}`);
  return lines.join("\n");
}

function replaceClientName(text, booking) {
  const name = String(booking?.name || "Cliente").trim() || "Cliente";
  return String(text || "").split(CLIENT_VAR).join(name);
}

function composeMessage({ title, body, booking, cfg, dateMode }) {
  const parts = [];
  const cleanTitle = replaceClientName(title, booking).trim();
  const cleanBody = replaceClientName(body, booking).trim();
  if (cleanTitle) parts.push(cleanTitle);
  if (cleanBody) parts.push(cleanBody);
  const dateLines = formatDateTimeLines(booking, cfg, dateMode);
  if (dateLines) parts.push(dateLines);
  return parts.filter(Boolean).join("\n\n").trim();
}

function templateForType(type, cfg) {
  const t = String(type || "").toLowerCase();
  if (t === "confirmation" || t === "create") {
    return {
      title: cfg?.createMsgTitle || "",
      body: cfg?.createMsgBody || "",
      dateMode: cfg?.createShowDateTime || "both",
      enabled: cfg?.createMsgEnabled !== false,
      delayMinutes: Number(cfg?.createMsgDelay || 0) || 0,
    };
  }
  if (t === "reminder2" || t === "second") {
    return {
      title: cfg?.secondMsgTitle || "",
      body: cfg?.secondMsgBody || "",
      dateMode: cfg?.secondIncludeTime === false ? "none" : "time",
      enabled: !!cfg?.secondReminder,
      hoursBefore: Number(cfg?.secondHoursBefore || 12) || 12,
    };
  }
  if (t === "after" || t === "post") {
    return {
      title: cfg?.afterMsgTitle || "",
      body: cfg?.afterMsgBody || "",
      dateMode: "none",
      enabled: cfg?.afterMsgEnabled !== false,
      delayHours: Number(cfg?.afterMsgDelay || 0.5) || 0.5,
    };
  }
  return {
    title: cfg?.msgTitle || "",
    body: cfg?.msgBody || "",
    dateMode: cfg?.showDateTime || "both",
    enabled: true,
    hoursBefore: Number(cfg?.sendHoursBefore || 24) || 24,
  };
}

function renderMessage(type, cfg, booking) {
  const tpl = templateForType(type, cfg);
  const text = composeMessage({
    title: tpl.title,
    body: tpl.body,
    booking,
    cfg,
    dateMode: tpl.dateMode,
  });
  const dt = parseBookingDateTime(booking, cfg?.timezone);
  return {
    type,
    text,
    title: replaceClientName(tpl.title, booking).trim(),
    body: replaceClientName(tpl.body, booking).trim(),
    datePart: dt ? formatDatePart(dt, cfg?.timeFormat) : "",
    timePart: dt ? formatTimePart(dt, cfg?.timeFormat) : "",
    enabled: tpl.enabled !== false,
    tpl,
  };
}

function sampleBooking(cfg) {
  return {
    id: "sample",
    name: "María",
    phone: "3001234567",
    date: "2026-07-24",
    time: "12:55",
    serviceName: "Corte",
    business: cfg?.businessName || "Mi negocio",
  };
}

function clampSendNotBefore730(sendAtMs, appointmentMs) {
  const sendAt = new Date(sendAtMs);
  const appointment = new Date(appointmentMs);
  const day730 = new Date(appointment);
  day730.setHours(7, 30, 0, 0);
  if (
    sendAt.toDateString() === appointment.toDateString() &&
    sendAt.getTime() < day730.getTime()
  ) {
    return day730.getTime();
  }
  if (sendAt.getHours() < 7 || (sendAt.getHours() === 7 && sendAt.getMinutes() < 30)) {
    const fixed = new Date(sendAt);
    fixed.setHours(7, 30, 0, 0);
    return fixed.getTime();
  }
  return sendAtMs;
}

function bookingAppointmentMs(booking) {
  const dt = parseBookingDateTime(booking, "America/Bogota");
  return dt ? dt.getTime() : null;
}

function isActiveBooking(booking) {
  const status = String(booking?.status || "").toLowerCase();
  const lifecycle = String(booking?.lifecycleStatus || booking?.meta?.lifecycleStatus || "").toLowerCase();
  if (status.includes("cancel") || lifecycle.includes("cancel")) return false;
  if (lifecycle === "completed" || lifecycle === "no_show") return false;
  return true;
}

module.exports = {
  CLIENT_VAR,
  renderMessage,
  sampleBooking,
  templateForType,
  bookingAppointmentMs,
  clampSendNotBefore730,
  isActiveBooking,
  parseBookingDateTime,
};
