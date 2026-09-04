/**
 * Contactos + Inteligencia del cliente (segmentación automática).
 * Une citas + cuentas de Puntos (correo / Google).
 */
(function () {
  const BOOKINGS_KEY = "gestionweb.bookings";
  const AUTOAGENDA_KEY = "gestionweb.autoagenda";
  const LOYALTY_USERS_KEY = "gestionweb.loyalty_users";

  const RULES = {
    frequentMinIn60: 4,
    inactiveDays: 45,
    lostDays: 90,
    vipMinTotal: 20,
  };

  let activeFilter = "all";
  let clientsCache = [];
  let directorySort = { key: "name", dir: "asc" };

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
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
    } catch (err) {
      console.warn("[contactos] BookingStore.loadBookings falló", err);
    }
    try {
      const list = JSON.parse(localStorage.getItem(BOOKINGS_KEY) || "[]");
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }

  function loadLoyaltyUsers() {
    try {
      const list = JSON.parse(localStorage.getItem(LOYALTY_USERS_KEY) || "[]");
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }

  function businessName() {
    try {
      const data = JSON.parse(localStorage.getItem(AUTOAGENDA_KEY) || "{}");
      if (data?.title) return data.title;
      return "Mi negocio";
    } catch {
      return "Mi negocio";
    }
  }

  function parseBookingDay(booking) {
    const date = String(booking?.date || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    const d = new Date(`${date}T12:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function daysBetween(from, to) {
    const ms = startOfDay(to).getTime() - startOfDay(from).getTime();
    return Math.floor(ms / (24 * 60 * 60 * 1000));
  }

  function startOfDay(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
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

  function firstName(fullName) {
    const parts = String(fullName || "Cliente").trim().split(/\s+/);
    return parts[0] || "Cliente";
  }

  function formatShortDate(iso) {
    if (!iso) return "—";
    try {
      return new Date(`${iso}T12:00:00`).toLocaleDateString("es-CO", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    } catch {
      return iso;
    }
  }

  function classifyClient(stats, today) {
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

  function buildLoyaltyIndex(users) {
    const byPhone = new Map();
    const byEmail = new Map();
    const byName = new Map();
    users.forEach((u) => {
      if (!u) return;
      const phone = phoneTail(u.phone);
      const email = normalizeEmail(u.email);
      const name = String(u.name || "")
        .trim()
        .toLowerCase();
      if (phone.length >= 7 && !byPhone.has(phone)) byPhone.set(phone, u);
      if (email && !byEmail.has(email)) byEmail.set(email, u);
      if (name && !byName.has(name)) byName.set(name, u);
    });
    return { byPhone, byEmail, byName, users };
  }

  function matchLoyaltyUser(client, index) {
    const phone = phoneTail(client.phone);
    if (phone.length >= 7 && index.byPhone.has(phone)) return index.byPhone.get(phone);
    const email = normalizeEmail(client.email);
    if (email && index.byEmail.has(email)) return index.byEmail.get(email);
    const name = String(client.name || "")
      .trim()
      .toLowerCase();
    if (name && index.byName.has(name)) return index.byName.get(name);
    return null;
  }

  function enrichFromLoyalty(client, user) {
    if (!user) return client;
    return {
      ...client,
      email: client.email || user.email || "",
      phone: client.phone || user.phone || "",
      name:
        !client.name || client.name === "Cliente"
          ? user.name || client.name
          : client.name,
      docType: client.docType || user.docType || "",
      docNumber: client.docNumber || user.docNumber || "",
      loyaltyUserId: user.id || "",
      googleId: user.googleId || "",
    };
  }

  function buildClients() {
    const today = startOfDay(new Date());
    const cutoff60 = new Date(today.getTime());
    cutoff60.setDate(cutoff60.getDate() - 60);

    const loyaltyUsers = loadLoyaltyUsers();
    const loyaltyIndex = buildLoyaltyIndex(loyaltyUsers);
    const claimedUserIds = new Set();
    const map = new Map();

    const bookings = loadBookings();
    for (let i = 0; i < bookings.length; i += 1) {
      const b = bookings[i];
      if (!b || !isActiveBooking(b)) continue;
      const day = parseBookingDay(b);
      if (!day) continue;
      const iso = toISODate(day);
      const key = clientKey(b);
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
    }

    map.forEach((client, key) => {
      const user = matchLoyaltyUser(client, loyaltyIndex);
      if (user && user.id) claimedUserIds.add(user.id);
      map.set(key, enrichFromLoyalty(client, user));
    });

    for (let i = 0; i < loyaltyUsers.length; i += 1) {
      const user = loyaltyUsers[i];
      if (!user) continue;
      if (!user.name && !user.email && !user.phone) continue;
      if (user.id && claimedUserIds.has(user.id)) continue;

      const phone = normalizePhone(user.phone);
      const email = normalizeEmail(user.email);
      const key = phone.length >= 7 ? `p:${phone}` : email ? `e:${email}` : `u:${user.id || i}`;

      if (map.has(key)) {
        map.set(key, enrichFromLoyalty(map.get(key), user));
        if (user.id) claimedUserIds.add(user.id);
        continue;
      }

      let alreadyLinked = false;
      map.forEach((existing) => {
        if (alreadyLinked) return;
        const matched = matchLoyaltyUser(existing, loyaltyIndex);
        if (matched && matched.id && user.id && matched.id === user.id) {
          alreadyLinked = true;
        }
      });
      if (alreadyLinked) {
        if (user.id) claimedUserIds.add(user.id);
        continue;
      }

      map.set(key, {
        key,
        name: user.name || "Cliente",
        phone: user.phone || "",
        email: user.email || "",
        docType: user.docType || "",
        docNumber: user.docNumber || "",
        loyaltyUserId: user.id || "",
        googleId: user.googleId || "",
        total: 0,
        inLast60: 0,
        lastDate: "",
        firstDate: "",
      });
      if (user.id) claimedUserIds.add(user.id);
    }

    return Array.from(map.values())
      .map((stats) => ({ ...stats, ...classifyClient(stats, today) }))
      .sort((a, b) => {
        const rank = { lost: 0, inactive: 1, vip: 2, frequent: 3, active: 4 };
        const ra = rank[a.primary] ?? 9;
        const rb = rank[b.primary] ?? 9;
        if (ra !== rb) return ra - rb;
        if (a.daysSince !== b.daysSince) return b.daysSince - a.daysSince;
        return String(a.name || "").localeCompare(String(b.name || ""), "es");
      });
  }

  function toISODate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function hasRetentionKind(client, kind) {
    return (client.retentionSignals || []).some((s) => s.kind === kind);
  }

  function topRetentionSignal(client) {
    const signals = client.retentionSignals || [];
    return signals.length ? signals[0] : null;
  }

  function badgeHtml(tag) {
    const map = {
      frequent: { className: "intel-badge--frequent", label: "🔥 Frecuente" },
      inactive: { className: "intel-badge--inactive", label: "⚠️ Inactivo" },
      lost: { className: "intel-badge--lost", label: "💤 Perdido" },
      vip: { className: "intel-badge--vip", label: "⭐ VIP" },
      active: { className: "intel-badge--active", label: "Activo" },
      near_reward: { className: "intel-badge--near", label: "🎁 Cerca de canje" },
      milestone: { className: "intel-badge--milestone", label: "🏆 Hito" },
      birthday: { className: "intel-badge--birthday", label: "🎂 Cumpleaños" },
    };
    const info = map[tag] || map.active;
    return `<span class="intel-badge ${info.className}">${info.label}</span>`;
  }

  function insightText(client) {
    const retention = topRetentionSignal(client);
    if (retention?.insight) return retention.insight;

    const brand = businessName();
    if (!client.total) {
      return client.email
        ? `Registrado en Puntos · ${client.email}`
        : "Registrado en Puntos, aún sin citas.";
    }
    if (client.primary === "lost") {
      return `No visita ${brand} hace ${client.daysSince} días.`;
    }
    if (client.primary === "inactive") {
      return `No visita ${brand} hace ${client.daysSince} días.`;
    }
    if (client.primary === "vip") {
      return `${client.total} servicios en total. Cliente VIP.`;
    }
    if (client.primary === "frequent") {
      return `${client.inLast60} servicios en los últimos 60 días.`;
    }
    if (client.daysSince === 0) return "Reservó hoy.";
    if (client.daysSince === 1) return "Última visita: ayer.";
    return `Última visita hace ${client.daysSince} días · ${client.total} servicio${client.total === 1 ? "" : "s"}.`;
  }

  function whatsappMessage(client) {
    const signal = topRetentionSignal(client);
    if (signal && window.RetentionEngine?.whatsappMessage) {
      return window.RetentionEngine.whatsappMessage(client, signal);
    }
    const brand = businessName();
    const name = firstName(client.name);
    if (client.primary === "lost" || client.primary === "inactive") {
      return `Hola ${name} 👋 Hace rato no nos vemos en ${brand}. ¿Agendamos tu próximo corte?`;
    }
    if (client.primary === "vip") {
      return `Hola ${name} 👋 Gracias por confiar tanto en ${brand}. ¿Te agendo tu próximo servicio VIP?`;
    }
    if (client.primary === "frequent") {
      return `Hola ${name} 👋 ¡Qué bueno verte seguido en ${brand}! ¿Agendamos tu próximo corte?`;
    }
    return `Hola ${name} 👋 ¿Agendamos tu próximo corte en ${brand}?`;
  }

  function openWhatsApp(client) {
    const message = whatsappMessage(client);
    const url =
      window.Security?.buildWhatsAppUrl?.(client.phone, message) ||
      (() => {
        const digits = normalizePhone(client.phone);
        if (digits.length < 7) return "";
        return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
      })();
    if (!url) {
      window.AppShell?.toast?.("Este contacto no tiene WhatsApp guardado");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function matchesFilter(client, filter) {
    if (filter === "all") return true;
    if (filter === "retencion") return (client.retentionSignals || []).length > 0;
    if (filter === "near_reward") return hasRetentionKind(client, "near_reward");
    if (filter === "milestone") return hasRetentionKind(client, "milestone");
    if (filter === "birthday") return hasRetentionKind(client, "birthday");
    if (filter === "vip") return client.tags.includes("vip");
    if (filter === "frequent") return client.tags.includes("frequent");
    if (filter === "inactive") return client.primary === "inactive";
    if (filter === "lost") return client.primary === "lost";
    return true;
  }

  function stripAccents(value) {
    try {
      return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
    } catch {
      return String(value || "");
    }
  }

  function matchesSearch(client, query) {
    const raw = String(query || "").trim();
    if (!raw) return true;
    const q = stripAccents(raw).toLowerCase();
    if (!q) return true;

    const name = stripAccents(client?.name).toLowerCase();
    const email = normalizeEmail(client?.email);
    const doc = String(client?.docNumber || "").toLowerCase();
    const phoneDigits = normalizePhone(client?.phone);
    const queryDigits = normalizePhone(raw);

    if (name.includes(q)) return true;
    if (email.includes(q)) return true;
    if (doc && doc.includes(q)) return true;
    if (queryDigits.length >= 3 && phoneDigits.includes(queryDigits)) return true;
    return false;
  }

  function bindSearchInput(id, onChange) {
    const input = document.getElementById(id);
    if (!input) return;
    const run = () => onChange(input.value || "");
    input.addEventListener("input", run);
    input.addEventListener("search", run);
    input.addEventListener("keyup", run);
    input.addEventListener("change", run);
  }

  function updateCounts(clients) {
    const set = (id, n) => {
      const el = document.getElementById(id);
      if (el) el.textContent = String(n);
    };
    set("intel-count-all", clients.length);
    set("intel-count-frequent", clients.filter((c) => c.tags.includes("frequent")).length);
    set("intel-count-inactive", clients.filter((c) => c.primary === "inactive").length);
    set("intel-count-lost", clients.filter((c) => c.primary === "lost").length);
    set("intel-count-vip", clients.filter((c) => c.tags.includes("vip")).length);
    set(
      "intel-count-retencion",
      clients.filter((c) => (c.retentionSignals || []).length > 0).length
    );
    set("intel-count-near", clients.filter((c) => hasRetentionKind(c, "near_reward")).length);
    set("intel-count-milestone", clients.filter((c) => hasRetentionKind(c, "milestone")).length);
    set("intel-count-birthday", clients.filter((c) => hasRetentionKind(c, "birthday")).length);
  }

  function contactMeta(client) {
    const parts = [];
    if (client.email) parts.push(client.email);
    if (client.phone) parts.push(client.phone);
    else parts.push("Sin WhatsApp");
    if (client.total > 0) {
      parts.push(`${client.total} servicio${client.total === 1 ? "" : "s"}`);
      parts.push(`Última: ${formatShortDate(client.lastDate)}`);
    } else {
      parts.push("Sin citas aún");
    }
    return parts.join(" · ");
  }

  function renderIntelList() {
    const list = document.getElementById("intel-list");
    if (!list) return;
    const query = document.getElementById("intel-search")?.value || "";
    const filtered = clientsCache.filter(
      (c) => matchesFilter(c, activeFilter) && matchesSearch(c, query)
    );

    if (!clientsCache.length) {
      list.innerHTML = `
        <p class="intel-empty">
          ${
            window.Billing?.isRestricted?.()
              ? "Vista de ejemplo. Renueva tu plan para ver tus clientes."
              : "Aún no hay clientes. Cuando haya citas o registros en Puntos (con correo), aparecerán aquí."
          }
        </p>`;
      return;
    }

    if (!filtered.length) {
      list.innerHTML = `<p class="intel-empty">${
        query.trim()
          ? "Ningún cliente coincide con tu búsqueda."
          : "No hay clientes en este filtro."
      }</p>`;
      return;
    }

    list.innerHTML = filtered
      .map((client) => {
        const retentionTags = (client.retentionSignals || []).map((s) => s.kind);
        const displayPrimary = client.retentionPrimary || client.primary;
        const extraBadges = [
          ...client.tags.filter((t) => t !== client.primary),
          ...retentionTags.filter((t) => t !== displayPrimary && !client.tags.includes(t)),
        ]
          .filter((t, i, arr) => arr.indexOf(t) === i)
          .map((t) => badgeHtml(t))
          .join("");
        const canWhatsApp = normalizePhone(client.phone).length >= 7;
        const showReminder =
          client.primary === "inactive" ||
          client.primary === "lost" ||
          retentionTags.length > 0;
        return `
          <article class="intel-card intel-card--${escapeHtml(displayPrimary || client.primary)}" data-key="${escapeHtml(client.key)}">
            <div class="intel-card__main">
              <div class="intel-card__head">
                <strong class="intel-card__name">${escapeHtml(client.name)}</strong>
                <div class="intel-card__badges">
                  ${badgeHtml(displayPrimary || client.primary)}
                  ${extraBadges}
                </div>
              </div>
              <p class="intel-card__insight">${escapeHtml(insightText(client))}</p>
              <p class="intel-card__meta">${escapeHtml(contactMeta(client))}${client.points != null && client.points > 0 ? ` · ${client.points} pts` : ""}</p>
            </div>
            <div class="intel-card__actions">
              ${
                canWhatsApp
                  ? `<button type="button" class="btn ${showReminder ? "btn--whatsapp" : "btn--secondary"} btn--sm" data-wa-key="${escapeHtml(client.key)}">
                       📲 ${showReminder ? "Enviar recordatorio" : "WhatsApp"}
                     </button>`
                  : `<span class="intel-card__no-phone">Sin número</span>`
              }
            </div>
          </article>`;
      })
      .join("");
  }

  function sortDirectoryClients(list) {
    const { key, dir } = directorySort;
    const factor = dir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      let cmp = 0;
      if (key === "name") {
        cmp = String(a.name || "").localeCompare(String(b.name || ""), "es", { sensitivity: "base" });
      } else if (key === "email") {
        cmp = String(a.email || "").localeCompare(String(b.email || ""), "es", { sensitivity: "base" });
      } else if (key === "phone") {
        cmp = normalizePhone(a.phone).localeCompare(normalizePhone(b.phone));
      } else if (key === "total") {
        cmp = (a.total || 0) - (b.total || 0);
      } else if (key === "lastDate") {
        cmp = String(a.lastDate || "").localeCompare(String(b.lastDate || ""));
      }
      if (cmp !== 0) return cmp * factor;
      return String(a.name || "").localeCompare(String(b.name || ""), "es", { sensitivity: "base" });
    });
  }

  function sortIndicator(key) {
    if (directorySort.key !== key) return "";
    return directorySort.dir === "asc" ? " ↑" : " ↓";
  }

  function renderContactsTable() {
    const table = document.getElementById("contacts-table");
    if (!table) return;
    const query = document.getElementById("contacts-search")?.value || "";
    const filtered = sortDirectoryClients(clientsCache.filter((c) => matchesSearch(c, query)));

    const head = `
      <div class="table__head contacts-table__head" role="row">
        <button type="button" class="contacts-sort" data-sort="name" role="columnheader">Cliente${sortIndicator("name")}</button>
        <button type="button" class="contacts-sort" data-sort="email" role="columnheader">Correo${sortIndicator("email")}</button>
        <button type="button" class="contacts-sort" data-sort="phone" role="columnheader">WhatsApp${sortIndicator("phone")}</button>
        <button type="button" class="contacts-sort" data-sort="total" role="columnheader">Citas${sortIndicator("total")}</button>
        <button type="button" class="contacts-sort" data-sort="lastDate" role="columnheader">Última visita${sortIndicator("lastDate")}</button>
        <div role="columnheader" class="sr-only">Acciones</div>
      </div>`;

    if (!filtered.length) {
      table.innerHTML = `${head}<p class="empty-hint" style="padding:16px 22px">${
        window.Billing?.isRestricted?.()
          ? "Renueva tu plan para ver tus contactos."
          : query.trim()
            ? "Ningún contacto coincide con tu búsqueda."
            : "No hay contactos para mostrar."
      }</p>`;
      return;
    }

    table.innerHTML =
      head +
      filtered
        .map(
          (c) => `
        <div class="table__row contacts-table__row" role="row" data-key="${escapeHtml(c.key)}">
          <div class="contacts-cell contacts-cell--name" role="cell">
            <strong>${escapeHtml(c.name)}</strong>
            <div class="contacts-table__tags">${badgeHtml(c.primary)}</div>
          </div>
          <div class="contacts-cell contacts-cell--email" role="cell">
            ${
              c.email
                ? `<a class="contacts-table__email" href="mailto:${escapeHtml(c.email)}">${escapeHtml(c.email)}</a>`
                : '<span class="contacts-muted">—</span>'
            }
          </div>
          <div class="contacts-cell contacts-cell--phone" role="cell">${escapeHtml(c.phone || "—")}</div>
          <div class="contacts-cell contacts-cell--total" role="cell">${c.total}</div>
          <div class="contacts-cell contacts-cell--date" role="cell">${escapeHtml(formatShortDate(c.lastDate))}</div>
          <div class="contacts-cell contacts-cell--actions" role="cell">
            ${
              normalizePhone(c.phone).length >= 7
                ? `<button type="button" class="btn btn--secondary btn--sm" data-wa-key="${escapeHtml(c.key)}">WhatsApp</button>`
                : ""
            }
          </div>
        </div>`
        )
        .join("");
  }

  function refresh() {
    if (window.Billing?.isRestricted?.()) {
      clientsCache = [];
      try {
        updateCounts([]);
        renderIntelList();
        renderContactsTable();
      } catch (err) {
        console.error("[contactos] Error al pintar maqueta", err);
      }
      return;
    }
    try {
      clientsCache = buildClients();
      if (window.RetentionEngine?.attachRetentionSignals) {
        clientsCache = window.RetentionEngine.attachRetentionSignals(clientsCache);
      }
    } catch (err) {
      console.error("[contactos] Error al cargar clientes", err);
      clientsCache = [];
    }
    try {
      updateCounts(clientsCache);
      renderIntelList();
      renderContactsTable();
    } catch (err) {
      console.error("[contactos] Error al pintar contactos", err);
    }
  }

  function findClient(key) {
    return clientsCache.find((c) => c.key === key);
  }

  document.querySelectorAll("[data-intel-filter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeFilter = btn.getAttribute("data-intel-filter") || "all";
      document.querySelectorAll("[data-intel-filter]").forEach((el) => {
        el.classList.toggle("is-active", el === btn);
      });
      renderIntelList();
    });
  });

  bindSearchInput("intel-search", () => {
    renderIntelList();
  });
  bindSearchInput("contacts-search", () => {
    renderContactsTable();
  });

  // Si quedó una búsqueda pegada que oculta todo, no bloquees la carga inicial
  const contactsSearch = document.getElementById("contacts-search");
  const intelSearch = document.getElementById("intel-search");
  if (contactsSearch) contactsSearch.value = "";
  if (intelSearch) intelSearch.value = "";

  document.getElementById("intel-list")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-wa-key]");
    if (!btn) return;
    const client = findClient(btn.getAttribute("data-wa-key"));
    if (client) openWhatsApp(client);
  });

  document.getElementById("contacts-table")?.addEventListener("click", (e) => {
    const sortBtn = e.target.closest("[data-sort]");
    if (sortBtn) {
      const key = sortBtn.getAttribute("data-sort");
      if (directorySort.key === key) {
        directorySort.dir = directorySort.dir === "asc" ? "desc" : "asc";
      } else {
        directorySort.key = key;
        directorySort.dir = key === "total" || key === "lastDate" ? "desc" : "asc";
      }
      renderContactsTable();
      return;
    }
    const btn = e.target.closest("[data-wa-key]");
    if (!btn) return;
    const client = findClient(btn.getAttribute("data-wa-key"));
    if (client) openWhatsApp(client);
  });

  try {
    window.BookingStore?.subscribe?.(refresh);
  } catch {
    /* ignore */
  }
  window.addEventListener("storage", (e) => {
    if (e.key === BOOKINGS_KEY || e.key === LOYALTY_USERS_KEY) refresh();
  });
  window.addEventListener("gestionweb:bookings-changed", refresh);

  if (window.AppShell?.whenReady) window.AppShell.whenReady(refresh);
  else window.addEventListener("gestionweb:panel-ready", refresh, { once: true });
})();
