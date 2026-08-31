(function () {
  const STORAGE_KEY = "barbercloud.autoagenda";
  const BOOKINGS_KEY = "barbercloud.bookings";
  const LOYALTY_USERS_KEY = "barbercloud.loyalty_users";
  const LOYALTY_SESSION_KEY = "barbercloud.loyalty_session";
  const LOYALTY_HISTORY_KEY = "barbercloud.loyalty_history";
  const LOYALTY = {
    /** Usado solo para calcular el costo en pts de cada producto al canjear */
    pesosPerPoint: 800,
    earnPerService: 5,
    expireMonths: 12,
  };
  const MONTHS = [
    "Enero",
    "Febrero",
    "Marzo",
    "Abril",
    "Mayo",
    "Junio",
    "Julio",
    "Agosto",
    "Septiembre",
    "Octubre",
    "Noviembre",
    "Diciembre",
  ];
  const DAY_KEYS = ["dom", "lun", "mar", "mie", "jue", "vie", "sab"];
  const CAL_CONFIGS_KEY = "barbercloud.calendar_configs";

  function loadConfig() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function resolveTimeFormat() {
    try {
      const fromAuto = loadConfig().timeFormat;
      if (fromAuto === "12" || fromAuto === "24") return fromAuto;
      const all = JSON.parse(localStorage.getItem(CAL_CONFIGS_KEY) || "{}");
      const preferred =
        all.barberhome ||
        all.gmail ||
        all.barbercloud ||
        Object.values(all).find((c) => c && (c.timeFormat === "12" || c.timeFormat === "24"));
      if (preferred?.timeFormat === "12" || preferred?.timeFormat === "24") {
        return preferred.timeFormat;
      }
    } catch {
      /* ignore */
    }
    return "12";
  }

  function formatDisplayTime(hhmm, format = resolveTimeFormat()) {
    const [hRaw, mRaw] = String(hhmm || "0:0").split(":");
    let h = Number(hRaw);
    const m = Number(mRaw) || 0;
    if (Number.isNaN(h)) return hhmm;
    if (format === "24") {
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    }
    const suffix = h >= 12 ? "pm" : "am";
    const h12 = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
  }

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function toISODate(d) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function startOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  const params = new URLSearchParams(location.search);
  const slug =
    window.Tenant?.slugFromLocation?.() ||
    window.Tenant?.normalizeSlug?.(params.get("s") || "") ||
    params.get("s") ||
    "";
  let config = loadConfig();
  let types =
    Array.isArray(config.appointmentTypes) && config.appointmentTypes.length
      ? config.appointmentTypes
      : [{ id: "type-1", name: "Agendar cita", duration: 60, price: 0, scheduleId: "" }];
  let schedules = Array.isArray(config.schedules) ? config.schedules : [];

  const title = document.getElementById("public-title");
  const description = document.getElementById("public-description");
  const avatar = document.getElementById("public-avatar");
  const services = document.getElementById("public-services");
  const serviceStep = document.getElementById("service-step");
  const calendarStep = document.getElementById("calendar-step");
  const puntosStep = document.getElementById("puntos-step");
  const shopStep = document.getElementById("shop-step");
  const form = document.getElementById("booking-form");
  const ok = document.getElementById("public-ok");
  const serviceInput = document.getElementById("public-service");
  const dateInput = document.getElementById("public-date");
  const timeInput = document.getElementById("public-time");
  const phoneFullInput = document.getElementById("public-phone-full");
  const bookingCc = document.getElementById("booking-cc");
  const bookingPhoneLocal = document.getElementById("booking-phone-local");
  const bookingNameInput = document.getElementById("booking-name");
  const summaryService = document.getElementById("summary-service");
  const summaryDuration = document.getElementById("summary-duration");
  const summaryWhen = document.getElementById("summary-when");
  const calGrid = document.getElementById("cal-grid");
  const calMonthLabel = document.getElementById("cal-month-label");
  const bookTimes = document.getElementById("book-times");
  const bookCal = document.getElementById("book-cal");
  const timesGrid = document.getElementById("times-grid");
  const calPrev = document.getElementById("cal-prev");
  const calNext = document.getElementById("cal-next");
  const calLoading = document.getElementById("cal-loading");
  const calLoadingText = calLoading?.querySelector(".book-cal__loading-text");

  if (config.title) title.textContent = config.title;
  if (config.description) description.textContent = config.description;
  avatar.src = config.avatarDataUrl || "assets/barberhome-avatar.png";
  document.title = `${config.title || "Agendar"} · BarberCloud`;

  function rewardsBrand() {
    const name = String(config.title || "").trim();
    return name ? `${name} Rewards` : "Rewards";
  }

  function applyRewardsCopy() {
    const brand = rewardsBrand();
    document.querySelectorAll("[data-rewards-brand]").forEach((el) => {
      el.textContent = brand;
    });
  }

  function syncPublicExtras() {
    const shopBtn = document.getElementById("btn-shop");
    const puntosBtn = document.getElementById("btn-puntos");
    if (shopBtn) shopBtn.hidden = false;
    if (puntosBtn) puntosBtn.hidden = false;
  }

  applyRewardsCopy();
  syncPublicExtras();

  function applyPublicConfig(next) {
    config = next || {};
    types =
      Array.isArray(config.appointmentTypes) && config.appointmentTypes.length
        ? config.appointmentTypes
        : [{ id: "type-1", name: "Agendar cita", duration: 60, price: 0, scheduleId: "" }];
    schedules = Array.isArray(config.schedules) ? config.schedules : [];
    if (config.title && title) title.textContent = config.title;
    if (config.description && description) description.textContent = config.description;
    if (avatar) avatar.src = config.avatarDataUrl || "assets/barberhome-avatar.png";
    document.title = `${config.title || "Agendar"} · BarberCloud`;
    applyRewardsCopy();
    syncPublicExtras();
    renderServices();
  }

  function showPublicGate(kind) {
    const notFound = document.getElementById("public-not-found");
    const unavailable = document.getElementById("public-unavailable");
    hideAll();
    if (serviceStep) serviceStep.hidden = true;
    if (kind === "unavailable") {
      if (unavailable) unavailable.hidden = false;
      if (notFound) notFound.hidden = true;
      return;
    }
    if (notFound) notFound.hidden = false;
    if (unavailable) unavailable.hidden = true;
  }

  async function hydrateTenantPage() {
    if (!slug) return;
    if (!window.SupabaseData?.enabled?.()) return;
    const negocio = await window.SupabaseData.fetchNegocioBySlug(slug);
    if (negocio === undefined) return;
    if (!negocio) {
      showPublicGate("not-found");
      return;
    }
    if (!window.Tenant?.isNegocioActive?.(negocio)) {
      showPublicGate("unavailable");
      return;
    }
    window.Tenant?.setCurrent?.(negocio);
    const agenda = negocio.autoagenda && typeof negocio.autoagenda === "object" ? negocio.autoagenda : {};
    applyPublicConfig({ ...agenda, slug: negocio.slug, title: agenda.title || negocio.name });
    if (window.SupabaseData?.enabled?.()) {
      window.BookingStore?.setAvailabilitySource?.("occupancy_only");
    }
    try {
      await refreshPublicOccupancy(negocio.slug);
      const sale = await window.SupabaseData.fetchProductosPorSlug?.(negocio.slug, "sale");
      const redeem = await window.SupabaseData.fetchProductosPorSlug?.(negocio.slug, "redeem");
      localStorage.setItem("barbercloud.marketplace_products", JSON.stringify(Array.isArray(sale) ? sale : []));
      localStorage.setItem(
        "barbercloud.loyalty_redeem_products",
        JSON.stringify(Array.isArray(redeem) ? redeem : [])
      );
    } catch (err) {
      console.warn("[booking] ocupacion/productos", err);
    }
  }

  async function refreshPublicOccupancy(tenantSlug) {
    const s = tenantSlug || slug;
    if (!s || !window.SupabaseData?.enabled?.()) return;
    try {
      const slots = await window.SupabaseData.fetchOcupacion?.(s);
      window.BookingStore?.setOccupancy?.(Array.isArray(slots) ? slots : []);
    } catch (err) {
      console.warn("[booking] ocupacion", err);
    }
  }

  let occupancyPollId = null;
  const OCCUPANCY_POLL_MS = 4000;

  function startOccupancyPolling() {
    stopOccupancyPolling();
    if (!slug || !window.SupabaseData?.enabled?.()) return;
    occupancyPollId = setInterval(() => {
      if (!isAvailabilityViewActive()) return;
      refreshPublicOccupancy(slug);
    }, OCCUPANCY_POLL_MS);
  }

  function stopOccupancyPolling() {
    if (occupancyPollId) {
      clearInterval(occupancyPollId);
      occupancyPollId = null;
    }
  }

  let selectedType = null;
  let viewMonth = startOfDay(new Date());
  viewMonth.setDate(1);
  let selectedDate = null;
  let selectedTime = null;
  let isBookingSubmitting = false;
  const bookingSubmitBtn = document.getElementById("booking-submit-btn");
  const bookingLoading = document.getElementById("booking-loading");
  const bookingSubmitLabel = bookingSubmitBtn?.querySelector(".booking-submit__label");

  function formatSummaryWhen(dateIso, time) {
    try {
      const d = new Date(`${dateIso}T${time || "12:00"}:00`);
      const datePart = d.toLocaleDateString("es-CO", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      });
      const timePart = formatDisplayTime(time || "12:00");
      return `${datePart} · ${timePart}`;
    } catch {
      return `${dateIso} ${formatDisplayTime(time || "")}`.trim();
    }
  }

  function fillBookingSummary() {
    if (summaryService) summaryService.textContent = selectedType?.name || "Cita";
    if (summaryDuration) summaryDuration.textContent = `${selectedType?.duration || 60} min`;
    if (summaryWhen) summaryWhen.textContent = formatSummaryWhen(selectedDate, selectedTime);
  }

  function hideAll() {
    stopAvailabilityPolling();
    serviceStep.hidden = true;
    calendarStep.hidden = true;
    puntosStep.hidden = true;
    if (shopStep) shopStep.hidden = true;
    const lookupStep = document.getElementById("lookup-step");
    if (lookupStep) lookupStep.hidden = true;
    form.hidden = true;
    ok.hidden = true;
    const nf = document.getElementById("public-not-found");
    const un = document.getElementById("public-unavailable");
    if (nf) nf.hidden = true;
    if (un) un.hidden = true;
  }

  function closeTimesOverlay() {
    bookTimes.hidden = true;
    bookCal?.classList.remove("is-picking-time");
    selectedDate = null;
    selectedTime = null;
    if (dateInput) dateInput.value = "";
    if (timeInput) timeInput.value = "";
    renderCalendar();
  }

  function showServices() {
    hideAll();
    serviceStep.hidden = false;
    selectedType = null;
    closeTimesOverlay();
  }

  window.addEventListener("booking:show-services", showServices);

  async function showCalendar() {
    hideAll();
    calendarStep.hidden = false;
    document.getElementById("calendar-service-name").textContent =
      selectedType?.name || "Agendar cita";
    document.getElementById("calendar-service-duration").textContent = `${
      selectedType?.duration || 60
    } min`;
    setCalendarLoading(true, "Cargando días disponibles…");
    closeTimesOverlay();
    try {
      await refreshGoogleBusyIfNeeded({ force: true });
      renderCalendar();
    } finally {
      setCalendarLoading(false);
    }
    startAvailabilityPolling();
  }

  function getScheduleForType() {
    if (!selectedType) return null;
    return (
      schedules.find((s) => s.id === selectedType.scheduleId) ||
      schedules[0] ||
      null
    );
  }

  function isDayOpen(date) {
    const schedule = getScheduleForType();
    if (!schedule || !schedule.days) {
      // Por defecto: lun–sáb
      const dow = date.getDay();
      return dow >= 1 && dow <= 6;
    }
    const key = DAY_KEYS[date.getDay()];
    const day = schedule.days[key];
    return !!(day && day.enabled);
  }

  function usesGoogleBusy() {
    return !!window.GoogleCalendar?.usesGoogleAvailability?.();
  }

  function isSlotOpen(dateIso, time, duration) {
    if (window.BookingStore && !window.BookingStore.isSlotFree(dateIso, time, duration)) {
      return false;
    }
    if (usesGoogleBusy() && window.GoogleCalendar?.isSlotBusy?.(dateIso, time, duration)) {
      return false;
    }
    return true;
  }

  function isDateAvailable(date) {
    const today = startOfDay(new Date());
    const d = startOfDay(date);
    if (d < today) return false;
    if (!isDayOpen(d)) return false;
    // Solo disponible si queda al menos un hueco libre (horarios + Google/local)
    return buildTimeSlots(d).length > 0;
  }

  let busySyncPromise = null;
  let availabilityPollId = null;
  let lastBusyFingerprint = "";
  let calendarLoadingCount = 0;
  const AVAILABILITY_POLL_MS = 5000;

  function setCalendarLoading(active, message) {
    if (active) {
      calendarLoadingCount += 1;
      if (message && calLoadingText) calLoadingText.textContent = message;
    } else {
      calendarLoadingCount = Math.max(0, calendarLoadingCount - 1);
    }
    const isLoading = calendarLoadingCount > 0;
    if (calLoading) calLoading.hidden = !isLoading;
    bookCal?.classList.toggle("is-loading", isLoading);
    if (calPrev) calPrev.disabled = isLoading || calPrev.classList.contains("is-disabled");
  }

  function busyFingerprint() {
    try {
      const cache = window.GoogleCalendar?.loadBusyCache?.();
      if (!cache) return "";
      const blocks = Array.isArray(cache.blocks) ? cache.blocks : [];
      return `${cache.updatedAt || ""}|${blocks.length}|${blocks
        .map((b) => `${b.date}:${b.startMin}-${b.endMin}`)
        .join(",")}`;
    } catch {
      return "";
    }
  }

  function isAvailabilityViewActive() {
    return !!(calendarStep && !calendarStep.hidden);
  }

  function applyAvailabilityToUI() {
    if (!isAvailabilityViewActive()) return;
    const keepDate = selectedDate;
    const keepTime = selectedTime;
    renderCalendar();

    if (!keepDate) return;

    // Si el día ya no tiene huecos, cerrar overlay de horas
    const dateObj = new Date(`${keepDate}T12:00:00`);
    if (!isDateAvailable(dateObj)) {
      selectedDate = null;
      selectedTime = null;
      if (dateInput) dateInput.value = "";
      if (timeInput) timeInput.value = "";
      bookTimes.hidden = true;
      bookCal?.classList.remove("is-picking-time");
      return;
    }

    selectedDate = keepDate;
    if (keepTime && !isSlotOpen(keepDate, keepTime, selectedType?.duration || 60)) {
      selectedTime = null;
      if (timeInput) timeInput.value = "";
    } else {
      selectedTime = keepTime;
    }
    renderTimes();
  }

  async function refreshGoogleBusyIfNeeded({ force = false } = {}) {
    const api = window.GoogleCalendar;
    if (!api?.isConnected?.()) return null;
    if (busySyncPromise) return busySyncPromise;
    try {
      if (!force) {
        const cache = api.loadBusyCache?.();
        const age = cache?.updatedAt ? Date.now() - new Date(cache.updatedAt).getTime() : Infinity;
        if (Number.isFinite(age) && age < 5 * 1000) return cache;
      }
      busySyncPromise = api.syncBusyCache();
      const cache = await busySyncPromise;
      return cache;
    } catch (err) {
      console.warn("[booking] No se pudo refrescar ocupación Google", err);
      return null;
    } finally {
      busySyncPromise = null;
    }
  }

  async function pollAvailability({ force = true } = {}) {
    if (!isAvailabilityViewActive()) return;
    if (!window.GoogleCalendar?.isConnected?.()) return;
    const before = busyFingerprint();
    await refreshGoogleBusyIfNeeded({ force });
    const after = busyFingerprint();
    if (!lastBusyFingerprint) lastBusyFingerprint = after;
    if (before !== after || lastBusyFingerprint !== after) {
      lastBusyFingerprint = after;
      applyAvailabilityToUI();
    }
  }

  function startAvailabilityPolling() {
    stopAvailabilityPolling();
    lastBusyFingerprint = busyFingerprint();
    startOccupancyPolling();
    refreshPublicOccupancy(slug);
    // Primera pasada rápida y luego cada 5s mientras estés en calendario/horas
    availabilityPollId = setInterval(() => {
      pollAvailability({ force: true });
    }, AVAILABILITY_POLL_MS);
  }

  function stopAvailabilityPolling() {
    stopOccupancyPolling();
    if (availabilityPollId) {
      clearInterval(availabilityPollId);
      availabilityPollId = null;
    }
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden || !isAvailabilityViewActive()) return;
    refreshPublicOccupancy(slug);
    pollAvailability({ force: true });
  });

  window.addEventListener("storage", (e) => {
    if (e.key !== "barbercloud.google_busy_cache" && e.key !== "barbercloud.bookings") return;
    if (!isAvailabilityViewActive()) return;
    applyAvailabilityToUI();
  });

  window.BookingStore?.subscribe?.((ev) => {
    if (!isAvailabilityViewActive()) return;
    if (ev?.type === "occupancy" || ev?.type === "bookings-updated" || ev?.type === "bookings-external-sync") {
      applyAvailabilityToUI();
    }
  });

  function renderCalendar() {
    const year = viewMonth.getFullYear();
    const month = viewMonth.getMonth();
    calMonthLabel.textContent = `${MONTHS[month]}, ${year}`;

    const today = startOfDay(new Date());
    const first = new Date(year, month, 1);
    // Monday-first index: Mon=0 ... Sun=6
    const startOffset = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const canGoPrev =
      year > today.getFullYear() ||
      (year === today.getFullYear() && month > today.getMonth());
    calPrev.disabled = !canGoPrev;
    calPrev.classList.toggle("is-disabled", !canGoPrev);

    let html = "";
    for (let i = 0; i < startOffset; i++) {
      html += `<span class="book-cal__cell book-cal__cell--empty"></span>`;
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const iso = toISODate(date);
      const available = isDateAvailable(date);
      const isToday = toISODate(date) === toISODate(today);
      const isSelected = selectedDate === iso;
      const classes = [
        "book-cal__cell",
        available ? "is-available" : "is-disabled",
        isToday ? "is-today" : "",
        isSelected ? "is-selected" : "",
      ]
        .filter(Boolean)
        .join(" ");

      if (available) {
        html += `<button type="button" class="${classes}" data-date="${iso}" aria-label="${iso}" aria-pressed="${isSelected}">${day}</button>`;
      } else {
        html += `<span class="${classes}" aria-hidden="true">${day}</span>`;
      }
    }

    calGrid.innerHTML = html;
  }

  function buildTimeSlots(date) {
    const schedule = getScheduleForType();
    const key = DAY_KEYS[date.getDay()];
    let start = "09:00";
    let end = "18:00";
    if (schedule?.days?.[key]?.enabled) {
      start = schedule.days[key].start || schedule.days[key].from || start;
      end = schedule.days[key].end || schedule.days[key].to || end;
    } else if (schedule?.days && !schedule.days[key]?.enabled) {
      return [];
    }
    const duration = selectedType?.duration || 60;
    const slots = [];
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    let mins = sh * 60 + sm;
    const endMins = eh * 60 + em;
    while (mins + duration <= endMins) {
      slots.push(`${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`);
      mins += duration;
    }
    // Si es hoy, filtrar horas pasadas
    const todayIso = toISODate(new Date());
    let available = slots;
    if (toISODate(date) === todayIso) {
      const now = new Date();
      const nowMins = now.getHours() * 60 + now.getMinutes();
      available = slots.filter((t) => {
        const [h, m] = t.split(":").map(Number);
        return h * 60 + m > nowMins + 30;
      });
    }
    // Ocultar horarios tomados en BarberCloud y/o Google Calendar
    const iso = toISODate(date);
    available = available.filter((t) => isSlotOpen(iso, t, duration));
    return available;
  }

  function renderTimes() {
    if (!selectedDate) {
      bookTimes.hidden = true;
      bookCal?.classList.remove("is-picking-time");
      return;
    }
    const date = new Date(selectedDate + "T12:00:00");
    const slots = buildTimeSlots(date);
    bookTimes.hidden = false;
    bookCal?.classList.add("is-picking-time");
    timesGrid.innerHTML = slots.length
      ? slots
          .map(
            (t) => `
          <button type="button" class="book-time ${selectedTime === t ? "is-selected" : ""}" data-time="${t}">
            ${formatDisplayTime(t)}
          </button>`
          )
          .join("")
      : `<p class="public-desc">No hay horarios disponibles este día.</p>`;
  }

  function renderServices() {
    services.innerHTML = types
      .map(
        (t) => `
        <button type="button" class="service-row" data-service="${t.id}">
          <span class="service-row__body">
            <span class="service-row__name">${t.name}</span>
            <span class="service-row__duration">${t.duration} min</span>
          </span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="m9 6 6 6-6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>`
      )
      .join("");
  }

  renderServices();
  hydrateTenantPage().catch((err) => console.warn("[booking] tenant", err));

  services.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-service]");
    if (!btn) return;
    selectedType = types.find((t) => t.id === btn.getAttribute("data-service"));
    if (!selectedType) return;
    serviceInput.value = selectedType.id;
    showCalendar();
  });

  calPrev.addEventListener("click", async () => {
    if (calPrev.disabled) return;
    viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1);
    setCalendarLoading(true, "Cargando días disponibles…");
    try {
      await refreshGoogleBusyIfNeeded();
      renderCalendar();
    } finally {
      setCalendarLoading(false);
    }
  });

  calNext.addEventListener("click", async () => {
    viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1);
    setCalendarLoading(true, "Cargando días disponibles…");
    try {
      await refreshGoogleBusyIfNeeded();
      renderCalendar();
    } finally {
      setCalendarLoading(false);
    }
  });

  calGrid.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-date]");
    if (!btn) return;
    selectedDate = btn.getAttribute("data-date");
    selectedTime = null;
    dateInput.value = selectedDate;
    timeInput.value = "";
    form.hidden = true;
    ok.hidden = true;
    setCalendarLoading(true, "Cargando horarios disponibles…");
    try {
      await refreshGoogleBusyIfNeeded({ force: true });
      lastBusyFingerprint = busyFingerprint();
      renderCalendar();
      renderTimes();
    } finally {
      setCalendarLoading(false);
    }
    startAvailabilityPolling();
  });

  timesGrid.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-time]");
    if (!btn) return;
    selectedTime = btn.getAttribute("data-time");
    timeInput.value = selectedTime;
    fillBookingSummary();
    // Solo aquí se muestra el formulario de datos
    hideAll();
    bookTimes.hidden = true;
    bookCal?.classList.remove("is-picking-time");
    form.hidden = false;
  });

  // Por si el navegador intenta validar el form oculto
  form.setAttribute("novalidate", "");
  form.addEventListener(
    "invalid",
    (e) => {
      if (form.hidden) e.preventDefault();
    },
    true
  );

  /* —— Tienda pública (productos del Marketplace admin) —— */
  const PRODUCTS_KEY = "barbercloud.marketplace_products";
  const REDEEM_PRODUCTS_KEY = "barbercloud.loyalty_redeem_products";
  const CART_KEY = "barbercloud.marketplace_cart";
  const REDEEM_CART_KEY = "barbercloud.loyalty_redeem_cart";
  const SALES_KEY = "barbercloud.marketplace_sales";
  const PRODUCT_REDEEMS_KEY = "barbercloud.loyalty_product_redemptions";
  const PLACEHOLDER =
    "data:image/svg+xml," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect fill="#f3f4f6" width="640" height="480"/><text x="320" y="250" text-anchor="middle" fill="#9ca3af" font-family="sans-serif" font-size="22">Sin imagen</text></svg>`
    );
  const publicShopGrid = document.getElementById("public-shop-grid");
  const publicCartPanel = document.getElementById("public-cart-panel");
  const publicCartList = document.getElementById("public-cart-list");
  const publicCartTotal = document.getElementById("public-cart-total");
  const publicCartBadge = document.getElementById("public-cart-badge");
  const redeemCartPanel = document.getElementById("redeem-cart-panel");
  const redeemCartList = document.getElementById("redeem-cart-list");
  const redeemCartTotal = document.getElementById("redeem-cart-total");
  const redeemCartBadge = document.getElementById("redeem-cart-badge");
  const redeemCartBalanceHint = document.getElementById("redeem-cart-balance-hint");

  function loadShopProducts() {
    try {
      const list = JSON.parse(localStorage.getItem(PRODUCTS_KEY) || "[]");
      if (!Array.isArray(list)) return [];
      return list.map((p) => ({
        ...p,
        stock: Number.isFinite(Number(p.stock)) ? Math.max(0, Number(p.stock)) : 10,
      }));
    } catch {
      return [];
    }
  }

  function loadRedeemProducts() {
    try {
      const raw = localStorage.getItem(REDEEM_PRODUCTS_KEY);
      if (raw === null) {
        return loadShopProducts().map((p) => ({
          id: `redeem-${p.id}`,
          name: p.name,
          description: p.description,
          pointsCost: pointsCostForProduct(p.price),
          stock: Number.isFinite(Number(p.stock)) ? Math.max(0, Number(p.stock)) : 0,
          images: Array.isArray(p.images) ? [...p.images] : [],
          createdAt: p.createdAt || new Date().toISOString(),
        }));
      }
      const list = JSON.parse(raw || "[]");
      if (!Array.isArray(list)) return [];
      return list.map((p) => ({
        ...p,
        stock: Number.isFinite(Number(p.stock)) ? Math.max(0, Number(p.stock)) : 0,
        pointsCost: Math.max(1, Number(p.pointsCost) || 1),
      }));
    } catch {
      return [];
    }
  }

  function saveRedeemProducts(list) {
    localStorage.setItem(REDEEM_PRODUCTS_KEY, JSON.stringify(list));
  }

  function saveShopProducts(list) {
    localStorage.setItem(PRODUCTS_KEY, JSON.stringify(list));
  }

  function loadShopSales() {
    try {
      const list = JSON.parse(localStorage.getItem(SALES_KEY) || "[]");
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }

  function saveShopSales(list) {
    localStorage.setItem(SALES_KEY, JSON.stringify(list.slice(0, 500)));
  }

  function loadShopCart() {
    try {
      const list = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }

  function saveShopCart(list) {
    localStorage.setItem(CART_KEY, JSON.stringify(list));
  }

  function formatShopMoney(amount) {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      maximumFractionDigits: 0,
    }).format(Number(amount) || 0);
  }

  function escapeShopHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function updatePublicCartBadge() {
    const qty = loadShopCart().reduce((sum, item) => sum + (item.qty || 0), 0);
    if (!publicCartBadge) return;
    publicCartBadge.textContent = String(qty);
    publicCartBadge.hidden = qty <= 0;
  }

  function publicCarouselHtml(product) {
    const images = product.images?.length ? product.images : [PLACEHOLDER];
    const slides = images
      .map(
        (src, i) =>
          `<img class="mkt-carousel__slide ${i === 0 ? "is-active" : ""}" src="${src}" alt="${escapeShopHtml(
            product.name
          )}" data-index="${i}" />`
      )
      .join("");
    const dots =
      images.length > 1
        ? `<div class="mkt-carousel__dots">${images
            .map(
              (_, i) =>
                `<button type="button" class="mkt-carousel__dot ${
                  i === 0 ? "is-active" : ""
                }" data-dot="${i}" aria-label="Imagen ${i + 1}"></button>`
            )
            .join("")}</div>`
        : "";
    const nav =
      images.length > 1
        ? `<button type="button" class="mkt-carousel__nav mkt-carousel__nav--prev" data-dir="-1" aria-label="Anterior">‹</button>
           <button type="button" class="mkt-carousel__nav mkt-carousel__nav--next" data-dir="1" aria-label="Siguiente">›</button>`
        : "";
    return `<div class="mkt-carousel" data-index="0">${slides}${nav}${dots}</div>`;
  }

  function setPublicCarouselIndex(root, index) {
    const slides = [...root.querySelectorAll(".mkt-carousel__slide")];
    const dots = [...root.querySelectorAll(".mkt-carousel__dot")];
    if (!slides.length) return;
    const next = ((index % slides.length) + slides.length) % slides.length;
    slides.forEach((el, i) => el.classList.toggle("is-active", i === next));
    dots.forEach((el, i) => el.classList.toggle("is-active", i === next));
    root.dataset.index = String(next);
  }

  function handlePublicCarouselClick(e) {
    const carousel = e.target.closest(".mkt-carousel");
    if (!carousel) return false;
    const current = Number(carousel.dataset.index || 0);
    const dirBtn = e.target.closest("[data-dir]");
    if (dirBtn) {
      setPublicCarouselIndex(carousel, current + Number(dirBtn.getAttribute("data-dir")));
      return true;
    }
    const dot = e.target.closest("[data-dot]");
    if (dot) {
      setPublicCarouselIndex(carousel, Number(dot.getAttribute("data-dot")));
      return true;
    }
    return false;
  }

  function initCarouselSwipe(container) {
    if (!container || container.dataset.carouselSwipe) return;
    container.dataset.carouselSwipe = "1";
    container.addEventListener(
      "touchstart",
      (e) => {
        const carousel = e.target.closest(".mkt-carousel");
        if (!carousel) return;
        carousel.dataset.touchStart = String(e.changedTouches[0].clientX);
      },
      { passive: true }
    );
    container.addEventListener(
      "touchend",
      (e) => {
        const carousel = e.target.closest(".mkt-carousel");
        if (!carousel || carousel.dataset.touchStart == null) return;
        const dx = e.changedTouches[0].clientX - Number(carousel.dataset.touchStart);
        delete carousel.dataset.touchStart;
        const slides = carousel.querySelectorAll(".mkt-carousel__slide");
        if (slides.length <= 1 || Math.abs(dx) < 36) return;
        const current = Number(carousel.dataset.index || 0);
        setPublicCarouselIndex(carousel, current + (dx < 0 ? 1 : -1));
      },
      { passive: true }
    );
  }

  async function refreshPublicProducts() {
    const s =
      window.Tenant?.slugFromLocation?.() ||
      window.Tenant?.normalizeSlug?.(new URLSearchParams(location.search).get("s") || "") ||
      "";
    if (s && window.SupabaseData?.enabled?.()) {
      try {
        const sale = await window.SupabaseData.fetchProductosPorSlug?.(s, "sale");
        localStorage.setItem(
          "barbercloud.marketplace_products",
          JSON.stringify(Array.isArray(sale) ? sale : [])
        );
      } catch (err) {
        console.warn("[booking] refresh productos", err);
      }
    }
    return loadShopProducts();
  }

  function renderPublicShop() {
    const products = loadShopProducts();
    updatePublicCartBadge();
    closePublicCart();

    if (!publicShopGrid) return;
    if (!products.length) {
      publicShopGrid.innerHTML = `
        <div class="mkt-empty">
          <strong>Pronto habrá productos</strong>
          <p>Aún no hay artículos publicados en la tienda.</p>
        </div>`;
      return;
    }

    publicShopGrid.innerHTML = products
      .map((p) => {
        const stock = Number(p.stock) || 0;
        const soldOut = stock <= 0;
        return `
      <article class="mkt-product public-shop-item" data-id="${escapeShopHtml(p.id)}">
        ${publicCarouselHtml(p)}
        <div class="mkt-product__body">
          <div class="mkt-product__top">
            <h3>${escapeShopHtml(p.name)}</h3>
            <strong class="mkt-product__price">${formatShopMoney(p.price)}</strong>
          </div>
          <span class="mkt-stock ${soldOut ? "mkt-stock--out" : stock <= 5 ? "mkt-stock--low" : ""}">${
            soldOut ? "Agotado" : `${stock} disponibles`
          }</span>
          <p class="mkt-product__desc">${escapeShopHtml(p.description)}</p>
          <div class="mkt-product__actions">
            <button class="btn btn--primary btn--block" type="button" data-add-cart ${
              soldOut ? "disabled" : ""
            }>
              ${soldOut ? "Agotado" : "Agregar al carrito"}
            </button>
          </div>
        </div>
      </article>`;
      })
      .join("");
  }

  function renderPublicCart() {
    const cart = loadShopCart();
    const products = loadShopProducts();
    const byId = Object.fromEntries(products.map((p) => [p.id, p]));
    updatePublicCartBadge();

    if (!cart.length) {
      if (publicCartList) {
        publicCartList.innerHTML = `<p class="public-desc public-desc--block">Tu carrito está vacío.</p>`;
      }
      if (publicCartTotal) publicCartTotal.textContent = formatShopMoney(0);
      return;
    }

    let total = 0;
    if (publicCartList) {
      publicCartList.innerHTML = cart
        .map((item) => {
          const product = byId[item.productId];
          if (!product) return "";
          const line = (Number(product.price) || 0) * (item.qty || 1);
          total += line;
          const img = product.images?.[0] || PLACEHOLDER;
          return `
            <article class="mkt-cart-item" data-cart-id="${escapeShopHtml(item.productId)}">
              <img src="${img}" alt="" />
              <div class="mkt-cart-item__body">
                <strong>${escapeShopHtml(product.name)}</strong>
                <span>${formatShopMoney(product.price)}</span>
                <div class="mkt-qty">
                  <button type="button" data-qty="-1" aria-label="Menos">−</button>
                  <span>${item.qty}</span>
                  <button type="button" data-qty="1" aria-label="Más">+</button>
                </div>
              </div>
              <div class="mkt-cart-item__side">
                <strong>${formatShopMoney(line)}</strong>
                <button type="button" class="btn btn--secondary btn--sm" data-remove-cart>Quitar</button>
              </div>
            </article>`;
        })
        .join("");
    }
    if (publicCartTotal) publicCartTotal.textContent = formatShopMoney(total);
  }

  function addToPublicCart(productId) {
    const products = loadShopProducts();
    const product = products.find((p) => p.id === productId);
    if (!product || (Number(product.stock) || 0) <= 0) {
      window.AppShell?.toast?.("Producto sin stock");
      return;
    }
    const cart = loadShopCart();
    const existing = cart.find((c) => c.productId === productId);
    const nextQty = (existing?.qty || 0) + 1;
    if (nextQty > (Number(product.stock) || 0)) {
      window.AppShell?.toast?.("No hay más unidades disponibles");
      return;
    }
    if (existing) existing.qty = nextQty;
    else cart.push({ productId, qty: 1 });
    saveShopCart(cart);
    updatePublicCartBadge();
    window.AppShell?.toast?.("Agregado al carrito");
  }

  publicShopGrid?.addEventListener("click", (e) => {
    const card = e.target.closest(".public-shop-item");
    if (!card) return;
    const id = card.getAttribute("data-id");

    if (e.target.closest("[data-add-cart]")) {
      addToPublicCart(id);
      return;
    }

    handlePublicCarouselClick(e);
  });
  initCarouselSwipe(publicShopGrid);

  function openPublicCart() {
    if (!publicCartPanel) return;
    renderPublicCart();
    publicCartPanel.hidden = false;
    document.body.classList.add("public-cart-open");
  }

  function closePublicCart() {
    if (!publicCartPanel) return;
    publicCartPanel.hidden = true;
    document.body.classList.remove("public-cart-open");
  }

  document.getElementById("btn-public-cart")?.addEventListener("click", openPublicCart);
  document.querySelectorAll("[data-close-public-cart]").forEach((el) => {
    el.addEventListener("click", closePublicCart);
  });

  publicCartList?.addEventListener("click", (e) => {
    const row = e.target.closest(".mkt-cart-item");
    if (!row) return;
    const productId = row.getAttribute("data-cart-id");
    let cart = loadShopCart();
    const item = cart.find((c) => c.productId === productId);
    if (!item) return;

    if (e.target.closest("[data-remove-cart]")) {
      cart = cart.filter((c) => c.productId !== productId);
      saveShopCart(cart);
      renderPublicCart();
      return;
    }
    const qtyBtn = e.target.closest("[data-qty]");
    if (!qtyBtn) return;
    item.qty += Number(qtyBtn.getAttribute("data-qty"));
    if (item.qty <= 0) cart = cart.filter((c) => c.productId !== productId);
    saveShopCart(cart);
    renderPublicCart();
  });

  function resolveShopWhatsApp() {
    try {
      const all = JSON.parse(localStorage.getItem(CAL_CONFIGS_KEY) || "{}");
      const cfg =
        all.barberhome ||
        all.gmail ||
        all.barbercloud ||
        Object.values(all).find((c) => c && (c.whatsappPhone || c.whatsappCc));
      if (cfg?.whatsappPhone) {
        const cc = String(cfg.whatsappCc || "+57").replace(/\D/g, "");
        const phone = String(cfg.whatsappPhone).replace(/\D/g, "");
        if (phone) return `${cc}${phone}`;
      }
    } catch {
      /* ignore */
    }
    try {
      const auto = loadConfig();
      if (auto.whatsappPhone) {
        const cc = String(auto.whatsappCc || "+57").replace(/\D/g, "");
        const phone = String(auto.whatsappPhone).replace(/\D/g, "");
        if (phone) return `${cc}${phone}`;
      }
    } catch {
      /* ignore */
    }
    return "573116962326";
  }

  function buildShopWhatsAppMessage(lines, total) {
    const business = config.title || "BarberHome";
    const items = lines
      .map(
        (line) =>
          `• ${line.qty}x ${line.name} — ${formatShopMoney(line.lineTotal)}`
      )
      .join("\n");
    return (
      `Hola, quiero concretar una compra en ${business}:\n\n` +
      `${items}\n\n` +
      `Total: ${formatShopMoney(total)}\n\n` +
      `¿Me ayudas con los detalles de entrega/pago?`
    );
  }

  function openShopWhatsApp(lines, total) {
    const phone = resolveShopWhatsApp();
    const message = buildShopWhatsAppMessage(lines, total);
    const url =
      window.Security?.buildWhatsAppUrl?.(phone, message) ||
      (() => {
        const digits = String(phone || "").replace(/\D/g, "");
        if (digits.length < 7) return "";
        return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
      })();
    if (!url) {
      window.AppShell?.toast?.("WhatsApp del negocio no configurado");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  let lastRedeemWhatsApp = null;

  function buildRedeemWhatsAppMessage(payload) {
    const business = config.title || "BarberHome";
    const c = payload?.customer || {};
    const lines = [
      `Hola, canjeé puntos en ${business} y quiero coordinar la entrega:`,
      "",
    ];
    if (Array.isArray(payload?.items) && payload.items.length) {
      lines.push("Productos:");
      payload.items.forEach((item) => {
        const label =
          item.qty > 1 ? `${item.productName} x${item.qty}` : item.productName;
        lines.push(`• ${label} — ${item.pointsCost} pts`);
      });
      lines.push("");
      lines.push(`Total puntos: ${payload.totalPoints ?? "—"}`);
    } else {
      lines.push(`Producto: ${payload?.productName || "Producto"}`);
      lines.push(`Puntos canjeados: ${payload?.pointsCost ?? "—"}`);
    }
    lines.push(`Saldo restante: ${payload?.balance ?? "—"} pts`);
    lines.push(`Cliente: ${c.name || "—"}`);
    lines.push(`Documento: ${c.docType || "CC"} ${c.docNumber || "—"}`);
    lines.push(`Teléfono: ${c.phone || "—"}`);
    if (payload?.id) lines.push(`ID canje: ${payload.id}`);
    lines.push("", "¿Me indicas cómo y cuándo puedo reclamarlo?");
    return lines.join("\n");
  }

  function openRedeemWhatsApp(payload) {
    const data = payload || lastRedeemWhatsApp;
    if (!data) {
      window.AppShell?.toast?.("Primero realiza un canje para coordinar la entrega");
      return;
    }
    const phone = resolveShopWhatsApp();
    const message = buildRedeemWhatsAppMessage(data);
    const url =
      window.Security?.buildWhatsAppUrl?.(phone, message) ||
      (() => {
        const digits = String(phone || "").replace(/\D/g, "");
        if (digits.length < 7) return "";
        return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
      })();
    if (!url) {
      window.AppShell?.toast?.("WhatsApp del negocio no configurado");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  document.getElementById("btn-public-checkout")?.addEventListener("click", () => {
    const cart = loadShopCart();
    if (!cart.length) {
      window.AppShell?.toast?.("El carrito está vacío");
      return;
    }

    let products = loadShopProducts();
    const lines = [];
    let total = 0;
    let units = 0;

    for (const item of cart) {
      const idx = products.findIndex((p) => p.id === item.productId);
      if (idx < 0) continue;
      const product = products[idx];
      const qty = Math.min(Number(item.qty) || 0, Number(product.stock) || 0);
      if (qty <= 0) continue;
      products[idx] = { ...product, stock: (Number(product.stock) || 0) - qty };
      const lineTotal = (Number(product.price) || 0) * qty;
      total += lineTotal;
      units += qty;
      lines.push({
        productId: product.id,
        name: product.name,
        price: product.price,
        qty,
        lineTotal,
      });
    }

    if (!lines.length) {
      window.AppShell?.toast?.("No hay stock suficiente para completar el pedido");
      renderPublicShop();
      return;
    }

    saveShopProducts(products);
    const sales = loadShopSales();
    sales.unshift({
      id: `sale-${Date.now().toString(36)}`,
      createdAt: new Date().toISOString(),
      total,
      units,
      items: lines,
      source: "public-whatsapp",
    });
    saveShopSales(sales);
    saveShopCart([]);
    renderPublicCart();
    renderPublicShop();
    closePublicCart();
    openShopWhatsApp(lines, total);
    window.AppShell?.toast?.("Te redirigimos a WhatsApp para concretar la compra");
  });

  document.getElementById("btn-puntos")?.addEventListener("click", () => {
    hideAll();
    puntosStep.hidden = false;
    openPuntosFlow();
  });

  document.getElementById("btn-shop")?.addEventListener("click", async () => {
    hideAll();
    if (shopStep) shopStep.hidden = false;
    if (publicShopGrid) {
      publicShopGrid.innerHTML = `<p class="public-desc public-desc--block">Cargando productos…</p>`;
    }
    await refreshPublicProducts();
    renderPublicShop();
  });
  document.getElementById("btn-back-shop")?.addEventListener("click", showServices);

  document.getElementById("btn-back-calendar")?.addEventListener("click", () => {
    if (!bookTimes.hidden) {
      closeTimesOverlay();
      return;
    }
    showServices();
  });
  document.getElementById("btn-back-puntos")?.addEventListener("click", showServices);
  document.getElementById("btn-back-form")?.addEventListener("click", () => {
    hideAll();
    calendarStep.hidden = false;
    selectedTime = null;
    if (timeInput) timeInput.value = "";
    renderCalendar();
    renderTimes();
  });

  /* —— Puntos Barberhome: auth + verificación —— */
  const puntosAuth = document.getElementById("puntos-auth");
  const puntosVerify = document.getElementById("puntos-verify");
  const puntosRecover = document.getElementById("puntos-recover");
  const puntosDashboard = document.getElementById("puntos-dashboard");
  const puntosGoogleComplete = document.getElementById("puntos-google-complete");
  const loginForm = document.getElementById("loyalty-login-form");
  const registerForm = document.getElementById("loyalty-register-form");
  const googleCompleteForm = document.getElementById("loyalty-google-complete-form");
  const verifyForm = document.getElementById("loyalty-verify-form");
  const recoverRequestForm = document.getElementById("loyalty-recover-request-form");
  const recoverResetForm = document.getElementById("loyalty-recover-reset-form");
  let pendingVerifyUserId = null;
  let pendingRecoverUserId = null;
  let pendingGoogleProfile = null;
  let pendingGoogleUserId = null;

  const PASSWORD_ITERATIONS = 100000;

  function bufToB64(buf) {
    const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf;
    let binary = "";
    bytes.forEach((b) => {
      binary += String.fromCharCode(b);
    });
    return btoa(binary);
  }

  function b64ToBuf(b64) {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function validatePassword(password) {
    const pw = String(password || "");
    if (pw.length < 8) return "La contraseña debe tener al menos 8 caracteres.";
    if (!/[a-z]/.test(pw)) return "Debe incluir al menos una letra minúscula.";
    if (!/[A-Z]/.test(pw)) return "Debe incluir al menos una letra mayúscula.";
    if (!/\d/.test(pw)) return "Debe incluir al menos un número.";
    return "";
  }

  async function hashPassword(password, existingSaltB64) {
    const enc = new TextEncoder();
    const salt = existingSaltB64
      ? b64ToBuf(existingSaltB64)
      : crypto.getRandomValues(new Uint8Array(16));
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      enc.encode(String(password)),
      "PBKDF2",
      false,
      ["deriveBits"]
    );
    const bits = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt,
        iterations: PASSWORD_ITERATIONS,
        hash: "SHA-256",
      },
      keyMaterial,
      256
    );
    return { salt: bufToB64(salt), hash: bufToB64(bits) };
  }

  async function verifyPassword(password, saltB64, hashB64) {
    if (!saltB64 || !hashB64) return false;
    const { hash } = await hashPassword(password, saltB64);
    if (window.Security?.constantTimeEqual) {
      return window.Security.constantTimeEqual(hash, hashB64);
    }
    return hash === hashB64;
  }

  function openLoyaltyTerms() {
    const panel = document.getElementById("loyalty-terms-panel");
    if (!panel) return;
    panel.hidden = false;
    document.body.classList.add("public-confirm-open");
    document.getElementById("loyalty-terms-accept")?.focus();
  }

  function closeLoyaltyTerms() {
    const panel = document.getElementById("loyalty-terms-panel");
    if (panel) panel.hidden = true;
    document.body.classList.remove("public-confirm-open");
  }

  function loadLoyaltyUsers() {
    try {
      return JSON.parse(localStorage.getItem(LOYALTY_USERS_KEY) || "[]");
    } catch {
      return [];
    }
  }

  function saveLoyaltyUsers(users) {
    localStorage.setItem(LOYALTY_USERS_KEY, JSON.stringify(users));
  }

  function getSessionUserId() {
    const raw = localStorage.getItem(LOYALTY_SESSION_KEY) || "";
    if (window.Security?.readSessionPayload) {
      const session = window.Security.readSessionPayload(raw);
      if (!session?.userId) {
        localStorage.removeItem(LOYALTY_SESSION_KEY);
        return "";
      }
      // Migrar sesión legacy a payload con expiración
      if (session.legacy) setSession(session.userId);
      return session.userId;
    }
    return raw;
  }

  function setSession(userId) {
    if (!userId) {
      localStorage.removeItem(LOYALTY_SESSION_KEY);
      return;
    }
    if (window.Security?.createSessionPayload) {
      const payload = window.Security.createSessionPayload(userId);
      localStorage.setItem(LOYALTY_SESSION_KEY, JSON.stringify(payload));
      return;
    }
    localStorage.setItem(LOYALTY_SESSION_KEY, userId);
  }

  function normalizeDoc(value, docType) {
    const type = String(docType || "CC").toUpperCase();
    const cleaned = String(value || "").replace(/\s+/g, "");
    if (type === "PAS") return cleaned.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
    return cleaned.replace(/\D/g, "");
  }

  function bindDocNumberInputs(root = document) {
    root.querySelectorAll("[data-doc-number], input[name='docNumber']").forEach((input) => {
      const scope = input.closest("form") || input.closest(".points-admin-form") || document;
      const typeEl = () => scope.querySelector("[name='docType'], #admin-doc-type");
      const sync = () => {
        const next = normalizeDoc(input.value, typeEl()?.value || "CC");
        if (input.value !== next) input.value = next;
        const docType = typeEl()?.value || "CC";
        input.inputMode = docType === "PAS" ? "text" : "numeric";
        input.pattern = docType === "PAS" ? "[A-Za-z0-9]*" : "[0-9]*";
      };
      input.addEventListener("input", sync);
      typeEl()?.addEventListener("change", sync);
      sync();
    });
  }

  function validateDocNumber(docType, docNumber) {
    if (!docNumber) return "El número de documento es obligatorio.";
    if (docType === "PAS") {
      if (!/^[A-Z0-9]{4,20}$/i.test(docNumber)) {
        return "Ingresa un pasaporte válido (letras y números, sin espacios).";
      }
      return "";
    }
    if (!/^\d+$/.test(docNumber)) return "El número de documento solo puede contener números.";
    if (docNumber.length < 5) return "El número de documento es demasiado corto.";
    return "";
  }

  function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
  }

  function normalizePhone(value) {
    return String(value || "").replace(/\s+/g, "");
  }

  function makeCode() {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  function showAuthError(id, message) {
    const el = document.getElementById(id);
    if (!el) return;
    el.hidden = !message;
    el.textContent = message || "";
  }

  function showPuntosView(view) {
    if (puntosAuth) puntosAuth.hidden = view !== "auth";
    if (puntosVerify) puntosVerify.hidden = view !== "verify";
    if (puntosRecover) puntosRecover.hidden = view !== "recover";
    if (puntosDashboard) puntosDashboard.hidden = view !== "dashboard";
    if (puntosGoogleComplete) puntosGoogleComplete.hidden = view !== "google-complete";
  }

  function userNeedsProfileCompletion(user) {
    if (!user) return true;
    return !user.docNumber || !user.phone || !user.acceptedTermsAt;
  }

  function showGoogleCompleteForm(profile, existingUser = null) {
    pendingGoogleProfile = profile;
    pendingGoogleUserId = existingUser?.id || null;
    showAuthError("google-complete-error", "");

    const nameInput = document.getElementById("google-complete-name");
    const emailInput = document.getElementById("google-complete-email");
    const lead = document.getElementById("google-complete-lead");
    if (nameInput) nameInput.value = existingUser?.name || profile.name || "";
    if (emailInput) emailInput.value = existingUser?.email || profile.email || "";
    if (lead) {
      lead.textContent = existingUser
        ? "Tu cuenta de Google está conectada. Completa los datos que faltan para canjear puntos."
        : "Iniciaste con Google. Confirma tu documento y WhatsApp para activar tu cuenta.";
    }

    if (googleCompleteForm) {
      const docType = googleCompleteForm.querySelector("[name='docType']");
      const docNumber = googleCompleteForm.querySelector("[name='docNumber']");
      const phone = googleCompleteForm.querySelector("[name='phone']");
      const terms = document.getElementById("google-complete-accept-terms");
      if (docType) docType.value = existingUser?.docType || "CC";
      if (docNumber) docNumber.value = existingUser?.docNumber || "";
      if (phone) phone.value = existingUser?.phone || "";
      if (terms) terms.checked = !!existingUser?.acceptedTermsAt;
    }

    bindDocNumberInputs(puntosGoogleComplete || document);
    showPuntosView("google-complete");
  }

  async function processGoogleProfile(profile) {
    const users = loadLoyaltyUsers();
    let user = users.find((u) => u.googleId === profile.sub);

    if (!user) {
      user = users.find((u) => normalizeEmail(u.email) === normalizeEmail(profile.email));
      if (user) {
        if (user.googleId && user.googleId !== profile.sub) {
          showAuthError("login-error", "Ese correo ya está vinculado a otra cuenta de Google.");
          return;
        }
        user.googleId = profile.sub;
        user.authProvider = user.authProvider || "google";
        if (!user.emailVerified) user.emailVerified = true;
        if (profile.name && !user.name) user.name = profile.name;
        user.googlePicture = profile.picture || user.googlePicture || "";
        saveLoyaltyUsers(users);
      }
    }

    if (user && !userNeedsProfileCompletion(user)) {
      setSession(user.id);
      pendingGoogleProfile = null;
      pendingGoogleUserId = null;
      renderDashboard(user);
      return;
    }

    showGoogleCompleteForm(profile, user || null);
  }

  async function handleGoogleAuth() {
    const btn = document.getElementById("btn-google-auth");
    showAuthError("login-error", "");
    showAuthError("register-error", "");
    showAuthError("google-complete-error", "");
    if (btn) {
      btn.disabled = true;
      btn.setAttribute("aria-busy", "true");
    }
    try {
      if (!window.GoogleAuth?.signIn) {
        throw new Error("Google Auth no cargó. Recarga la página.");
      }
      const profile = await window.GoogleAuth.signIn({ prompt: "select_account" });
      await processGoogleProfile(profile);
    } catch (err) {
      const msg = String(err?.message || err || "No se pudo conectar con Google.");
      const cancelled =
        /popup_closed|access_denied|cancel/i.test(msg) || msg === "popup_closed_by_user";
      showAuthError("login-error", cancelled ? "Inicio con Google cancelado." : msg);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.removeAttribute("aria-busy");
      }
    }
  }

  function showRecoverStep(step) {
    if (recoverRequestForm) recoverRequestForm.hidden = step !== "request";
    if (recoverResetForm) recoverResetForm.hidden = step !== "reset";
  }

  function pointsFromPrice(price) {
    return Math.floor((Number(price) || 0) / LOYALTY.pesosPerPoint);
  }

  function pointsCostForProduct(price) {
    return Math.max(1, pointsFromPrice(price));
  }

  function expireDateFrom(iso) {
    const d = new Date(iso || Date.now());
    d.setMonth(d.getMonth() + LOYALTY.expireMonths);
    return d.toISOString();
  }

  function ensureLedger(user) {
    if (!Array.isArray(user.ledger)) user.ledger = [];
    return user;
  }

  function historyFingerprint(entry) {
    // at + amount basta para no duplicar (notas pueden diferir entre ledger e historial)
    return `${entry.at || ""}|${Number(entry.amount) || 0}`;
  }

  function loadLoyaltyHistory() {
    try {
      return JSON.parse(localStorage.getItem(LOYALTY_HISTORY_KEY) || "[]");
    } catch {
      return [];
    }
  }

  function historyForUser(user, history) {
    const doc = normalizeDoc(user.docNumber);
    return (history || loadLoyaltyHistory()).filter((h) => {
      if (user.id && h.userId === user.id) return true;
      if (h.docNumber && normalizeDoc(h.docNumber) === doc) return true;
      return false;
    });
  }

  function balanceFromHistory(user, history) {
    const now = Date.now();
    let balance = 0;
    historyForUser(user, history).forEach((h) => {
      const amount = Number(h.amount) || 0;
      if (amount > 0) {
        const expMs = new Date(expireDateFrom(h.at)).getTime();
        if (!Number.isNaN(expMs) && expMs > now) balance += amount;
      } else {
        balance += amount;
      }
    });
    return Math.max(0, balance);
  }

  function reconcileUserFromHistory(user) {
    ensureLedger(user);
    const history = historyForUser(user);
    const byFp = new Map(user.ledger.map((e) => [historyFingerprint(e), e]));
    history.forEach((h) => {
      const fp = historyFingerprint(h);
      const amount = Number(h.amount) || 0;
      const isEarn = amount > 0;
      const existing = byFp.get(fp);
      if (existing) {
        if (isEarn && !existing.expiresAt) {
          existing.expiresAt = expireDateFrom(h.at);
        }
        return;
      }
      const entry = {
        type: isEarn
          ? "earn"
          : String(h.note || "").toLowerCase().includes("canje")
            ? "redeem"
            : "adjust",
        amount,
        at: h.at || new Date().toISOString(),
        expiresAt: isEarn ? expireDateFrom(h.at) : undefined,
        note: h.note || "",
        fromHistory: true,
      };
      user.ledger.push(entry);
      byFp.set(fp, entry);
    });
    // Migrar saldo huérfano solo si no hay historial ni ledger
    if (!user.ledger.length && (user.points || 0) > 0 && !history.length) {
      user.ledger.push({
        type: "earn",
        amount: user.points,
        at: user.createdAt || new Date().toISOString(),
        expiresAt: expireDateFrom(user.createdAt || new Date().toISOString()),
        note: "Saldo inicial",
      });
    }
    return user;
  }

  function syncUserPoints(user) {
    reconcileUserFromHistory(user);
    const history = loadLoyaltyHistory();
    const fromHistory = historyForUser(user, history);
    if (fromHistory.length) {
      user.points = balanceFromHistory(user, history);
    } else {
      const now = Date.now();
      let balance = 0;
      user.ledger.forEach((entry) => {
        const amount = Number(entry.amount) || 0;
        if (entry.type === "earn" || amount > 0) {
          if (entry.type === "redeem" || entry.type === "adjust") {
            balance += amount;
            return;
          }
          const expMs = entry.expiresAt ? new Date(entry.expiresAt).getTime() : Infinity;
          if (!Number.isNaN(expMs) && expMs > now) balance += amount;
        } else {
          balance += amount;
        }
      });
      user.points = Math.max(0, balance);
    }
    return user;
  }

  function activePoints(user) {
    return syncUserPoints(user).points;
  }

  function formatCop(n) {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      maximumFractionDigits: 0,
    }).format(n);
  }

  function appendAdminHistory(entry) {
    try {
      const list = JSON.parse(localStorage.getItem(LOYALTY_HISTORY_KEY) || "[]");
      list.unshift(entry);
      localStorage.setItem(LOYALTY_HISTORY_KEY, JSON.stringify(list.slice(0, 100)));
    } catch {
      /* ignore */
    }
  }

  function persistUser(user) {
    const users = loadLoyaltyUsers();
    const idx = users.findIndex((u) => u.id === user.id);
    if (idx >= 0) users[idx] = user;
    else users.push(user);
    saveLoyaltyUsers(users);
  }

  function productPointsCost(product) {
    return Math.max(1, Number(product.pointsCost) || pointsCostForProduct(product.price));
  }

  function loadRedeemCart() {
    const sessionId = getSessionUserId();
    if (!sessionId) return [];
    try {
      const raw = JSON.parse(localStorage.getItem(REDEEM_CART_KEY) || "null");
      if (!raw || raw.userId !== sessionId || !Array.isArray(raw.items)) return [];
      return raw.items;
    } catch {
      return [];
    }
  }

  function saveRedeemCart(items) {
    const sessionId = getSessionUserId();
    if (!sessionId) return;
    localStorage.setItem(
      REDEEM_CART_KEY,
      JSON.stringify({ userId: sessionId, items: items || [] })
    );
  }

  function clearRedeemCart() {
    saveRedeemCart([]);
    updateRedeemCartBadge();
  }

  function redeemCartPointsTotal(cart, productsById) {
    return cart.reduce((sum, item) => {
      const product = productsById[item.productId];
      if (!product) return sum;
      return sum + productPointsCost(product) * (Number(item.qty) || 0);
    }, 0);
  }

  function updateRedeemCartBadge() {
    const qty = loadRedeemCart().reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
    if (!redeemCartBadge) return;
    redeemCartBadge.hidden = qty <= 0;
    redeemCartBadge.textContent = String(qty);
  }

  function renderRedeemCart(user) {
    const cart = loadRedeemCart();
    const products = loadRedeemProducts();
    const byId = Object.fromEntries(products.map((p) => [p.id, p]));
    updateRedeemCartBadge();

    const points = user?.points || 0;
    const totalPts = redeemCartPointsTotal(cart, byId);

    if (!cart.length) {
      if (redeemCartList) {
        redeemCartList.innerHTML = `<p class="public-desc public-desc--block">Tu carrito de canje está vacío.</p>`;
      }
      if (redeemCartTotal) redeemCartTotal.textContent = "0 pts";
      if (redeemCartBalanceHint) redeemCartBalanceHint.textContent = `Tienes ${points} pts disponibles.`;
      return;
    }

    if (redeemCartList) {
      redeemCartList.innerHTML = cart
        .map((item) => {
          const product = byId[item.productId];
          if (!product) return "";
          const unitCost = productPointsCost(product);
          const linePts = unitCost * (item.qty || 1);
          const img = product.images?.[0] || PLACEHOLDER;
          return `
            <article class="mkt-cart-item" data-redeem-cart-id="${escapeShopHtml(item.productId)}">
              <img src="${img}" alt="" />
              <div class="mkt-cart-item__body">
                <strong>${escapeShopHtml(product.name)}</strong>
                <span class="mkt-cart-item__points">${unitCost} pts c/u</span>
                <div class="mkt-qty">
                  <button type="button" data-redeem-qty="-1" aria-label="Menos">−</button>
                  <span>${item.qty}</span>
                  <button type="button" data-redeem-qty="1" aria-label="Más">+</button>
                </div>
              </div>
              <div class="mkt-cart-item__side">
                <strong>${linePts} pts</strong>
                <button type="button" class="btn btn--secondary btn--sm" data-remove-redeem-cart>Quitar</button>
              </div>
            </article>`;
        })
        .join("");
    }

    if (redeemCartTotal) redeemCartTotal.textContent = `${totalPts} pts`;
    if (redeemCartBalanceHint) {
      const remaining = points - totalPts;
      redeemCartBalanceHint.textContent =
        remaining >= 0
          ? `Usarás ${totalPts} pts · Te quedarán ${remaining} pts.`
          : `Te faltan ${Math.abs(remaining)} pts para completar este canje.`;
    }
  }

  function addToRedeemCart(productId, user) {
    const products = loadRedeemProducts();
    const product = products.find((p) => p.id === productId);
    if (!product || (Number(product.stock) || 0) <= 0) {
      window.AppShell?.toast?.("Producto sin stock");
      return;
    }

    const cart = loadRedeemCart();
    const existing = cart.find((c) => c.productId === productId);
    const nextQty = (existing?.qty || 0) + 1;
    if (nextQty > (Number(product.stock) || 0)) {
      window.AppShell?.toast?.("No hay más unidades disponibles");
      return;
    }

    const cartTotal = redeemCartPointsTotal(cart, Object.fromEntries(products.map((p) => [p.id, p])));
    const unitCost = productPointsCost(product);
    const points = user?.points || 0;
    if (cartTotal + unitCost > points) {
      showAuthError(
        "redeem-error",
        `No alcanzan tus puntos. Te faltan ${cartTotal + unitCost - points} pts para agregar ${product.name}.`
      );
      return;
    }

    showAuthError("redeem-error", "");
    if (existing) existing.qty = nextQty;
    else cart.push({ productId, qty: 1 });
    saveRedeemCart(cart);
    updateRedeemCartBadge();
    renderRedeemProducts(user);
    window.AppShell?.toast?.("Agregado al carrito de canje");
  }

  function openRedeemCart(user) {
    if (!redeemCartPanel) return;
    renderRedeemCart(user);
    redeemCartPanel.hidden = false;
    document.body.classList.add("public-cart-open");
  }

  function closeRedeemCart() {
    if (!redeemCartPanel) return;
    redeemCartPanel.hidden = true;
    document.body.classList.remove("public-cart-open");
  }

  function redeemableProducts() {
    return loadRedeemProducts()
      .filter((p) => (Number(p.stock) || 0) > 0)
      .map((p) => ({
        ...p,
        pointsCost: Math.max(1, Number(p.pointsCost) || pointsCostForProduct(p.price)),
      }))
      .sort((a, b) => a.pointsCost - b.pointsCost || String(a.name).localeCompare(String(b.name)));
  }

  function renderRedeemProducts(user) {
    const grid = document.getElementById("loyalty-redeem-grid");
    const lead = document.getElementById("loyalty-redeem-lead");
    if (!grid) return;

    const points = user.points || 0;
    const products = redeemableProducts();
    const cart = loadRedeemCart();
    const cartTotal = redeemCartPointsTotal(
      cart,
      Object.fromEntries(products.map((p) => [p.id, p]))
    );
    const remaining = points - cartTotal;
    const affordable = products.filter((p) => productPointsCost(p) <= remaining).length;

    if (lead) {
      lead.textContent = products.length
        ? cart.length
          ? `Tienes ${cart.length} producto${cart.length === 1 ? "" : "s"} en el carrito (${cartTotal} pts).`
          : affordable
            ? `Puedes agregar ${affordable} producto${affordable === 1 ? "" : "s"} con tus ${points} puntos.`
            : `Sigue acumulando: cada servicio completado te suma ${LOYALTY.earnPerService} pts.`
        : "Por ahora no hay productos con stock para canjear.";
    }

    updateRedeemCartBadge();

    if (!products.length) {
      grid.innerHTML =
        `<p class="loyalty-redeem-empty">Cuando haya productos en el inventario de canje, aparecerán aquí.</p>`;
      grid.classList.remove("loyalty-redeem-grid--scroll-hint");
      return;
    }

    grid.classList.toggle("loyalty-redeem-grid--scroll-hint", products.length > 1);

    grid.innerHTML = products
      .map((p) => {
        const cost = productPointsCost(p);
        const inCart = cart.find((c) => c.productId === p.id);
        const missing = Math.max(0, cost - remaining);
        const can = missing === 0;
        return `
          <article class="loyalty-redeem-item ${can ? "is-ready" : "is-locked"} ${inCart ? "is-in-cart" : ""}" data-product-id="${escapeShopHtml(p.id)}">
            <div class="loyalty-redeem-item__media">
              ${publicCarouselHtml(p)}
            </div>
            <div class="loyalty-redeem-item__body">
              <h4>${escapeShopHtml(p.name)}</h4>
              <p class="loyalty-redeem-item__price"><strong>${cost}</strong> puntos</p>
              <div class="loyalty-redeem-item__progress">
                <div class="points-progress">
                  <div class="points-progress__bar" style="width:${Math.min(100, Math.round((points / Math.max(cost, 1)) * 100))}%"></div>
                </div>
                <p class="loyalty-redeem-item__progress-meta">
                  ${
                    points >= cost
                      ? "¡Puedes canjearlo!"
                      : `${points} / ${cost} pts · faltan ${Math.max(0, cost - points)}`
                  }
                </p>
              </div>
              <p class="loyalty-redeem-item__status">
                ${
                  inCart
                    ? `${inCart.qty} en carrito`
                    : can
                      ? "Listo para agregar"
                      : `Te faltan <strong>${missing}</strong> punto${missing === 1 ? "" : "s"}`
                }
              </p>
              <button
                type="button"
                class="btn ${can ? "btn--primary" : "btn--secondary"} btn--block btn-add-redeem-cart"
                data-product-id="${escapeShopHtml(p.id)}"
                ${can ? "" : "disabled"}
              >
                ${inCart ? "Agregar otro" : can ? "Agregar al carrito" : `Faltan ${missing} pts`}
              </button>
            </div>
          </article>`;
      })
      .join("");
  }

  function updatePointsProgress(points, products) {
    const bar = document.getElementById("points-progress-bar");
    const hint = document.getElementById("points-progress-hint");
    if (!products.length) {
      if (bar) bar.style.width = "0%";
      if (hint) hint.textContent = "Cada servicio te acerca a un nuevo beneficio.";
      return;
    }

    const cart = loadRedeemCart();
    const byId = Object.fromEntries(products.map((p) => [p.id, p]));
    const cartTotal = redeemCartPointsTotal(cart, byId);
    const available = Math.max(0, points - cartTotal);
    const next = products.find((p) => productPointsCost(p) > available) || products[products.length - 1];
    const need = productPointsCost(next);
    const pct = Math.min(100, Math.round((available / need) * 100));
    if (bar) bar.style.width = `${pct}%`;
    if (hint) {
      if (cart.length) {
        hint.textContent = `Carrito: ${cartTotal} pts · Disponibles: ${available} pts.`;
      } else if (available >= need) {
        const ready = products.filter((p) => productPointsCost(p) <= available).length;
        hint.textContent = `Tu fidelidad tiene recompensa: puedes canjear ${ready} producto${ready === 1 ? "" : "s"}.`;
      } else {
        hint.textContent = `Cada servicio te acerca a un nuevo beneficio. Faltan ${need - available} pts para ${next.name}.`;
      }
    }
  }

  async function redeemCartWithPoints(user) {
    const cart = loadRedeemCart();
    if (!cart.length) {
      window.AppShell?.toast?.("El carrito de canje está vacío");
      return null;
    }

    let products = loadRedeemProducts();
    const byId = Object.fromEntries(products.map((p) => [p.id, p]));
    const lines = [];
    let totalPoints = 0;

    for (const item of cart) {
      const product = byId[item.productId];
      const qty = Number(item.qty) || 0;
      if (!product || qty <= 0) continue;
      const stock = Number(product.stock) || 0;
      if (qty > stock) {
        showAuthError("redeem-error", `${product.name} ya no tiene stock suficiente.`);
        return null;
      }
      const unitCost = productPointsCost(product);
      totalPoints += unitCost * qty;
      lines.push({ product, qty, unitCost, linePoints: unitCost * qty });
    }

    if (!lines.length) {
      showAuthError("redeem-error", "No hay productos válidos en el carrito.");
      return null;
    }

    if ((user.points || 0) < totalPoints) {
      showAuthError(
        "redeem-error",
        `Te faltan ${totalPoints - (user.points || 0)} puntos para este canje.`
      );
      return null;
    }

    const ok = await openPublicConfirm({
      title: "Confirmar canje",
      message: `Vas a canjear ${lines.length} producto${lines.length === 1 ? "" : "s"} por ${totalPoints} puntos. Se descontarán al instante; luego coordina la entrega por WhatsApp.`,
      confirmLabel: "Sí, canjear",
      cancelLabel: "Cancelar",
    });
    if (!ok) return null;

    const now = new Date().toISOString();
    ensureLedger(user);
    const productNames = lines.map((line) =>
      line.qty > 1 ? `${line.product.name} x${line.qty}` : line.product.name
    );
    appendAdminHistory({
      id: crypto.randomUUID(),
      userId: user.id,
      name: user.name,
      docType: user.docType,
      docNumber: user.docNumber,
      amount: -totalPoints,
      note: `Canje carrito · ${productNames.join(", ")}`,
      at: now,
    });
    user.ledger.push({
      type: "redeem",
      amount: -totalPoints,
      at: now,
      note: `Canje carrito · ${productNames.join(", ")}`,
    });
    syncUserPoints(user);

    const customer = {
      userId: user.id,
      name: user.name,
      docType: user.docType,
      docNumber: user.docNumber,
      phone: user.phone,
      email: user.email || "",
    };

    const batchId = `predeem-${Date.now().toString(36)}`;
    const redeemedItems = [];

    lines.forEach((line) => {
      const pIdx = products.findIndex((p) => p.id === line.product.id);
      if (pIdx < 0) return;
      products[pIdx] = {
        ...products[pIdx],
        stock: (Number(products[pIdx].stock) || 0) - line.qty,
      };

      const redeemId = `${batchId}-${line.product.id.slice(-6)}`;
      redeemedItems.push({
        id: redeemId,
        productName: line.product.name,
        pointsCost: line.linePoints,
        qty: line.qty,
      });

      const sales = loadShopSales();
      sales.unshift({
        id: `sale-${redeemId}`,
        createdAt: now,
        total: (Number(line.product.price) || 0) * line.qty,
        units: line.qty,
        items: [
          {
            productId: line.product.id,
            name: line.product.name,
            price: line.product.price,
            qty: line.qty,
            lineTotal: (Number(line.product.price) || 0) * line.qty,
            pointsCost: line.linePoints,
          },
        ],
        source: "loyalty-points",
        redeemId,
        customer,
      });
      saveShopSales(sales);

      try {
        const redemptions = JSON.parse(localStorage.getItem(PRODUCT_REDEEMS_KEY) || "[]");
        const list = Array.isArray(redemptions) ? redemptions : [];
        list.unshift({
          id: redeemId,
          saleId: `sale-${redeemId}`,
          createdAt: now,
          productId: line.product.id,
          productName: line.product.name,
          pointsCost: line.linePoints,
          valueCop: (Number(line.product.price) || 0) * line.qty,
          status: "pending",
          deliveredAt: null,
          pointsDeducted: true,
          customer,
          qty: line.qty,
        });
        localStorage.setItem(PRODUCT_REDEEMS_KEY, JSON.stringify(list.slice(0, 200)));
      } catch {
        /* ignore */
      }

      try {
        const alertFn = window.EmailService?.sendRedeemAdminAlert;
        if (typeof alertFn === "function") {
          alertFn({
            id: redeemId,
            productName: line.qty > 1 ? `${line.product.name} x${line.qty}` : line.product.name,
            pointsCost: line.linePoints,
            valueCop: (Number(line.product.price) || 0) * line.qty,
            createdAt: now,
            customer,
            slug: config.slug || slug,
            negocioId: window.Tenant?.currentId?.() || "",
          }).catch((err) => {
            console.warn("[loyalty] No se pudo avisar al admin del canje", err);
          });
        }
      } catch (err) {
        console.warn("[loyalty] No se pudo avisar al admin del canje", err);
      }
    });

    saveRedeemProducts(products);
    clearRedeemCart();
    closeRedeemCart();

    try {
      const list = JSON.parse(localStorage.getItem(LOYALTY_HISTORY_KEY) || "[]");
      if (list[0]) {
        list[0].balance = user.points;
        localStorage.setItem(LOYALTY_HISTORY_KEY, JSON.stringify(list.slice(0, 100)));
      }
    } catch {
      /* ignore */
    }

    persistUser(user);

    lastRedeemWhatsApp = {
      id: batchId,
      items: redeemedItems,
      totalPoints,
      balance: user.points,
      customer,
    };

    const success = document.getElementById("redeem-success");
    const successText = document.getElementById("redeem-success-text");
    if (successText) {
      successText.textContent = `Canjeaste ${lines.length} producto${lines.length === 1 ? "" : "s"} por ${totalPoints} puntos. Te quedan ${user.points} pts. Coordina la entrega por WhatsApp.`;
    }
    if (success) success.hidden = false;
    showAuthError("redeem-error", "");
    window.AppShell?.toast?.("Canje realizado con éxito");
    return user;
  }

  function getLoggedInUser() {
    const users = loadLoyaltyUsers();
    const sessionId = getSessionUserId();
    const idx = users.findIndex((u) => u.id === sessionId && u.emailVerified);
    if (idx < 0) return null;
    return syncUserPoints(users[idx]);
  }

  function renderDashboard(user, opts = {}) {
    syncUserPoints(user);
    const points = user.points || 0;
    document.getElementById("loyalty-user-name").textContent = user.name.split(" ")[0] || user.name;
    document.getElementById("points-value").textContent = String(points);

    const products = redeemableProducts();
    updatePointsProgress(points, products);
    renderRedeemProducts(user);
    updateRedeemCartBadge();

    document.getElementById("loyalty-meta").innerHTML = `
      <p><strong>Documento:</strong> ${escapeShopHtml(user.docType)} ${escapeShopHtml(user.docNumber)}</p>
      <p><strong>Correo:</strong> ${escapeShopHtml(user.email)}</p>
      <p><strong>Teléfono:</strong> ${escapeShopHtml(user.phone)}</p>
    `;

    const success = document.getElementById("redeem-success");
    if (success && !opts.keepRedeemSuccess) success.hidden = true;
    if (!opts.keepRedeemSuccess) showAuthError("redeem-error", "");
    persistUser(user);
    showPuntosView("dashboard");
  }

  function openPuntosFlow() {
    const users = loadLoyaltyUsers();
    const sessionId = getSessionUserId();
    const user = users.find((u) => u.id === sessionId && u.emailVerified);
    if (user) {
      renderDashboard(user);
      return;
    }
    showPuntosView("auth");
    switchAuthTab("login");
  }

  function switchAuthTab(tab) {
    document.querySelectorAll("[data-auth-tab]").forEach((btn) => {
      btn.classList.toggle("is-active", btn.getAttribute("data-auth-tab") === tab);
    });
    if (loginForm) loginForm.hidden = tab !== "login";
    if (registerForm) registerForm.hidden = tab !== "register";
    showAuthError("login-error", "");
    showAuthError("register-error", "");
  }

  async function startEmailVerification(user) {
    pendingVerifyUserId = user.id;
    const code = makeCode();
    const users = loadLoyaltyUsers();
    const idx = users.findIndex((u) => u.id === user.id);
    if (idx >= 0) {
      users[idx].verifyCode = code;
      users[idx].verifySentAt = new Date().toISOString();
      users[idx].verifyExpiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      saveLoyaltyUsers(users);
    }

    const lead = document.getElementById("verify-lead");
    if (lead) {
      lead.textContent = `Enviando código a ${user.email}…`;
    }
    showAuthError("verify-error", "");
    showPuntosView("verify");

    const demo = document.getElementById("verify-demo");
    const demoCode = document.getElementById("verify-demo-code");
    const sendResult = window.EmailService
      ? await window.EmailService.sendVerificationCode({
          toEmail: user.email,
          toName: user.name,
          code,
        })
      : { ok: false, demo: true };

    if (lead) {
      lead.textContent = sendResult.ok
        ? `Te enviamos un código a ${user.email}. Ingrésalo para activar tu cuenta.`
        : `Revisa tu correo (${user.email}). Si no llega, usa el código de prueba o reenvía.`;
    }

    // Solo mostrar código en pantalla si el envío real falló o no está configurado
    if (demo && demoCode) {
      const showDemo = !sendResult.ok || sendResult.demo;
      demo.hidden = !showDemo;
      demoCode.textContent = showDemo ? code : "";
    }

    if (sendResult.ok) {
      window.AppShell?.toast?.("Código enviado al correo");
    } else if (window.EmailConfig?.enabled) {
      showAuthError(
        "verify-error",
        sendResult.message || "No se pudo enviar el correo. Usa el código mostrado o reenvía."
      );
    }
  }

  document.querySelectorAll("[data-auth-tab]").forEach((btn) => {
    btn.addEventListener("click", () => switchAuthTab(btn.getAttribute("data-auth-tab")));
  });

  document.getElementById("btn-open-terms")?.addEventListener("click", (e) => {
    e.preventDefault();
    openLoyaltyTerms();
  });
  document.getElementById("btn-open-terms-google")?.addEventListener("click", (e) => {
    e.preventDefault();
    openLoyaltyTerms();
  });
  document.getElementById("btn-google-auth")?.addEventListener("click", handleGoogleAuth);
  document.getElementById("btn-google-complete-back")?.addEventListener("click", () => {
    pendingGoogleProfile = null;
    pendingGoogleUserId = null;
    googleCompleteForm?.reset();
    showAuthError("google-complete-error", "");
    showPuntosView("auth");
  });
  document.getElementById("loyalty-terms-accept")?.addEventListener("click", () => {
    const box = document.getElementById("register-accept-terms");
    if (box) box.checked = true;
    closeLoyaltyTerms();
  });
  document.getElementById("loyalty-terms-dismiss")?.addEventListener("click", closeLoyaltyTerms);

  document.getElementById("btn-forgot-password")?.addEventListener("click", () => {
    showAuthError("recover-request-error", "");
    showAuthError("recover-reset-error", "");
    recoverRequestForm?.reset();
    recoverResetForm?.reset();
    showRecoverStep("request");
    showPuntosView("recover");
  });

  document.getElementById("btn-recover-back-login")?.addEventListener("click", () => {
    pendingRecoverUserId = null;
    showPuntosView("auth");
    switchAuthTab("login");
  });

  async function startPasswordRecovery(user) {
    pendingRecoverUserId = user.id;
    const code = makeCode();
    const users = loadLoyaltyUsers();
    const idx = users.findIndex((u) => u.id === user.id);
    if (idx < 0) return { ok: false, message: "Cuenta no encontrada." };
    users[idx].recoverCode = code;
    users[idx].recoverSentAt = new Date().toISOString();
    users[idx].recoverExpiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    saveLoyaltyUsers(users);

    const lead = document.getElementById("recover-lead");
    if (lead) lead.textContent = `Enviando código a ${user.email}…`;
    showAuthError("recover-request-error", "");
    showAuthError("recover-reset-error", "");
    showRecoverStep("reset");
    showPuntosView("recover");

    const demo = document.getElementById("recover-demo");
    const demoCode = document.getElementById("recover-demo-code");
    const sendFn = window.EmailService?.sendRecoveryCode || window.EmailService?.sendVerificationCode;
    const sendResult = sendFn
      ? await sendFn({
          toEmail: user.email,
          toName: user.name,
          code,
        })
      : { ok: false, demo: true };

    if (lead) {
      lead.textContent = sendResult.ok
        ? `Te enviamos un código a ${user.email}. Ingrésalo y crea tu nueva contraseña.`
        : `Revisa tu correo (${user.email}). Si no llega, usa el código de respaldo o reenvía.`;
    }
    if (demo && demoCode) {
      const showDemo = !sendResult.ok || sendResult.demo;
      demo.hidden = !showDemo;
      demoCode.textContent = showDemo ? code : "";
    }
    if (sendResult.ok) {
      window.AppShell?.toast?.("Código de recuperación enviado");
    } else if (window.EmailConfig?.enabled) {
      showAuthError(
        "recover-reset-error",
        sendResult.message || "No se pudo enviar el correo. Usa el código mostrado o reenvía."
      );
    }
    return sendResult;
  }

  registerForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const submitBtn = registerForm.querySelector('button[type="submit"]');
    const data = Object.fromEntries(new FormData(registerForm).entries());
    const name = String(data.name || "").trim();
    const docType = String(data.docType || "CC");
    const docNumber = normalizeDoc(data.docNumber, docType);
    const email = normalizeEmail(data.email);
    const phone = normalizePhone(data.phone);
    const password = String(data.password || "");
    const passwordConfirm = String(data.passwordConfirm || "");
    const acceptTerms = data.acceptTerms === "on" || data.acceptTerms === "true";

    if (!name || !docNumber || !email || !phone || !password) {
      showAuthError("register-error", "Completa todos los campos.");
      return;
    }
    const docError = validateDocNumber(docType, docNumber);
    if (docError) {
      showAuthError("register-error", docError);
      return;
    }
    if (!acceptTerms) {
      showAuthError("register-error", "Debes aceptar los términos y condiciones.");
      return;
    }
    const pwError = validatePassword(password);
    if (pwError) {
      showAuthError("register-error", pwError);
      return;
    }
    if (password !== passwordConfirm) {
      showAuthError("register-error", "Las contraseñas no coinciden.");
      return;
    }

    const users = loadLoyaltyUsers();
    if (users.some((u) => normalizeDoc(u.docNumber, docType) === docNumber && u.docType === docType)) {
      showAuthError("register-error", "Ese documento ya está registrado. Inicia sesión.");
      return;
    }
    if (users.some((u) => normalizeEmail(u.email) === email && u.emailVerified)) {
      showAuthError("register-error", "Ese correo ya está registrado.");
      return;
    }

    const passwordBundle = await hashPassword(password);

    // Si ya se registró pero no verificó, actualizar datos y reenviar código
    const pending = users.find(
      (u) => normalizeEmail(u.email) === email && !u.emailVerified
    );
    if (pending) {
      pending.name = name;
      pending.phone = phone;
      pending.docType = docType;
      pending.docNumber = docNumber;
      pending.passwordSalt = passwordBundle.salt;
      pending.passwordHash = passwordBundle.hash;
      pending.acceptedTermsAt = new Date().toISOString();
      const pendingMerged = window.LoyaltyEngine?.absorbPhoneStub?.(users, pending);
      saveLoyaltyUsers(pendingMerged?.users || users);
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Enviando código…";
      }
      await startEmailVerification(pending);
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Crear cuenta";
      }
      return;
    }

    const user = {
      id: crypto.randomUUID(),
      name,
      docType,
      docNumber,
      email,
      phone,
      emailVerified: false,
      points: 0,
      verifyCode: "",
      passwordSalt: passwordBundle.salt,
      passwordHash: passwordBundle.hash,
      acceptedTermsAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
    users.push(user);
    const registeredMerged = window.LoyaltyEngine?.absorbPhoneStub?.(users, user);
    saveLoyaltyUsers(registeredMerged?.users || users);
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Enviando código…";
    }
    await startEmailVerification(user);
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Crear cuenta";
    }
  });

  loginForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(loginForm).entries());
    const docType = String(data.docType || "CC");
    const docNumber = normalizeDoc(data.docNumber, docType);
    const email = normalizeEmail(data.email);
    const password = String(data.password || "");
    const throttleScope = `loyalty:${docType}:${docNumber}:${email}`;

    if (window.Security?.isLoginBlocked?.(throttleScope)) {
      showAuthError("login-error", window.Security.loginBlockMessage(throttleScope));
      return;
    }

    const docError = validateDocNumber(docType, docNumber);
    if (docError) {
      showAuthError("login-error", docError);
      return;
    }
    const users = loadLoyaltyUsers();
    const user = users.find(
      (u) =>
        u.docType === docType &&
        normalizeDoc(u.docNumber, docType) === docNumber &&
        normalizeEmail(u.email) === email
    );

    if (!user) {
      window.Security?.registerLoginFailure?.(throttleScope);
      showAuthError("login-error", "No encontramos esa cuenta. Revisa los datos o regístrate.");
      return;
    }

    if (!user.emailVerified) {
      startEmailVerification(user);
      return;
    }

    if (!user.passwordHash || !user.passwordSalt) {
      if (user.googleId || user.authProvider === "google") {
        showAuthError("login-error", "Esta cuenta usa Google. Pulsa «Continuar con Google».");
        return;
      }
      showAuthError(
        "login-error",
        "Tu cuenta aún no tiene contraseña. Usa Recuperar contraseña para crear una."
      );
      return;
    }

    const ok = await verifyPassword(password, user.passwordSalt, user.passwordHash);
    if (!ok) {
      window.Security?.registerLoginFailure?.(throttleScope);
      showAuthError("login-error", "Contraseña incorrecta.");
      return;
    }

    window.Security?.clearLoginFailures?.(throttleScope);
    setSession(user.id);
    renderDashboard(user);
  });

  recoverRequestForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const submitBtn = recoverRequestForm.querySelector('button[type="submit"]');
    const data = Object.fromEntries(new FormData(recoverRequestForm).entries());
    const docType = String(data.docType || "CC");
    const docNumber = normalizeDoc(data.docNumber, docType);
    const email = normalizeEmail(data.email);
    const users = loadLoyaltyUsers();
    const docError = validateDocNumber(docType, docNumber);
    if (docError) {
      showAuthError("recover-request-error", docError);
      return;
    }
    const user = users.find(
      (u) =>
        u.docType === docType &&
        normalizeDoc(u.docNumber, docType) === docNumber &&
        normalizeEmail(u.email) === email
    );
    if (!user) {
      showAuthError(
        "recover-request-error",
        "No encontramos esa cuenta. Revisa documento y correo."
      );
      return;
    }
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Enviando…";
    }
    await startPasswordRecovery(user);
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Enviar código";
    }
  });

  recoverResetForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(recoverResetForm).entries());
    const code = String(data.code || "").trim();
    const password = String(data.password || "");
    const passwordConfirm = String(data.passwordConfirm || "");
    const users = loadLoyaltyUsers();
    const idx = users.findIndex((u) => u.id === pendingRecoverUserId);
    if (idx < 0) {
      showAuthError("recover-reset-error", "Sesión de recuperación inválida. Solicita el código de nuevo.");
      return;
    }
    if (String(users[idx].recoverCode || "") !== code) {
      showAuthError("recover-reset-error", "Código incorrecto. Revisa e intenta otra vez.");
      return;
    }
    const recoverExp = Date.parse(users[idx].recoverExpiresAt || "") || 0;
    if (recoverExp && Date.now() > recoverExp) {
      showAuthError("recover-reset-error", "El código expiró. Solicita uno nuevo.");
      return;
    }
    const pwError = validatePassword(password);
    if (pwError) {
      showAuthError("recover-reset-error", pwError);
      return;
    }
    if (password !== passwordConfirm) {
      showAuthError("recover-reset-error", "Las contraseñas no coinciden.");
      return;
    }

    const bundle = await hashPassword(password);
    users[idx].passwordSalt = bundle.salt;
    users[idx].passwordHash = bundle.hash;
    users[idx].recoverCode = "";
    users[idx].recoverSentAt = "";
    users[idx].recoverExpiresAt = "";
    users[idx].emailVerified = true;
    saveLoyaltyUsers(users);
    pendingRecoverUserId = null;
    recoverRequestForm?.reset();
    recoverResetForm?.reset();
    window.AppShell?.toast?.("Contraseña actualizada. Ya puedes iniciar sesión.");
    showPuntosView("auth");
    switchAuthTab("login");
    showAuthError("login-error", "");
  });

  document.getElementById("btn-recover-resend")?.addEventListener("click", async () => {
    const users = loadLoyaltyUsers();
    const user = users.find((u) => u.id === pendingRecoverUserId);
    if (!user) return;
    await startPasswordRecovery(user);
  });

  verifyForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    const code = String(new FormData(verifyForm).get("code") || "").trim();
    const users = loadLoyaltyUsers();
    const idx = users.findIndex((u) => u.id === pendingVerifyUserId);
    if (idx < 0) {
      showAuthError("verify-error", "Sesión de verificación inválida. Regístrate de nuevo.");
      return;
    }
    if (users[idx].verifyCode !== code) {
      showAuthError("verify-error", "Código incorrecto. Revisa e intenta otra vez.");
      return;
    }
    const verifyExp = Date.parse(users[idx].verifyExpiresAt || "") || 0;
    if (verifyExp && Date.now() > verifyExp) {
      showAuthError("verify-error", "El código expiró. Pulsa Reenviar código.");
      return;
    }
    users[idx].emailVerified = true;
    users[idx].verifyCode = "";
    users[idx].verifyExpiresAt = "";
    saveLoyaltyUsers(users);
    setSession(users[idx].id);
    verifyForm.reset();
    renderDashboard(users[idx]);
  });

  document.getElementById("btn-resend-code")?.addEventListener("click", () => {
    const users = loadLoyaltyUsers();
    const user = users.find((u) => u.id === pendingVerifyUserId);
    if (!user) return;
    startEmailVerification(user);
  });

  googleCompleteForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!pendingGoogleProfile) {
      showAuthError("google-complete-error", "Sesión de Google expirada. Vuelve a intentar.");
      showPuntosView("auth");
      return;
    }

    const submitBtn = googleCompleteForm.querySelector('button[type="submit"]');
    const data = Object.fromEntries(new FormData(googleCompleteForm).entries());
    const name = String(data.name || pendingGoogleProfile.name || "").trim();
    const email = normalizeEmail(data.email || pendingGoogleProfile.email);
    const docType = String(data.docType || "CC");
    const docNumber = normalizeDoc(data.docNumber, docType);
    const phone = normalizePhone(data.phone);
    const acceptTerms = data.acceptTerms === "on" || data.acceptTerms === "true";

    if (!docNumber || !phone) {
      showAuthError("google-complete-error", "Completa documento y WhatsApp.");
      return;
    }
    const docError = validateDocNumber(docType, docNumber);
    if (docError) {
      showAuthError("google-complete-error", docError);
      return;
    }
    if (!acceptTerms) {
      showAuthError("google-complete-error", "Debes aceptar los términos y condiciones.");
      return;
    }

    const users = loadLoyaltyUsers();
    const duplicateDoc = users.some(
      (u) =>
        u.id !== pendingGoogleUserId &&
        u.docType === docType &&
        normalizeDoc(u.docNumber, docType) === docNumber
    );
    if (duplicateDoc) {
      showAuthError("google-complete-error", "Ese documento ya está registrado.");
      return;
    }

    let user = pendingGoogleUserId
      ? users.find((u) => u.id === pendingGoogleUserId)
      : null;

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Activando…";
    }

    if (user) {
      user.name = name || user.name;
      user.email = email || user.email;
      user.docType = docType;
      user.docNumber = docNumber;
      user.phone = phone;
      user.googleId = pendingGoogleProfile.sub;
      user.authProvider = "google";
      user.googlePicture = pendingGoogleProfile.picture || user.googlePicture || "";
      user.emailVerified = true;
      user.acceptedTermsAt = user.acceptedTermsAt || new Date().toISOString();
    } else {
      user = {
        id: crypto.randomUUID(),
        name,
        docType,
        docNumber,
        email,
        phone,
        googleId: pendingGoogleProfile.sub,
        authProvider: "google",
        googlePicture: pendingGoogleProfile.picture || "",
        emailVerified: true,
        points: 0,
        acceptedTermsAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };
      users.push(user);
    }

    const googleMerged = window.LoyaltyEngine?.absorbPhoneStub?.(users, user);
    saveLoyaltyUsers(googleMerged?.users || users);
    pendingGoogleProfile = null;
    pendingGoogleUserId = null;
    googleCompleteForm.reset();
    setSession(user.id);
    window.AppShell?.toast?.("Cuenta activada con Google");

    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Activar cuenta";
    }
    renderDashboard(user);
  });

  document.getElementById("btn-loyalty-logout")?.addEventListener("click", () => {
    setSession("");
    pendingVerifyUserId = null;
    pendingRecoverUserId = null;
    pendingGoogleProfile = null;
    pendingGoogleUserId = null;
    loginForm?.reset();
    registerForm?.reset();
    googleCompleteForm?.reset();
    recoverRequestForm?.reset();
    recoverResetForm?.reset();
    showPuntosView("auth");
    switchAuthTab("login");
  });

  function openPublicConfirm({
    title = "Confirmar",
    message = "",
    confirmLabel = "Confirmar",
    cancelLabel = "Cancelar",
  } = {}) {
    const panel = document.getElementById("public-confirm-panel");
    const titleEl = document.getElementById("public-confirm-title");
    const messageEl = document.getElementById("public-confirm-message");
    const okBtn = document.getElementById("public-confirm-ok");
    const cancelBtn = document.getElementById("public-confirm-cancel");
    const dismissBtn = document.getElementById("public-confirm-dismiss");

    if (!panel || !okBtn || !cancelBtn) {
      return Promise.resolve(window.confirm(message || title));
    }

    if (titleEl) titleEl.textContent = title;
    if (messageEl) messageEl.textContent = message;
    okBtn.textContent = confirmLabel;
    cancelBtn.textContent = cancelLabel;

    return new Promise((resolve) => {
      const finish = (value) => {
        panel.hidden = true;
        document.body.classList.remove("public-confirm-open");
        okBtn.removeEventListener("click", onOk);
        cancelBtn.removeEventListener("click", onCancel);
        dismissBtn?.removeEventListener("click", onCancel);
        panel.removeEventListener("keydown", onKey);
        resolve(value);
      };
      const onOk = () => finish(true);
      const onCancel = () => finish(false);
      const onKey = (ev) => {
        if (ev.key === "Escape") finish(false);
      };

      okBtn.addEventListener("click", onOk);
      cancelBtn.addEventListener("click", onCancel);
      dismissBtn?.addEventListener("click", onCancel);
      panel.addEventListener("keydown", onKey);

      panel.hidden = false;
      document.body.classList.add("public-confirm-open");
      okBtn.focus();
    });
  }

  document.getElementById("btn-redeem-whatsapp")?.addEventListener("click", () => {
    openRedeemWhatsApp();
  });

  document.getElementById("btn-redeem-cart")?.addEventListener("click", () => {
    const user = getLoggedInUser();
    if (!user) {
      window.AppShell?.toast?.("Inicia sesión para ver tu carrito de canje");
      return;
    }
    openRedeemCart(user);
  });

  document.querySelectorAll("[data-close-redeem-cart]").forEach((el) => {
    el.addEventListener("click", closeRedeemCart);
  });

  redeemCartList?.addEventListener("click", (e) => {
    const user = getLoggedInUser();
    if (!user) return;
    const row = e.target.closest(".mkt-cart-item");
    if (!row) return;
    const productId = row.getAttribute("data-redeem-cart-id");
    let cart = loadRedeemCart();
    const item = cart.find((c) => c.productId === productId);
    if (!item) return;

    if (e.target.closest("[data-remove-redeem-cart]")) {
      cart = cart.filter((c) => c.productId !== productId);
      saveRedeemCart(cart);
      renderRedeemCart(user);
      renderRedeemProducts(user);
      updatePointsProgress(user.points, redeemableProducts());
      return;
    }

    const qtyBtn = e.target.closest("[data-redeem-qty]");
    if (!qtyBtn) return;
    const delta = Number(qtyBtn.getAttribute("data-redeem-qty"));
    const product = loadRedeemProducts().find((p) => p.id === productId);
    if (!product) return;

    if (delta > 0) {
      const products = loadRedeemProducts();
      const cartTotal = redeemCartPointsTotal(
        cart,
        Object.fromEntries(products.map((p) => [p.id, p]))
      );
      const unitCost = productPointsCost(product);
      if (cartTotal + unitCost > (user.points || 0)) {
        window.AppShell?.toast?.("No tienes puntos suficientes para agregar otro");
        return;
      }
      if ((item.qty || 0) + 1 > (Number(product.stock) || 0)) {
        window.AppShell?.toast?.("No hay más unidades disponibles");
        return;
      }
    }

    item.qty = (item.qty || 0) + delta;
    if (item.qty <= 0) cart = cart.filter((c) => c.productId !== productId);
    saveRedeemCart(cart);
    renderRedeemCart(user);
    renderRedeemProducts(user);
    updatePointsProgress(user.points, redeemableProducts());
  });

  document.getElementById("btn-redeem-checkout")?.addEventListener("click", async () => {
    const user = getLoggedInUser();
    if (!user) {
      window.AppShell?.toast?.("Inicia sesión para canjear");
      return;
    }
    const updated = await redeemCartWithPoints(user);
    if (updated) renderDashboard(updated, { keepRedeemSuccess: true });
  });

  document.getElementById("loyalty-redeem-grid")?.addEventListener("click", (e) => {
    if (handlePublicCarouselClick(e)) return;
    const btn = e.target.closest(".btn-add-redeem-cart");
    if (!btn || btn.disabled) return;
    const productId = btn.getAttribute("data-product-id");
    if (!productId) return;
    const user = getLoggedInUser();
    if (!user) {
      showAuthError("redeem-error", "Debes iniciar sesión para canjear.");
      return;
    }
    addToRedeemCart(productId, user);
    updatePointsProgress(user.points, redeemableProducts());
  });
  initCarouselSwipe(document.getElementById("loyalty-redeem-grid"));

  /** Respaldo si EmailService aún no tiene sendBookingAdminAlert (caché vieja) */
  async function notifyAdminBookingFallback(booking) {
    if (window.EmailService?.sendBookingAdminAlert) {
      return window.EmailService.sendBookingAdminAlert(booking);
    }
    const c = window.EmailConfig || {};
    if (!c.enabled || c.notifyAdminOnBooking === false) {
      return { ok: false, skipped: true };
    }
    const biz = window.Tenant?.cached?.();
    const admin = String(biz?.owner_email || c.adminEmail || c.fromEmail || "").trim();
    const url = String(c.appsScriptUrl || "").trim();
    if (!admin || !url || !c.appsScriptSecret) {
      return { ok: false, message: "Correo del dueño de la membresía no configurado" };
    }
    const payloadBooking = {
      id: booking?.id || "",
      name: booking?.name || "Cliente",
      phone: booking?.phone || "",
      serviceName: booking?.serviceName || "Cita",
      date: booking?.date || "",
      time: booking?.time || "",
      duration: booking?.duration || 60,
      price: booking?.price ?? 0,
      notes: booking?.notes || "",
      status: booking?.status || "pending_confirmation",
      source: booking?.source || "public",
      business: booking?.business || c.fromName || "BarberHome",
      clientFingerprint:
        booking?.clientFingerprint || window.Security?.getDeviceId?.() || "",
    };
    const res = await fetch(url, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        secret: c.appsScriptSecret,
        type: "booking",
        from_name: c.fromName || "BarberHome",
        to_email: admin,
        admin_email: admin,
        client_name: payloadBooking.name,
        client_phone: payloadBooking.phone,
        client_fingerprint: payloadBooking.clientFingerprint,
        service: payloadBooking.serviceName,
        date: payloadBooking.date,
        time: payloadBooking.time,
        duration: payloadBooking.duration,
        price: payloadBooking.price,
        notes: payloadBooking.notes,
        booking: payloadBooking,
      }),
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    if (!res.ok || data?.ok === false) {
      return { ok: false, message: data?.message || `Error HTTP ${res.status}` };
    }
    return { ok: true, message: "Aviso enviado al administrador" };
  }

  function showBookingError(message) {
    const el = document.getElementById("booking-error");
    if (!el) return;
    el.hidden = !message;
    el.textContent = message || "";
  }

  function setBookingLoading(active) {
    if (bookingLoading) bookingLoading.hidden = !active;
    form?.classList.toggle("is-submitting", active);
    if (bookingSubmitBtn) {
      bookingSubmitBtn.disabled = active;
      bookingSubmitBtn.classList.toggle("is-loading", active);
      bookingSubmitBtn.setAttribute("aria-busy", active ? "true" : "false");
    }
    if (bookingSubmitLabel) {
      bookingSubmitLabel.textContent = active ? "Reservando…" : "Reservar";
    }
    form
      ?.querySelectorAll("input, select, button.book-nav__back")
      .forEach((el) => {
        if (active) {
          el.dataset.bookingWasDisabled = el.disabled ? "1" : "0";
          el.disabled = true;
          return;
        }
        if (el.dataset.bookingWasDisabled === "0") el.disabled = false;
        delete el.dataset.bookingWasDisabled;
      });
  }

  function sanitizeBookingPhone(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function validateBookingName(name) {
    const trimmed = String(name || "").trim();
    if (!trimmed) return "El nombre es obligatorio.";
    if (trimmed.length < 2) return "Escribe tu nombre completo.";
    return "";
  }

  function validateBookingPhoneLocal(local) {
    const digits = sanitizeBookingPhone(local);
    if (!digits) return "El WhatsApp es obligatorio.";
    if (digits.length < 7) return "Escribe un número de WhatsApp válido (mín. 7 dígitos).";
    if (digits.length > 15) return "El número de WhatsApp es demasiado largo.";
    return "";
  }

  function bindBookingPhoneInput() {
    bookingPhoneLocal?.addEventListener("input", () => {
      const next = sanitizeBookingPhone(bookingPhoneLocal.value);
      if (bookingPhoneLocal.value !== next) bookingPhoneLocal.value = next;
    });
  }

  function findRecentClientBooking(date, time, phone) {
    if (!window.BookingStore || !date || !time || !phone) return null;
    const recentMs = 120_000;
    const now = Date.now();
    return (
      window.BookingStore.loadBookings().find((b) => {
        if (!window.BookingStore.isActive(b)) return false;
        if (b.date !== date || b.time !== time || b.phone !== phone) return false;
        const created = Date.parse(b.createdAt || "") || 0;
        return now - created < recentMs;
      }) || null
    );
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (isBookingSubmitting) return;
    showBookingError("");

    const local = sanitizeBookingPhone(bookingPhoneLocal?.value || "");
    if (bookingPhoneLocal) bookingPhoneLocal.value = local;

    const data = Object.fromEntries(new FormData(form).entries());
    const name = String(data.name || "").trim();

    const nameError = validateBookingName(name);
    if (nameError) {
      showBookingError(nameError);
      bookingNameInput?.focus();
      return;
    }

    const phoneError = validateBookingPhoneLocal(local);
    if (phoneError) {
      showBookingError(phoneError);
      bookingPhoneLocal?.focus();
      return;
    }

    const fullPhone = (() => {
      const cc = bookingCc?.value || "+57";
      return `${cc}${local}`;
    })();
    if (phoneFullInput) phoneFullInput.value = fullPhone;

    data.name = name;
    data.phone = fullPhone;
    const duration = selectedType?.duration || 60;
    const date = data.date || selectedDate;
    const time = data.time || selectedTime;

    const clientFingerprint = window.Security?.getDeviceId?.() || "";

    isBookingSubmitting = true;
    setBookingLoading(true);

    try {
    const planLimit = await window.PlanLimits?.canAddAppointment?.({
      negocioId: window.Tenant?.currentId?.() || "",
      negocio: window.Tenant?.cached?.(),
    });
    if (planLimit && !planLimit.ok) {
      showBookingError(planLimit.message);
      return;
    }

    if (window.BookingStore && date && time) {
      const useGoogle = usesGoogleBusy();
      let result = await window.BookingStore.bookAtomically({
        ...data,
        date,
        time,
        countryCode: bookingCc?.value || "+57",
        serviceName: selectedType?.name || "Cita",
        duration,
        price: selectedType?.price || 0,
        slug: config.slug || slug,
        business: config.title || "BarberHome",
        calendarId: useGoogle ? "gmail" : "barberhome",
        status: "pending_confirmation",
        source: "public",
        name,
        clientFingerprint,
        negocioId: window.Tenant?.currentId?.() || "",
      });
      if (!result.ok) {
        const duplicate = findRecentClientBooking(date, time, fullPhone);
        if (duplicate) result = { ok: true, booking: duplicate };
      }
      if (!result.ok) {
        window.alert(result.message || "Esa hora ya no está disponible. Elige otra.");
        closeTimesOverlay();
        showCalendar();
        return;
      }

      // Aviso al admin PRIMERO (no depender de Google OAuth)
      try {
        const alertFn =
          window.EmailService?.sendBookingAdminAlert || notifyAdminBookingFallback;
        const alert = await alertFn({
          ...result.booking,
          clientFingerprint,
        });
        if (alert?.ok) {
          window.AppShell?.toast?.("Aviso de reserva enviado al barbero");
        } else if (alert && !alert.skipped) {
          console.warn("[booking] Aviso membresía:", alert.message);
          window.AppShell?.toast?.(
            alert.message || "No se pudo enviar el aviso al correo del barbero"
          );
        }
      } catch (err) {
        console.warn("[booking] No se pudo avisar al barbero por correo", err);
        window.AppShell?.toast?.("No se pudo enviar el aviso al correo del barbero");
      }

      // Crear evento en Google en segundo plano (no bloquea el correo)
      if (useGoogle && window.GoogleCalendar?.isConnected?.()) {
        Promise.resolve()
          .then(() =>
            window.GoogleCalendar.createEvent({
              summary: `${selectedType?.name || "Cita"} ${data.name || ""} ${fullPhone}`.trim(),
              description: `Reserva BarberHome\nCliente: ${data.name || ""}\nWhatsApp: ${fullPhone}`,
              date,
              time,
              duration,
            })
          )
          .then((gEvent) => {
            if (gEvent?.id && result.booking?.id && window.BookingStore) {
              const list = window.BookingStore.loadBookings();
              const idx = list.findIndex((b) => b.id === result.booking.id);
              if (idx >= 0) {
                list[idx] = { ...list[idx], googleEventId: gEvent.id };
                window.BookingStore.saveBookings(list);
              }
            }
          })
          .catch((err) => {
            console.warn("[booking] No se pudo crear evento en Google", err);
          });
      }
    } else {
      const booking = {
        id: crypto.randomUUID(),
        ...data,
        date,
        time,
        countryCode: bookingCc?.value || "+57",
        serviceName: selectedType?.name || "Cita",
        duration,
        price: selectedType?.price || 0,
        slug: config.slug || slug,
        negocioId: window.Tenant?.currentId?.() || "",
        business: config.title || "BarberHome",
        status: "pending_confirmation",
        source: "public",
        clientFingerprint,
        createdAt: new Date().toISOString(),
      };
      const list = JSON.parse(localStorage.getItem(BOOKINGS_KEY) || "[]");
      list.unshift(booking);
      if (window.BookingStore?.saveBookings) window.BookingStore.saveBookings(list);
      else {
        localStorage.setItem(BOOKINGS_KEY, JSON.stringify(list));
        window.dispatchEvent(new CustomEvent("barbercloud:bookings-changed"));
      }
      try {
        const alertFn =
          window.EmailService?.sendBookingAdminAlert || notifyAdminBookingFallback;
        await alertFn({ ...booking, clientFingerprint });
      } catch (err) {
        console.warn("[booking] No se pudo avisar al admin por correo", err);
      }
    }

    // Los puntos ya no se cargan solos: el barbero los asigna (5 pts por servicio).
    hideAll();
    ok.hidden = false;
    } finally {
      isBookingSubmitting = false;
      setBookingLoading(false);
    }
  });

  bindDocNumberInputs();
  bindBookingPhoneInput();

  document.getElementById("btn-book-another")?.addEventListener("click", () => {
    form?.reset();
    showBookingError("");
    if (bookingPhoneLocal) bookingPhoneLocal.value = "";
    if (phoneFullInput) phoneFullInput.value = "";
    showServices();
  });
})();
