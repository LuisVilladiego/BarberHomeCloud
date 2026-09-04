(function () {
  const NOTIF_KEY = "gestionweb.notifications";
  const BOOKINGS_KEY = "gestionweb.bookings";

  const listEl = document.getElementById("notif-list");
  let filter = "all";

  const BADGE_LABEL = {
    autoagenda: "Autoagenda",
    enviado: "Mensaje enviado",
    confirmada: "Confirmada",
    cancelada: "Cancelada",
    recordatorio: "Recordatorio",
    alerta: "Próxima cita",
    retencion: "Retención",
  };

  const RETENTION_KIND_LABEL = {
    inactive: "Inactivo",
    lost: "Perdido",
    milestone: "Hito",
    near_reward: "Cerca de canje",
    birthday: "Cumpleaños",
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
        title: `${b.name || "Cliente"} - Agendar cita -`,
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
          .map((n) => {
            const isRetention = n.type === "retencion";
            const subLabel = isRetention
              ? RETENTION_KIND_LABEL[n.retentionKind] || n.retentionKind
              : "";
            const detail = n.body || formatAppt(n.appointmentAt);
            const canWa = isRetention && String(n.phone || "").replace(/\D/g, "").length >= 7;
            return `
          <article class="notif-card ${n.read ? "" : "is-unread"}${isRetention ? " notif-card--retencion" : ""}" data-id="${escapeHtml(n.id)}"${isRetention ? ` data-retention-kind="${escapeHtml(n.retentionKind || "")}" data-client-key="${escapeHtml(n.clientKey || "")}"` : ""}>
            <div class="notif-card__main">
              <strong>${escapeHtml(n.title)}</strong>
              <p class="notif-card__detail">${escapeHtml(detail)}</p>
              ${
                isRetention && subLabel
                  ? `<p class="notif-card__sub">${escapeHtml(subLabel)}</p>`
                  : !isRetention
                    ? `<p>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <rect x="3.5" y="5" width="17" height="15" rx="2" stroke="currentColor" stroke-width="1.6"/>
                  <path d="M3.5 10h17M8 3.5V7M16 3.5V7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
                </svg>
                ${escapeHtml(formatAppt(n.appointmentAt))}
              </p>`
                    : ""
              }
              ${
                canWa
                  ? `<button type="button" class="btn btn--whatsapp btn--sm notif-card__wa" data-wa-notif="${escapeHtml(n.id)}">📲 WhatsApp</button>`
                  : ""
              }
            </div>
            <span class="notif-badge notif-badge--${escapeHtml(n.type)}">${escapeHtml(
              BADGE_LABEL[n.type] || n.type
            )}</span>
          </article>`;
          })
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
    const waBtn = e.target.closest("[data-wa-notif]");
    if (waBtn) {
      e.stopPropagation();
      const id = waBtn.getAttribute("data-wa-notif");
      const notif = loadNotifications().find((n) => n.id === id);
      if (!notif || notif.type !== "retencion") return;
      const client = { name: notif.title.split(" — ")[0] || "Cliente", phone: notif.phone };
      const signal = { kind: notif.retentionKind || "inactive" };
      if (notif.body?.includes("canjear")) {
        const m = notif.body.match(/«([^»]+)»/);
        if (m) signal.productName = m[1];
        const gap = notif.body.match(/faltan (\d+) pts/i);
        if (gap) signal.pointsGap = Number(gap[1]);
      }
      window.RetentionEngine?.openWhatsApp?.(client, signal);
      return;
    }

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

  window.addEventListener("gestionweb:notifications", () => {
    render();
    window.AppShell?.syncNotificationBadge?.();
  });

  function start() {
    render();
    window.AppShell?.syncNotificationBadge?.();
    window.AppShell?.runNotificationJobs?.();
  }

  if (window.AppShell?.whenReady) window.AppShell.whenReady(start);
  else window.addEventListener("gestionweb:panel-ready", start, { once: true });
})();
