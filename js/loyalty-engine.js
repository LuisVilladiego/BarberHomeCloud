/**
 * Puntos de fidelización del negocio (Gestiónweb.app).
 * +5 pts al marcar un servicio como completado. El admin solo ajusta excepciones.
 */
(function () {
  const USERS_KEY = "gestionweb.loyalty_users";
  const HISTORY_KEY = "gestionweb.loyalty_history";
  const POINTS_PER_SERVICE = 5;

  function safeParse(raw, fallback) {
    if (window.Security?.safeJsonParse) return window.Security.safeJsonParse(raw, fallback);
    try {
      return JSON.parse(raw || "") ?? fallback;
    } catch {
      return fallback;
    }
  }

  function phoneTail(phone) {
    if (window.Security?.phoneTail) return window.Security.phoneTail(phone);
    const digits = String(phone || "").replace(/\D/g, "");
    return digits.length >= 7 ? digits.slice(-10) : digits;
  }

  function loadUsers() {
    const list = safeParse(localStorage.getItem(USERS_KEY), []);
    return Array.isArray(list) ? list : [];
  }

  function saveUsers(users) {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
    window.SupabaseData?.upsertCliente &&
      users.slice(0, 5).forEach((u) => window.SupabaseData.upsertCliente(u));
  }

  function appendHistory(entry) {
    const list = safeParse(localStorage.getItem(HISTORY_KEY), []);
    const next = Array.isArray(list) ? list : [];
    next.unshift(entry);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next.slice(0, 200)));
    window.SupabaseData?.insertPunto?.(entry);
  }

  function findUserForBooking(booking) {
    const tail = phoneTail(booking?.phone);
    if (!tail || tail.length < 7) return null;
    return loadUsers().find((u) => phoneTail(u.phone) === tail) || null;
  }

  function ensureUserForBooking(booking) {
    const existing = findUserForBooking(booking);
    if (existing) return existing;
    const tail = phoneTail(booking?.phone);
    if (!tail || tail.length < 7) return null;
    const users = loadUsers();
    const stub = {
      id: crypto.randomUUID?.() || `pts-user-${Date.now()}`,
      name: String(booking.name || "Cliente").trim() || "Cliente",
      phone: String(booking.phone || "").trim(),
      email: "",
      docType: "",
      docNumber: "",
      points: 0,
      createdByService: true,
      createdAt: new Date().toISOString(),
    };
    users.push(stub);
    saveUsers(users);
    return stub;
  }

  function absorbPhoneStub(users, target) {
    const list = Array.isArray(users) ? users : [];
    const tail = phoneTail(target?.phone);
    if (!tail || !target?.id) return { users: list, absorbed: 0 };
    const idx = list.findIndex(
      (u) => u.id !== target.id && u.createdByService && phoneTail(u.phone) === tail
    );
    if (idx < 0) return { users: list, absorbed: 0 };
    const stub = list[idx];
    const pts = Number(stub.points) || 0;
    target.points = (Number(target.points) || 0) + pts;
    list.splice(idx, 1);
    const history = safeParse(localStorage.getItem(HISTORY_KEY), []);
    if (Array.isArray(history) && stub.id) {
      history.forEach((h) => {
        if (h.userId === stub.id) h.userId = target.id;
      });
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 200)));
    }
    return { users: list, absorbed: pts };
  }

  function awardForCompletedBooking(booking) {
    if (!booking?.id) return { ok: false, message: "Cita inválida" };
    if (booking.pointsAwarded) return { ok: false, skipped: true, message: "Ya se asignaron puntos" };
    const user = ensureUserForBooking(booking);
    if (!user) {
      return {
        ok: false,
        skipped: true,
        message: "Falta el WhatsApp del cliente para asignar puntos.",
      };
    }
    const amount = POINTS_PER_SERVICE;
    const users = loadUsers();
    const idx = users.findIndex((u) => u.id === user.id);
    if (idx < 0) return { ok: false, message: "Cliente no encontrado" };
    users[idx] = {
      ...users[idx],
      points: (Number(users[idx].points) || 0) + amount,
    };
    const balance = users[idx].points;
    saveUsers(users);
    const entry = {
      id: crypto.randomUUID?.() || `pts-${Date.now()}`,
      userId: user.id,
      name: user.name,
      docType: user.docType,
      docNumber: user.docNumber,
      amount,
      note: `Servicio completado · ${booking.serviceName || "Cita"}`,
      at: new Date().toISOString(),
      balance,
      bookingId: booking.id,
    };
    appendHistory(entry);
    return { ok: true, user: users[idx], amount };
  }

  window.LoyaltyEngine = {
    POINTS_PER_SERVICE,
    findUserForBooking,
    ensureUserForBooking,
    absorbPhoneStub,
    awardForCompletedBooking,
  };
})();
