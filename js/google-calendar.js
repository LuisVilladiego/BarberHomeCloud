/**
 * Conexión a Google Calendar vía Google Identity Services (token en navegador).
 */
(function () {
  const AUTH_KEY = "barbercloud.google_auth";
  const BUSY_KEY = "barbercloud.google_busy_cache";
  const ACTIVE_CAL_KEY = "barbercloud.active_calendar";
  const CANONICAL_ORIGIN = "https://barber-home-cloud.vercel.app";
  const cfg = () => window.GoogleConfig || {};

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
      return JSON.parse(localStorage.getItem(AUTH_KEY) || "null");
    } catch {
      return null;
    }
  }

  function saveAuth(data) {
    if (!data) {
      localStorage.removeItem(AUTH_KEY);
      return;
    }
    localStorage.setItem(AUTH_KEY, JSON.stringify(data));
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
    localStorage.setItem(ACTIVE_CAL_KEY, "gmail");
    try {
      await syncBusyCache();
    } catch (err) {
      console.warn("[Google Calendar] No se pudo sincronizar disponibilidad", err);
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
    localStorage.removeItem(BUSY_KEY);
  }

  function getConnection() {
    return loadAuth();
  }

  function isConnected() {
    const auth = loadAuth();
    return !!(auth?.accessToken && auth?.email);
  }

  function loadBusyCache() {
    try {
      const cache = JSON.parse(localStorage.getItem(BUSY_KEY) || "null");
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
  function usesGoogleAvailability() {
    // Si Google está conectado (o hay cache de ocupación), bloquea huecos ocupados ahí.
    return isConnected() || !!(loadBusyCache()?.blocks?.length);
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
    localStorage.setItem(BUSY_KEY, JSON.stringify(cache));
    reconcileLocalBookings(blocks, items);

    const active = localStorage.getItem(ACTIVE_CAL_KEY);
    if (!active || active === "gmail") {
      localStorage.setItem(ACTIVE_CAL_KEY, "gmail");
    }
    return cache;
  }

  function clearBusyCache() {
    localStorage.removeItem(BUSY_KEY);
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
    const [h, m] = String(time || "09:00").split(":").map(Number);
    const start = new Date(`${date}T00:00:00`);
    start.setHours(h || 0, m || 0, 0, 0);
    const end = new Date(start.getTime() + (Number(duration) || 60) * 60000);
    const body = {
      summary: summary || "Cita BarberHome",
      description: description || "",
      start: { dateTime: start.toISOString() },
      end: { dateTime: end.toISOString() },
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
    createEvent,
    ACTIVE_CAL_KEY,
    BUSY_KEY,
  };
})();
