(() => {
  async function postJson(body) {
    const res = await fetch("/api/booking/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!data?.message && !res.ok) {
      throw new Error("No se pudo completar la solicitud de WhatsApp.");
    }
    return data;
  }

  function tenantIds(booking) {
    return {
      slug: booking?.slug || window.Tenant?.slugFromLocation?.() || "",
      negocioId: booking?.negocioId || window.Tenant?.currentId?.() || "",
    };
  }

  async function syncCalendarConfig(calendarMessages) {
    const negocioId = window.Tenant?.currentId?.() || "";
    if (!negocioId || !calendarMessages) return { ok: false, skipped: true };
    return postJson({
      kind: "whatsapp-sync",
      negocioId,
      calendarMessages,
    });
  }

  async function sendTest({ messageType, phone, countryCode, calendarId, config }) {
    const ids = tenantIds();
    return postJson({
      kind: "whatsapp-send",
      messageType: messageType || "reminder",
      testPhone: String(phone || "").replace(/\D/g, ""),
      testCountryCode: countryCode || "+57",
      negocioId: ids.negocioId,
      slug: ids.slug,
      booking: config
        ? {
            calendar_id: calendarId || "barberhome",
            name: "María",
            phone: String(phone || "").replace(/\D/g, ""),
            date: "2026-07-24",
            time: "12:55",
            service_name: "Corte",
            business: config.businessName || "BarberCloud",
            meta: { countryCode: countryCode || "+57" },
          }
        : null,
    });
  }

  async function sendBookingConfirmation(booking, { respectDelay = true } = {}) {
    if (!booking?.phone) return { ok: false, skipped: true, message: "Sin teléfono." };
    const ids = tenantIds(booking);
    return postJson({
      kind: "whatsapp-send",
      messageType: "confirmation",
      respectDelay,
      negocioId: booking.negocioId || ids.negocioId,
      slug: booking.slug || ids.slug,
      booking: {
        id: booking.id,
        name: booking.name,
        phone: booking.phone,
        date: booking.date,
        time: booking.time,
        duration: booking.duration,
        service_name: booking.serviceName,
        status: booking.status,
        business: booking.business,
        calendar_id: booking.calendarId || "barberhome",
        slug: booking.slug,
        negocio_id: booking.negocioId,
        meta: {
          countryCode: booking.countryCode || "+57",
          createdAt: booking.createdAt || new Date().toISOString(),
          lifecycleStatus: booking.lifecycleStatus || "",
          confirmationStatus: booking.confirmationStatus || "",
          waMessages: booking.waMessages || {},
        },
      },
    });
  }

  window.WhatsAppService = {
    syncCalendarConfig,
    sendTest,
    sendBookingConfirmation,
  };
})();
