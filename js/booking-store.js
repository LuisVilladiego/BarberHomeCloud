/**
 * Store compartido de citas + bloqueo para evitar doble reserva.
 * Regla de carrera: gana quien obtiene el lock con timestamp más temprano.
 */
(function () {
  const BOOKINGS_KEY = "barbercloud.bookings";
  const LOCK_PREFIX = "barbercloud.slot_lock:";
  const LOCK_TTL_MS = 12000;
  const CHANNEL = "barbercloud.bookings";

  const listeners = new Set();
  let bc = null;
  try {
    bc = new BroadcastChannel(CHANNEL);
    bc.onmessage = (ev) => {
      listeners.forEach((fn) => fn(ev.data));
    };
  } catch {
    /* ignore */
  }

  window.addEventListener("storage", (e) => {
    if (e.key === BOOKINGS_KEY || (e.key && e.key.startsWith(LOCK_PREFIX))) {
      listeners.forEach((fn) => fn({ type: "storage", key: e.key }));
    }
  });

  function safeParse(raw, fallback) {
    if (window.Security?.safeJsonParse) {
      return window.Security.safeJsonParse(raw, fallback);
    }
    try {
      return JSON.parse(raw || "") ?? fallback;
    } catch {
      return fallback;
    }
  }

  function toMinutes(hhmm) {
    const [h, m] = String(hhmm || "0:0").split(":").map(Number);
    return h * 60 + (m || 0);
  }

  function rangesOverlap(aStart, aEnd, bStart, bEnd) {
    return aStart < bEnd && bStart < aEnd;
  }

  function isActive(booking) {
    const status = String(booking?.status || "").toLowerCase();
    return status !== "cancelled" && status !== "canceled" && status !== "rejected";
  }

  function loadBookings() {
    const raw = safeParse(localStorage.getItem(BOOKINGS_KEY), []);
    const persisted = (Array.isArray(raw) ? raw : []).filter((b) => !b?.occupancyOnly);
    return persisted.concat(occupancyOverlay);
  }

  let occupancyOverlay = [];

  function setOccupancy(slots) {
    occupancyOverlay = (Array.isArray(slots) ? slots : []).map((s, i) => {
      const date = s.fecha || s.date;
      const time = s.hora || s.time;
      return {
        id: `occ-${date}-${time}-${i}`,
        date,
        time,
        duration: Number(s.duration) || 60,
        status: s.status || "confirmed",
        occupancyOnly: true,
        name: "",
        phone: "",
      };
    });
    listeners.forEach((fn) => fn({ type: "occupancy" }));
  }

  function notifyListeners(payload) {
    bc?.postMessage(payload);
    listeners.forEach((fn) => fn(payload));
    window.dispatchEvent(new CustomEvent("barbercloud:bookings-changed"));
  }

  /** Tras actualizar localStorage desde Supabase (sin re-subir a la nube). */
  function notifyExternalUpdate() {
    notifyListeners({ type: "bookings-external-sync" });
  }

  function saveBookings(list) {
    const persisted = (Array.isArray(list) ? list : []).filter((b) => !b?.occupancyOnly);
    localStorage.setItem(BOOKINGS_KEY, JSON.stringify(persisted));
    notifyListeners({ type: "bookings-updated" });
    // Sync en segundo plano a Supabase (si está configurado)
    if (window.SupabaseData?.enabled?.()) {
      Promise.resolve()
        .then(async () => {
          const recent = persisted.slice(0, 40);
          for (const b of recent) {
            await window.SupabaseData.upsertCita(b);
          }
        })
        .catch((err) => console.warn("[booking-store] sync Supabase", err));
    }
  }

  function findConflicts(bookings, date, time, duration, excludeId) {
    const start = toMinutes(time);
    const end = start + (Number(duration) || 60);
    return (bookings || []).filter((b) => {
      if (!isActive(b)) return false;
      if (excludeId && b.id === excludeId) return false;
      if (b.date !== date) return false;
      const bStart = toMinutes(b.time);
      const bEnd = bStart + (Number(b.duration) || 60);
      return rangesOverlap(start, end, bStart, bEnd);
    });
  }

  function isSlotFree(date, time, duration, excludeId) {
    return findConflicts(loadBookings(), date, time, duration, excludeId).length === 0;
  }

  function lockKey(date, time) {
    return `${LOCK_PREFIX}${date}|${time}`;
  }

  function readLock(date, time) {
    const lock = safeParse(localStorage.getItem(lockKey(date, time)), null);
    if (!lock) return null;
    if ((lock.expiresAt || 0) < Date.now()) {
      localStorage.removeItem(lockKey(date, time));
      return null;
    }
    return lock;
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  const slotChains = new Map();

  function runSlotExclusive(date, time, work) {
    const key = lockKey(date, time);
    const tail = slotChains.get(key) || Promise.resolve();
    const run = tail.catch(() => {}).then(work);
    slotChains.set(key, run);
    return run.finally(() => {
      if (slotChains.get(key) === run) slotChains.delete(key);
    });
  }

  /**
   * Intenta reservar un hueco de forma concurrente-segura (multi-pestaña).
   * Si dos clientes compiten, gana el claim con `at` más antiguo.
   */
  async function bookAtomically(bookingInput) {
    const date = bookingInput.date;
    const time = bookingInput.time;
    if (!date || !time) {
      return { ok: false, reason: "invalid", message: "Fecha y hora son obligatorias." };
    }
    return runSlotExclusive(date, time, () => bookAtomicallyCore(bookingInput));
  }

  async function bookAtomicallyCore(bookingInput) {
    const duration = Number(bookingInput.duration) || 60;
    const date = bookingInput.date;
    const time = bookingInput.time;

    const claim = {
      id: crypto.randomUUID(),
      at: Date.now(),
      claimant: bookingInput.name || bookingInput.phone || "cliente",
      date,
      time,
      duration,
      expiresAt: Date.now() + LOCK_TTL_MS,
    };

    const key = lockKey(date, time);
    const existing = readLock(date, time);
    if (existing && existing.at <= claim.at && existing.id !== claim.id) {
      return {
        ok: false,
        reason: "race_lost",
        message: `Esa hora la está tomando ${existing.claimant}. Intenta otra.`,
        winner: existing,
      };
    }

    localStorage.setItem(key, JSON.stringify(claim));
    await sleep(40);

    const after = safeParse(localStorage.getItem(key), null);
    if (!after || after.id !== claim.id) {
      if (after && after.at < claim.at) {
        return {
          ok: false,
          reason: "race_lost",
          message: `Otra persona reservó primero (${after.claimant}). Elige otra hora.`,
          winner: after,
        };
      }
      // Nuestro claim es más antiguo: reafirmar
      if (after && claim.at < after.at) {
        localStorage.setItem(key, JSON.stringify({ ...claim, expiresAt: Date.now() + LOCK_TTL_MS }));
        await sleep(30);
        const finalLock = safeParse(localStorage.getItem(key), null);
        if (!finalLock || finalLock.id !== claim.id) {
          return {
            ok: false,
            reason: "race_lost",
            message: `Otra persona se adelantó (${finalLock?.claimant || "otro cliente"}).`,
            winner: finalLock,
          };
        }
      } else {
        return {
          ok: false,
          reason: "race_lost",
          message: "No se pudo asegurar el horario. Intenta de nuevo.",
          winner: after,
        };
      }
    }

    const list = loadBookings();
    const conflicts = findConflicts(list, date, time, duration);
    if (conflicts.length) {
      localStorage.removeItem(key);
      const winner = conflicts[0];
      return {
        ok: false,
        reason: "taken",
        message: `Esa hora ya está ocupada por ${winner.name || "otro cliente"}.`,
        winner,
      };
    }

    const booking = {
      id: bookingInput.id || crypto.randomUUID(),
      name: bookingInput.name || "Cliente",
      phone: bookingInput.phone || "",
      date,
      time,
      duration,
      serviceName: bookingInput.serviceName || "Cita",
      serviceId: bookingInput.serviceId || "",
      price: bookingInput.price || 0,
      notes: bookingInput.notes || "",
      status: bookingInput.status || "confirmed",
      source: bookingInput.source || "admin",
      business: bookingInput.business || window.Tenant?.cached?.()?.name || "Mi barbería",
      calendarId: bookingInput.calendarId || "negocio",
      slug: bookingInput.slug || window.Tenant?.cached?.()?.slug || "",
      negocioId: bookingInput.negocioId || window.Tenant?.currentId?.() || "",
      createdAt: new Date().toISOString(),
      claimAt: claim.at,
    };

    // Revalidar lock propio justo antes de escribir
    const lockNow = safeParse(localStorage.getItem(key), null);
    if (!lockNow || lockNow.id !== claim.id) {
      return {
        ok: false,
        reason: "lock_lost",
        message: "Perdiste el bloqueo del horario. Intenta otra vez.",
        winner: lockNow,
      };
    }

    const fresh = loadBookings();
    if (findConflicts(fresh, date, time, duration).length) {
      localStorage.removeItem(key);
      return {
        ok: false,
        reason: "taken",
        message: "Esa hora se ocupó hace un momento. Elige otra.",
      };
    }

    fresh.unshift(booking);
    saveBookings(fresh);
    localStorage.removeItem(key);
    try {
      await window.SupabaseData?.upsertCita?.(booking);
    } catch (err) {
      console.warn("[booking-store] upsert cita remota", err);
    }
    try {
      const notifKey = "barbercloud.notifications";
      const notifs = safeParse(localStorage.getItem(notifKey), []);
      const list = Array.isArray(notifs) ? notifs : [];
      list.unshift({
        id: `booking-${booking.id}`,
        title: `${booking.name || "Cliente"} - Agendar cita en BarberHome -`,
        appointmentAt:
          booking.date && booking.time
            ? `${booking.date}T${String(booking.time).length === 5 ? booking.time + ":00" : booking.time}`
            : booking.createdAt,
        createdAt: booking.createdAt,
        type: booking.source === "public" ? "autoagenda" : "confirmada",
        read: false,
        bookingId: booking.id,
      });
      localStorage.setItem(notifKey, JSON.stringify(list.slice(0, 300)));
    } catch {
      /* ignore */
    }
    bc?.postMessage({ type: "booking-created", booking });
    return { ok: true, booking };
  }

  function patchBooking(id, patch) {
    const list = loadBookings();
    const idx = list.findIndex((b) => b.id === id);
    if (idx < 0) return null;
    list[idx] = { ...list[idx], ...patch, updatedAt: new Date().toISOString() };
    saveBookings(list);
    window.SupabaseData?.upsertCita?.(list[idx]);
    return list[idx];
  }

  function cancelBooking(id) {
    return patchBooking(id, { status: "cancelled", cancelledAt: new Date().toISOString() });
  }

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  window.BookingStore = {
    BOOKINGS_KEY,
    loadBookings,
    saveBookings,
    findConflicts,
    isSlotFree,
    bookAtomically,
    cancelBooking,
    patchBooking,
    setOccupancy,
    subscribe,
    notifyExternalUpdate,
    toMinutes,
    isActive,
  };

  const isDashboard = !!document.querySelector(".sidebar");
  if (isDashboard && window.SupabaseData?.enabled?.()) {
    window.SupabaseData.pullToLocalCache?.().catch((err) =>
      console.warn("[booking-store] pull inicial", err)
    );
  }
})();
