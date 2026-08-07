(function () {
  const PAUSE_ICON =
    '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="7" y="6.5" width="3.2" height="11" rx="1" fill="currentColor"/><rect x="13.8" y="6.5" width="3.2" height="11" rx="1" fill="currentColor"/></svg>';
  const PLAY_ICON =
    '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 8.2 16.2 12 9 15.8V8.2Z" fill="currentColor"/></svg>';

  function calendarName(row) {
    return row.querySelector(".calendar-cell span:not(.calendar-icon)")?.textContent?.trim() || "Calendario";
  }

  async function refreshGoogleRow() {
    const emailEl = document.getElementById("gmail-calendar-email");
    const statusEl = document.getElementById("gmail-calendar-status");
    const countEl = document.getElementById("gmail-events-count");
    const row = document.querySelector('[data-calendar-id="gmail"]');
    const api = window.GoogleCalendar;
    if (!emailEl || !statusEl || !api) return;

    const auth = api.getConnection();
    if (!auth?.email) {
      emailEl.textContent = "Google Calendar (sin conectar)";
      statusEl.textContent = "Sin conectar";
      statusEl.classList.remove("status--ok");
      statusEl.classList.add("status--paused");
      if (countEl) countEl.textContent = "—";
      if (row) row.dataset.paused = "true";
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
  }

  async function connectGoogleCalendar() {
    const api = window.GoogleCalendar;
    if (!api) {
      window.AppShell?.toast?.("Módulo de Google Calendar no cargó");
      return;
    }
    window.AppShell?.toast?.("Abriendo Google…");
    try {
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
          "Revisa orígenes JS en Google Cloud (localhost) y usuarios de prueba"
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

  document.addEventListener("click", (e) => {
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

      if (action === "pausar") {
        const next = row.dataset.paused !== "true";
        setPaused(row, next);
        window.AppShell?.toast(next ? `Mensajes pausados · ${name}` : `Mensajes reanudados · ${name}`);
        return;
      }

      if (action === "configurar") {
        const id = row.dataset.calendarId || "";
        const params = new URLSearchParams({ id, name });
        location.href = `calendario-config.html?${params.toString()}`;
        return;
      }

      if (action === "eliminar") {
        const id = row?.dataset.calendarId || "";
        if (id === "gmail" && window.GoogleCalendar?.isConnected()) {
          if (!confirm("¿Desconectar Google Calendar?")) return;
          window.GoogleCalendar.disconnect();
          refreshGoogleRow();
          window.AppShell?.toast("Google Calendar desconectado");
          return;
        }
        if (!confirm(`¿Eliminar el calendario "${name}"?`)) return;
        row.remove();
        window.AppShell?.toast(`Calendario eliminado · ${name}`);
        return;
      }

      if (action === "conectar-google") {
        connectGoogleCalendar();
        return;
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

  document.getElementById("btn-add-calendar")?.addEventListener("click", () => {
    connectGoogleCalendar();
  });

  refreshGoogleRow();
})();
