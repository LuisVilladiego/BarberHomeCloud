(function () {
  const store = window.CalendarStore;
  if (!store) {
    console.error("[calendarios] CalendarStore no cargó");
    return;
  }

  const PAUSE_ICON =
    '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="7" y="6.5" width="3.2" height="11" rx="1" fill="currentColor"/><rect x="13.8" y="6.5" width="3.2" height="11" rx="1" fill="currentColor"/></svg>';
  const PLAY_ICON =
    '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 8.2 16.2 12 9 15.8V8.2Z" fill="currentColor"/></svg>';

  function calendarName(row) {
    return row.querySelector(".calendar-cell span:not(.calendar-icon)")?.textContent?.trim() || "Calendario";
  }

  function isPreviewMode() {
    if (window.Billing?.isRestricted) return window.Billing.isRestricted();
    return !window.Billing?.isActive?.();
  }

  function syncEmptyState() {
    const rows = [...document.querySelectorAll(".table__row[data-calendar-id]")];
    const visible = rows.some((row) => !row.hidden);
    const emptyEl = document.getElementById("calendars-empty");
    if (emptyEl) emptyEl.hidden = visible;
  }

  /** Muestra u oculta filas según calendarios configurados por el usuario. */
  function syncCalendarRows() {
    const demoRow = document.getElementById("calendar-demo-row");
    const preview = isPreviewMode();

    if (demoRow) {
      demoRow.hidden = !preview;
      demoRow.classList.toggle("is-gone", !preview);
    }

    if (preview) {
      document.querySelectorAll(".table__row[data-calendar-id]").forEach((row) => {
        if (row.id === "calendar-demo-row") return;
        row.hidden = true;
        row.classList.add("is-gone");
      });
      const emptyEl = document.getElementById("calendars-empty");
      if (emptyEl) emptyEl.hidden = true;
      return;
    }

    const configs = store.loadAll();
    const ctx = window.Tenant?.getBusinessContext?.() || {};
    const bizName = ctx.title || "";

    ["barberhome", "barbercloud", "gmail"].forEach((calendarId) => {
      document.querySelectorAll(`[data-calendar-id="${calendarId}"]`).forEach((row) => {
        const show = store.isConfigured(calendarId);
        row.hidden = !show;
        row.classList.toggle("is-gone", !show);
        if (!show) return;

        const cfg = configs[calendarId];
        if (calendarId === "gmail") return;

        const name =
          calendarId === "barberhome"
            ? cfg?.businessName || bizName || "Tu negocio"
            : cfg?.businessName || (bizName ? `Calendario ${bizName}` : "Calendario en BarberCloud");
        const nameSpan = row.querySelector(".calendar-cell span:not(.calendar-icon)");
        if (nameSpan) nameSpan.textContent = name;
        const menuBtn = row.querySelector(".row-menu__trigger");
        if (menuBtn) menuBtn.setAttribute("aria-label", `Opciones de ${name}`);
        if (typeof cfg?.paused === "boolean") setPaused(row, cfg.paused);
      });
    });

    syncEmptyState();
  }

  async function refreshGoogleRow() {
    const emailEl = document.getElementById("gmail-calendar-email");
    const statusEl = document.getElementById("gmail-calendar-status");
    const countEl = document.getElementById("gmail-events-count");
    const row = document.querySelector('[data-calendar-id="gmail"]');
    const api = window.GoogleCalendar;
    if (!emailEl || !statusEl || !api) return;

    if (store.isRemoved("gmail")) {
      emailEl.textContent = "Google Calendar (sin conectar)";
      statusEl.textContent = "Sin conectar";
      statusEl.classList.remove("status--ok");
      statusEl.classList.add("status--paused");
      if (countEl) countEl.textContent = "—";
      if (row) {
        row.dataset.paused = "true";
        row.hidden = true;
        row.classList.add("is-gone");
      }
      syncEmptyState();
      return;
    }

    const auth = api.getConnection();
    if (!auth?.email) {
      emailEl.textContent = "Google Calendar (sin conectar)";
      statusEl.textContent = "Sin conectar";
      statusEl.classList.remove("status--ok");
      statusEl.classList.add("status--paused");
      if (countEl) countEl.textContent = "—";
      if (row) row.dataset.paused = "true";
      syncCalendarRows();
      return;
    }

    emailEl.textContent = auth.email;
    statusEl.textContent = "Conectado";
    statusEl.classList.add("status--ok");
    statusEl.classList.remove("status--paused");
    if (row) row.dataset.paused = "false";

    try {
      const events = await api.listUpcomingEvents({ maxResults: 50 });
      if (countEl) countEl.textContent = String(events.length);
    } catch {
      if (countEl) countEl.textContent = "—";
    }

    syncCalendarRows();
  }

  async function connectGoogleCalendar() {
    const api = window.GoogleCalendar;
    if (!api) {
      window.AppShell?.toast?.("Módulo de Google Calendar no cargó");
      return;
    }
    window.AppShell?.toast?.("Abriendo Google…");
    try {
      store.unmarkRemoved("gmail");
      const auth = await api.connect({ forceConsent: !api.isConnected() });
      try {
        await api.syncBusyCache?.();
      } catch {
        /* ignore */
      }
      await refreshGoogleRow();
      window.AppShell?.toast?.(
        `Google Calendar conectado · disponibilidad actualizada · ${auth.email || auth.calendarName || "OK"}`
      );
    } catch (err) {
      const msg = String(err?.message || err || "");
      if (/popup_closed|access_denied|user/i.test(msg)) {
        window.AppShell?.toast?.("Conexión cancelada");
        return;
      }
      if (/origin|redirect|invalid_client|idpiframe/i.test(msg)) {
        window.AppShell?.toast?.(
          "Google no autoriza esta dirección. Abre el panel en https://barber-home-cloud.vercel.app"
        );
        return;
      }
      window.AppShell?.toast?.(msg || "No se pudo conectar Google Calendar");
    }
  }

  function closeAllMenus(except) {
    document.querySelectorAll(".row-menu.is-open").forEach((menu) => {
      if (except && menu === except) return;
      menu.classList.remove("is-open");
      const trigger = menu.querySelector(".row-menu__trigger");
      const panel = menu.querySelector(".row-menu__panel");
      if (trigger) trigger.setAttribute("aria-expanded", "false");
      if (panel) panel.hidden = true;
    });
  }

  function openMenu(menu) {
    closeAllMenus(menu);
    menu.classList.add("is-open");
    const trigger = menu.querySelector(".row-menu__trigger");
    const panel = menu.querySelector(".row-menu__panel");
    if (trigger) trigger.setAttribute("aria-expanded", "true");
    if (panel) panel.hidden = false;
  }

  function setPaused(row, paused) {
    row.dataset.paused = paused ? "true" : "false";
    const status = row.querySelector(".status");
    if (status) {
      status.classList.toggle("status--ok", !paused);
      status.classList.toggle("status--paused", paused);
      status.textContent = paused ? "Mensajes pausados" : "Enviando mensajes";
    }
    const pauseBtn = row.querySelector('[data-action="pausar"]');
    if (pauseBtn) {
      pauseBtn.innerHTML = `${paused ? PLAY_ICON : PAUSE_ICON}${paused ? "Reanudar mensajes" : "Pausar mensajes"}`;
    }
  }

  function hideCalendarRow(id) {
    if (!id) return;
    document.querySelectorAll(`[data-calendar-id="${id}"]`).forEach((row) => {
      row.hidden = true;
      row.setAttribute("hidden", "");
      row.classList.add("is-gone");
    });
    syncEmptyState();
  }

  function requestDelete(id, row) {
    if (!id || id === "demo") {
      window.AppShell?.toast?.("Este calendario de ejemplo se quita al activar tu plan.");
      return false;
    }
    return removeCalendar(id, row, calendarName(row));
  }

  function removeCalendar(id, row, name) {
    if (!id || id === "demo") return false;

    if (id === "gmail") {
      const msg = window.GoogleCalendar?.isConnected?.()
        ? "¿Desconectar y eliminar Google Calendar?"
        : `¿Eliminar el calendario "${name}"?`;
      if (!confirm(msg)) return false;
    } else if (!confirm(`¿Eliminar el calendario "${name}"?`)) {
      return false;
    }

    hideCalendarRow(id);

    const ok = store.markRemoved(id);
    if (!ok) {
      if (row) {
        row.hidden = false;
        row.removeAttribute("hidden");
        row.classList.remove("is-gone");
      }
      syncCalendarRows();
      window.AppShell?.toast?.("No se pudo eliminar el calendario. Recarga e inténtalo de nuevo.");
      return false;
    }

    hideCalendarRow(id);
    if (id === "gmail") refreshGoogleRow();
    syncEmptyState();

    window.AppShell?.toast?.(
      id === "gmail" ? "Google Calendar eliminado" : `Calendario eliminado · ${name}`
    );
    return true;
  }

  document.addEventListener("click", (e) => {
    const deleteBtn = e.target.closest("[data-calendar-delete]");
    if (deleteBtn) {
      e.preventDefault();
      e.stopPropagation();
      closeAllMenus();
      const row = deleteBtn.closest(".table__row");
      requestDelete(row?.dataset.calendarId || "", row);
      return;
    }

    const trigger = e.target.closest(".row-menu__trigger");
    if (trigger) {
      e.preventDefault();
      e.stopPropagation();
      const menu = trigger.closest(".row-menu");
      if (!menu) return;
      if (menu.classList.contains("is-open")) closeAllMenus();
      else openMenu(menu);
      return;
    }

    const item = e.target.closest(".row-menu__item");
    if (item) {
      e.preventDefault();
      e.stopPropagation();
      const row = item.closest(".table__row");
      const action = item.getAttribute("data-action");
      const name = calendarName(row);
      closeAllMenus();

      if (action === "eliminar") {
        requestDelete(row?.dataset.calendarId || "", row);
        return;
      }

      if (action === "pausar") {
        const id = row?.dataset.calendarId || "";
        const next = row.dataset.paused !== "true";
        setPaused(row, next);
        if (id && id !== "demo") {
          const all = store.loadAll();
          if (all[id]) {
            all[id].paused = next;
            store.saveAll(all);
          }
        }
        window.AppShell?.toast(next ? `Mensajes pausados · ${name}` : `Mensajes reanudados · ${name}`);
        return;
      }

      if (action === "configurar") {
        if (isPreviewMode() || row?.dataset.calendarId === "demo") {
          location.href = "suscripcion.html?need=1";
          return;
        }
        const id = row.dataset.calendarId || "";
        const params = new URLSearchParams({ id, name });
        location.href = `calendario-config.html?${params.toString()}`;
        return;
      }

      if (action === "crear-cita") {
        location.href = "calendario.html";
        return;
      }

      if (action === "conectar-google") {
        if (isPreviewMode()) {
          location.href = "suscripcion.html?need=1";
          return;
        }
        connectGoogleCalendar();
        return;
      }

      if (action === "mensajes") {
        if (isPreviewMode() || row?.dataset.calendarId === "demo") {
          window.AppShell?.toast("En el plan activo aquí verás los mensajes reales de tus clientes.");
          return;
        }
      }

      const labels = {
        "crear-cita": "Crear cita",
        mensajes: "Mensajes programados",
      };
      window.AppShell?.toast(`${labels[action] || action} · ${name}`);
      return;
    }

    if (!e.target.closest(".row-menu")) closeAllMenus();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAllMenus();
  });

  function addCalendarOrUpgrade() {
    if (isPreviewMode()) {
      location.href = "suscripcion.html?need=1";
      return;
    }
    connectGoogleCalendar();
  }

  document.getElementById("btn-add-calendar")?.addEventListener("click", () => {
    addCalendarOrUpgrade();
  });

  document.getElementById("btn-empty-add-calendar")?.addEventListener("click", () => {
    addCalendarOrUpgrade();
  });

  function startCalendars() {
    store.migrateLegacyOnce?.();
    syncCalendarRows();
    refreshGoogleRow();
  }

  if (window.AppShell?.whenReady) window.AppShell.whenReady(startCalendars);
  else window.addEventListener("barbercloud:panel-ready", startCalendars, { once: true });

  window.addEventListener("barbercloud:billing-updated", syncCalendarRows);
  window.addEventListener("barbercloud:calendars-changed", syncCalendarRows);
  window.addEventListener("barbercloud:tenant-changed", () => {
    store.migrateLegacyOnce?.();
    syncCalendarRows();
    refreshGoogleRow();
  });

  window.BarberCalendars = {
    markRemoved: (id) => store.markRemoved(id),
    unmarkRemoved: (id) => store.unmarkRemoved(id),
    isRemoved: (id) => store.isRemoved(id),
    isConfigured: (id) => store.isConfigured(id),
    syncRows: syncCalendarRows,
  };
})();
