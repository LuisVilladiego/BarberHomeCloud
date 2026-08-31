(function () {
  const BOOKINGS_KEY = "barbercloud.bookings";
  const SUB_KEY = "barbercloud.subscription";
  const NOTIF_KEY = "barbercloud.notifications";

  const dateFrom = document.getElementById("date-from");
  const dateTo = document.getElementById("date-to");
  const dateLabel = document.getElementById("date-label");
  const canvas = document.getElementById("reports-chart");
  const filterModal = document.getElementById("filter-modal");

  let filters = { calendar: "all", status: "all" };
  let googleEventsCache = [];
  let renderSeq = 0;

  // Rango por defecto: mes actual
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const toIso = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };
  dateFrom.value = toIso(monthStart);
  dateTo.value = toIso(monthEnd);

  function formatMoney(amount) {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      maximumFractionDigits: 0,
    }).format(Number(amount) || 0);
  }

  function shortMonthDay(iso) {
    const d = new Date(`${iso}T12:00:00`);
    return d.toLocaleDateString("es-CO", { month: "short", day: "numeric" }).replace(".", "");
  }

  function updateDateLabel() {
    dateLabel.textContent = `${shortMonthDay(dateFrom.value)} - ${shortMonthDay(dateTo.value)}`;
  }

  function daysInRange(from, to) {
    const out = [];
    const cur = new Date(`${from}T12:00:00`);
    const end = new Date(`${to}T12:00:00`);
    while (cur <= end) {
      out.push(toIso(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return out;
  }

  function loadBookings() {
    if (window.BookingStore?.loadBookings) return window.BookingStore.loadBookings();
    try {
      const list = JSON.parse(localStorage.getItem(BOOKINGS_KEY) || "[]");
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }

  function loadNotifications() {
    try {
      const list = JSON.parse(localStorage.getItem(NOTIF_KEY) || "[]");
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }

  function planPriceCop() {
    try {
      const sub = JSON.parse(localStorage.getItem(SUB_KEY) || "{}");
      const plan = window.BusinessModel?.findPlan?.(sub.planId) || window.Plans?.find?.(sub.planId);
      return Number(plan?.price) || 72000;
    } catch {
      return 72000;
    }
  }

  function bookingCalendarId(b) {
    const raw = String(b.calendarId || b.business || "negocio").toLowerCase();
    if (raw.includes("gmail") || raw.includes("google")) return "gmail";
    return "negocio";
  }

  function matchesCalendarFilter(calendarId) {
    const f = filters.calendar;
    if (!f || f === "all") return true;
    if (f === "gmail") return calendarId === "gmail";
    if (
      f === "BarberHome" ||
      f === "barberhome" ||
      f === "native" ||
      f === "negocio" ||
      f === "barbercloud"
    ) {
      return calendarId === "negocio";
    }
    return calendarId === String(f).toLowerCase();
  }

  function classifyBookingStatus(b) {
    const life = window.BookingStore?.lifecycleStatus?.(b);
    const confirm = window.BookingStore?.confirmationStatus?.(b);
    if (life === "cancelled" || life === "no_show") return "cancelled";
    if (confirm === "failed") return "failed";
    if (confirm === "pending" || confirm === "expired") return "waiting";
    if (confirm === "declined") return "cancelled";
    const status = String(b.status || "").toLowerCase();
    if (status.includes("cancel")) return "cancelled";
    if (status.includes("fail") || status.includes("undeliver")) return "failed";
    if (
      status.includes("pending") ||
      status.includes("waiting") ||
      status === "pending_confirmation"
    ) {
      return "waiting";
    }
    if (status.includes("confirm") || status === "google" || status === "scheduled") {
      return "confirmed";
    }
    return "confirmed";
  }

  function extractPhone(text) {
    const m = String(text || "").match(/(\+?\d[\d\s().-]{7,}\d)/);
    return m ? m[1].replace(/\s+/g, " ").trim() : "";
  }

  function mapGoogleEventToAppointment(ev) {
    if (!ev?.start) return null;
    if (String(ev.status || "").toLowerCase() === "cancelled") {
      const date = String(ev.start.dateTime || ev.start.date || "").slice(0, 10);
      if (!date) return null;
      return {
        id: `gcal-${ev.id}`,
        googleEventId: ev.id,
        date,
        name: ev.summary || "Evento Google",
        phone: extractPhone(ev.summary) || extractPhone(ev.description),
        status: "cancelled",
        calendarId: "gmail",
        source: "google",
      };
    }
    // Solo eventos con hora (las citas reales); todo el día informativo no cuenta
    if (!ev.start.dateTime) return null;
    if (String(ev.transparency || "").toLowerCase() === "transparent") return null;
    const start = new Date(ev.start.dateTime);
    if (Number.isNaN(start.getTime())) return null;
    const date = toIso(start);
    const summary = ev.summary || "Evento Google";
    const phone = extractPhone(summary) || extractPhone(ev.description);
    return {
      id: `gcal-${ev.id}`,
      googleEventId: ev.id,
      date,
      name: summary.replace(phone, "").replace(/\s{2,}/g, " ").trim() || summary,
      phone,
      status: "confirmed",
      calendarId: "gmail",
      source: "google",
    };
  }

  async function loadGoogleAppointments(from, to) {
    const api = window.GoogleCalendar;
    if (!api?.isConnected?.()) return [];
    if (filters.calendar !== "all" && filters.calendar !== "gmail") return [];
    try {
      const timeMin = new Date(`${from}T00:00:00`);
      const timeMax = new Date(`${to}T23:59:59`);
      const items = await api.listEventsInRange({
        timeMin,
        timeMax,
        maxResults: 250,
      });
      googleEventsCache = items;
      return items.map(mapGoogleEventToAppointment).filter(Boolean);
    } catch (err) {
      console.warn("[reportes] No se pudieron cargar eventos de Google", err);
      return [];
    }
  }

  function mergeAppointments(localBookings, googleAppts) {
    const googleIds = new Set(
      localBookings.map((b) => b.googleEventId).filter(Boolean)
    );
    const merged = [...localBookings];
    googleAppts.forEach((g) => {
      if (g.googleEventId && googleIds.has(g.googleEventId)) return;
      // Evitar duplicar si ya hay booking local mismo día/hora/nombre aproximado
      const dup = localBookings.some((b) => {
        if (b.date !== g.date) return false;
        if (bookingCalendarId(b) !== "gmail") return false;
        const bn = String(b.name || "").trim().toLowerCase();
        const gn = String(g.name || "").trim().toLowerCase();
        return bn && gn && (bn.includes(gn) || gn.includes(bn));
      });
      if (!dup) merged.push(g);
    });
    return merged;
  }

  function appointmentsInRange() {
    const from = dateFrom.value;
    const to = dateTo.value;
    const local = loadBookings().filter((b) => {
      const day = String(b.date || "").slice(0, 10);
      if (!day || day < from || day > to) return false;
      return matchesCalendarFilter(bookingCalendarId(b));
    });

    // Google se mezcla en buildSeries async; aquí solo local síncrono
    return local;
  }

  function messageStatsInRange() {
    // Mensajes reales de notificaciones (si existen) para KPIs de envío
    const from = dateFrom.value;
    const to = dateTo.value;
    let sent = 0;
    let failed = 0;
    loadNotifications().forEach((n) => {
      const day = String(n.appointmentAt || n.createdAt || "").slice(0, 10);
      if (!day || day < from || day > to) return;
      const type = String(n.type || "").toLowerCase();
      if (type === "alerta") return;
      if (type.includes("fail") || type.includes("undeliver")) failed += 1;
      else sent += 1;
    });
    return { sent, failed };
  }

  function buildSeries(appointments) {
    const days = daysInRange(dateFrom.value, dateTo.value);
    const series = days.map((date) => ({
      date,
      confirmed: 0,
      cancelled: 0,
      waiting: 0,
      failed: 0,
    }));
    const byDate = Object.fromEntries(series.map((s) => [s.date, s]));

    appointments.forEach((b) => {
      const day = String(b.date || "").slice(0, 10);
      if (!byDate[day]) return;
      if (!matchesCalendarFilter(bookingCalendarId(b))) return;
      const bucket = classifyBookingStatus(b);
      if (byDate[day][bucket] != null) byDate[day][bucket] += 1;
    });

    return series;
  }

  function applyStatusFilter(point) {
    if (filters.status === "all") return point;
    const zero = { ...point, confirmed: 0, cancelled: 0, waiting: 0, failed: 0 };
    if (filters.status === "confirmed") zero.confirmed = point.confirmed;
    if (filters.status === "cancelled") zero.cancelled = point.cancelled;
    if (filters.status === "waiting") zero.waiting = point.waiting;
    if (filters.status === "failed") zero.failed = point.failed;
    return zero;
  }

  function totals(series) {
    return series.reduce(
      (acc, d) => {
        acc.confirmed += d.confirmed;
        acc.cancelled += d.cancelled;
        acc.waiting += d.waiting;
        acc.failed += d.failed;
        return acc;
      },
      { confirmed: 0, cancelled: 0, waiting: 0, failed: 0 }
    );
  }

  function renderKpis(series) {
    const t = totals(series);
    const apptTotal = t.confirmed + t.cancelled + t.waiting + t.failed;
    const msgs = window.Billing?.isRestricted?.() ? { sent: 0, failed: 0 } : messageStatsInRange();
    // Total mostrado: prioriza citas del calendario; si hay mensajes, úsalos como contexto de envío
    const total = apptTotal;
    const answered = t.confirmed + t.cancelled;
    const confirmRate = total ? Math.round((t.confirmed / total) * 1000) / 10 : 0;
    const responseRate = total ? Math.round((answered / total) * 1000) / 10 : 0;
    const cost = planPriceCop();
    const costBase = msgs.sent || total;
    const costMsg = costBase ? Math.round(cost / costBase) : 0;

    let peak = series[0] || { date: dateFrom.value, confirmed: 0, cancelled: 0, waiting: 0, failed: 0 };
    series.forEach((d) => {
      const sum = d.confirmed + d.cancelled + d.waiting + d.failed;
      const peakSum = peak.confirmed + peak.cancelled + peak.waiting + peak.failed;
      if (sum > peakSum) peak = d;
    });
    const peakSum = peak.confirmed + peak.cancelled + peak.waiting + peak.failed;

    document.getElementById("kpi-total").textContent = String(total);
    document.getElementById("kpi-confirmed").textContent = String(t.confirmed);
    document.getElementById("kpi-cancelled").textContent = String(t.cancelled);
    document.getElementById("kpi-waiting").textContent = String(t.waiting);
    document.getElementById("kpi-failed").textContent = String(t.failed + msgs.failed);
    document.getElementById("kpi-confirm-rate").textContent = `${confirmRate}%`;
    document.getElementById("kpi-response-rate").textContent = `${responseRate}%`;
    document.getElementById("kpi-cost").textContent = formatMoney(cost);
    document.getElementById("kpi-cost-msg").textContent = formatMoney(costMsg);
    document.getElementById("kpi-peak").textContent = shortMonthDay(peak.date);
    document.getElementById("kpi-peak-hint").textContent = `${peakSum} citas ese día`;
  }

  function normalizePhone(phone) {
    return String(phone || "").replace(/\D/g, "");
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function clientKey(booking) {
    const phone = normalizePhone(booking.phone);
    const name = String(booking.name || "")
      .trim()
      .toLowerCase();
    if (phone.length >= 7) return `p:${phone}`;
    if (name) return `n:${name}`;
    return `id:${booking.id || Math.random()}`;
  }

  function buildClientRanking(appointments) {
    const map = new Map();
    appointments.forEach((b) => {
      if (!matchesCalendarFilter(bookingCalendarId(b))) return;
      if (window.BookingStore?.lifecycleStatus?.(b) === "cancelled") return;
      const status = String(b.status || "").toLowerCase();
      if (status.includes("cancel")) return;

      const key = clientKey(b);
      const day = String(b.date || "").slice(0, 10);
      const prev = map.get(key) || {
        key,
        name: b.name || "Cliente",
        phone: b.phone || "",
        count: 0,
        lastDate: day,
      };
      prev.count += 1;
      if (!prev.name || prev.name === "Cliente") prev.name = b.name || prev.name;
      if (!prev.phone && b.phone) prev.phone = b.phone;
      if (day > prev.lastDate) prev.lastDate = day;
      map.set(key, prev);
    });

    return Array.from(map.values())
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "es"))
      .slice(0, 10);
  }

  function renderRanking(appointments) {
    const listEl = document.getElementById("client-ranking");
    const periodEl = document.getElementById("ranking-period");
    if (periodEl) {
      periodEl.textContent = `${shortMonthDay(dateFrom.value)} – ${shortMonthDay(dateTo.value)}`;
    }
    if (!listEl) return [];

    const ranking = buildClientRanking(appointments);
    if (!ranking.length) {
      listEl.innerHTML = `<li class="client-ranking__empty">Aún no hay citas en este período para armar el ranking.</li>`;
      return ranking;
    }

    const max = ranking[0]?.count || 1;
    listEl.innerHTML = ranking
      .map((row, idx) => {
        const place = idx + 1;
        const medal =
          place === 1 ? "is-gold" : place === 2 ? "is-silver" : place === 3 ? "is-bronze" : "";
        const pct = Math.max(8, Math.round((row.count / max) * 100));
        const phone = row.phone
          ? `<span class="client-ranking__phone">${escapeHtml(row.phone)}</span>`
          : "";
        return `
          <li class="client-ranking__item ${medal}">
            <span class="client-ranking__place" aria-label="Puesto ${place}">${place}</span>
            <div class="client-ranking__info">
              <strong>${escapeHtml(row.name)}</strong>
              ${phone}
              <div class="client-ranking__bar" aria-hidden="true">
                <span style="width:${pct}%"></span>
              </div>
            </div>
            <div class="client-ranking__stats">
              <strong>${row.count}</strong>
              <span>${row.count === 1 ? "cita" : "citas"}</span>
            </div>
          </li>`;
      })
      .join("");
    return ranking;
  }

  function drawChart(series) {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.parentElement.clientWidth;
    const cssH = 280;
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const pad = { t: 16, r: 12, b: 36, l: 36 };
    const w = cssW - pad.l - pad.r;
    const h = cssH - pad.t - pad.b;
    const maxVal = Math.max(
      4,
      ...series.map((d) => d.confirmed + d.cancelled + d.waiting + d.failed)
    );
    const step = Math.max(1, Math.ceil(maxVal / 6));
    const yMax = step * 6;

    ctx.clearRect(0, 0, cssW, cssH);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, cssW, cssH);

    ctx.strokeStyle = "#eef0f3";
    ctx.fillStyle = "#9ca3af";
    ctx.font = "11px DM Sans, system-ui, sans-serif";
    ctx.textAlign = "right";
    for (let v = 0; v <= yMax; v += step) {
      const y = pad.t + h - (v / yMax) * h;
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(pad.l + w, y);
      ctx.stroke();
      ctx.fillText(String(v), pad.l - 8, y + 3);
    }

    const gap = 4;
    const barW = Math.max(4, w / Math.max(series.length, 1) - gap);
    const colors = {
      confirmed: "#22c55e",
      cancelled: "#ef4444",
      waiting: "#eab308",
      failed: "#f97316",
    };

    series.forEach((d, i) => {
      const x = pad.l + i * (barW + gap) + gap / 2;
      let y = pad.t + h;
      ["confirmed", "cancelled", "waiting", "failed"].forEach((key) => {
        const val = d[key];
        if (!val) return;
        const bh = (val / yMax) * h;
        y -= bh;
        ctx.fillStyle = colors[key];
        ctx.fillRect(x, y, barW, bh);
      });
    });

    ctx.fillStyle = "#9ca3af";
    ctx.textAlign = "center";
    const labelEvery = Math.max(1, Math.ceil(series.length / 10));
    series.forEach((d, i) => {
      if (i % labelEvery !== 0 && i !== series.length - 1) return;
      const x = pad.l + i * (barW + gap) + gap / 2 + barW / 2;
      const label = d.date.slice(5);
      ctx.save();
      ctx.translate(x, pad.t + h + 14);
      ctx.rotate((-35 * Math.PI) / 180);
      ctx.fillText(label, 0, 0);
      ctx.restore();
    });
  }

  async function collectAppointments() {
    const local = appointmentsInRange();
    const googleAppts = await loadGoogleAppointments(dateFrom.value, dateTo.value);
    if (filters.calendar === "gmail") {
      // Solo Google (+ bookings locales marcados gmail)
      const localGmail = local.filter((b) => bookingCalendarId(b) === "gmail");
      return mergeAppointments(localGmail, googleAppts);
    }
    if (filters.calendar === "all") {
      return mergeAppointments(local, googleAppts);
    }
    return local;
  }

  async function render() {
    const seq = ++renderSeq;
    updateDateLabel();
    if (window.Billing?.isRestricted?.()) {
      const series = daysInRange(dateFrom.value, dateTo.value).map((date) => ({
        date,
        confirmed: 0,
        cancelled: 0,
        waiting: 0,
        failed: 0,
      }));
      renderKpis(series);
      drawChart(series);
      renderRanking([]);
      return { series, appointments: [] };
    }
    const appointments = await collectAppointments();
    if (seq !== renderSeq) return null;
    const series = buildSeries(appointments).map(applyStatusFilter);
    renderKpis(series);
    drawChart(series);
    renderRanking(appointments);
    return { series, appointments };
  }

  dateFrom.addEventListener("change", () => render());
  dateTo.addEventListener("change", () => render());
  window.addEventListener("resize", () => render());

  document.getElementById("btn-filter")?.addEventListener("click", () => {
    filterModal.hidden = false;
  });
  document.querySelectorAll("[data-close-filter]").forEach((el) =>
    el.addEventListener("click", () => {
      filterModal.hidden = true;
    })
  );
  document.getElementById("filter-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    filters = {
      calendar: String(fd.get("calendar") || "all"),
      status: String(fd.get("status") || "all"),
    };
    filterModal.hidden = true;
    render();
    window.AppShell?.toast("Filtros aplicados");
  });

  document.getElementById("btn-download")?.addEventListener("click", async () => {
    const result = await render();
    if (!result) return;
    const { series, appointments } = result;
    const t = totals(series);
    const ranking = buildClientRanking(appointments);
    const rows = [
      ["fecha", "confirmadas", "canceladas", "esperando", "no_entregados"],
      ...series.map((d) => [d.date, d.confirmed, d.cancelled, d.waiting, d.failed]),
      [],
      ["metricas"],
      ["citas_totales", t.confirmed + t.cancelled + t.waiting + t.failed],
      ["confirmadas", t.confirmed],
      ["canceladas", t.cancelled],
      ["esperando", t.waiting],
      ["no_entregados", t.failed],
      ["costo_periodo_cop", planPriceCop()],
      ["calendario_filtro", filters.calendar],
      [],
      ["ranking_clientes"],
      ["puesto", "nombre", "telefono", "citas"],
      ...ranking.map((r, i) => [i + 1, r.name, r.phone, r.count]),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reporte-${dateFrom.value}_${dateTo.value}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    window.AppShell?.toast("Reporte descargado");
  });

  // Si Google está conectado, default útil: todos (incluye Google)
  if (window.GoogleCalendar?.isConnected?.()) {
    const select = filterModal?.querySelector('select[name="calendar"]');
    if (select && !select.value) select.value = "all";
  }

  if (window.AppShell?.whenReady) window.AppShell.whenReady(render);
  else window.addEventListener("barbercloud:panel-ready", render, { once: true });
})();
