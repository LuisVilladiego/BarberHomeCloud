(function () {
  const KEY_MAP = {
    confirmafy_settings: "barbercloud_settings",
    confirmafy_feedback: "barbercloud_feedback",
    "confirmafy.autoagenda": "barbercloud.autoagenda",
    "confirmafy.bookings": "barbercloud.bookings",
    "confirmafy.subscription": "barbercloud.subscription",
    "confirmafy.tutorial": "barbercloud.tutorial",
  };

  try {
    Object.entries(KEY_MAP).forEach(([from, to]) => {
      if (localStorage.getItem(to) != null) return;
      const prev = localStorage.getItem(from);
      if (prev != null) localStorage.setItem(to, prev);
    });
  } catch {
    /* ignore */
  }

  function syncUserFromSettings() {
    try {
      const s = JSON.parse(localStorage.getItem("barbercloud_settings") || "{}");
      if (!s.name) return;
      document.querySelectorAll(".user__name").forEach((el) => {
        el.textContent = s.name;
      });
      document.querySelectorAll(".user__avatar").forEach((el) => {
        el.textContent = (String(s.name).trim()[0] || "I").toUpperCase();
      });
    } catch {
      /* ignore */
    }
  }

  function unreadNotificationCount() {
    try {
      const list = JSON.parse(localStorage.getItem("barbercloud.notifications") || "[]");
      if (!Array.isArray(list) || !list.length) return 49;
      return list.filter((n) => !n.read).length;
    } catch {
      return 49;
    }
  }

  function syncNotificationBadge() {
    const count = unreadNotificationCount();
    const label = count > 49 ? "49+" : String(count);
    document.querySelectorAll(".notifications .badge-count").forEach((el) => {
      el.textContent = label;
      el.hidden = count <= 0;
    });
  }

  function wireNotificationBell() {
    document.querySelectorAll(".notifications").forEach((el) => {
      if (el.tagName === "A") {
        el.setAttribute("href", "notificaciones.html");
        return;
      }
      el.addEventListener("click", (e) => {
        e.preventDefault();
        location.href = "notificaciones.html";
      });
    });
  }

  const REMINDER_MINUTES = 30;
  const BOOKINGS_KEY = "barbercloud.bookings";
  const NOTIF_KEY = "barbercloud.notifications";
  const CAL_CONFIGS_KEY = "barbercloud.calendar_configs";

  function parseBookingDate(booking) {
    if (!booking?.date || !booking?.time) return null;
    const time =
      String(booking.time).length === 5 ? `${booking.time}:00` : String(booking.time);
    const d = new Date(`${booking.date}T${time}`);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function isActiveBooking(booking) {
    const status = String(booking?.status || "").toLowerCase();
    return !status.includes("cancel");
  }

  function formatReminderTime(date) {
    return date.toLocaleTimeString("es-CO", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }

  function toast(message) {
    const el = document.getElementById("toast");
    if (!el) return;
    el.textContent = message;
    el.hidden = false;
    clearTimeout(el._timer);
    el._timer = setTimeout(() => {
      el.hidden = true;
    }, 2800);
  }

  function getMessageConfig() {
    try {
      const all = JSON.parse(localStorage.getItem(CAL_CONFIGS_KEY) || "{}");
      const cfg =
        all.barberhome ||
        all.gmail ||
        all.barbercloud ||
        Object.values(all).find((c) => c && typeof c === "object") ||
        {};
      return {
        paused: !!cfg.paused,
        sendHoursBefore: Number(cfg.sendHoursBefore || 24) || 24,
        secondReminder: !!cfg.secondReminder,
        secondHoursBefore: Number(cfg.secondHoursBefore || 12) || 12,
      };
    } catch {
      return {
        paused: false,
        sendHoursBefore: 24,
        secondReminder: false,
        secondHoursBefore: 12,
      };
    }
  }

  function clampSendNotBefore730(sendAt, appointment) {
    const d = new Date(sendAt);
    const day = new Date(appointment);
    day.setHours(7, 30, 0, 0);
    if (d.getTime() < day.getTime() && d.toDateString() === appointment.toDateString()) {
      return day.getTime();
    }
    if (d.getHours() < 7 || (d.getHours() === 7 && d.getMinutes() < 30)) {
      const fixed = new Date(d);
      fixed.setHours(7, 30, 0, 0);
      return fixed.getTime();
    }
    return sendAt;
  }

  function notifyCreated(created) {
    if (!created.length) return;
    syncNotificationBadge();
    window.dispatchEvent(
      new CustomEvent("barbercloud:notifications", { detail: { created } })
    );
  }

  /** Alerta interna al admin: 30 min antes de la cita */
  function checkAdminReminders() {
    try {
      const bookings = JSON.parse(localStorage.getItem(BOOKINGS_KEY) || "[]");
      if (!Array.isArray(bookings) || !bookings.length) return;

      let notifs = JSON.parse(localStorage.getItem(NOTIF_KEY) || "[]");
      if (!Array.isArray(notifs)) notifs = [];
      const existing = new Set(notifs.map((n) => n.id));
      const now = Date.now();
      const windowMs = REMINDER_MINUTES * 60 * 1000;
      const created = [];

      bookings.forEach((booking) => {
        if (!isActiveBooking(booking)) return;
        const alertId = `admin-alert-${booking.id}`;
        if (existing.has(alertId) || existing.has(`reminder-${booking.id}`)) return;

        const appt = parseBookingDate(booking);
        if (!appt) return;

        const msUntil = appt.getTime() - now;
        if (msUntil <= 0 || msUntil > windowMs) return;

        const minsLeft = Math.max(1, Math.round(msUntil / 60000));
        const notif = {
          id: alertId,
          title: `Próxima cita · ${booking.name || "Cliente"} · ${
            booking.serviceName || "Cita"
          } a las ${formatReminderTime(appt)} (en ~${minsLeft} min)`,
          appointmentAt: appt.toISOString(),
          createdAt: new Date().toISOString(),
          type: "alerta",
          read: false,
          bookingId: booking.id,
        };
        notifs.unshift(notif);
        existing.add(alertId);
        created.push(notif);
      });

      if (!created.length) return;

      localStorage.setItem(NOTIF_KEY, JSON.stringify(notifs.slice(0, 300)));
      notifyCreated(created);
      toast(
        created.length === 1
          ? `⏰ Cita en ~${REMINDER_MINUTES} min · ${created[0].title.replace(/^Próxima cita · /, "")}`
          : `⏰ ${created.length} citas próximas`
      );
    } catch {
      /* ignore */
    }
  }

  /**
   * Simula el envío de recordatorios a clientes y los lista en
   * Notificaciones → Recordatorios (personas a las que ya se les envió).
   */
  function processClientReminderSends() {
    try {
      const cfg = getMessageConfig();
      if (cfg.paused) return;

      let bookings = JSON.parse(localStorage.getItem(BOOKINGS_KEY) || "[]");
      if (!Array.isArray(bookings) || !bookings.length) return;

      let notifs = JSON.parse(localStorage.getItem(NOTIF_KEY) || "[]");
      if (!Array.isArray(notifs)) notifs = [];
      const existing = new Set(notifs.map((n) => n.id));
      const now = Date.now();
      const created = [];
      let bookingsChanged = false;

      bookings = bookings.map((booking) => {
        if (!isActiveBooking(booking)) return booking;
        const appt = parseBookingDate(booking);
        if (!appt) return booking;

        let next = booking;
        const graceUntil = appt.getTime() + 60 * 60 * 1000;

        if (!booking.reminderSent && now < graceUntil) {
          let sendAt = appt.getTime() - cfg.sendHoursBefore * 60 * 60 * 1000;
          sendAt = clampSendNotBefore730(sendAt, appt);
          if (now >= sendAt) {
            const notifId = `client-reminder-${booking.id}`;
            if (!existing.has(notifId)) {
              const notif = {
                id: notifId,
                title: `${booking.name || "Cliente"} - Recordatorio enviado -`,
                appointmentAt: appt.toISOString(),
                createdAt: new Date().toISOString(),
                type: "recordatorio",
                read: false,
                bookingId: booking.id,
              };
              notifs.unshift(notif);
              existing.add(notifId);
              created.push(notif);
            }
            next = {
              ...next,
              reminderSent: true,
              reminderSentAt: new Date().toISOString(),
            };
            bookingsChanged = true;
          }
        }

        if (cfg.secondReminder && !next.secondReminderSent && now < graceUntil) {
          let sendAt2 = appt.getTime() - cfg.secondHoursBefore * 60 * 60 * 1000;
          sendAt2 = clampSendNotBefore730(sendAt2, appt);
          if (now >= sendAt2) {
            const notifId = `client-reminder2-${booking.id}`;
            if (!existing.has(notifId)) {
              const notif = {
                id: notifId,
                title: `${booking.name || "Cliente"} - Segundo recordatorio enviado -`,
                appointmentAt: appt.toISOString(),
                createdAt: new Date().toISOString(),
                type: "recordatorio",
                read: false,
                bookingId: booking.id,
              };
              notifs.unshift(notif);
              existing.add(notifId);
              created.push(notif);
            }
            next = {
              ...next,
              secondReminderSent: true,
              secondReminderSentAt: new Date().toISOString(),
            };
            bookingsChanged = true;
          }
        }

        return next;
      });

      if (bookingsChanged) {
        localStorage.setItem(BOOKINGS_KEY, JSON.stringify(bookings));
      }
      if (created.length) {
        localStorage.setItem(NOTIF_KEY, JSON.stringify(notifs.slice(0, 300)));
        notifyCreated(created);
      }
    } catch {
      /* ignore */
    }
  }

  function runNotificationJobs() {
    processClientReminderSends();
    checkAdminReminders();
  }

  window.AppShell = {
    toast,
    syncNotificationBadge,
    checkAdminReminders,
    processClientReminderSends,
    runNotificationJobs,
  };

  syncUserFromSettings();
  wireNotificationBell();
  syncNotificationBadge();
  runNotificationJobs();
  setInterval(runNotificationJobs, 20000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) runNotificationJobs();
  });

  const toggle = document.querySelector(".menu-toggle");
  const sidebar = document.querySelector(".sidebar");
  const backdrop = document.querySelector(".backdrop");

  if (!toggle || !sidebar) return;

  function setOpen(open) {
    sidebar.classList.toggle("is-open", open);
    document.body.classList.toggle("nav-open", open);
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
  }

  toggle.addEventListener("click", () => setOpen(!sidebar.classList.contains("is-open")));
  backdrop?.addEventListener("click", () => setOpen(false));
  sidebar.querySelectorAll(".nav__item").forEach((link) => {
    link.addEventListener("click", () => setOpen(false));
  });
  window.addEventListener("resize", () => {
    if (window.innerWidth > 900) setOpen(false);
  });
})();
