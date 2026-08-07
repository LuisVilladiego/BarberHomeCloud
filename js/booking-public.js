(function () {
  const STORAGE_KEY = "barbercloud.autoagenda";
  const BOOKINGS_KEY = "barbercloud.bookings";
  const LOYALTY_USERS_KEY = "barbercloud.loyalty_users";
  const LOYALTY_SESSION_KEY = "barbercloud.loyalty_session";
  const LOYALTY_HISTORY_KEY = "barbercloud.loyalty_history";
  const POINTS_KEY = "barbercloud.points";
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
  const slug = params.get("s") || "";
  const config = loadConfig();
  const types =
    Array.isArray(config.appointmentTypes) && config.appointmentTypes.length
      ? config.appointmentTypes
      : [{ id: "type-1", name: "Agendar cita en BarberHome", duration: 60, price: 0, scheduleId: "" }];
  const schedules = Array.isArray(config.schedules) ? config.schedules : [];

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

  if (config.title) title.textContent = config.title;
  if (config.description) description.textContent = config.description;
  avatar.src = config.avatarDataUrl || "assets/barberhome-avatar.png";
  document.title = `${config.title || "Agendar"} · BarberHome`;

  let selectedType = null;
  let viewMonth = startOfDay(new Date());
  viewMonth.setDate(1);
  let selectedDate = null;
  let selectedTime = null;

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
    form.hidden = true;
    ok.hidden = true;
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

  async function showCalendar() {
    hideAll();
    calendarStep.hidden = false;
    document.getElementById("calendar-service-name").textContent =
      selectedType?.name || "Agendar cita";
    document.getElementById("calendar-service-duration").textContent = `${
      selectedType?.duration || 60
    } min`;
    await refreshGoogleBusyIfNeeded({ force: true });
    closeTimesOverlay();
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
  const AVAILABILITY_POLL_MS = 5000;

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
    // Primera pasada rápida y luego cada 5s mientras estés en calendario/horas
    availabilityPollId = setInterval(() => {
      pollAvailability({ force: true });
    }, AVAILABILITY_POLL_MS);
  }

  function stopAvailabilityPolling() {
    if (availabilityPollId) {
      clearInterval(availabilityPollId);
      availabilityPollId = null;
    }
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden || !isAvailabilityViewActive()) return;
    pollAvailability({ force: true });
  });

  window.addEventListener("storage", (e) => {
    if (e.key !== "barbercloud.google_busy_cache" && e.key !== "barbercloud.bookings") return;
    if (!isAvailabilityViewActive()) return;
    applyAvailabilityToUI();
  });

  window.BookingStore?.subscribe?.(() => {
    if (!isAvailabilityViewActive()) return;
    applyAvailabilityToUI();
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
    await refreshGoogleBusyIfNeeded();
    renderCalendar();
  });

  calNext.addEventListener("click", async () => {
    viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1);
    await refreshGoogleBusyIfNeeded();
    renderCalendar();
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
    await refreshGoogleBusyIfNeeded({ force: true });
    lastBusyFingerprint = busyFingerprint();
    renderCalendar();
    renderTimes();
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
  const CART_KEY = "barbercloud.marketplace_cart";
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

  function renderPublicShop() {
    const products = loadShopProducts();
    updatePublicCartBadge();
    closePublicCart();

    if (!publicShopGrid) return;
    if (!products.length) {
      publicShopGrid.innerHTML = `
        <div class="mkt-empty">
          <strong>Pronto habrá productos</strong>
          <p>Aún no hay artículos publicados en la tienda BarberHome.</p>
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

    const carousel = e.target.closest(".mkt-carousel");
    if (!carousel) return;
    const current = Number(carousel.dataset.index || 0);
    const dirBtn = e.target.closest("[data-dir]");
    if (dirBtn) {
      setPublicCarouselIndex(carousel, current + Number(dirBtn.getAttribute("data-dir")));
      return;
    }
    const dot = e.target.closest("[data-dot]");
    if (dot) setPublicCarouselIndex(carousel, Number(dot.getAttribute("data-dot")));
  });

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
    const text = encodeURIComponent(buildShopWhatsAppMessage(lines, total));
    const url = `https://wa.me/${phone}?text=${text}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  let lastRedeemWhatsApp = null;

  function buildRedeemWhatsAppMessage(payload) {
    const business = config.title || "BarberHome";
    const c = payload?.customer || {};
    const lines = [
      `Hola, canjeé puntos en ${business} y quiero coordinar la entrega:`,
      "",
      `Producto: ${payload?.productName || "Producto"}`,
      `Puntos canjeados: ${payload?.pointsCost ?? "—"}`,
      `Saldo restante: ${payload?.balance ?? "—"} pts`,
      `Cliente: ${c.name || "—"}`,
      `Documento: ${c.docType || "CC"} ${c.docNumber || "—"}`,
      `Teléfono: ${c.phone || "—"}`,
    ];
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
    const text = encodeURIComponent(buildRedeemWhatsAppMessage(data));
    const url = `https://wa.me/${phone}?text=${text}`;
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

  document.getElementById("btn-shop")?.addEventListener("click", () => {
    hideAll();
    if (shopStep) shopStep.hidden = false;
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
  const loginForm = document.getElementById("loyalty-login-form");
  const registerForm = document.getElementById("loyalty-register-form");
  const verifyForm = document.getElementById("loyalty-verify-form");
  const recoverRequestForm = document.getElementById("loyalty-recover-request-form");
  const recoverResetForm = document.getElementById("loyalty-recover-reset-form");
  let pendingVerifyUserId = null;
  let pendingRecoverUserId = null;

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
    if (!/[^A-Za-z0-9]/.test(pw)) return "Debe incluir al menos un símbolo (!@#$…).";
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
    return localStorage.getItem(LOYALTY_SESSION_KEY) || "";
  }

  function setSession(userId) {
    if (userId) localStorage.setItem(LOYALTY_SESSION_KEY, userId);
    else localStorage.removeItem(LOYALTY_SESSION_KEY);
  }

  function normalizeDoc(value) {
    return String(value || "").replace(/\s+/g, "").toUpperCase();
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

  function redeemableProducts() {
    return loadShopProducts()
      .filter((p) => (Number(p.stock) || 0) > 0)
      .map((p) => ({
        ...p,
        pointsCost: pointsCostForProduct(p.price),
      }))
      .sort((a, b) => a.pointsCost - b.pointsCost || String(a.name).localeCompare(String(b.name)));
  }

  function renderRedeemProducts(user) {
    const grid = document.getElementById("loyalty-redeem-grid");
    const lead = document.getElementById("loyalty-redeem-lead");
    if (!grid) return;

    const points = user.points || 0;
    const products = redeemableProducts();
    const affordable = products.filter((p) => p.pointsCost <= points).length;

    if (lead) {
      lead.textContent = products.length
        ? affordable
          ? `Puedes canjear ${affordable} producto${affordable === 1 ? "" : "s"} con tus ${points} puntos.`
          : `Aún no alcanzas ningún producto. Recuerda pedirle al barbero cargar tus ${LOYALTY.earnPerService} pts por servicio.`
        : "Por ahora no hay productos con stock para canjear.";
    }

    if (!products.length) {
      grid.innerHTML =
        `<p class="loyalty-redeem-empty">Cuando haya productos en el marketplace, aparecerán aquí.</p>`;
      return;
    }

    grid.innerHTML = products
      .map((p) => {
        const missing = Math.max(0, p.pointsCost - points);
        const can = missing === 0;
        const thumb = p.images?.length ? p.images[0] : PLACEHOLDER;
        return `
          <article class="loyalty-redeem-item ${can ? "is-ready" : "is-locked"}" data-product-id="${escapeShopHtml(p.id)}">
            <div class="loyalty-redeem-item__media">
              <img class="loyalty-redeem-item__img" src="${thumb}" alt="${escapeShopHtml(p.name)}" loading="lazy" />
            </div>
            <div class="loyalty-redeem-item__body">
              <h4>${escapeShopHtml(p.name)}</h4>
              <p class="loyalty-redeem-item__price"><strong>${p.pointsCost}</strong> puntos</p>
              <p class="loyalty-redeem-item__status">
                ${
                  can
                    ? "Listo para canjear"
                    : `Te faltan <strong>${missing}</strong> punto${missing === 1 ? "" : "s"}`
                }
              </p>
              <button
                type="button"
                class="btn ${can ? "btn--primary" : "btn--secondary"} btn--block btn-redeem-product"
                data-product-id="${escapeShopHtml(p.id)}"
                ${can ? "" : "disabled"}
              >
                ${can ? "Canjear ahora" : `Faltan ${missing} pts`}
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
      if (hint) hint.textContent = "Sin productos disponibles para canjear por ahora.";
      return;
    }

    const next = products.find((p) => p.pointsCost > points) || products[products.length - 1];
    const need = next.pointsCost;
    const pct = Math.min(100, Math.round((points / need) * 100));
    if (bar) bar.style.width = `${pct}%`;
    if (hint) {
      if (points >= products[0].pointsCost) {
        const ready = products.filter((p) => p.pointsCost <= points).length;
        hint.textContent =
          points >= need
            ? `Tienes puntos para canjear ${ready} producto${ready === 1 ? "" : "s"}.`
            : `Puedes canjear ${ready} producto${ready === 1 ? "" : "s"}. Te faltan ${need - points} pts para ${next.name}.`;
      } else {
        hint.textContent = `Te faltan ${need - points} puntos para canjear ${next.name} (${need} pts).`;
      }
    }
  }

  function redeemProductWithPoints(productId) {
    const users = loadLoyaltyUsers();
    const sessionId = getSessionUserId();
    const idx = users.findIndex((u) => u.id === sessionId && u.emailVerified);
    if (idx < 0) {
      showAuthError("redeem-error", "Debes iniciar sesión para canjear.");
      return;
    }

    let user = syncUserPoints(users[idx]);
    const products = loadShopProducts();
    const pIdx = products.findIndex((p) => p.id === productId);
    if (pIdx < 0) {
      showAuthError("redeem-error", "Ese producto ya no está disponible.");
      renderDashboard(user);
      return;
    }

    const product = products[pIdx];
    const stock = Number(product.stock) || 0;
    if (stock <= 0) {
      showAuthError("redeem-error", "Ese producto está agotado.");
      renderDashboard(user);
      return;
    }

    const cost = pointsCostForProduct(product.price);
    if ((user.points || 0) < cost) {
      showAuthError(
        "redeem-error",
        `Te faltan ${cost - (user.points || 0)} puntos para canjear ${product.name}.`
      );
      renderDashboard(user);
      return;
    }

    const now = new Date().toISOString();
    ensureLedger(user);
    appendAdminHistory({
      id: crypto.randomUUID(),
      userId: user.id,
      name: user.name,
      docType: user.docType,
      docNumber: user.docNumber,
      amount: -cost,
      note: `Canje producto · ${product.name}`,
      at: now,
    });
    user.ledger.push({
      type: "redeem",
      amount: -cost,
      at: now,
      note: `Canje producto · ${product.name}`,
      productId: product.id,
    });
    syncUserPoints(user);
    try {
      const list = JSON.parse(localStorage.getItem(LOYALTY_HISTORY_KEY) || "[]");
      if (list[0]) {
        list[0].balance = user.points;
        localStorage.setItem(LOYALTY_HISTORY_KEY, JSON.stringify(list.slice(0, 100)));
      }
    } catch {
      /* ignore */
    }

    products[pIdx] = { ...product, stock: stock - 1 };
    saveShopProducts(products);

    const saleId = `sale-${Date.now().toString(36)}`;
    const redeemId = `predeem-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const customer = {
      userId: user.id,
      name: user.name,
      docType: user.docType,
      docNumber: user.docNumber,
      phone: user.phone,
      email: user.email || "",
    };

    const sales = loadShopSales();
    sales.unshift({
      id: saleId,
      createdAt: now,
      total: Number(product.price) || 0,
      units: 1,
      items: [
        {
          productId: product.id,
          name: product.name,
          price: product.price,
          qty: 1,
          lineTotal: Number(product.price) || 0,
          pointsCost: cost,
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
        saleId,
        createdAt: now,
        productId: product.id,
        productName: product.name,
        pointsCost: cost,
        valueCop: Number(product.price) || 0,
        status: "pending",
        deliveredAt: null,
        pointsDeducted: true,
        customer,
      });
      localStorage.setItem(PRODUCT_REDEEMS_KEY, JSON.stringify(list.slice(0, 200)));
    } catch {
      /* ignore */
    }

    users[idx] = user;
    saveLoyaltyUsers(users);
    try {
      renderPublicShop();
    } catch {
      /* ignore */
    }

    const alertPayload = {
      id: redeemId,
      productName: product.name,
      pointsCost: cost,
      valueCop: Number(product.price) || 0,
      createdAt: now,
      customer,
    };
    try {
      const alertFn = window.EmailService?.sendRedeemAdminAlert;
      if (typeof alertFn === "function") {
        alertFn(alertPayload).catch((err) => {
          console.warn("[loyalty] No se pudo avisar al admin del canje", err);
        });
      }
    } catch (err) {
      console.warn("[loyalty] No se pudo avisar al admin del canje", err);
    }

    lastRedeemWhatsApp = {
      id: redeemId,
      productName: product.name,
      pointsCost: cost,
      balance: user.points,
      customer,
    };

    const success = document.getElementById("redeem-success");
    const successText = document.getElementById("redeem-success-text");
    if (successText) {
      successText.textContent = `Canjeaste ${product.name} por ${cost} puntos. Te quedan ${user.points} pts. Coordina la entrega por WhatsApp.`;
    }
    if (success) success.hidden = false;
    showAuthError("redeem-error", "");
    renderDashboard(user, { keepRedeemSuccess: true });
    window.AppShell?.toast?.(`Canje exitoso: ${product.name}`);
  }

  function renderDashboard(user, opts = {}) {
    syncUserPoints(user);
    const points = user.points || 0;
    document.getElementById("loyalty-user-name").textContent = user.name.split(" ")[0] || user.name;
    document.getElementById("points-value").textContent = String(points);

    const products = redeemableProducts();
    updatePointsProgress(points, products);
    renderRedeemProducts(user);

    document.getElementById("loyalty-meta").innerHTML = `
      <p><strong>Documento:</strong> ${user.docType} ${user.docNumber}</p>
      <p><strong>Correo:</strong> ${user.email}</p>
      <p><strong>Teléfono:</strong> ${user.phone}</p>
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
    const docNumber = normalizeDoc(data.docNumber);
    const email = normalizeEmail(data.email);
    const phone = normalizePhone(data.phone);
    const password = String(data.password || "");
    const passwordConfirm = String(data.passwordConfirm || "");
    const acceptTerms = data.acceptTerms === "on" || data.acceptTerms === "true";

    if (!name || !docNumber || !email || !phone || !password) {
      showAuthError("register-error", "Completa todos los campos.");
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
    if (users.some((u) => normalizeDoc(u.docNumber) === docNumber && u.docType === docType)) {
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
      saveLoyaltyUsers(users);
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
    saveLoyaltyUsers(users);
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
    const docNumber = normalizeDoc(data.docNumber);
    const email = normalizeEmail(data.email);
    const password = String(data.password || "");
    const users = loadLoyaltyUsers();
    const user = users.find(
      (u) =>
        u.docType === docType &&
        normalizeDoc(u.docNumber) === docNumber &&
        normalizeEmail(u.email) === email
    );

    if (!user) {
      showAuthError("login-error", "No encontramos esa cuenta. Revisa los datos o regístrate.");
      return;
    }

    if (!user.emailVerified) {
      startEmailVerification(user);
      return;
    }

    if (!user.passwordHash || !user.passwordSalt) {
      showAuthError(
        "login-error",
        "Tu cuenta aún no tiene contraseña. Usa Recuperar contraseña para crear una."
      );
      return;
    }

    const ok = await verifyPassword(password, user.passwordSalt, user.passwordHash);
    if (!ok) {
      showAuthError("login-error", "Contraseña incorrecta.");
      return;
    }

    setSession(user.id);
    renderDashboard(user);
  });

  recoverRequestForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const submitBtn = recoverRequestForm.querySelector('button[type="submit"]');
    const data = Object.fromEntries(new FormData(recoverRequestForm).entries());
    const docType = String(data.docType || "CC");
    const docNumber = normalizeDoc(data.docNumber);
    const email = normalizeEmail(data.email);
    const users = loadLoyaltyUsers();
    const user = users.find(
      (u) =>
        u.docType === docType &&
        normalizeDoc(u.docNumber) === docNumber &&
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
    users[idx].emailVerified = true;
    users[idx].verifyCode = "";
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

  document.getElementById("btn-loyalty-logout")?.addEventListener("click", () => {
    setSession("");
    pendingVerifyUserId = null;
    pendingRecoverUserId = null;
    loginForm?.reset();
    registerForm?.reset();
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

  document.getElementById("loyalty-redeem-grid")?.addEventListener("click", async (e) => {
    const btn = e.target.closest(".btn-redeem-product");
    if (!btn || btn.disabled) return;
    const productId = btn.getAttribute("data-product-id");
    if (!productId) return;

    const product = loadShopProducts().find((p) => p.id === productId);
    const cost = product ? pointsCostForProduct(product.price) : 0;
    const productName = product?.name || "este producto";
    const ok = await openPublicConfirm({
      title: "Confirmar canje",
      message: `Vas a canjear ${productName} por ${cost} puntos. Se descontarán al instante; luego coordina la entrega por WhatsApp.`,
      confirmLabel: "Sí, canjear",
      cancelLabel: "Cancelar",
    });
    if (!ok) return;
    redeemProductWithPoints(productId);
  });

  /** Respaldo si EmailService aún no tiene sendBookingAdminAlert (caché vieja) */
  async function notifyAdminBookingFallback(booking) {
    const c = window.EmailConfig || {};
    if (!c.enabled || c.notifyAdminOnBooking === false) {
      return { ok: false, skipped: true };
    }
    const admin = String(c.adminEmail || c.fromEmail || "").trim();
    const url = String(c.appsScriptUrl || "").trim();
    if (!admin || !url || !c.appsScriptSecret) {
      return { ok: false, message: "Correo admin no configurado" };
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

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const local = String(bookingPhoneLocal?.value || "").trim();
    if (!local) {
      bookingPhoneLocal?.focus();
      return;
    }
    const fullPhone = (() => {
      const cc = bookingCc?.value || "+57";
      const digits = local.replace(/[^\d]/g, "");
      return `${cc}${digits}`;
    })();
    if (phoneFullInput) phoneFullInput.value = fullPhone;

    const data = Object.fromEntries(new FormData(form).entries());
    data.phone = fullPhone;
    const duration = selectedType?.duration || 60;
    const date = data.date || selectedDate;
    const time = data.time || selectedTime;

    // Revalidar ocupación (local + Google) justo antes de reservar
    if (date && time && !isSlotOpen(date, time, duration)) {
      window.alert("Esa hora ya no está disponible. Elige otra.");
      closeTimesOverlay();
      showCalendar();
      return;
    }

    if (window.BookingStore && date && time) {
      const useGoogle = usesGoogleBusy();
      const result = await window.BookingStore.bookAtomically({
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
        name: data.name || "Cliente",
      });
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
        const alert = await alertFn(result.booking);
        if (alert?.ok) {
          window.AppShell?.toast?.("Aviso de reserva enviado a tu correo");
        } else if (alert && !alert.skipped) {
          console.warn("[booking] Aviso admin:", alert.message);
          window.AppShell?.toast?.(
            alert.message || "No se pudo enviar el aviso al correo admin"
          );
        }
      } catch (err) {
        console.warn("[booking] No se pudo avisar al admin por correo", err);
        window.AppShell?.toast?.("No se pudo enviar el aviso al correo admin");
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
        business: config.title || "BarberHome",
        status: "pending_confirmation",
        source: "public",
        createdAt: new Date().toISOString(),
      };
      const list = JSON.parse(localStorage.getItem(BOOKINGS_KEY) || "[]");
      list.unshift(booking);
      localStorage.setItem(BOOKINGS_KEY, JSON.stringify(list));
      try {
        const alertFn =
          window.EmailService?.sendBookingAdminAlert || notifyAdminBookingFallback;
        await alertFn(booking);
      } catch (err) {
        console.warn("[booking] No se pudo avisar al admin por correo", err);
      }
    }

    // Los puntos ya no se cargan solos: el barbero los asigna (5 pts por servicio).
    hideAll();
    ok.hidden = false;
  });

  document.getElementById("btn-book-another")?.addEventListener("click", () => {
    form?.reset();
    if (bookingPhoneLocal) bookingPhoneLocal.value = "";
    if (phoneFullInput) phoneFullInput.value = "";
    showServices();
  });
})();
