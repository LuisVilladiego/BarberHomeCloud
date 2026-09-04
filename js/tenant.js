/**
 * Multi-tenant Gestiónweb.app: slug único por negocio, una sola app/DB.
 */
(function () {
  const NEGOCIO_ID_KEY = "gestionweb.negocio_id";
  const NEGOCIO_CACHE_KEY = "gestionweb.negocio";

  const RESERVED_SLUGS = [
    "admin",
    "admin-login",
    "api",
    "landing",
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
    if (window.BusinessModel?.normalizeStatus) {
      const normalized = window.BusinessModel.normalizeStatus(status);
      return window.BusinessModel.ACCESS_STATUSES.has(normalized);
    }
    const s = String(status || "").toLowerCase();
    return s === "active" || s === "trialing" || s === "trial" || s === "past_due";
  }

  /**
   * Misma regla que public.negocio_suscripcion_activa en supabase/billing.sql:
   * sin periodo vigente no hay acceso, aunque el estado diga "active".
   */
  function isNegocioActive(negocio) {
    if (!negocio) return false;
    if (window.BusinessModel?.hasSubscriptionAccess) {
      return window.BusinessModel.hasSubscriptionAccess(
        negocio.subscription_status,
        negocio.current_period_end
      );
    }
    if (!isSubscriptionActive(negocio.subscription_status)) return false;
    if (!Object.prototype.hasOwnProperty.call(negocio, "current_period_end")) return true;
    const end = negocio.current_period_end;
    return !!end && new Date(end).getTime() > Date.now();
  }

  function hasActiveSubscription() {
    const biz = cached();
    if (biz && biz.subscription_status) {
      if (window.BusinessModel?.hasSubscriptionAccess) {
        return window.BusinessModel.hasSubscriptionAccess(
          biz.subscription_status,
          biz.current_period_end
        );
      }
      if (!isSubscriptionActive(biz.subscription_status)) return false;
      // Si el negocio vive en la nube, manda el periodo pagado. La columna solo
      // falta si todavía no se corrió supabase/billing.sql.
      if (Object.prototype.hasOwnProperty.call(biz, "current_period_end")) {
        const end = biz.current_period_end;
        return !!end && new Date(end).getTime() > Date.now();
      }
      return true;
    }
    try {
      const raw = localStorage.getItem("gestionweb.subscription");
      if (!raw) return false;
      const sub = JSON.parse(raw);
      if (!isSubscriptionActive(sub?.status)) return false;
      if (sub?.periodEnd) return new Date(sub.periodEnd).getTime() > Date.now();
      return true;
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

  const SCOPED_STORAGE_BASES = [
    "gestionweb.calendar_configs",
    "gestionweb.google_auth",
    "gestionweb.google_busy_cache",
    "gestionweb.active_calendar",
  ];

  /**
   * Clave localStorage aislada por negocio. Migra datos legacy globales una sola vez
   * al negocio que los reclama; nunca los copia a otro tenant.
   */
  function scopedStorageKey(baseKey, negocioId) {
    const nid = negocioId || currentId();
    if (!nid) return baseKey;
    const scoped = `${baseKey}.${nid}`;
    try {
      if (localStorage.getItem(scoped) != null) return scoped;

      const legacy = localStorage.getItem(baseKey);
      if (!legacy) return scoped;

      const claimKey = `${baseKey}.__legacy_owner`;
      const owner = localStorage.getItem(claimKey);
      if (owner && owner !== nid) return scoped;

      localStorage.setItem(scoped, legacy);
      localStorage.setItem(claimKey, nid);
      localStorage.removeItem(baseKey);
    } catch {
      /* ignore */
    }
    return scoped;
  }

  function setCurrent(negocio) {
    try {
      if (!negocio?.id) return;
      const prev = currentId();
      localStorage.setItem(NEGOCIO_ID_KEY, negocio.id);
      localStorage.setItem(NEGOCIO_CACHE_KEY, JSON.stringify(negocio));
      if (prev && prev !== negocio.id) {
        window.dispatchEvent(
          new CustomEvent("gestionweb:tenant-changed", {
            detail: { prevId: prev, negocioId: negocio.id },
          })
        );
      }
    } catch {
      /* ignore */
    }
  }

  function withOwnerEmail(negocio, ownerEmail) {
    if (!negocio) return negocio;
    const email = String(ownerEmail || negocio.owner_email || "").trim();
    return email ? { ...negocio, owner_email: email } : negocio;
  }

  function cached() {
    try {
      const raw = localStorage.getItem(NEGOCIO_CACHE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  const ONBOARDED_KEY = "gestionweb.onboarded";

  /** Slugs de demo / otro tenant que no deben contarse como negocio del usuario. */
  const DEMO_SLUGS = new Set([
    "barberhomeluisvilladiego",
    "barberhome",
    "confirmafy",
    "demo",
    "negocio",
  ]);

  function isDemoSlug(raw) {
    const slug = normalizeSlug(raw);
    return !slug || DEMO_SLUGS.has(slug);
  }

  function readAutoagendaCache() {
    try {
      return JSON.parse(localStorage.getItem("gestionweb.autoagenda") || "{}");
    } catch {
      return {};
    }
  }

  /** Datos de negocio del tenant autenticado (sin relleno demo). */
  function getBusinessContext() {
    const auto = readAutoagendaCache();
    const biz = cached();
    const slug = auto.slug || biz?.slug || "";
    const title = String(auto.title || biz?.name || "").trim();
    return {
      slug: isDemoSlug(slug) ? "" : slug,
      title,
      description: String(auto.description || "").trim(),
      avatarDataUrl: auto.avatarDataUrl || "",
    };
  }

  /**
   * True solo si el usuario ya configuró SU negocio (onboarding, Supabase o autoagenda propia).
   * No cuenta slugs demo ni caché huérfano de otro tenant.
   */
  function hasConfiguredBusiness() {
    try {
      if (localStorage.getItem(ONBOARDED_KEY) === "1") return true;
      const biz = cached();
      if (currentId() && biz?.id === currentId()) {
        if (biz.slug && validateSlug(biz.slug).ok && !isDemoSlug(biz.slug)) return true;
        if (biz.onboarding_completed) return true;
      }
      const auto = readAutoagendaCache();
      const slug = auto.slug || "";
      const title = String(auto.title || "").trim();
      if (title && slug && validateSlug(slug).ok && !isDemoSlug(slug)) return true;
      return false;
    } catch {
      return false;
    }
  }

  /** Formularios vacíos: sin negocio configurado o sin suscripción activa. */
  function shouldUseEmptyForms() {
    if (!hasConfiguredBusiness()) return true;
    if (!hasActiveSubscription()) return true;
    return false;
  }

  function hasExistingBusiness() {
    return hasConfiguredBusiness();
  }

  function markOnboarded() {
    try {
      localStorage.setItem(ONBOARDED_KEY, "1");
    } catch {
      /* ignore */
    }
  }

  /** Claves que no se borran al cerrar sesión (sí se borran al pulsar Desconectar). */
  const SESSION_PERSIST_KEYS = new Set(["gestionweb.device_id", "gestionweb.auth"]);

  function shouldPersistAcrossLogout(key) {
    if (SESSION_PERSIST_KEYS.has(key)) return true;
    if (key === "gestionweb.welcome" || key.startsWith("gestionweb.welcome.")) return true;
    if (key.startsWith("gestionweb.login_throttle:")) return true;
    if (key.endsWith(".__legacy_owner")) return true;
    for (const base of SCOPED_STORAGE_BASES) {
      if (key.startsWith(`${base}.`) && key.length > base.length + 1) return true;
    }
    return false;
  }

  /** Borra datos de negocio/caché. Conserva login, device y datos scoped por negocio. */
  function clearLocalData() {
    try {
      Object.keys(localStorage).forEach((key) => {
        if (!key.startsWith("gestionweb") && !key.startsWith("barbercloud")) return;
        if (shouldPersistAcrossLogout(key)) return;
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
        localStorage.setItem("gestionweb.autoagenda", JSON.stringify(negocio.autoagenda));
      }
      if (negocio.subscription_status || negocio.plan_id) {
        localStorage.setItem(
          "gestionweb.subscription",
          JSON.stringify({
            planId: window.BusinessModel?.normalizePlanId?.(negocio.plan_id) || negocio.plan_id || "pro",
            status: window.BusinessModel?.normalizeStatus?.(negocio.subscription_status) || negocio.subscription_status || "expired",
            periodStart: negocio.current_period_start || null,
            periodEnd: negocio.current_period_end || null,
            lastPaymentAt: negocio.last_payment_at || null,
            cancelAtPeriodEnd: !!negocio.cancel_at_period_end,
            payment: { provider: "wompi" },
          })
        );
      }
      window.Billing?.cache?.(window.Billing.fromNegocio(negocio));
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
      clearLocalData();
      return { ok: true, mode: "needs-onboarding", needsOnboarding: true };
    }

    const ownerMismatch = cachedBiz?.owner_id && cachedBiz.owner_id !== user.id;
    const idMismatch = !prevId || prevId !== own.id;
    const enriched = withOwnerEmail(own, user.email);
    if (ownerMismatch || idMismatch || cachedBiz?.id !== own.id) {
      clearLocalData();
      setCurrent(enriched);
    } else {
      setCurrent(enriched);
    }

    hydrateNegocioCaches(enriched);
    await window.SupabaseData?.rememberNotifyEmail?.(user.email);
    await window.SupabaseData.pullToLocalCache?.({ replace: true });
    await refreshRole();

    return { ok: true, mode: "ready", negocio: enriched, needsOnboarding: false };
  }

  let cachedRole = null;

  async function refreshRole() {
    cachedRole = null;
    return currentRole(true);
  }

  async function currentRole(forceRefresh = false) {
    if (!forceRefresh && cachedRole) return cachedRole;
    if (window.SupabaseData?.fetchMembershipRole) {
      const remote = await window.SupabaseData.fetchMembershipRole(currentId());
      if (remote) {
        cachedRole = window.BusinessModel?.normalizeRole?.(remote) || remote;
        return cachedRole;
      }
    }
    cachedRole = "owner";
    return cachedRole;
  }

  window.Tenant = {
    RESERVED_SLUGS,
    NEGOCIO_ID_KEY,
    ONBOARDED_KEY,
    DEMO_SLUGS,
    normalizeSlug,
    validateSlug,
    isDemoSlug,
    publicUrl,
    displayLink,
    slugFromLocation,
    isSubscriptionActive,
    isNegocioActive,
    hasActiveSubscription,
    currentId,
    scopedStorageKey,
    SCOPED_STORAGE_BASES,
    setCurrent,
    cached,
    withOwnerEmail,
    isLocalHost,
    readAutoagendaCache,
    getBusinessContext,
    hasConfiguredBusiness,
    shouldUseEmptyForms,
    hasExistingBusiness,
    markOnboarded,
    clearLocalData,
    hydrateNegocioCaches,
    syncWithAuthenticatedUser,
    currentRole,
    refreshRole,
  };
})();
