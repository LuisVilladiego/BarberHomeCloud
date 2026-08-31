const { rest, negocioBySlug, negocioById } = require("./supabase");
const { normalizePhoneKey } = require("./otp");

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isCancelledStatus(status) {
  const s = String(status || "").toLowerCase();
  return s.includes("cancel") || s === "rejected";
}

function phoneMatches(stored, needleKey) {
  if (!stored || !needleKey) return false;
  const a = normalizePhoneKey(stored);
  const b = normalizePhoneKey(needleKey);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length >= 7 && b.length >= 7) return a.slice(-10) === b.slice(-10);
  return false;
}

function publicBookingRow(row) {
  return {
    id: row.id,
    name: row.name || "Cliente",
    date: row.date,
    time: row.time,
    duration: row.duration || 60,
    serviceName: row.service_name || row.serviceName || "Cita",
    status: row.status || "pending_confirmation",
    business: row.business || "",
  };
}

async function resolveNegocio({ slug, negocioId }) {
  if (negocioId) {
    const byId = await negocioById(negocioId);
    if (byId) return byId;
  }
  if (slug) return negocioBySlug(slug);
  return null;
}

async function upcomingBookingsByPhone({ slug, negocioId, phoneE164 }) {
  const negocio = await resolveNegocio({ slug, negocioId });
  if (!negocio?.id) return { negocio: null, bookings: [] };

  const today = todayIso();
  const needle = normalizePhoneKey(phoneE164);

  let rows = [];
  try {
    rows = await rest("citas", {
      query: {
        select: "id,name,phone,date,time,duration,service_name,status,business,slug,negocio_id",
        negocio_id: `eq.${negocio.id}`,
        date: `gte.${today}`,
        order: "date.asc,time.asc",
      },
    });
  } catch (err) {
    console.error("[bookings-lookup] citas", err);
    rows = [];
  }

  const bookings = (Array.isArray(rows) ? rows : [])
    .filter((row) => !isCancelledStatus(row.status))
    .filter((row) => phoneMatches(row.phone, needle))
    .map(publicBookingRow);

  return { negocio, bookings };
}

module.exports = {
  upcomingBookingsByPhone,
};
