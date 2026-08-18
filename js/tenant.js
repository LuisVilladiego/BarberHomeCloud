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
    const s = String(status || "").toLowerCase();
    return s === "active" || s === "trialing";
  }

  function hasActiveSubscription() {
    const biz = cached();
    if (biz && biz.subscription_status) {
      return isSubscriptionActive(biz.subscription_status);
    }
    try {
      const raw = localStorage.getItem("barbercloud.subscription");
      if (!raw) return false;
      const sub = JSON.parse(raw);
      return isSubscriptionActive(sub?.status);
    } catch {
      return false;
    }
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

  /** Borra datos de negocio/caché; conserva device_id, auth y throttle de login. */
  function clearLocalData() {
    try {
      Object.keys(localStorage).forEach((key) => {
        if (!key.startsWith("barbercloud")) return;
        if (key === "barbercloud.device_id") return;
        if (key === "barbercloud.auth") return;
        if (key.startsWith("barbercloud.login_throttle:")) return;
        localStorage.removeItem(key);
      });
    } catch {
      /* ignore */
    }
  }

  function hydrateNegocioCaches(negocio) {
    if (!negocio) return;
    try {
      if (negocio.autoagenda && typeof negocio.autoagenda === "object") {
        localStorage.setItem("barbercloud.autoagenda", JSON.stringify(negocio.autoagenda));
      }
      if (negocio.subscription_status || negocio.plan_id) {
        localStorage.setItem(
          "barbercloud.subscription",
          JSON.stringify({
            planId: negocio.plan_id || "100",
            status: negocio.subscription_status || "trialing",
            cancelAtPeriodEnd: false,
            payment: { provider: "pending" },
          })
        );
      }
      if (negocio.onboarding_completed) {
        localStorage.setItem(ONBOARDED_KEY, "1");
      }
    } catch {
      /* ignore */
    }
  }

  /**
   * Tras login: alinea caché local con el negocio del usuario autenticado.
   * Evita que un usuario nuevo herede datos de otro en el mismo navegador.
   */
  async function syncWithAuthenticatedUser() {
    const user = await window.BarberAuth?.currentUser?.();
    if (!user) return { ok: true, mode: "anonymous" };
    if (!window.SupabaseData?.enabled?.()) return { ok: true, mode: "local-only" };

    const prevId = currentId();
    const cachedBiz = cached();
    const own = await window.SupabaseData.fetchOwnNegocio?.();

    if (!own) {
      if (prevId || cachedBiz || hasExistingBusiness()) clearLocalData();
      return { ok: true, mode: "needs-onboarding", needsOnboarding: true };
    }

    const ownerMismatch = cachedBiz?.owner_id && cachedBiz.owner_id !== user.id;
    const idMismatch = prevId && prevId !== own.id;
    if (ownerMismatch || idMismatch || cachedBiz?.id !== own.id) {
      clearLocalData();
      setCurrent(own);
    }

    hydrateNegocioCaches(own);
    await window.SupabaseData.pullToLocalCache?.({ replace: true });

    return { ok: true, mode: "ready", negocio: own, needsOnboarding: false };
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
    hasActiveSubscription,
    currentId,
    setCurrent,
    cached,
    isLocalHost,
    hasExistingBusiness,
    markOnboarded,
    clearLocalData,
    hydrateNegocioCaches,
    syncWithAuthenticatedUser,
  };
})();
