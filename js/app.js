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
      if (s.name) {
        document.querySelectorAll(".user__name").forEach((el) => {
          el.textContent = s.name;
        });
        document.querySelectorAll(".user__avatar").forEach((el) => {
          el.textContent = (String(s.name).trim()[0] || "I").toUpperCase();
        });
      }
    } catch {
      /* ignore */
    }
    applySaasBranding();
  }

  function applySaasBranding() {
    document.querySelectorAll(".brand").forEach((brand) => {
      if (brand.querySelector(".brand__sub")) return;
      const name = brand.querySelector(".brand__name");
      if (!name) return;
      const wrap = document.createElement("span");
      wrap.className = "brand__text";
      name.replaceWith(wrap);
      wrap.appendChild(name);
      const sub = document.createElement("small");
      sub.className = "brand__sub";
      sub.textContent = "Plataforma para barberías";
      wrap.appendChild(sub);
    });
    document.querySelectorAll('a.nav__item[href="marketplace.html"]').forEach((a) => {
      a.childNodes.forEach((n) => {
        if (n.nodeType === 3 && n.textContent.trim()) n.textContent = " Tienda";
      });
    });
    let negocio = "";
    try {
      const auto = JSON.parse(localStorage.getItem("barbercloud.autoagenda") || "{}");
      negocio = String(auto.title || "").trim();
    } catch {
      negocio = "";
    }
    if (!negocio) negocio = window.Tenant?.cached?.()?.name || "";
    document.querySelectorAll(".user").forEach((box) => {
      const nameEl = box.querySelector(".user__name");
      if (nameEl && !nameEl.parentElement.classList.contains("user__text")) {
        const wrap = document.createElement("span");
        wrap.className = "user__text";
        nameEl.replaceWith(wrap);
        wrap.appendChild(nameEl);
      }
      const host = box.querySelector(".user__text") || box;
      let chip = host.querySelector(".user__negocio");
      if (!negocio) {
        chip?.remove();
        return;
      }
      if (!chip) {
        chip = document.createElement("span");
        chip.className = "user__negocio";
        host.appendChild(chip);
      }
      chip.textContent = negocio;
    });
  }

  function unreadNotificationCount() {
    try {
      const list = JSON.parse(localStorage.getItem("barbercloud.notifications") || "[]");
      if (!Array.isArray(list) || !list.length) return 0;
      return list.filter((n) => !n.read).length;
    } catch {
      return 0;
    }
  }

  function syncNotificationBadge() {
    const count = unreadNotificationCount();
    const label = count > 99 ? "99+" : String(count);
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

  let retentionEnginePromise = null;

  function ensureRetentionEngine() {
    if (window.RetentionEngine) return Promise.resolve();
    if (retentionEnginePromise) return retentionEnginePromise;
    retentionEnginePromise = new Promise((resolve) => {
      const existing = document.querySelector('script[data-retention-engine="1"]');
      if (existing) {
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener("error", () => resolve(), { once: true });
        return;
      }
      const script = document.createElement("script");
      script.src = "js/retention-engine.js?v=20260818";
      script.dataset.retentionEngine = "1";
      script.onload = () => resolve();
      script.onerror = () => resolve();
      document.head.appendChild(script);
    });
    return retentionEnginePromise;
  }

  function runRetentionScan() {
    ensureRetentionEngine().then(() => {
      window.RetentionEngine?.syncRetentionNotifications?.();
    });
  }

  function runNotificationJobs() {
    processClientReminderSends();
    checkAdminReminders();
    runRetentionScan();
  }

  const LAST_ACTIVITY_KEY = "barbercloud.last_activity";
  const IDLE_MS = 15 * 60 * 1000;

  function hasAuthSessionEarly() {
    try {
      const raw = localStorage.getItem("barbercloud.auth");
      if (!raw) return false;
      const data = JSON.parse(raw);
      return !!(data?.access_token || data?.currentSession?.access_token || data?.user);
    } catch {
      return false;
    }
  }

  async function logout(options = {}) {
    try {
      await window.BarberAuth?.signOut?.();
    } catch {
      /* ignore */
    }
    try {
      const client = window.SupabaseClient?.getClient?.();
      if (client?.auth?.signOut) await client.auth.signOut();
    } catch {
      /* ignore */
    }
    try {
      localStorage.removeItem("barbercloud.auth");
      localStorage.removeItem(LAST_ACTIVITY_KEY);
      window.Tenant?.clearLocalData?.();
    } catch {
      /* ignore */
    }
    location.href = options.idle ? "login.html?idle=1" : "login.html";
  }

  function markActivity() {
    try {
      localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
  }

  function startIdleWatch() {
    if (!hasAuthSessionEarly()) return;
    markActivity();
    let lastWrite = 0;
    const bump = () => {
      const now = Date.now();
      if (now - lastWrite < 4000) return;
      lastWrite = now;
      markActivity();
    };
    ["click", "keydown", "mousemove", "scroll", "touchstart"].forEach((evt) => {
      document.addEventListener(evt, bump, { passive: true });
    });
    const check = () => {
      if (!hasAuthSessionEarly()) return;
      let last = 0;
      try {
        last = Number(localStorage.getItem(LAST_ACTIVITY_KEY) || 0);
      } catch {
        last = 0;
      }
      if (!last) {
        markActivity();
        return;
      }
      if (Date.now() - last >= IDLE_MS) {
        logout({ idle: true });
      }
    };
    setInterval(check, 15000);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) check();
    });
    window.addEventListener("storage", (e) => {
      if (e.key === LAST_ACTIVITY_KEY || e.key === "barbercloud.auth") check();
    });
  }

  function wireUserMenu() {
    document.querySelectorAll("aside .user").forEach((btn) => {
      if (btn.closest(".user-menu")) return;
      const wrap = document.createElement("div");
      wrap.className = "user-menu";
      btn.replaceWith(wrap);
      wrap.appendChild(btn);
      btn.setAttribute("aria-haspopup", "true");
      btn.setAttribute("aria-expanded", "false");
      if (!btn.querySelector(".user__caret")) {
        btn.insertAdjacentHTML(
          "beforeend",
          '<svg class="user__caret" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 10l5 5 5-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'
        );
      }
      const panel = document.createElement("div");
      panel.className = "user-menu__panel";
      panel.hidden = true;
      panel.innerHTML =
        '<button type="button" class="user-menu__item" data-logout>Cerrar sesión</button>';
      wrap.appendChild(panel);

      const setOpen = (open) => {
        panel.hidden = !open;
        btn.setAttribute("aria-expanded", open ? "true" : "false");
      };
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        setOpen(panel.hidden);
      });
      panel.querySelector("[data-logout]")?.addEventListener("click", (e) => {
        e.preventDefault();
        logout();
      });
      document.addEventListener("click", (e) => {
        if (!wrap.contains(e.target)) setOpen(false);
      });
    });
  }

  window.AppShell = {
    toast,
    logout,
    syncNotificationBadge,
    checkAdminReminders,
    processClientReminderSends,
    runNotificationJobs,
  };

  syncUserFromSettings();
  wireNotificationBell();
  syncNotificationBadge();
  wireUserMenu();
  startIdleWatch();

  function hasExistingBusiness() {
    if (window.Tenant?.hasExistingBusiness?.()) return true;
    try {
      if (localStorage.getItem("barbercloud.onboarded") === "1") return true;
      if (localStorage.getItem("barbercloud.negocio_id")) return true;
      const auto = JSON.parse(localStorage.getItem("barbercloud.autoagenda") || "{}");
      return !!(auto.slug && String(auto.slug).length >= 3);
    } catch {
      return false;
    }
  }

  function hasAuthSession() {
    try {
      const raw = localStorage.getItem("barbercloud.auth");
      if (!raw) return false;
      const data = JSON.parse(raw);
      return !!(data?.access_token || data?.currentSession?.access_token || data?.user);
    } catch {
      return false;
    }
  }

  function hasActiveSub() {
    if (window.Tenant?.hasActiveSubscription) return window.Tenant.hasActiveSubscription();
    try {
      const raw = localStorage.getItem("barbercloud.subscription");
      if (!raw) return false;
      const status = String(JSON.parse(raw)?.status || "").toLowerCase();
      return status === "active" || status === "trialing";
    } catch {
      return false;
    }
  }

  async function initTenantGate() {
    if (hasAuthSession() && window.Tenant?.syncWithAuthenticatedUser) {
      const sync = await window.Tenant.syncWithAuthenticatedUser();
      if (sync?.needsOnboarding) {
        location.replace("onboarding.html");
        return false;
      }
    } else if (!hasExistingBusiness()) {
      location.replace("onboarding.html");
      return false;
    }

    const page = (location.pathname.split("/").pop() || "index.html").toLowerCase();
    if (page !== "suscripcion.html" && hasAuthSession() && !hasActiveSub()) {
      location.replace("suscripcion.html?need=1");
      return false;
    }
    return true;
  }

  initTenantGate().then((ok) => {
    if (!ok) return;

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
  });
})();
