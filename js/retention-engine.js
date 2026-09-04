/**
 * Automatizaciones de retención — Gestiónweb.app
 * Detecta clientes inactivos, hitos, puntos cerca de canje y cumpleaños;
 * genera alertas accionables en notificaciones.
 */
(function () {
  const BOOKINGS_KEY = "gestionweb.bookings";
  const LOYALTY_USERS_KEY = "gestionweb.loyalty_users";
  const REDEEM_KEY = "gestionweb.loyalty_redeem_products";
  const AUTOAGENDA_KEY = "gestionweb.autoagenda";
  const NOTIF_KEY = "gestionweb.notifications";
  const LAST_SCAN_KEY = "gestionweb.retention_last_scan";

  const RULES = {
    frequentMinIn60: 4,
    inactiveDays: 45,
    lostDays: 90,
    vipMinTotal: 20,
    milestoneEvery: 10,
    nearRewardPoints: 25,
    scanIntervalMs: 6 * 60 * 60 * 1000,
  };

  function safeParse(raw, fallback) {
    try {
      return JSON.parse(raw || "") ?? fallback;
    } catch {
      return fallback;
    }
  }

  function normalizePhone(phone) {
    return String(phone || "").replace(/\D/g, "");
  }

  function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
  }

  function phoneTail(phone) {
    const digits = normalizePhone(phone);
    return digits.length >= 7 ? digits.slice(-10) : digits;
  }

  function startOfDay(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  function daysBetween(a, b) {
    return Math.floor((startOfDay(b) - startOfDay(a)) / 86400000);
  }

  function toISODate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function periodMonth() {
    return toISODate(new Date()).slice(0, 7);
  }

  function periodYear() {
    return String(new Date().getFullYear());
  }

  function firstName(name) {
    return String(name || "Cliente").trim().split(/\s+/)[0] || "Cliente";
  }

  function businessName() {
    const data = safeParse(localStorage.getItem(AUTOAGENDA_KEY), {});
    return data?.title || "tu negocio";
  }

  function isActiveBooking(booking) {
    if (window.BookingStore?.isActive) return window.BookingStore.isActive(booking);
    const status = String(booking?.status || "").toLowerCase();
    return status !== "cancelled" && status !== "canceled" && status !== "rejected";
  }

  function loadBookings() {
    try {
      if (typeof window.BookingStore?.loadBookings === "function") {
        const fromStore = window.BookingStore.loadBookings();
        if (Array.isArray(fromStore)) return fromStore;
      }
    } catch {
      /* ignore */
    }
    const list = safeParse(localStorage.getItem(BOOKINGS_KEY), []);
    return Array.isArray(list) ? list : [];
  }

  function loadLoyaltyUsers() {
    const list = safeParse(localStorage.getItem(LOYALTY_USERS_KEY), []);
    return Array.isArray(list) ? list : [];
  }

  function loadRedeemProducts() {
    const list = safeParse(localStorage.getItem(REDEEM_KEY), []);
    return Array.isArray(list) ? list.filter((p) => p && p.pointsCost > 0) : [];
  }

  function parseBookingDay(b) {
    const raw = String(b?.date || "").slice(0, 10);
    if (!raw) return null;
    const d = new Date(`${raw}T12:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function clientKeyFromBooking(b) {
    const phone = normalizePhone(b?.phone);
    const name = String(b?.name || "").trim().toLowerCase();
    if (phone.length >= 7) return `p:${phone}`;
    const email = normalizeEmail(b?.email);
    if (email) return `e:${email}`;
    if (name) return `n:${name}`;
    return `id:${b?.id || "unknown"}`;
  }

  function buildLoyaltyIndex(users) {
    const byPhone = new Map();
    const byEmail = new Map();
    const byName = new Map();
    users.forEach((u) => {
      if (!u) return;
      const phone = phoneTail(u.phone);
      const email = normalizeEmail(u.email);
      const name = String(u.name || "").trim().toLowerCase();
      if (phone.length >= 7 && !byPhone.has(phone)) byPhone.set(phone, u);
      if (email && !byEmail.has(email)) byEmail.set(email, u);
      if (name && !byName.has(name)) byName.set(name, u);
    });
    return { byPhone, byEmail, byName };
  }

  function matchLoyaltyUser(client, index) {
    const phone = phoneTail(client.phone);
    if (phone.length >= 7 && index.byPhone.has(phone)) return index.byPhone.get(phone);
    const email = normalizeEmail(client.email);
    if (email && index.byEmail.has(email)) return index.byEmail.get(email);
    const name = String(client.name || "").trim().toLowerCase();
    if (name && index.byName.has(name)) return index.byName.get(name);
    return null;
  }

  function classifyVisit(stats, today) {
    const daysSince = stats.lastDate
      ? daysBetween(new Date(`${stats.lastDate}T12:00:00`), today)
      : 9999;
    const tags = [];
    if (stats.total >= RULES.vipMinTotal) tags.push("vip");
    if (stats.inLast60 >= RULES.frequentMinIn60) tags.push("frequent");
    if (stats.total > 0) {
      if (daysSince >= RULES.lostDays) tags.push("lost");
      else if (daysSince >= RULES.inactiveDays) tags.push("inactive");
    }
    let primary = "active";
    if (stats.total > 0 && daysSince >= RULES.lostDays) primary = "lost";
    else if (stats.total > 0 && daysSince >= RULES.inactiveDays) primary = "inactive";
    else if (stats.total >= RULES.vipMinTotal) primary = "vip";
    else if (stats.inLast60 >= RULES.frequentMinIn60) primary = "frequent";
    return { tags, primary, daysSince };
  }

  /** Perfiles unificados citas + Puntos */
  function buildClientProfiles() {
    const today = startOfDay(new Date());
    const cutoff60 = new Date(today.getTime());
    cutoff60.setDate(cutoff60.getDate() - 60);

    const loyaltyUsers = loadLoyaltyUsers();
    const loyaltyIndex = buildLoyaltyIndex(loyaltyUsers);
    const claimedUserIds = new Set();
    const map = new Map();

    loadBookings().forEach((b) => {
      if (!b || !isActiveBooking(b)) return;
      const day = parseBookingDay(b);
      if (!day) return;
      const iso = toISODate(day);
      const key = clientKeyFromBooking(b);
      const prev = map.get(key) || {
        key,
        name: b.name || "Cliente",
        phone: b.phone || "",
        email: b.email || "",
        total: 0,
        inLast60: 0,
        lastDate: iso,
        firstDate: iso,
      };
      prev.total += 1;
      if (day.getTime() >= cutoff60.getTime()) prev.inLast60 += 1;
      if (!prev.name || prev.name === "Cliente") prev.name = b.name || prev.name;
      if ((!prev.phone || normalizePhone(prev.phone).length < 7) && b.phone) prev.phone = b.phone;
      if (!prev.email && b.email) prev.email = b.email;
      if (iso > prev.lastDate) prev.lastDate = iso;
      if (iso < prev.firstDate) prev.firstDate = iso;
      map.set(key, prev);
    });

    map.forEach((client, key) => {
      const user = matchLoyaltyUser(client, loyaltyIndex);
      if (user?.id) claimedUserIds.add(user.id);
      if (user) {
        map.set(key, {
          ...client,
          email: client.email || user.email || "",
          phone: client.phone || user.phone || "",
          name: !client.name || client.name === "Cliente" ? user.name || client.name : client.name,
          loyaltyUserId: user.id || "",
          points: Number(user.points) || 0,
          birthDate: user.birthDate || user.birthday || "",
        });
      }
    });

    loyaltyUsers.forEach((user, i) => {
      if (!user || (!user.name && !user.email && !user.phone)) return;
      if (user.id && claimedUserIds.has(user.id)) return;

      const phone = normalizePhone(user.phone);
      const email = normalizeEmail(user.email);
      const key = phone.length >= 7 ? `p:${phone}` : email ? `e:${email}` : `u:${user.id || i}`;

      if (map.has(key)) {
        const existing = map.get(key);
        map.set(key, {
          ...existing,
          loyaltyUserId: user.id || existing.loyaltyUserId,
          points: Number(user.points) || existing.points || 0,
          birthDate: user.birthDate || user.birthday || existing.birthDate || "",
        });
        if (user.id) claimedUserIds.add(user.id);
        return;
      }

      map.set(key, {
        key,
        name: user.name || "Cliente",
        phone: user.phone || "",
        email: user.email || "",
        loyaltyUserId: user.id || "",
        points: Number(user.points) || 0,
        birthDate: user.birthDate || user.birthday || "",
        total: 0,
        inLast60: 0,
        lastDate: "",
        firstDate: "",
      });
      if (user.id) claimedUserIds.add(user.id);
    });

    return Array.from(map.values()).map((stats) => {
      const visit = classifyVisit(stats, today);
      const retention = computeRetentionSignals({ ...stats, ...visit });
      return { ...stats, ...visit, retentionSignals: retention.signals, retentionPrimary: retention.primary };
    });
  }

  function isBirthdayToday(birthDate) {
    const raw = String(birthDate || "").trim();
    if (!raw) return false;
    const today = new Date();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw.slice(5, 10) === `${mm}-${dd}`;
    if (/^\d{2}-\d{2}$/.test(raw)) return raw === `${mm}-${dd}`;
    if (/^\d{2}\/\d{2}$/.test(raw)) {
      const [a, b] = raw.split("/");
      return `${a.padStart(2, "0")}-${b.padStart(2, "0")}` === `${mm}-${dd}`;
    }
    return false;
  }

  function nearestRedeemTarget(points, products) {
    if (!products.length) return null;
    let best = null;
    products.forEach((p) => {
      const cost = Number(p.pointsCost) || 0;
      if (cost <= 0) return;
      const gap = cost - (Number(points) || 0);
      if (gap <= 0 || gap > RULES.nearRewardPoints) return;
      if (!best || gap < best.gap) best = { product: p, gap, cost };
    });
    return best;
  }

  function computeRetentionSignals(client) {
    const signals = [];
    const brand = businessName();

    if (client.primary === "inactive") {
      signals.push({
        kind: "inactive",
        label: "Inactivo",
        insight: `No visita ${brand} hace ${client.daysSince} días.`,
        priority: 2,
      });
    }
    if (client.primary === "lost") {
      signals.push({
        kind: "lost",
        label: "Perdido",
        insight: `Sin visitas en ${client.daysSince} días — riesgo de perderlo.`,
        priority: 1,
      });
    }

    const milestone = Math.floor((client.total || 0) / RULES.milestoneEvery) * RULES.milestoneEvery;
    if (milestone >= RULES.milestoneEvery && client.total >= RULES.milestoneEvery) {
      signals.push({
        kind: "milestone",
        label: "Hito de servicios",
        insight: `${client.total} servicios completados — merece un detalle especial.`,
        milestone,
        priority: 3,
      });
    }

    const redeemProducts = loadRedeemProducts();
    const near = nearestRedeemTarget(client.points, redeemProducts);
    if (near) {
      signals.push({
        kind: "near_reward",
        label: "Cerca de canje",
        insight: `Le faltan ${near.gap} pts para canjear «${near.product.name}» (${near.cost} pts).`,
        productId: near.product.id,
        productName: near.product.name,
        pointsGap: near.gap,
        pointsCost: near.cost,
        priority: 4,
      });
    }

    if (isBirthdayToday(client.birthDate)) {
      signals.push({
        kind: "birthday",
        label: "Cumpleaños",
        insight: `Hoy es su cumpleaños — buen momento para un mensaje personal.`,
        priority: 5,
      });
    }

    signals.sort((a, b) => a.priority - b.priority);
    const primary = signals[0]?.kind || null;
    return { signals, primary };
  }

  function notificationId(signal, client) {
    const key = String(client.key || "unknown").replace(/[^a-zA-Z0-9_-]/g, "_");
    if (signal.kind === "inactive" || signal.kind === "lost") {
      return `retencion-${signal.kind}-${key}-${periodMonth()}`;
    }
    if (signal.kind === "milestone") {
      return `retencion-milestone-${key}-${signal.milestone}`;
    }
    if (signal.kind === "near_reward") {
      return `retencion-near-${key}-${signal.productId}-${periodMonth()}`;
    }
    if (signal.kind === "birthday") {
      return `retencion-birthday-${key}-${periodYear()}`;
    }
    return `retencion-${signal.kind}-${key}`;
  }

  function whatsappMessage(client, signal) {
    const brand = businessName();
    const name = firstName(client.name);

    if (signal.kind === "lost" || signal.kind === "inactive") {
      return `Hola ${name} 👋 Hace rato no nos vemos en ${brand}. ¿Agendamos tu próximo corte?`;
    }
    if (signal.kind === "milestone") {
      return `Hola ${name} 👋 ¡Ya llevas ${client.total} servicios con ${brand}! Gracias por confiar en nosotros. ¿Te agendo tu próximo corte?`;
    }
    if (signal.kind === "near_reward") {
      return `Hola ${name} 👋 Te faltan solo ${signal.pointsGap} puntos para canjear «${signal.productName}» en ${brand}. ¿Agendamos tu próximo servicio?`;
    }
    if (signal.kind === "birthday") {
      return `Hola ${name} 🎂 ¡Feliz cumpleaños! En ${brand} queremos celebrarlo contigo. ¿Te agendo un servicio especial?`;
    }
    return `Hola ${name} 👋 ¿Agendamos tu próximo corte en ${brand}?`;
  }

  function buildWhatsAppUrl(phone, message) {
    if (window.Security?.buildWhatsAppUrl) return window.Security.buildWhatsAppUrl(phone, message);
    const digits = normalizePhone(phone);
    if (digits.length < 7) return "";
    return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
  }

  function openWhatsApp(client, signal) {
    const message = whatsappMessage(client, signal || { kind: client.primary || "active" });
    const url = buildWhatsAppUrl(client.phone, message);
    if (!url) {
      window.AppShell?.toast?.("Este contacto no tiene WhatsApp guardado");
      return false;
    }
    window.open(url, "_blank", "noopener,noreferrer");
    return true;
  }

  function scanSignals() {
    const clients = buildClientProfiles();
    const out = [];
    clients.forEach((client) => {
      (client.retentionSignals || []).forEach((signal) => {
        out.push({
          ...signal,
          clientKey: client.key,
          name: client.name,
          phone: client.phone,
          email: client.email,
          total: client.total,
          points: client.points,
          daysSince: client.daysSince,
          notifId: notificationId(signal, client),
        });
      });
    });
    return out.sort((a, b) => a.priority - b.priority);
  }

  function syncRetentionNotifications(options = {}) {
    const force = !!options.force;
    if (!force) {
      try {
        const last = Number(localStorage.getItem(LAST_SCAN_KEY) || 0);
        if (Date.now() - last < RULES.scanIntervalMs) return { ok: true, skipped: true };
      } catch {
        /* ignore */
      }
    }

    const signals = scanSignals();
    let notifs = safeParse(localStorage.getItem(NOTIF_KEY), []);
    if (!Array.isArray(notifs)) notifs = [];
    const byId = new Map(notifs.map((n) => [n.id, n]));
    const created = [];

    signals.forEach((sig) => {
      if (byId.has(sig.notifId)) return;
      const client = { key: sig.clientKey, name: sig.name, phone: sig.phone };
      const notif = {
        id: sig.notifId,
        title: `${sig.name} — ${sig.label}`,
        body: sig.insight,
        appointmentAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        type: "retencion",
        retentionKind: sig.kind,
        clientKey: sig.clientKey,
        phone: sig.phone,
        read: false,
      };
      byId.set(sig.notifId, notif);
      created.push(notif);
    });

    if (created.length) {
      const merged = Array.from(byId.values()).sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
      );
      localStorage.setItem(NOTIF_KEY, JSON.stringify(merged.slice(0, 300)));
      window.AppShell?.syncNotificationBadge?.();
      created.forEach((n) => {
        window.dispatchEvent(new CustomEvent("gestionweb:retention-alert", { detail: n }));
      });
    }

    try {
      localStorage.setItem(LAST_SCAN_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }

    return { ok: true, created: created.length, signals: signals.length };
  }

  function attachRetentionSignals(clients) {
    if (!Array.isArray(clients)) return clients;
    const profiles = buildClientProfiles();
    const byKey = new Map(profiles.map((c) => [c.key, c]));
    const byPhone = new Map();
    profiles.forEach((c) => {
      const phone = normalizePhone(c.phone);
      if (phone.length >= 7 && !byPhone.has(phone)) byPhone.set(phone, c);
    });
    return clients.map((c) => {
      let enriched = byKey.get(c.key);
      if (!enriched) {
        const phone = normalizePhone(c.phone);
        if (phone.length >= 7) enriched = byPhone.get(phone);
      }
      if (!enriched) return c;
      return {
        ...c,
        points: enriched.points,
        birthDate: enriched.birthDate,
        retentionSignals: enriched.retentionSignals,
        retentionPrimary: enriched.retentionPrimary,
      };
    });
  }

  function actionableCount() {
    return buildClientProfiles().filter((c) => (c.retentionSignals || []).length > 0).length;
  }

  window.RetentionEngine = {
    RULES,
    buildClientProfiles,
    scanSignals,
    syncRetentionNotifications,
    attachRetentionSignals,
    whatsappMessage,
    openWhatsApp,
    actionableCount,
    notificationId,
  };
})();
