/**
 * Multi-tenant BarberCloud: slug único por negocio, una sola app/DB.
 */
(function () {
  const NEGOCIO_ID_KEY = "barbercloud.negocio_id";
  const NEGOCIO_CACHE_KEY = "barbercloud.negocio";

  const RESERVED_SLUGS = [
    "admin",
    "api",
    "login",
    "logout",
    "register",
    "registro",
    "dashboard",
    "config",
    "configuracion",
    "settings",
    "marketplace",
    "contactos",
    "clientes",
    "puntos",
    "reservas",
    "calendario",
    "perfil",
    "usuarios",
    "auth",
    "public",
    "static",
    "favicon",
    "robots",
    "sitemap",
    "booking",
    "index",
    "autoagenda",
    "tutorial",
    "manual",
    "reportes",
    "notificaciones",
    "suscripcion",
    "feedback",
    "onboarding",
    "signup",
    "cuenta",
    "assets",
    "js",
    "css",
  ];

  const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])$/;

  function reservedSet() {
    return new Set(RESERVED_SLUGS);
  }

  function normalizeSlug(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[\s_]+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 50);
  }

  function validateSlug(raw) {
    const slug = normalizeSlug(raw);
    if (!slug) {
      return { ok: false, slug, reason: "empty", message: "El slug es obligatorio." };
    }
    if (slug.length < 3) {
      return { ok: false, slug, reason: "short", message: "Usa al menos 3 caracteres." };
    }
    if (slug.length > 50) {
      return { ok: false, slug, reason: "long", message: "Máximo 50 caracteres." };
    }
    if (reservedSet().has(slug) || slug === "robots.txt" || slug === "sitemap.xml") {
      return { ok: false, slug, reason: "reserved", message: "Ese nombre está reservado. Elige otro." };
    }
    if (!SLUG_RE.test(slug) || slug.includes("--")) {
      return {
        ok: false,
        slug,
        reason: "format",
        message: "Solo minúsculas, números y guion medio. Sin espacios ni caracteres especiales.",
      };
    }
    return { ok: true, slug };
  }

  function isLocalHost() {
    const h = location.hostname;
    return h === "localhost" || h === "127.0.0.1";
  }

  function publicUrl(slug) {
    const v = validateSlug(slug);
    const clean = v.slug || "negocio";
    if (isLocalHost()) {
      return new URL(`booking.html?s=${encodeURIComponent(clean)}`, location.href).href;
    }
    return `${location.origin}/${clean}`;
  }

  function displayLink(slug) {
    const v = validateSlug(slug);
    const clean = v.slug || "";
    const host = isLocalHost() ? "barber-home-cloud.vercel.app" : location.host;
    return `${host}/${clean}`;
  }

  function slugFromLocation() {
    const q = new URLSearchParams(location.search).get("s");
    if (q) return normalizeSlug(q);
    const parts = location.pathname.replace(/\/+$/, "").split("/").filter(Boolean);
    const last = parts[parts.length - 1] || "";
    if (!last || last.endsWith(".html") || last.includes(".")) return "";
    return normalizeSlug(last);
  }

  function isSubscriptionActive(status) {
    const s = String(status || "active").toLowerCase();
    return s === "active" || s === "trialing";
  }

  function currentId() {
    try {
      return localStorage.getItem(NEGOCIO_ID_KEY) || "";
    } catch {
      return "";
    }
  }

  function setCurrent(negocio) {
    try {
      if (!negocio?.id) return;
      localStorage.setItem(NEGOCIO_ID_KEY, negocio.id);
      localStorage.setItem(NEGOCIO_CACHE_KEY, JSON.stringify(negocio));
    } catch {
      /* ignore */
    }
  }

  function cached() {
    try {
      const raw = localStorage.getItem(NEGOCIO_CACHE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  const ONBOARDED_KEY = "barbercloud.onboarded";

  function hasExistingBusiness() {
    try {
      if (localStorage.getItem(ONBOARDED_KEY) === "1") return true;
      if (currentId()) return true;
      const auto = JSON.parse(localStorage.getItem("barbercloud.autoagenda") || "{}");
      return !!(auto.slug && validateSlug(auto.slug).ok);
    } catch {
      return false;
    }
  }

  function markOnboarded() {
    try {
      localStorage.setItem(ONBOARDED_KEY, "1");
    } catch {
      /* ignore */
    }
  }

  window.Tenant = {
    RESERVED_SLUGS,
    NEGOCIO_ID_KEY,
    ONBOARDED_KEY,
    normalizeSlug,
    validateSlug,
    publicUrl,
    displayLink,
    slugFromLocation,
    isSubscriptionActive,
    currentId,
    setCurrent,
    cached,
    isLocalHost,
    hasExistingBusiness,
    markOnboarded,
  };
})();
