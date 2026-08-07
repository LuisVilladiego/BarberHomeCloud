(function () {
  const NOTIF_KEY = "barbercloud.notifications";
  const BOOKINGS_KEY = "barbercloud.bookings";

  const listEl = document.getElementById("notif-list");
  let filter = "all";

  const BADGE_LABEL = {
    autoagenda: "Autoagenda",
    enviado: "Mensaje enviado",
    confirmada: "Confirmada",
    cancelada: "Cancelada",
    recordatorio: "Recordatorio",
    alerta: "Próxima cita",
  };

  function safeParse(raw, fallback) {
    try {
      return JSON.parse(raw || "") ?? fallback;
    } catch {
      return fallback;
    }
  }

  function loadNotifications() {
    let list = safeParse(localStorage.getItem(NOTIF_KEY), []);
    if (!Array.isArray(list)) list = [];
    list = normalizeNotificationTypes(list);
    list = mergeFromBookings(list);
    list = mergeReminderNotifsFromBookings(list);
    if (!list.length) list = seedDemo();
    saveNotifications(list);
    return list;
  }

  function normalizeNotificationTypes(list) {
    return list.map((n) => {
      const id = String(n.id || "");
      // Alertas internas del admin (antes se guardaban como recordatorio)
      if (id.startsWith("reminder-") || id.startsWith("admin-alert-")) {
        return {
          ...n,
          id: id.startsWith("reminder-")
            ? id.replace("reminder-", "admin-alert-")
            : id,
          type: "alerta",
        };
      }
      // Demos / mensajes de recordatorio al cliente
      if (n.type === "enviado" && (id.startsWith("demo-") || id.startsWith("client-reminder"))) {
        return { ...n, type: "recordatorio" };
      }
      return n;
    });
  }

  function mergeReminderNotifsFromBookings(existing) {
    const bookings = safeParse(localStorage.getItem(BOOKINGS_KEY), []);
    if (!Array.isArray(bookings) || !bookings.length) return existing;
    const byId = new Map(existing.map((n) => [n.id, n]));

    bookings.forEach((b) => {
      if (!b.reminderSent) return;
      const id = `client-reminder-${b.id}`;
      if (byId.has(id)) return;
      const appointmentAt =
        b.date && b.time
          ? `${b.date}T${String(b.time).length === 5 ? b.time + ":00" : b.time}`
          : b.createdAt || new Date().toISOString();
      byId.set(id, {
        id,
        title: `${b.name || "Cliente"} - Recordatorio enviado -`,
        appointmentAt,
        createdAt: b.reminderSentAt || b.createdAt || new Date().toISOString(),
        type: "recordatorio",
        read: true,
        bookingId: b.id,
      });
    });

    bookings.forEach((b) => {
      if (!b.secondReminderSent) return;
      const id = `client-reminder2-${b.id}`;
      if (byId.has(id)) return;
      const appointmentAt =
        b.date && b.time
          ? `${b.date}T${String(b.time).length === 5 ? b.time + ":00" : b.time}`
          : b.createdAt || new Date().toISOString();
      byId.set(id, {
        id,
        title: `${b.name || "Cliente"} - Segundo recordatorio enviado -`,
        appointmentAt,
        createdAt: b.secondReminderSentAt || b.createdAt || new Date().toISOString(),
        type: "recordatorio",
        read: true,
        bookingId: b.id,
      });
    });

    return Array.from(byId.values());
  }

  function saveNotifications(list) {
    localStorage.setItem(NOTIF_KEY, JSON.stringify(list.slice(0, 300)));
  }

  function seedDemo() {
    const now = new Date();
    const today = new Date(now);
    const anteayer = new Date(now);
    anteayer.setDate(anteayer.getDate() - 2);

    return [
      {
        id: "demo-1",
        title: "Jaime y Vicente - Agendar cita en BarberHome -",
        appointmentAt: isoAt(today, 14, 0),
        createdAt: today.toISOString(),
        type: "autoagenda",
        read: false,
      },
      {
        id: "demo-2",
        title: "Jose Goldstein - Agendar cita en BarberHome -",
        appointmentAt: isoAt(addDays(today, 1), 13, 0),
        createdAt: today.toISOString(),
        type: "autoagenda",
        read: false,
      },
      {
        id: "demo-3",
        title: "Juan Miguel Vélez - Recordatorio enviado -",
        appointmentAt: isoAt(addDays(today, -1), 9, 0),
        createdAt: anteayer.toISOString(),
        type: "recordatorio",
        read: true,
      },
      {
        id: "demo-4",
        title: "Alexander Vargas - Recordatorio enviado -",
        appointmentAt: isoAt(addDays(today, -1), 7, 0),
        createdAt: anteayer.toISOString(),
        type: "recordatorio",
        read: true,
      },
      {
        id: "demo-5",
        title: "Alejandro Agudelo - Recordatorio enviado -",
        appointmentAt: isoAt(addDays(today, -2), 17, 0),
        createdAt: anteayer.toISOString(),
        type: "recordatorio",
        read: true,
      },
    ];
  }

  function addDays(d, n) {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  }

  function isoAt(date, h, m) {
    const d = new Date(date);
    d.setHours(h, m, 0, 0);
    return d.toISOString();
  }

  function mergeFromBookings(existing) {
    const bookings = safeParse(localStorage.getItem(BOOKINGS_KEY), []);
    if (!Array.isArray(bookings) || !bookings.length) return existing;

    const byId = new Map(existing.map((n) => [n.id, n]));
    bookings.forEach((b) => {
      const id = `booking-${b.id}`;
      if (byId.has(id)) return;
      const status = String(b.status || "").toLowerCase();
      let type = "autoagenda";
      if (status.includes("cancel")) type = "cancelada";
      else if (status.includes("confirm")) type = "confirmada";
      else if (b.source === "public" || b.source === "autoagenda") type = "autoagenda";
      else if (status.includes("envi") || b.messageSent) type = "enviado";

      const appointmentAt = b.date && b.time
        ? `${b.date}T${String(b.time).length === 5 ? b.time + ":00" : b.time}`
        : b.createdAt || new Date().toISOString();

      byId.set(id, {
        id,
        title: `${b.name || "Cliente"} - Agendar cita en BarberHome -`,
        appointmentAt,
        createdAt: b.createdAt || new Date().toISOString(),
        type,
        read: false,
        bookingId: b.id,
      });
    });
    return Array.from(byId.values());
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatAppt(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "Cita pendiente";
    const date = d.toLocaleDateString("es-CO", { day: "numeric", month: "short" });
    const time = d.toLocaleTimeString("es-CO", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    return `Cita: ${date}, ${time}`;
  }

  function dayGroupLabel(iso) {
    const d = new Date(iso);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const day = new Date(d);
    day.setHours(0, 0, 0, 0);
    const diff = Math.round((today - day) / 86400000);
    if (diff === 0) return "Hoy";
    if (diff === 1) return "Ayer";
    if (diff === 2) return "Anteayer";
    return d.toLocaleDateString("es-CO", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }

  function render() {
    const all = loadNotifications().sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );
    const filtered =
      filter === "all" ? all : all.filter((n) => n.type === filter);

    if (!filtered.length) {
      listEl.innerHTML = `<p class="empty-hint" style="padding:20px 0">No hay notificaciones en este filtro.</p>`;
      return;
    }

    const groups = new Map();
    filtered.forEach((n) => {
      const key = dayGroupLabel(n.createdAt);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(n);
    });

    listEl.innerHTML = Array.from(groups.entries())
      .map(([label, items]) => {
        const cards = items
          .map(
            (n) => `
          <article class="notif-card ${n.read ? "" : "is-unread"}" data-id="${escapeHtml(n.id)}">
            <div class="notif-card__main">
              <strong>${escapeHtml(n.title)}</strong>
              <p>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <rect x="3.5" y="5" width="17" height="15" rx="2" stroke="currentColor" stroke-width="1.6"/>
                  <path d="M3.5 10h17M8 3.5V7M16 3.5V7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
                </svg>
                ${escapeHtml(formatAppt(n.appointmentAt))}
              </p>
            </div>
            <span class="notif-badge notif-badge--${escapeHtml(n.type)}">${escapeHtml(
              BADGE_LABEL[n.type] || n.type
            )}</span>
          </article>`
          )
          .join("");
        return `<section class="notif-group">
          <h2 class="notif-group__title">${escapeHtml(label)}</h2>
          <div class="notif-group__list">${cards}</div>
        </section>`;
      })
      .join("");
  }

  document.querySelectorAll(".notif-filter").forEach((btn) => {
    btn.addEventListener("click", () => {
      filter = btn.getAttribute("data-filter") || "all";
      document.querySelectorAll(".notif-filter").forEach((b) => {
        const on = b === btn;
        b.classList.toggle("is-active", on);
        b.setAttribute("aria-selected", on ? "true" : "false");
      });
      render();
    });
  });

  listEl?.addEventListener("click", (e) => {
    const card = e.target.closest(".notif-card");
    if (!card) return;
    const id = card.getAttribute("data-id");
    const list = loadNotifications();
    const idx = list.findIndex((n) => n.id === id);
    if (idx < 0) return;
    list[idx].read = true;
    saveNotifications(list);
    render();
    window.AppShell?.syncNotificationBadge?.();
    if (list[idx].bookingId) {
      window.AppShell?.toast?.("Notificación marcada como leída");
    }
  });

  render();
  window.AppShell?.syncNotificationBadge?.();
  window.AppShell?.runNotificationJobs?.();
  window.addEventListener("barbercloud:notifications", () => {
    render();
    window.AppShell?.syncNotificationBadge?.();
  });
})();
