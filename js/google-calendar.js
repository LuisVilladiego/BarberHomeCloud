/**
 * Conexión a Google Calendar vía Google Identity Services (token en navegador).
 */
(function () {
  const AUTH_BASE = "barbercloud.google_auth";
  const BUSY_BASE = "barbercloud.google_busy_cache";
  const ACTIVE_BASE = "barbercloud.active_calendar";
  const CANONICAL_ORIGIN = "https://barber-home-cloud.vercel.app";
  const cfg = () => window.GoogleConfig || {};

  function authKey() {
    return window.Tenant?.scopedStorageKey?.(AUTH_BASE) || AUTH_BASE;
  }

  function busyKey() {
    return window.Tenant?.scopedStorageKey?.(BUSY_BASE) || BUSY_BASE;
  }

  function activeCalKey() {
    return window.Tenant?.scopedStorageKey?.(ACTIVE_BASE) || ACTIVE_BASE;
  }

  function googleAuthError(err) {
    const raw = String(err?.type || err?.message || err || "");
    if (/origin/i.test(raw)) {
      return `Google no autoriza esta dirección. Abre el panel en ${CANONICAL_ORIGIN}`;
    }
    return err?.message || raw || "Error de autenticación Google";
  }

  let tokenClient = null;
  let pendingResolve = null;
  let pendingReject = null;

  function loadAuth() {
    try {
      return JSON.parse(localStorage.getItem(authKey()) || "null");
    } catch {
      return null;
    }
  }

  function saveAuth(data) {
    if (!data) {
      localStorage.removeItem(authKey());
      return;
    }
    localStorage.setItem(authKey(), JSON.stringify(data));
  }

  function isExpired(auth) {
    if (!auth?.accessToken || !auth?.expiresAt) return true;
    return Date.now() >= Number(auth.expiresAt) - 60_000;
  }

  function waitForGis(timeoutMs = 12000) {
    return new Promise((resolve, reject) => {
      if (window.google?.accounts?.oauth2) {
        resolve();
        return;
      }
      const start = Date.now();
      const id = setInterval(() => {
        if (window.google?.accounts?.oauth2) {
          clearInterval(id);
          resolve();
        } else if (Date.now() - start > timeoutMs) {
          clearInterval(id);
          reject(new Error("No se cargó Google Identity Services"));
        }
      }, 100);
    });
  }

  function ensureTokenClient() {
    const clientId = cfg().clientId;
    if (!clientId) throw new Error("Falta GoogleConfig.clientId");
    if (tokenClient) return tokenClient;

    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: cfg().scopes,
      callback: (response) => {
        if (response.error) {
          pendingReject?.(new Error(googleAuthError(response)));
          pendingResolve = null;
          pendingReject = null;
          return;
        }
        pendingResolve?.(response);
        pendingResolve = null;
        pendingReject = null;
      },
      error_callback: (err) => {
        pendingReject?.(new Error(googleAuthError(err)));
        pendingResolve = null;
        pendingReject = null;
      },
    });
    return tokenClient;
  }

  function requestToken(prompt) {
    return new Promise((resolve, reject) => {
      pendingResolve = resolve;
      pendingReject = reject;
      ensureTokenClient().requestAccessToken(prompt ? { prompt } : {});
    });
  }

  async function fetchJson(url, accessToken) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.error?.message || `Error HTTP ${res.status}`;
      throw new Error(msg);
    }
    return data;
  }

  async function fetchUserEmail(accessToken) {
    const data = await fetchJson(
      "https://www.googleapis.com/oauth2/v3/userinfo",
      accessToken
    );
    return data.email || "";
  }

  async function listCalendars(accessToken) {
    const data = await fetchJson(
      "https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader&maxResults=50",
      accessToken
    );
    return Array.isArray(data.items) ? data.items : [];
  }

  /** Calendarios que no deben bloquear citas (festivos, cumpleaños, etc.) */
  function isIgnorableCalendar(cal) {
    const id = String(cal?.id || "").toLowerCase();
    const summary = String(cal?.summary || "").toLowerCase();
    const hay = `${id} ${summary}`;
    return (
      hay.includes("holiday") ||
      hay.includes("festivo") ||
      hay.includes("festivos") ||
      hay.includes("birthday") ||
      hay.includes("cumpleaños") ||
      hay.includes("cumpleanos") ||
      hay.includes("#contacts") ||
      hay.includes("addressbook") ||
      hay.includes("weather") ||
      hay.includes("clima")
    );
  }

  function shouldCountAsBusy(ev) {
    if (!ev?.start) return false;
    if (String(ev.status || "").toLowerCase() === "cancelled") return false;
    // "Disponible" / Free en Google → no bloquea
    if (String(ev.transparency || "").toLowerCase() === "transparent") return false;

    const allDay = !ev.start.dateTime && !!ev.start.date;
    if (allDay) {
      // Solo bloquear todo el día si es fuera de oficina / cierre explícito
      const type = String(ev.eventType || "").toLowerCase();
      const summary = String(ev.summary || "");
      if (type === "outofoffice") return true;
      return /out of office|fuera de (la )?oficina|vacaciones|no disponible|cerrado|sin agenda/i.test(
        summary
      );
    }
    return true;
  }

  function calendarsForAvailability(calendars, fallbackId) {
    const list = Array.isArray(calendars) ? calendars : [];
    const usable = list.filter((c) => c?.id && !isIgnorableCalendar(c));
    if (usable.length) return usable.map((c) => c.id);
    return [fallbackId || "primary"];
  }

  async function connect({ forceConsent = false } = {}) {
    await waitForGis();
    const host = location.hostname;
    const known =
      location.origin === CANONICAL_ORIGIN ||
      host === "localhost" ||
      host === "127.0.0.1" ||
      /barber-home-cloud.*\.vercel\.app$/i.test(host);
    if (!known) {
      throw new Error(`Google no autoriza esta dirección. Abre el panel en ${CANONICAL_ORIGIN}`);
    }
    const tokenRes = await requestToken(forceConsent ? "consent" : "");
    const accessToken = tokenRes.access_token;
    const expiresIn = Number(tokenRes.expires_in || 3600);
    const email = await fetchUserEmail(accessToken);
    const calendars = await listCalendars(accessToken);
    const primary =
      calendars.find((c) => c.primary) || calendars[0] || { id: "primary", summary: "Principal" };

    const auth = {
      accessToken,
      expiresAt: Date.now() + expiresIn * 1000,
      email,
      calendarId: primary.id,
      calendarName: primary.summary || primary.id,
      connectedAt: new Date().toISOString(),
    };
    saveAuth(auth);
    localStorage.setItem(activeCalKey(), "gmail");
    try {
      await persistGoogleFlag({
        connected: true,
        email: auth.email,
        calendarId: auth.calendarId,
        calendarName: auth.calendarName,
      });
    } catch (err) {
      console.warn("[Google Calendar] No se pudo guardar el vínculo en el negocio", err);
    }
    try {
      await syncBusyCache();
    } catch (err) {
      console.warn("[Google Calendar] No se pudo sincronizar disponibilidad", err);
    }
    try {
      await syncPendingBookings();
    } catch (err) {
      console.warn("[Google Calendar] No se pudieron enviar citas pendientes", err);
    }
    return auth;
  }

  async function getValidAccessToken() {
    let auth = loadAuth();
    if (auth && !isExpired(auth)) return auth.accessToken;

    await waitForGis();
    const tokenRes = await requestToken("");
    const accessToken = tokenRes.access_token;
    const expiresIn = Number(tokenRes.expires_in || 3600);
    auth = {
      ...(auth || {}),
      accessToken,
      expiresAt: Date.now() + expiresIn * 1000,
    };
    if (!auth.email) auth.email = await fetchUserEmail(accessToken);
    saveAuth(auth);
    return accessToken;
  }

  async function listUpcomingEvents({ calendarId, maxResults = 20 } = {}) {
    const auth = loadAuth();
    const calId = encodeURIComponent(calendarId || auth?.calendarId || "primary");
    const token = await getValidAccessToken();
    const timeMin = encodeURIComponent(new Date().toISOString());
    const data = await fetchJson(
      `https://www.googleapis.com/calendar/v3/calendars/${calId}/events?timeMin=${timeMin}&singleEvents=true&orderBy=startTime&maxResults=${maxResults}`,
      token
    );
    return Array.isArray(data.items) ? data.items : [];
  }

  async function listEventsInRange({
    calendarId,
    calendarIds,
    timeMin,
    timeMax,
    maxResults = 250,
  } = {}) {
    const auth = loadAuth();
    const token = await getValidAccessToken();
    const min = encodeURIComponent(
      timeMin instanceof Date ? timeMin.toISOString() : String(timeMin)
    );
    const max = encodeURIComponent(
      timeMax instanceof Date ? timeMax.toISOString() : String(timeMax)
    );

    let ids = Array.isArray(calendarIds) ? calendarIds.filter(Boolean) : [];
    if (calendarId) ids = [calendarId];
    if (!ids.length) {
      try {
        const cals = await listCalendars(token);
        ids = calendarsForAvailability(cals, auth?.calendarId || "primary");
      } catch {
        ids = [];
      }
    }
    if (!ids.length) ids = [auth?.calendarId || "primary"];

    const all = [];
    const seen = new Set();
    for (const id of ids) {
      const calId = encodeURIComponent(id);
      try {
        const data = await fetchJson(
          `https://www.googleapis.com/calendar/v3/calendars/${calId}/events?timeMin=${min}&timeMax=${max}&singleEvents=true&orderBy=startTime&maxResults=${maxResults}`,
          token
        );
        for (const item of data.items || []) {
          if (!item?.id || seen.has(item.id)) continue;
          if (!shouldCountAsBusy(item)) continue;
          seen.add(item.id);
          all.push({ ...item, __calendarId: id });
        }
      } catch {
        /* calendario sin permiso o inexistente: seguir con los demás */
      }
    }
    all.sort((a, b) => {
      const as = a.start?.dateTime || a.start?.date || "";
      const bs = b.start?.dateTime || b.start?.date || "";
      return as.localeCompare(bs);
    });
    return all;
  }

  function disconnect() {
    const auth = loadAuth();
    if (auth?.accessToken && window.google?.accounts?.oauth2) {
      try {
        google.accounts.oauth2.revoke(auth.accessToken, () => {});
      } catch {
        /* ignore */
      }
    }
    saveAuth(null);
    localStorage.removeItem(busyKey());
    persistGoogleFlag({ connected: false }).catch(() => {});
  }

  function getConnection() {
    return loadAuth();
  }

  function isConnected() {
    const auth = loadAuth();
    // Conectado = el usuario vinculó Google y no pulsó Desconectar.
    // El token puede expirar; se renueva en getValidAccessToken() sin desconectar.
    return !!(auth?.email || auth?.accessToken);
  }

  function loadBusyCache() {
    try {
      const cache = JSON.parse(localStorage.getItem(busyKey()) || "null");
      if (!cache || !Array.isArray(cache.blocks)) return null;
      return cache;
    } catch {
      return null;
    }
  }

  function toMinutes(hhmm) {
    const [h, m] = String(hhmm || "0:0").split(":").map(Number);
    return h * 60 + (m || 0);
  }

  function rangesOverlap(aStart, aEnd, bStart, bEnd) {
    return aStart < bEnd && bStart < aEnd;
  }

  /** ¿La agenda pública debe respetar ocupación de Google? */
  function readAutoagenda() {
    const fromTenant = window.Tenant?.cached?.()?.autoagenda;
    if (fromTenant && typeof fromTenant === "object") return fromTenant;
    try {
      const local = JSON.parse(localStorage.getItem("barbercloud.autoagenda") || "{}");
      return local && typeof local === "object" ? local : {};
    } catch {
      return {};
    }
  }

  function negocioWantsGoogle() {
    if (isConnected()) return true;
    return !!readAutoagenda()?.googleCalendar?.connected;
  }

  async function publishConnectionIfNeeded() {
    if (!isConnected()) return;
    const flag = readAutoagenda()?.googleCalendar;
    if (flag?.connected && flag.email) return;
    const auth = loadAuth();
    await persistGoogleFlag({
      connected: true,
      email: auth?.email || "",
      calendarId: auth?.calendarId || "primary",
      calendarName: auth?.calendarName || "",
    });
  }

  async function persistGoogleFlag(link) {
    const auto = { ...readAutoagenda() };
    auto.googleCalendar = link?.connected
      ? {
          connected: true,
          email: link.email || "",
          calendarId: link.calendarId || "primary",
          calendarName: link.calendarName || "",
        }
      : { connected: false };
    try {
      localStorage.setItem("barbercloud.autoagenda", JSON.stringify(auto));
    } catch {
      /* ignore */
    }
    const own = await window.SupabaseData?.fetchOwnNegocio?.();
    if (!own?.id || !window.SupabaseData?.upsertNegocio) return;
    const merged = {
      ...(own.autoagenda && typeof own.autoagenda === "object" ? own.autoagenda : {}),
      ...auto,
      googleCalendar: auto.googleCalendar,
    };
    await window.SupabaseData.upsertNegocio({
      id: own.id,
      slug: own.slug,
      name: own.name,
      autoagenda: merged,
    });
    if (link?.connected && link.email) {
      await window.SupabaseData.rememberNotifyEmail?.(link.email);
    }
  }

  function usesGoogleAvailability() {
    // Si Google está conectado (o hay cache de ocupación), bloquea huecos ocupados ahí.
    return isConnected() || negocioWantsGoogle() || !!(loadBusyCache()?.blocks?.length);
  }

  /**
   * Bloques ocupados en cache (legibles sin token, para agenda pública).
   * Cada block: { date, startMin, endMin, summary }
   */
  function isSlotBusy(dateIso, timeHhmm, durationMin) {
    const cache = loadBusyCache();
    if (!cache?.blocks?.length) return false;
    const start = toMinutes(timeHhmm);
    const end = start + (Number(durationMin) || 60);
    return cache.blocks.some((b) => {
      if (b.date !== dateIso) return false;
      return rangesOverlap(start, end, Number(b.startMin), Number(b.endMin));
    });
  }

  function eventToBusyBlocks(ev) {
    const blocks = [];
    if (!shouldCountAsBusy(ev)) return blocks;

    // Todo el día (p. ej. fuera de oficina): Google usa end.date exclusivo
    if (!ev.start.dateTime && ev.start.date) {
      const startDate = String(ev.start.date).slice(0, 10);
      const endExclusive = String(ev.end?.date || "").slice(0, 10);
      let day = new Date(`${startDate}T12:00:00`);
      const last = endExclusive
        ? new Date(`${endExclusive}T12:00:00`)
        : new Date(day.getTime() + 24 * 60 * 60 * 1000);
      while (day < last) {
        const y = day.getFullYear();
        const m = String(day.getMonth() + 1).padStart(2, "0");
        const d = String(day.getDate()).padStart(2, "0");
        blocks.push({
          date: `${y}-${m}-${d}`,
          startMin: 0,
          endMin: 24 * 60,
          summary: ev.summary || "Ocupado",
          allDay: true,
        });
        day = new Date(day.getTime() + 24 * 60 * 60 * 1000);
      }
      return blocks;
    }

    if (!ev.start.dateTime) return blocks;
    const start = new Date(ev.start.dateTime);
    const end = new Date(ev.end?.dateTime || ev.start.dateTime);
    if (Number.isNaN(start.getTime())) return blocks;

    // Soportar eventos que cruzan medianoche
    let cursor = new Date(start);
    while (cursor < end) {
      const date = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
      const dayStart = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate());
      const nextDay = new Date(dayStart);
      nextDay.setDate(nextDay.getDate() + 1);
      const segEnd = end < nextDay ? end : nextDay;
      const startMin = (cursor - dayStart) / 60000;
      const endMin = Math.max(startMin + 1, (segEnd - dayStart) / 60000);
      blocks.push({
        date,
        startMin: Math.floor(startMin),
        endMin: Math.ceil(endMin),
        summary: ev.summary || "Ocupado",
        allDay: false,
      });
      cursor = nextDay;
    }
    return blocks;
  }

  function reconcileLocalBookings(blocks, events) {
    const store = window.BookingStore;
    if (!store?.loadBookings || !store?.saveBookings) return;
    const eventIds = new Set((events || []).map((ev) => ev.id).filter(Boolean));
    const list = store.loadBookings();
    let changed = false;
    const updated = list.map((b) => {
      if (!store.isActive(b)) return b;
      if (b.calendarId !== "gmail" && b.source !== "google") return b;

      // Si conocemos el event id de Google y ya no existe → liberar
      if (b.googleEventId) {
        if (eventIds.has(b.googleEventId)) return b;
        changed = true;
        return {
          ...b,
          status: "cancelled",
          cancelledAt: new Date().toISOString(),
          cancelReason: "removed_from_google",
        };
      }

      // Sin event id: liberar solo si el hueco ya no está ocupado en Google
      // y la cita no es demasiado reciente (evita carreras al crear)
      const created = Date.parse(b.createdAt || "") || 0;
      if (Date.now() - created < 2 * 60 * 1000) return b;
      const start = toMinutes(b.time);
      const end = start + (Number(b.duration) || 60);
      const stillInGoogle = (blocks || []).some(
        (bl) =>
          bl.date === b.date &&
          rangesOverlap(start, end, Number(bl.startMin), Number(bl.endMin))
      );
      if (stillInGoogle) return b;
      changed = true;
      return {
        ...b,
        status: "cancelled",
        cancelledAt: new Date().toISOString(),
        cancelReason: "removed_from_google",
      };
    });
    if (changed) store.saveBookings(updated);
  }

  async function syncBusyCache({ daysAhead = 62 } = {}) {
    if (!isConnected()) {
      throw new Error("Google Calendar no está conectado");
    }
    const timeMin = new Date();
    timeMin.setHours(0, 0, 0, 0);
    const timeMax = new Date(timeMin);
    timeMax.setDate(timeMax.getDate() + daysAhead);

    const items = await listEventsInRange({ timeMin, timeMax, maxResults: 250 });
    const blocks = [];
    for (const ev of items) {
      blocks.push(...eventToBusyBlocks(ev));
    }

    const cache = {
      updatedAt: new Date().toISOString(),
      email: loadAuth()?.email || "",
      daysAhead,
      blocks,
    };
    // Reemplaza siempre la cache (así un evento borrado libera el hueco)
    localStorage.setItem(busyKey(), JSON.stringify(cache));
    reconcileLocalBookings(blocks, items);

    const active = localStorage.getItem(activeCalKey());
    if (!active || active === "gmail") {
      localStorage.setItem(activeCalKey(), "gmail");
    }
    return cache;
  }

  function clearBusyCache() {
    localStorage.removeItem(busyKey());
  }

  function calendarTimeZone() {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Bogota";
    } catch {
      return "America/Bogota";
    }
  }

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function dateTimeLocal(date, time) {
    const hhmm = String(time || "09:00").slice(0, 5);
    return `${date}T${hhmm.length === 5 ? hhmm : "09:00"}:00`;
  }

  function addMinutesToDateTime(date, time, durationMin) {
    const [h, m] = String(time || "09:00").split(":").map(Number);
    const startMin = (h || 0) * 60 + (m || 0);
    const endMin = startMin + (Number(durationMin) || 60);
    const extraDays = Math.floor(endMin / (24 * 60));
    const rem = ((endMin % (24 * 60)) + 24 * 60) % (24 * 60);
    const dt = new Date(`${date}T12:00:00`);
    dt.setDate(dt.getDate() + extraDays);
    return {
      date: `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`,
      time: `${pad2(Math.floor(rem / 60))}:${pad2(rem % 60)}`,
    };
  }

  function isBookingActive(booking) {
    const life = String(
      window.BookingStore?.lifecycleStatus?.(booking) || booking?.lifecycleStatus || booking?.status || ""
    ).toLowerCase();
    if (life === "cancelled" || life === "canceled" || life === "completed" || life === "no_show") {
      return false;
    }
    if (String(booking?.status || "").toLowerCase().includes("cancel")) return false;
    return true;
  }

  function needsGooglePush(booking) {
    if (!booking?.id || !booking.date || !booking.time) return false;
    if (booking.googleEventId) return false;
    if (booking.source === "google") return false;
    if (booking.googleSync === "skipped" || booking.googleSync === "synced") return false;
    if (!isBookingActive(booking)) return false;
    const today = new Date();
    const todayIso = `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`;
    if (String(booking.date) < todayIso) return false;
    return true;
  }

  async function createEvent({
    summary,
    description,
    date,
    time,
    duration = 60,
    calendarId,
  } = {}) {
    const auth = loadAuth();
    const token = await getValidAccessToken();
    const calId = encodeURIComponent(calendarId || auth?.calendarId || "primary");
    const tz = calendarTimeZone();
    const endAt = addMinutesToDateTime(date, time, duration);
    const body = {
      summary: summary || "Cita BarberCloud",
      description: description || "",
      start: { dateTime: dateTimeLocal(date, time), timeZone: tz },
      end: { dateTime: dateTimeLocal(endAt.date, endAt.time), timeZone: tz },
    };
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${calId}/events`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.error?.message || `Error HTTP ${res.status}`);
    }
    try {
      await syncBusyCache();
    } catch {
      /* ignore */
    }
    return data;
  }

  async function deleteEvent(eventId, calendarId) {
    if (!eventId) return { ok: true, skipped: true };
    const auth = loadAuth();
    const token = await getValidAccessToken();
    const calId = encodeURIComponent(calendarId || auth?.calendarId || "primary");
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${calId}/events/${encodeURIComponent(eventId)}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    if (res.status === 404 || res.status === 410 || res.ok) return { ok: true };
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error?.message || `Error HTTP ${res.status}`);
  }

  async function pushBooking(booking) {
    if (!booking?.id) return null;
    if (booking.googleEventId) return { id: booking.googleEventId, already: true };
    if (!isConnected()) return null;
    const name = booking.name || "Cliente";
    const phone = booking.phone || "";
    const service = booking.serviceName || "Cita";
    const data = await createEvent({
      summary: `${service} · ${name}${phone ? ` ${phone}` : ""}`.trim(),
      description: [
        "Reserva BarberCloud",
        `Cliente: ${name}`,
        phone ? `WhatsApp: ${phone}` : "",
        booking.notes ? `Notas: ${booking.notes}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
      date: booking.date,
      time: booking.time,
      duration: booking.duration,
      calendarId: loadAuth()?.calendarId,
    });
    if (data?.id && window.BookingStore?.patchBooking) {
      window.BookingStore.patchBooking(booking.id, {
        googleEventId: data.id,
        googleSync: "synced",
        calendarId: "gmail",
      });
    }
    return data;
  }

  async function syncPendingBookings() {
    if (!isConnected()) return { ok: false, synced: 0, reason: "disconnected" };
    const store = window.BookingStore;
    if (!store?.loadBookings) return { ok: true, synced: 0 };
    const list = store.loadBookings();
    let synced = 0;
    let failed = 0;
    for (const booking of list) {
      if (!needsGooglePush(booking)) continue;
      try {
        const ev = await pushBooking(booking);
        if (ev?.id) synced += 1;
      } catch (err) {
        failed += 1;
        console.warn("[Google Calendar] no se pudo enviar cita", booking.id, err);
        store.patchBooking?.(booking.id, {
          googleSync: "error",
          googleSyncError: err?.message || "error",
        });
      }
    }
    return { ok: failed === 0, synced, failed };
  }

  async function removeBookingEvent(booking) {
    if (!booking?.googleEventId || !isConnected()) return { ok: true, skipped: true };
    try {
      await deleteEvent(booking.googleEventId);
      return { ok: true };
    } catch (err) {
      console.warn("[Google Calendar] no se pudo borrar evento", err);
      return { ok: false, message: err?.message };
    }
  }

  window.GoogleCalendar = {
    connect,
    disconnect,
    getConnection,
    isConnected,
    getValidAccessToken,
    listCalendars,
    listUpcomingEvents,
    listEventsInRange,
    loadBusyCache,
    syncBusyCache,
    clearBusyCache,
    isSlotBusy,
    usesGoogleAvailability,
    negocioWantsGoogle,
    createEvent,
    deleteEvent,
    pushBooking,
    syncPendingBookings,
    removeBookingEvent,
    publishConnectionIfNeeded,
    ACTIVE_CAL_KEY: activeCalKey,
    BUSY_KEY: busyKey,
    AUTH_KEY: authKey,
  };
})();
