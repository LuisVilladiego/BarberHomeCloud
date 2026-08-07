(function () {
  const AUTOAGENDA_KEY = "barbercloud.autoagenda";
  const ACTIVE_CAL_KEY = "barbercloud.active_calendar";
  const DAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
  const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  const START_HOUR = 5;
  const END_HOUR = 21;
  const SLOT_MIN = 30;
  const ROW_PX = 28;

  const store = window.BookingStore;
  if (!store) {
    console.error("BookingStore no cargó");
    return;
  }

  const headEl = document.getElementById("gcal-head");
  const bodyEl = document.getElementById("gcal-body");
  const monthSelect = document.getElementById("gcal-month");
  const sourceSelect = document.getElementById("gcal-source");
  const modal = document.getElementById("appt-modal");
  const detailModal = document.getElementById("appt-detail-modal");
  const form = document.getElementById("appt-form");
  const serviceSelect = document.getElementById("appt-service");
  const errorEl = document.getElementById("appt-error");
  const slotSummary = document.getElementById("appt-slot-summary");
  const cancelBtn = document.getElementById("btn-cancel-appt");

  let weekStart = startOfWeek(new Date());
  let selectedBookingId = null;
  let selectedEvent = null;
  let services = loadServices();
  let activeCalendarId = localStorage.getItem(ACTIVE_CAL_KEY) || "barberhome";
  let googleWeekEvents = [];
  let loadSeq = 0;

  function loadServices() {
    try {
      const cfg = JSON.parse(localStorage.getItem(AUTOAGENDA_KEY) || "{}");
      if (Array.isArray(cfg.appointmentTypes) && cfg.appointmentTypes.length) {
        return cfg.appointmentTypes;
      }
    } catch {
      /* ignore */
    }
    return [
      { id: "type-1", name: "Corte", duration: 60, price: 25000 },
      { id: "type-2", name: "Corte + Barba", duration: 60, price: 35000 },
    ];
  }

  function startOfWeek(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const day = (d.getDay() + 6) % 7; // Mon=0
    d.setDate(d.getDate() - day);
    return d;
  }

  function addDays(date, n) {
    const d = new Date(date);
    d.setDate(d.getDate() + n);
    return d;
  }

  function toISODate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function formatTimeLabel(minutes) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    let format = "12";
    try {
      const auto = JSON.parse(localStorage.getItem("barbercloud.autoagenda") || "{}");
      if (auto.timeFormat === "12" || auto.timeFormat === "24") format = auto.timeFormat;
      else {
        const all = JSON.parse(localStorage.getItem("barbercloud.calendar_configs") || "{}");
        const cfg =
          all.barberhome ||
          all.gmail ||
          all.barbercloud ||
          Object.values(all).find((c) => c && (c.timeFormat === "12" || c.timeFormat === "24"));
        if (cfg?.timeFormat === "12" || cfg?.timeFormat === "24") format = cfg.timeFormat;
      }
    } catch {
      /* ignore */
    }
    if (format === "24") {
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    }
    const suffix = h >= 12 ? "pm" : "am";
    const h12 = h % 12 || 12;
    return m === 0 ? `${h12}:00 ${suffix}` : `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
  }

  function minutesToHHMM(mins) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function weekDays() {
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  }

  function fillMonthSelect() {
    const year = weekStart.getFullYear();
    monthSelect.innerHTML = MONTHS.map(
      (label, idx) => `<option value="${idx}">${label}</option>`
    ).join("");
    monthSelect.value = String(weekStart.getMonth());
    monthSelect.dataset.year = String(year);
  }

  function fillServices() {
    services = loadServices();
    serviceSelect.innerHTML = services
      .map(
        (s) =>
          `<option value="${escapeHtml(s.id)}" data-duration="${s.duration || 60}" data-price="${s.price || 0}" data-name="${escapeHtml(s.name)}">${escapeHtml(s.name)} · ${s.duration || 60} min</option>`
      )
      .join("");
  }

  function availableCalendars() {
    const list = [
      { id: "barberhome", label: "BarberHome", type: "local" },
      { id: "barbercloud", label: "Calendario en BarberCloud", type: "local" },
    ];
    const g = window.GoogleCalendar?.getConnection?.();
    if (g?.email) {
      list.splice(1, 0, {
        id: "gmail",
        label: g.email,
        type: "google",
      });
    }
    return list;
  }

  function isGoogleSource() {
    return activeCalendarId === "gmail";
  }

  function fillSourceSelect() {
    if (!sourceSelect) return;
    const calendars = availableCalendars();
    if (!calendars.some((c) => c.id === activeCalendarId)) {
      activeCalendarId = calendars[0]?.id || "barberhome";
      localStorage.setItem(ACTIVE_CAL_KEY, activeCalendarId);
    }
    sourceSelect.innerHTML = calendars
      .map(
        (c) =>
          `<option value="${escapeHtml(c.id)}">${escapeHtml(c.label)}</option>`
      )
      .join("");
    sourceSelect.value = activeCalendarId;
  }

  function matchesLocalCalendar(booking) {
    const raw = String(booking.calendarId || booking.business || "barberhome").toLowerCase();
    if (activeCalendarId === "barberhome") {
      return (
        raw.includes("barberhome") ||
        raw === "barberhome" ||
        (!booking.calendarId && (!booking.business || booking.business === "BarberHome"))
      );
    }
    if (activeCalendarId === "barbercloud") {
      return (
        raw.includes("barbercloud") ||
        raw === "native" ||
        raw === "calendario en barbercloud"
      );
    }
    return false;
  }

  function extractPhone(text) {
    const m = String(text || "").match(/(\+?\d[\d\s().-]{7,}\d)/);
    return m ? m[1].replace(/\s+/g, " ").trim() : "";
  }

  function mapGoogleEvent(ev) {
    const summary = ev.summary || "Evento Google";
    const phone = extractPhone(summary) || extractPhone(ev.description || "");
    const name = summary.replace(phone, "").replace(/\s{2,}/g, " ").trim() || summary;
    const base = {
      id: `gcal-${ev.id}`,
      googleEventId: ev.id,
      name,
      phone,
      notes: ev.description || "",
      status: "google",
      source: "google",
      htmlLink: ev.htmlLink || "",
      calendarId: "gmail",
      googleCalendarId: ev.__calendarId || "",
    };

    // Eventos de todo el día (solo `date`, sin hora)
    if (!ev.start?.dateTime && ev.start?.date) {
      return {
        ...base,
        date: String(ev.start.date).slice(0, 10),
        time: "08:00",
        duration: 60,
        serviceName: "Todo el día",
        allDay: true,
      };
    }

    const startRaw = ev.start?.dateTime;
    if (!startRaw) return null;
    const start = new Date(startRaw);
    const end = new Date(ev.end?.dateTime || startRaw);
    let duration = Math.max(30, Math.round((end - start) / 60000) || 60);
    const hh = String(start.getHours()).padStart(2, "0");
    const mm = String(start.getMinutes()).padStart(2, "0");
    return {
      ...base,
      date: toISODate(start),
      time: `${hh}:${mm}`,
      duration,
      serviceName: "Google Calendar",
      allDay: false,
    };
  }

  async function refreshGoogleWeek() {
    if (!isGoogleSource()) {
      googleWeekEvents = [];
      return;
    }
    const api = window.GoogleCalendar;
    if (!api?.isConnected?.()) {
      googleWeekEvents = [];
      window.AppShell?.toast?.("Conecta Google Calendar desde Inicio");
      return;
    }
    const seq = ++loadSeq;
    const days = weekDays();
    const timeMin = new Date(days[0]);
    timeMin.setHours(0, 0, 0, 0);
    const timeMax = addDays(days[6], 1);
    timeMax.setHours(0, 0, 0, 0);
    try {
      // Todos los calendarios de la cuenta (no solo el principal)
      const items = await api.listEventsInRange({ timeMin, timeMax, maxResults: 250 });
      if (seq !== loadSeq) return;
      googleWeekEvents = items.map(mapGoogleEvent).filter(Boolean);
      try {
        await api.syncBusyCache?.();
      } catch {
        /* ignore */
      }
      if (!googleWeekEvents.length) {
        window.AppShell?.toast?.(
          "Sin eventos en esta semana. Prueba otra semana o reconecta Google."
        );
      } else {
        window.AppShell?.toast?.(`${googleWeekEvents.length} evento(s) de Google`);
      }
    } catch (err) {
      if (seq !== loadSeq) return;
      googleWeekEvents = [];
      const msg = String(err?.message || "No se pudieron cargar eventos de Google");
      window.AppShell?.toast?.(msg);
      console.error("[Google Calendar]", err);
    }
  }

  function bookingsForWeek() {
    const days = new Set(weekDays().map(toISODate));
    if (isGoogleSource()) {
      return googleWeekEvents.filter((b) => days.has(b.date));
    }
    return store
      .loadBookings()
      .filter((b) => store.isActive(b) && days.has(b.date) && matchesLocalCalendar(b));
  }

  function isSlotFreeInView(date, time, duration) {
    if (!isGoogleSource()) return store.isSlotFree(date, time, duration);
    const start = store.toMinutes(time);
    const end = start + (Number(duration) || SLOT_MIN);
    return !googleWeekEvents.some((b) => {
      if (b.date !== date) return false;
      const bStart = store.toMinutes(b.time);
      const bEnd = bStart + (Number(b.duration) || 60);
      return start < bEnd && bStart < end;
    });
  }

  async function renderAndLoad() {
    render();
    if (isGoogleSource()) {
      await refreshGoogleWeek();
      render();
    }
  }

  function nowOffsetPx(date = new Date()) {
    const mins = date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
    const start = START_HOUR * 60;
    const end = END_HOUR * 60;
    if (mins < start || mins > end) return null;
    return ((mins - start) / SLOT_MIN) * ROW_PX;
  }

  function updateNowIndicator() {
    document.querySelectorAll(".gcal__now, .gcal__now-marker").forEach((el) => el.remove());
    const todayIso = toISODate(new Date());
    const todayCol = bodyEl?.querySelector(`.gcal__col[data-date="${todayIso}"]`);
    const timesCol = bodyEl?.querySelector(".gcal__times");
    if (!todayCol || !timesCol) return;
    const top = nowOffsetPx();
    if (top == null) return;

    const marker = document.createElement("div");
    marker.className = "gcal__now-marker";
    marker.style.top = `${top}px`;
    marker.setAttribute("aria-hidden", "true");
    timesCol.appendChild(marker);

    const line = document.createElement("div");
    line.className = "gcal__now";
    line.style.top = `${top}px`;
    line.setAttribute("aria-hidden", "true");
    line.innerHTML = `<span class="gcal__now-dot"></span>`;
    todayCol.appendChild(line);
  }

  function render() {
    const days = weekDays();
    const todayIso = toISODate(new Date());

    headEl.innerHTML =
      `<div class="gcal__corner"></div>` +
      days
        .map((d) => {
          const iso = toISODate(d);
          const isToday = iso === todayIso;
          return `<div class="gcal__dayhead ${isToday ? "is-today" : ""}">
            <span>${DAY_LABELS[(d.getDay() + 6) % 7]} ${d.getDate()}</span>
          </div>`;
        })
        .join("");

    const totalSlots = ((END_HOUR - START_HOUR) * 60) / SLOT_MIN;
    let timeCol = `<div class="gcal__times">`;
    for (let i = 0; i < totalSlots; i++) {
      const mins = START_HOUR * 60 + i * SLOT_MIN;
      timeCol += `<div class="gcal__time ${mins % 60 === 0 ? "is-hour" : ""}">${
        mins % 60 === 0 ? formatTimeLabel(mins) : ""
      }</div>`;
    }
    timeCol += `</div>`;

    const bookings = bookingsForWeek();
    let cols = `<div class="gcal__cols">`;
    days.forEach((d) => {
      const iso = toISODate(d);
      const isToday = iso === todayIso;
      cols += `<div class="gcal__col ${isToday ? "is-today" : ""}" data-date="${iso}">`;
      for (let i = 0; i < totalSlots; i++) {
        const mins = START_HOUR * 60 + i * SLOT_MIN;
        const hhmm = minutesToHHMM(mins);
        const free = isSlotFreeInView(iso, hhmm, SLOT_MIN);
        cols += `<button type="button" class="gcal__slot ${free ? "" : "is-busy"}" data-date="${iso}" data-time="${hhmm}" aria-label="${iso} ${hhmm}"></button>`;
      }

      const dayBookings = bookings.filter((b) => b.date === iso);
      dayBookings.forEach((b) => {
        let start = store.toMinutes(b.time);
        let duration = Number(b.duration) || 60;
        const dayEnd = END_HOUR * 60;
        const dayStart = START_HOUR * 60;
        // Encajar eventos fuera del rango visible (antes de 5am / después de 9pm)
        if (start + duration <= dayStart) return;
        if (start >= dayEnd) {
          start = dayEnd - SLOT_MIN;
          duration = SLOT_MIN;
        } else if (start < dayStart) {
          duration = Math.max(SLOT_MIN, duration - (dayStart - start));
          start = dayStart;
        }
        if (start + duration > dayEnd) duration = Math.max(SLOT_MIN, dayEnd - start);
        const top = ((start - dayStart) / SLOT_MIN) * ROW_PX;
        const height = Math.max((duration / SLOT_MIN) * ROW_PX - 2, ROW_PX - 2);
        const googleClass = b.source === "google" ? " gcal__event--google" : "";
        cols += `<button type="button" class="gcal__event${googleClass}" data-booking-id="${escapeHtml(b.id)}" style="top:${top}px;height:${height}px" title="${escapeHtml(b.name)}">
          <strong>${escapeHtml(b.allDay ? "Todo el día" : b.time)} · ${escapeHtml(b.serviceName || "Cita")}</strong>
          <span>${escapeHtml(b.name || "")}</span>
        </button>`;
      });

      cols += `</div>`;
    });
    cols += `</div>`;

    bodyEl.innerHTML = timeCol + cols;
    fillMonthSelect();
    updateNowIndicator();
  }

  function openModal({ date, time } = {}) {
    fillServices();
    errorEl.hidden = true;
    form.reset();
    if (date) document.getElementById("appt-date").value = date;
    if (time) document.getElementById("appt-time").value = time;
    const svc = services[0];
    slotSummary.textContent = date && time
      ? `${date} · ${time}${svc ? ` · ${svc.duration || 60} min` : ""}`
      : "Completa fecha y hora";
    modal.hidden = false;
  }

  function closeModal() {
    modal.hidden = true;
  }

  function findEventById(id) {
    if (String(id).startsWith("gcal-")) {
      return googleWeekEvents.find((b) => b.id === id) || null;
    }
    return store.loadBookings().find((b) => b.id === id) || null;
  }

  function openDetail(id) {
    const booking = findEventById(id);
    if (!booking) return;
    selectedBookingId = booking.source === "google" ? null : id;
    selectedEvent = booking;
    const isGoogle = booking.source === "google";
    document.getElementById("appt-detail-body").innerHTML = `
      <p><strong>${escapeHtml(booking.serviceName || "Cita")}</strong></p>
      <p>${escapeHtml(booking.date)} · ${escapeHtml(booking.time)} (${booking.duration || 60} min)</p>
      <p><strong>Cliente:</strong> ${escapeHtml(booking.name || "—")}</p>
      <p><strong>WhatsApp:</strong> ${escapeHtml(booking.phone || "—")}</p>
      <p><strong>Estado:</strong> ${escapeHtml(isGoogle ? "Google Calendar" : booking.status || "confirmed")}</p>
      ${booking.notes ? `<p><strong>Notas:</strong> ${escapeHtml(booking.notes)}</p>` : ""}
      ${
        isGoogle && booking.htmlLink
          ? `<p><a href="${escapeHtml(booking.htmlLink)}" target="_blank" rel="noreferrer">Abrir en Google Calendar</a></p>`
          : ""
      }
    `;
    if (cancelBtn) cancelBtn.hidden = isGoogle;
    detailModal.hidden = false;
  }

  function closeDetail() {
    detailModal.hidden = true;
    selectedBookingId = null;
    selectedEvent = null;
    if (cancelBtn) cancelBtn.hidden = false;
  }

  function showError(msg) {
    errorEl.hidden = !msg;
    errorEl.textContent = msg || "";
  }

  bodyEl?.addEventListener("click", (e) => {
    const eventBtn = e.target.closest(".gcal__event");
    if (eventBtn) {
      openDetail(eventBtn.getAttribute("data-booking-id"));
      return;
    }
    const slot = e.target.closest(".gcal__slot");
    if (!slot) return;
    if (isGoogleSource()) {
      window.AppShell?.toast("Cambia a BarberHome o BarberCloud para crear citas aquí");
      return;
    }
    const date = slot.getAttribute("data-date");
    const time = slot.getAttribute("data-time");
    if (!store.isSlotFree(date, time, SLOT_MIN)) {
      window.AppShell?.toast("Ese horario ya está ocupado.");
      return;
    }
    openModal({ date, time });
  });

  document.getElementById("btn-gcal-prev")?.addEventListener("click", () => {
    weekStart = addDays(weekStart, -7);
    renderAndLoad();
  });
  document.getElementById("btn-gcal-next")?.addEventListener("click", () => {
    weekStart = addDays(weekStart, 7);
    renderAndLoad();
  });
  document.getElementById("btn-gcal-today")?.addEventListener("click", () => {
    weekStart = startOfWeek(new Date());
    renderAndLoad();
  });
  monthSelect?.addEventListener("change", () => {
    const month = Number(monthSelect.value);
    const year = weekStart.getFullYear();
    weekStart = startOfWeek(new Date(year, month, 1));
    renderAndLoad();
  });
  sourceSelect?.addEventListener("change", async () => {
    activeCalendarId = sourceSelect.value || "barberhome";
    localStorage.setItem(ACTIVE_CAL_KEY, activeCalendarId);
    googleWeekEvents = [];
    if (activeCalendarId === "gmail" && window.GoogleCalendar?.isConnected?.()) {
      try {
        await window.GoogleCalendar.syncBusyCache();
      } catch {
        /* ignore */
      }
    }
    renderAndLoad();
    const label = sourceSelect.selectedOptions[0]?.textContent || activeCalendarId;
    window.AppShell?.toast(`Viendo · ${label}`);
  });
  document.getElementById("btn-new-appt")?.addEventListener("click", () => {
    if (isGoogleSource()) {
      window.AppShell?.toast("Cambia a BarberHome o BarberCloud para crear citas");
      return;
    }
    openModal({});
  });
  document.getElementById("btn-gcal-view")?.addEventListener("click", () => {
    window.AppShell?.toast("Vista semana activa");
  });
  document.getElementById("btn-gcal-filter")?.addEventListener("click", () => {
    fillSourceSelect();
    sourceSelect?.focus();
    window.AppShell?.toast("Usa el selector de calendario a la izquierda");
  });

  modal?.querySelectorAll("[data-close-modal]").forEach((el) => {
    el.addEventListener("click", closeModal);
  });
  detailModal?.querySelectorAll("[data-close-detail]").forEach((el) => {
    el.addEventListener("click", closeDetail);
  });

  document.getElementById("appt-service")?.addEventListener("change", () => {
    const date = document.getElementById("appt-date").value;
    const time = document.getElementById("appt-time").value;
    const opt = serviceSelect.selectedOptions[0];
    slotSummary.textContent =
      date && time
        ? `${date} · ${time} · ${opt?.dataset.duration || 60} min`
        : "Completa fecha y hora";
  });

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    showError("");
    const submitBtn = document.getElementById("appt-submit");
    const opt = serviceSelect.selectedOptions[0];
    const duration = Number(opt?.dataset.duration || 60);
    const date = document.getElementById("appt-date").value;
    const time = document.getElementById("appt-time").value;
    const name = document.getElementById("appt-name").value.trim();
    const phone = document.getElementById("appt-phone").value.trim();

    if (!store.isSlotFree(date, time, duration)) {
      showError("Esa hora ya no está disponible. Elige otro horario.");
      render();
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Reservando…";

    const businessLabel =
      activeCalendarId === "barbercloud" ? "BarberCloud" : "BarberHome";
    const result = await store.bookAtomically({
      name,
      phone,
      date,
      time,
      duration,
      serviceId: opt?.value || "",
      serviceName: opt?.dataset.name || opt?.textContent || "Cita",
      price: Number(opt?.dataset.price || 0),
      notes: document.getElementById("appt-notes").value.trim(),
      status: "confirmed",
      source: "admin",
      business: businessLabel,
      calendarId: activeCalendarId,
    });

    submitBtn.disabled = false;
    submitBtn.textContent = "Guardar cita";

    if (!result.ok) {
      showError(result.message || "No se pudo agendar.");
      render();
      return;
    }

    closeModal();
    render();
    window.AppShell?.toast(`Cita agendada · ${name} · ${time}`);
  });

  document.getElementById("btn-cancel-appt")?.addEventListener("click", () => {
    if (!selectedBookingId) return;
    if (!confirm("¿Cancelar esta cita? El horario quedará libre.")) return;
    store.cancelBooking(selectedBookingId);
    closeDetail();
    render();
    window.AppShell?.toast("Cita cancelada · horario liberado");
  });

  store.subscribe(() => {
    if (!isGoogleSource()) render();
  });
  fillServices();
  fillSourceSelect();
  renderAndLoad();
  setInterval(updateNowIndicator, 30000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      updateNowIndicator();
      if (isGoogleSource()) renderAndLoad();
    }
  });
})();
