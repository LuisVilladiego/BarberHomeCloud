/**
 * Utilidades de seguridad compartidas (XSS, URLs, JSON, sesión).
 * No cambia la lógica de negocio; solo endurece entradas/salidas.
 */
(function () {
  const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 días
  const LOGIN_WINDOW_MS = 15 * 60 * 1000;
  const LOGIN_MAX_ATTEMPTS = 8;

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, "&#96;");
  }

  /** Solo permite http(s) o wa.me / api.whatsapp.com / mailto / tel */
  function sanitizeUrl(url, { allowMailto = true, allowTel = true } = {}) {
    const raw = String(url || "").trim();
    if (!raw) return "";
    try {
      const u = new URL(raw, window.location.origin);
      const protocol = u.protocol.toLowerCase();
      if (protocol === "https:" || protocol === "http:") {
        return u.href;
      }
      if (allowMailto && protocol === "mailto:") return u.href;
      if (allowTel && protocol === "tel:") return u.href;
      return "";
    } catch {
      return "";
    }
  }

  function sanitizeWhatsAppPhone(phone) {
    const digits = String(phone || "").replace(/\D/g, "");
    if (digits.length < 7 || digits.length > 15) return "";
    return digits;
  }

  function buildWhatsAppUrl(phone, text) {
    const digits = sanitizeWhatsAppPhone(phone);
    if (!digits) return "";
    const q = text ? `?text=${encodeURIComponent(String(text))}` : "";
    return `https://wa.me/${digits}${q}`;
  }

  function safeJsonParse(raw, fallback) {
    try {
      if (raw == null || raw === "") return fallback;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && Object.prototype.hasOwnProperty.call(parsed, "__proto__")) {
        delete parsed.__proto__;
      }
      return parsed ?? fallback;
    } catch {
      return fallback;
    }
  }

  function constantTimeEqual(a, b) {
    const left = String(a || "");
    const right = String(b || "");
    const len = Math.max(left.length, right.length);
    let diff = left.length === right.length ? 0 : 1;
    for (let i = 0; i < len; i += 1) {
      diff |= (left.charCodeAt(i) || 0) ^ (right.charCodeAt(i) || 0);
    }
    return diff === 0;
  }

  function createSessionPayload(userId) {
    const id = String(userId || "").trim();
    if (!id) return null;
    const issuedAt = Date.now();
    return {
      userId: id,
      issuedAt,
      expiresAt: issuedAt + SESSION_MAX_AGE_MS,
    };
  }

  function readSessionPayload(raw) {
    // Compat: sesión antigua = solo UUID string
    if (!raw) return null;
    if (raw[0] !== "{") {
      return { userId: String(raw), issuedAt: Date.now(), expiresAt: Date.now() + SESSION_MAX_AGE_MS, legacy: true };
    }
    const data = safeJsonParse(raw, null);
    if (!data || typeof data !== "object") return null;
    const userId = String(data.userId || "").trim();
    const expiresAt = Number(data.expiresAt) || 0;
    if (!userId) return null;
    if (expiresAt && Date.now() > expiresAt) return null;
    return data;
  }

  function loginThrottleKey(scope) {
    return `barbercloud.login_throttle:${scope || "default"}`;
  }

  function getLoginThrottle(scope) {
    const data = safeJsonParse(localStorage.getItem(loginThrottleKey(scope)), null);
    if (!data || typeof data !== "object") return { fails: 0, firstAt: 0 };
    const firstAt = Number(data.firstAt) || 0;
    if (firstAt && Date.now() - firstAt > LOGIN_WINDOW_MS) {
      localStorage.removeItem(loginThrottleKey(scope));
      return { fails: 0, firstAt: 0 };
    }
    return { fails: Number(data.fails) || 0, firstAt };
  }

  function registerLoginFailure(scope) {
    const cur = getLoginThrottle(scope);
    const next = {
      fails: (cur.fails || 0) + 1,
      firstAt: cur.firstAt || Date.now(),
    };
    localStorage.setItem(loginThrottleKey(scope), JSON.stringify(next));
    return next;
  }

  function clearLoginFailures(scope) {
    localStorage.removeItem(loginThrottleKey(scope));
  }

  function isLoginBlocked(scope) {
    const cur = getLoginThrottle(scope);
    return (cur.fails || 0) >= LOGIN_MAX_ATTEMPTS;
  }

  function loginBlockMessage(scope) {
    const cur = getLoginThrottle(scope);
    const waitMin = Math.max(1, Math.ceil((LOGIN_WINDOW_MS - (Date.now() - (cur.firstAt || Date.now()))) / 60000));
    return `Demasiados intentos. Espera ~${waitMin} min e inténtalo de nuevo.`;
  }

  /* —— Rate limit de reservas (máx. 3 citas seguidas) —— */
  const BOOKING_MAX_ACTIVE = 3;
  const BOOKING_DEVICE_WINDOW_MS = 2 * 60 * 60 * 1000; // 2 horas
  const BOOKING_DEVICE_MAX = 3;
  const DEVICE_ID_KEY = "barbercloud.device_id";
  const BOOKING_DEVICE_RATE_KEY = "barbercloud.booking_device_rate";

  function getDeviceId() {
    try {
      let id = localStorage.getItem(DEVICE_ID_KEY);
      if (!id) {
        id = crypto.randomUUID ? crypto.randomUUID() : `d-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        localStorage.setItem(DEVICE_ID_KEY, id);
      }
      return id;
    } catch {
      return "anonymous";
    }
  }

  function phoneTail(phone) {
    const digits = String(phone || "").replace(/\D/g, "");
    return digits.length >= 7 ? digits.slice(-10) : digits;
  }

  function countActiveFutureBookingsForPhone(phone, loadBookingsFn) {
    const tail = phoneTail(phone);
    if (tail.length < 7) return 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    let list = [];
    try {
      list = typeof loadBookingsFn === "function" ? loadBookingsFn() : [];
    } catch {
      list = [];
    }
    if (!Array.isArray(list)) list = [];
    return list.filter((b) => {
      const status = String(b?.status || "").toLowerCase();
      if (status === "cancelled" || status === "canceled" || status === "rejected") return false;
      if (phoneTail(b?.phone) !== tail) return false;
      const date = String(b?.date || "").slice(0, 10);
      return date >= todayIso;
    }).length;
  }

  function checkBookingPhoneLimit(phone, loadBookingsFn) {
    const count = countActiveFutureBookingsForPhone(phone, loadBookingsFn);
    if (count >= BOOKING_MAX_ACTIVE) {
      return {
        ok: false,
        reason: "phone_limit",
        count,
        message: `Ya tienes ${count} citas activas. El máximo es ${BOOKING_MAX_ACTIVE} citas seguidas por WhatsApp. Cancela una o espera a completarlas.`,
      };
    }
    return { ok: true, count };
  }

  function getDeviceBookingRate() {
    const data = safeJsonParse(localStorage.getItem(BOOKING_DEVICE_RATE_KEY), null);
    if (!data || typeof data !== "object") return { hits: [], deviceId: getDeviceId() };
    const cutoff = Date.now() - BOOKING_DEVICE_WINDOW_MS;
    const hits = Array.isArray(data.hits) ? data.hits.filter((t) => Number(t) > cutoff) : [];
    return { hits, deviceId: data.deviceId || getDeviceId() };
  }

  function checkBookingDeviceLimit() {
    const { hits, deviceId } = getDeviceBookingRate();
    if (hits.length >= BOOKING_DEVICE_MAX) {
      return {
        ok: false,
        reason: "device_limit",
        deviceId,
        message: `Desde este dispositivo ya se agendaron ${BOOKING_DEVICE_MAX} citas seguidas. Espera un rato e inténtalo de nuevo.`,
      };
    }
    return { ok: true, deviceId, remaining: BOOKING_DEVICE_MAX - hits.length };
  }

  function registerDeviceBooking() {
    const { hits, deviceId } = getDeviceBookingRate();
    hits.push(Date.now());
    localStorage.setItem(
      BOOKING_DEVICE_RATE_KEY,
      JSON.stringify({ deviceId, hits: hits.slice(-20) })
    );
  }

  /** Evita javascript: y data: en href de enlaces dinámicos */
  function safeExternalHref(url) {
    const clean = sanitizeUrl(url);
    if (!clean) return "";
    try {
      const u = new URL(clean);
      if (u.protocol !== "https:" && u.protocol !== "http:") return "";
      return clean;
    } catch {
      return "";
    }
  }

  window.Security = {
    escapeHtml,
    escapeAttr,
    sanitizeUrl,
    sanitizeWhatsAppPhone,
    buildWhatsAppUrl,
    safeJsonParse,
    constantTimeEqual,
    createSessionPayload,
    readSessionPayload,
    registerLoginFailure,
    clearLoginFailures,
    isLoginBlocked,
    loginBlockMessage,
    safeExternalHref,
    getDeviceId,
    phoneTail,
    checkBookingPhoneLimit,
    checkBookingDeviceLimit,
    registerDeviceBooking,
    countActiveFutureBookingsForPhone,
    SESSION_MAX_AGE_MS,
    LOGIN_MAX_ATTEMPTS,
    BOOKING_MAX_ACTIVE,
    BOOKING_DEVICE_MAX,
  };
})();
