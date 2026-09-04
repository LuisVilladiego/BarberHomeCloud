/**
 * Persistencia de calendarios del panel — aislada por negocio_id.
 * Los eliminados viven en una clave aparte para no perderse al guardar configs.
 */
(function () {
  const BASE_KEY = "gestionweb.calendar_configs";

  function currentNegocioId() {
    return window.Tenant?.currentId?.() || window.Tenant?.cached?.()?.id || "";
  }

  function configsKey() {
    const nid = currentNegocioId();
    if (!nid) return null;
    return window.Tenant?.scopedStorageKey?.(BASE_KEY) || `${BASE_KEY}.${nid}`;
  }

  function removedKey() {
    const nid = currentNegocioId();
    if (!nid) return null;
    return `${BASE_KEY}.${nid}.removed`;
  }

  function migrateLegacyRemoved(all) {
    const key = removedKey();
    if (!key || !Array.isArray(all._removed) || !all._removed.length) return;
    try {
      const prev = loadRemovedIds();
      const merged = [...new Set([...prev, ...all._removed])];
      localStorage.setItem(key, JSON.stringify(merged));
      delete all._removed;
      const cfgKey = configsKey();
      if (cfgKey) localStorage.setItem(cfgKey, JSON.stringify(all));
    } catch {
      /* ignore */
    }
  }

  function loadRemovedIds() {
    try {
      const key = removedKey();
      if (!key) return [];
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
      }
      const all = JSON.parse(localStorage.getItem(configsKey() || "") || "{}");
      return Array.isArray(all._removed) ? all._removed.filter(Boolean) : [];
    } catch {
      return [];
    }
  }

  function saveRemovedIds(ids) {
    try {
      const key = removedKey();
      if (!key) return false;
      localStorage.setItem(key, JSON.stringify([...new Set(ids.filter(Boolean))]));
      return true;
    } catch {
      return false;
    }
  }

  function loadAll() {
    const key = configsKey();
    if (!key) return {};
    try {
      window.Tenant?.scopedStorageKey?.(BASE_KEY);
      const raw = JSON.parse(localStorage.getItem(key) || "{}");
      if (!raw || typeof raw !== "object") return {};
      const nid = currentNegocioId();
      if (nid && raw._negocioId && raw._negocioId !== nid) return {};
      if (Array.isArray(raw._removed) && raw._removed.length) migrateLegacyRemoved(raw);
      const copy = { ...raw };
      delete copy._removed;
      return copy;
    } catch {
      return {};
    }
  }

  function saveAll(all) {
    const key = configsKey();
    if (!key) return false;
    try {
      const nid = currentNegocioId();
      const payload = { ...all };
      delete payload._removed;
      if (nid) payload._negocioId = nid;
      localStorage.setItem(key, JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  }

  function notifyChange() {
    window.dispatchEvent(new CustomEvent("gestionweb:calendars-changed"));
  }

  function isRemoved(calendarId) {
    if (!calendarId || calendarId === "demo") return false;
    return loadRemovedIds().includes(calendarId);
  }

  function markRemoved(calendarId) {
    if (!calendarId || calendarId === "demo") return false;
    if (!currentNegocioId()) return false;

    const removed = new Set(loadRemovedIds());
    removed.add(calendarId);
    if (!saveRemovedIds([...removed])) return false;

    const all = loadAll();
    delete all[calendarId];
    saveAll(all);

    if (calendarId === "gmail") {
      try {
        window.GoogleCalendar?.disconnect?.();
        window.GoogleCalendar?.clearBusyCache?.();
      } catch {
        /* ignore */
      }
    }

    notifyChange();
    return true;
  }

  function unmarkRemoved(calendarId) {
    if (!calendarId || calendarId === "demo") return false;
    if (!isRemoved(calendarId)) return true;
    const next = loadRemovedIds().filter((id) => id !== calendarId);
    saveRemovedIds(next);
    notifyChange();
    return true;
  }

  function isConfigured(calendarId) {
    if (!calendarId || calendarId === "demo") return false;
    if (isRemoved(calendarId)) return false;

    if (calendarId === "gmail") {
      const auth = window.GoogleCalendar?.getConnection?.();
      return !!(auth?.email || window.GoogleCalendar?.isConnected?.());
    }

    const all = loadAll();
    return !!all[calendarId];
  }

  window.CalendarStore = {
    loadAll,
    saveAll,
    loadRemovedIds,
    isRemoved,
    markRemoved,
    unmarkRemoved,
    isConfigured,
    migrateLegacyOnce() {
      configsKey();
    },
  };
})();
