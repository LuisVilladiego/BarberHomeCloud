(function () {
  const AUTOAGENDA_KEY = "barbercloud.autoagenda";
  const ACTIVE_CAL_BASE = "barbercloud.active_calendar";
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
  function activeCalKey() {
    return window.Tenant?.scopedStorageKey?.(ACTIVE_CAL_BASE) || ACTIVE_CAL_BASE;
  }

  let activeCalendarId = localStorage.getItem(activeCalKey()) || "negocio";
  if (activeCalendarId === "barberhome" || activeCalendarId === "barbercloud") {
    activeCalendarId = "negocio";
    localStorage.setItem(activeCalKey(), "negocio");
  }
  let googleWeekEvents = [];
  let loadSeq = 0;

  function isPreviewMode() {
    if (window.Billing?.isRestricted) return window.Billing.isRestricted();
    return !window.Billing?.isActive?.();
  }

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
        const all = window.CalendarStore?.loadAll?.() || {};
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

  function businessName() {
    try {
      const auto = JSON.parse(localStorage.getItem("barbercloud.autoagenda") || "{}");
      if (auto.title) return String(auto.title);
    } catch {
      /* ignore */
    }
    return window.Tenant?.cached?.()?.name || "Mi barbería";
  }

  function availableCalendars() {
    if (isPreviewMode()) {
      return [{ id: "demo", label: "Calendario de prueba", type: "demo" }];
    }
    const list = [{ id: "negocio", label: businessName(), type: "local" }];
    const g = window.GoogleCalendar?.getConnection?.();
    list.push({
      id: "gmail",
      label: g?.email || "Google Calendar (sin conectar)",
      type: "google",
    });
    return list;
  }

  function isGoogleSource() {
    return activeCalendarId === "gmail";
  }

  function fillSourceSelect() {
    if (!sourceSelect) return;
    const calendars = availableCalendars();
    if (isPreviewMode()) {
      activeCalendarId = "demo";
    } else if (!calendars.some((c) => c.id === activeCalendarId)) {
      activeCalendarId = calendars[0]?.id || "negocio";
      localStorage.setItem(activeCalKey(), activeCalendarId);
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
    if (booking?.source === "google") return false;
    return true;
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

  function demoBookingsForWeek() {
    const days = weekDays();
    const todayIso = toISODate(new Date());
    const today = days.find((d) => toISODate(d) === todayIso) || days[2];
    const date = toISODate(today);
    return [
      {
        id: "demo-1",
        date,
        time: "10:00",
        duration: 60,
        name: "Cliente de ejemplo",
        serviceName: "Corte clásico",
        status: "confirmed",
        demo: true,
      },
      {
        id: "demo-2",
        date,
        time: "11:30",
        duration: 45,
        name: "Reserva de prueba",
        serviceName: "Corte + barba",
        status: "pending_confirmation",
        demo: true,
      },
      {
        id: "demo-3",
        date,
        time: "16:00",
        duration: 30,
        name: "Walk-in de ejemplo",
        serviceName: "Perfilado",
        status: "confirmed",
        demo: true,
      },
    ];
  }

  function bookingsForWeek() {
    const days = new Set(weekDays().map(toISODate));
    if (isPreviewMode()) {
      return demoBookingsForWeek().filter((b) => days.has(b.date));
    }
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
    if (isPreviewMode()) return;
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
        const shown = b.source === "google" ? "confirmed" : store.displayStatus?.(b) || b.status || "confirmed";
        const statusClass = b.source === "google" ? "" : ` gcal__event--${shown}`;
        cols += `<button type="button" class="gcal__event${googleClass}${statusClass}" data-booking-id="${escapeHtml(b.id)}" style="top:${top}px;height:${height}px" title="${escapeHtml(b.name)} · ${escapeHtml(statusLabel(shown))}">
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

  const APPT_STATUSES = [
    { id: "pending_confirmation", label: "Pendiente" },
    { id: "confirmed", label: "Confirmada" },
    { id: "in_service", label: "En servicio" },
    { id: "completed", label: "Completada" },
    { id: "cancelled", label: "Cancelada" },
    { id: "no_show", label: "No-show" },
  ];

  function statusLabel(status) {
    return APPT_STATUSES.find((s) => s.id === status)?.label || status || "Confirmada";
  }

  function openDetail(id) {
    const booking = findEventById(id);
    if (!booking) return;
    selectedBookingId = booking.source === "google" ? null : id;
    selectedEvent = booking;
    const isGoogle = booking.source === "google";
    const status = store.displayStatus?.(booking) || booking.status || "confirmed";
    const statusOptions = APPT_STATUSES.map(
      (s) =>
        `<option value="${s.id}" ${s.id === status ? "selected" : ""}>${s.label}</option>`
    ).join("");
    document.getElementById("appt-detail-body").innerHTML = `
      <p><strong>${escapeHtml(booking.serviceName || "Cita")}</strong></p>
      <p>${escapeHtml(booking.date)} · ${escapeHtml(booking.time)} (${booking.duration || 60} min)</p>
      <p><strong>Cliente:</strong> ${escapeHtml(booking.name || "—")}</p>
      <p><strong>WhatsApp:</strong> ${escapeHtml(booking.phone || "—")}</p>
      ${
        isGoogle
          ? `<p><strong>Estado:</strong> Google Calendar</p>`
          : `<label class="field"><span class="field__label">Estado</span>
             <select id="appt-status">${statusOptions}</select></label>
             <p class="section-lead">Al marcar <strong>Completada</strong> se suman ${window.LoyaltyEngine?.POINTS_PER_SERVICE || 5} puntos al cliente (si está en Puntos).</p>`
      }
      ${booking.notes ? `<p><strong>Notas:</strong> ${escapeHtml(booking.notes)}</p>` : ""}
      ${
        isGoogle && booking.htmlLink
          ? (() => {
              const href =
                window.Security?.safeExternalHref?.(booking.htmlLink) ||
                (/^https:\/\//i.test(String(booking.htmlLink || ""))
                  ? String(booking.htmlLink)
                  : "");
              return href
                ? `<p><a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">Abrir en Google Calendar</a></p>`
                : "";
            })()
          : ""
      }
    `;
    const completeBtn = document.getElementById("btn-complete-appt");
    if (completeBtn) {
      completeBtn.hidden =
        isGoogle || status === "completed" || status === "cancelled" || status === "no_show";
    }
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
    if (isPreviewMode()) {
      window.AppShell?.toast("Estas citas son de ejemplo. Activa tu plan para agendar las tuyas.");
      return;
    }
    if (isGoogleSource() && !window.GoogleCalendar?.isConnected?.()) {
      window.AppShell?.toast("Conecta Google Calendar desde Inicio para agendar aquí");
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
    localStorage.setItem(activeCalKey(), activeCalendarId);
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
    if (isGoogleSource() && !window.GoogleCalendar?.isConnected?.()) {
      window.AppShell?.toast("Conecta Google Calendar desde Inicio para agendar aquí");
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

    const businessLabel = businessName();
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
      calendarId: window.GoogleCalendar?.isConnected?.() || activeCalendarId === "gmail" ? "gmail" : activeCalendarId,
      googleSync: window.GoogleCalendar?.negocioWantsGoogle?.() ? "pending" : "",
    });

    submitBtn.disabled = false;
    submitBtn.textContent = "Guardar cita";

    if (!result.ok) {
      showError(result.message || "No se pudo agendar.");
      render();
      return;
    }

    closeModal();
    refreshCalendar();
    if (result.booking?.googleEventId) {
      window.AppShell?.toast(`Cita agendada en Google Calendar · ${name} · ${time}`);
    } else if (result.booking?.googleSync === "pending") {
      window.AppShell?.toast(`Cita guardada. Se enviará a Google Calendar al sincronizar · ${name}`);
    } else {
      window.AppShell?.toast(`Cita agendada · ${name} · ${time}`);
    }
  });

  document.getElementById("btn-complete-appt")?.addEventListener("click", () => {
    if (!selectedBookingId) return;
    applyStatus(selectedBookingId, "completed");
  });

  document.getElementById("appt-detail-body")?.addEventListener("change", (e) => {
    const sel = e.target.closest("#appt-status");
    if (!sel || !selectedBookingId) return;
    applyStatus(selectedBookingId, sel.value);
  });

  function applyStatus(id, status) {
    const prev = store.loadBookings().find((b) => b.id === id);
    if (!prev) return;
    const patch = { status };
    if (status === "pending_confirmation") {
      patch.lifecycleStatus = "scheduled";
      patch.confirmationStatus = "pending";
    } else if (status === "confirmed" || status === "in_service") {
      patch.lifecycleStatus = "scheduled";
      patch.confirmationStatus = "confirmed";
    } else if (status === "completed") {
      patch.lifecycleStatus = "completed";
    } else if (status === "cancelled") {
      patch.lifecycleStatus = "cancelled";
      patch.confirmationStatus = "declined";
    } else if (status === "no_show") {
      patch.lifecycleStatus = "no_show";
    }
    if (status === "completed") {
      const award = window.LoyaltyEngine?.awardForCompletedBooking?.(prev);
      if (award?.ok) {
        patch.pointsAwarded = true;
        window.AppShell?.toast(`Servicio completado · +${award.amount} puntos a ${award.user.name}`);
      } else if (award?.message && !award.skipped) {
        window.AppShell?.toast(award.message);
      } else if (award?.skipped && prev.pointsAwarded) {
        window.AppShell?.toast("Servicio completado");
      } else if (award?.skipped) {
        window.AppShell?.toast("Servicio completado. Falta el WhatsApp del cliente para sumar puntos.");
      } else {
        window.AppShell?.toast("Servicio completado");
      }
      patch.completedAt = new Date().toISOString();
    } else {
      window.AppShell?.toast(`Estado: ${statusLabel(status)}`);
    }
    store.patchBooking(id, patch);
    closeDetail();
    render();
  }

  document.getElementById("btn-cancel-appt")?.addEventListener("click", () => {
    if (!selectedBookingId) return;
    if (!confirm("¿Cancelar esta cita? El horario quedará libre.")) return;
    store.cancelBooking(selectedBookingId);
    closeDetail();
    render();
    window.AppShell?.toast("Cita cancelada · horario liberado");
  });

  function refreshCalendar() {
    if (isGoogleSource()) {
      renderAndLoad();
    } else {
      render();
    }
  }

  store.subscribe(() => {
    refreshCalendar();
  });

  window.addEventListener("barbercloud:bookings-changed", () => {
    refreshCalendar();
  });

  let stopCitasLive = null;

  function startLiveBookingsSync() {
    if (!window.SupabaseData?.startCitasLiveSync) return;
    stopCitasLive?.();
    stopCitasLive = window.SupabaseData.startCitasLiveSync({
      intervalMs: 4000,
      onChange: () => refreshCalendar(),
    });
  }

  function startCalendar() {
    fillServices();
    fillSourceSelect();
    renderAndLoad();

    if (isPreviewMode()) return;

    (async function bootCalendarSync() {
      try {
        await window.SupabaseData?.fetchOwnNegocio?.();
      } catch {
        /* ignore */
      }
      startLiveBookingsSync();
      if (window.GoogleCalendar?.isConnected?.()) {
        try {
          await window.GoogleCalendar.publishConnectionIfNeeded?.();
        } catch {
          /* ignore */
        }
        try {
          const sync = await window.GoogleCalendar.syncPendingBookings();
          if (sync?.synced) {
            window.AppShell?.toast?.(
              sync.synced === 1
                ? "1 cita enviada a Google Calendar"
                : `${sync.synced} citas enviadas a Google Calendar`
            );
            refreshCalendar();
          }
        } catch (err) {
          console.warn("[calendario] sync Google", err);
        }
      }
    })();
  }

  if (window.AppShell?.whenReady) window.AppShell.whenReady(startCalendar);
  else window.addEventListener("barbercloud:panel-ready", startCalendar, { once: true });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    updateNowIndicator();
    if (isGoogleSource()) {
      renderAndLoad();
      return;
    }
    window.SupabaseData?.syncCitasFromCloud?.().then((res) => {
      if (res?.changed) refreshCalendar();
    });
  });

  window.addEventListener("pagehide", () => {
    stopCitasLive?.();
    window.SupabaseData?.stopCitasLiveSync?.();
  });

  setInterval(updateNowIndicator, 30000);

  /** Mueve la semana visible hasta incluir la fecha ISO (p. ej. cita de prueba del tour). */
  function goToDate(isoDate) {
    if (!isoDate) return;
    const match = String(isoDate).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return;
    const d = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    if (Number.isNaN(d.getTime())) return;
    weekStart = startOfWeek(d);
    refreshCalendar();
  }

  window.BarberCalendar = {
    goToDate,
    refresh: refreshCalendar,
  };
})();
