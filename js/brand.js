/**
 * Marca central de la plataforma.
 */
(function () {
  const LEGACY_PREFIX = "barbercloud";
  const STORAGE_PREFIX = "gestionweb";

  const BRAND = {
    name: "Gestiónweb.app",
    shortName: "Gestiónweb",
    tagline: "Tu negocio, más simple",
    storagePrefix: STORAGE_PREFIX,
    legacyStoragePrefix: LEGACY_PREFIX,
  };

  function migrateStorageKeys() {
    try {
      Object.keys(localStorage).forEach((key) => {
        if (key.startsWith(`${LEGACY_PREFIX}.`)) {
          const next = `${STORAGE_PREFIX}.${key.slice(LEGACY_PREFIX.length + 1)}`;
          if (localStorage.getItem(next) == null) {
            localStorage.setItem(next, localStorage.getItem(key));
          }
        }
        if (key.startsWith(`${LEGACY_PREFIX}_`)) {
          const next = `${STORAGE_PREFIX}_${key.slice(LEGACY_PREFIX.length + 1)}`;
          if (localStorage.getItem(next) == null) {
            localStorage.setItem(next, localStorage.getItem(key));
          }
        }
      });
      const legacyMap = {
        confirmafy_settings: `${STORAGE_PREFIX}_settings`,
        confirmafy_feedback: `${STORAGE_PREFIX}_feedback`,
        "confirmafy.autoagenda": `${STORAGE_PREFIX}.autoagenda`,
        "confirmafy.bookings": `${STORAGE_PREFIX}.bookings`,
        "confirmafy.subscription": `${STORAGE_PREFIX}.subscription`,
        "confirmafy.tutorial": `${STORAGE_PREFIX}.tutorial`,
      };
      Object.entries(legacyMap).forEach(([from, to]) => {
        if (localStorage.getItem(to) != null) return;
        const prev = localStorage.getItem(from);
        if (prev != null) localStorage.setItem(to, prev);
      });
    } catch {
      /* ignore */
    }
  }

  migrateStorageKeys();

  window.Brand = BRAND;
})();
