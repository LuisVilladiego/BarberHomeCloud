/**
 * Cierra el panel ANTES del primer pintado si no hay suscripción activa.
 * Debe cargarse en <head> de las páginas con sidebar (no en suscripcion/login).
 */
(function () {
  document.documentElement.classList.add("access-pending");
  if (!document.getElementById("access-pending-style")) {
    const style = document.createElement("style");
    style.id = "access-pending-style";
    style.textContent =
      "html.access-pending,html.access-pending body{background:#f1f2f4}" +
      "html.access-pending body{visibility:hidden!important;overflow:hidden}";
    document.head.appendChild(style);
  }

  const page = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  if (page === "suscripcion.html" || page === "login.html" || page === "landing.html") {
    document.documentElement.classList.remove("access-pending");
    return;
  }

  function hasAuth() {
    try {
      const raw =
        localStorage.getItem("gestionweb.auth") || localStorage.getItem("barbercloud.auth");
      if (!raw) return false;
      const data = JSON.parse(raw);
      return !!(data?.access_token || data?.currentSession?.access_token || data?.user);
    } catch {
      return false;
    }
  }

  function cachedAccess() {
    try {
      const billing = JSON.parse(
        localStorage.getItem("gestionweb.billing") ||
          localStorage.getItem("barbercloud.billing") ||
          "null"
      );
      const sub = JSON.parse(
        localStorage.getItem("gestionweb.subscription") ||
          localStorage.getItem("barbercloud.subscription") ||
          "{}"
      );
      const status = String(billing?.status || sub.status || "").toLowerCase();
      const periodEnd = billing?.periodEnd || sub.periodEnd || null;
      if (!periodEnd) return false;
      if (new Date(periodEnd).getTime() <= Date.now()) return false;
      const normalized =
        status === "trialing" ? "trial" : status === "cancelled" ? "canceled" : status;
      return (
        normalized === "trial" ||
        normalized === "active" ||
        normalized === "past_due" ||
        normalized === "canceled"
      );
    } catch {
      return false;
    }
  }

  function hasBillingCache() {
    try {
      return !!(
        localStorage.getItem("gestionweb.billing") ||
        localStorage.getItem("gestionweb.subscription")
      );
    } catch {
      return false;
    }
  }

  if (!hasAuth()) {
    location.replace("login.html");
    return;
  }

  const isPreviewPage =
    page === "index.html" || page === "calendario.html" || page === "";

  if (hasBillingCache() && !cachedAccess() && !isPreviewPage) {
    location.replace("suscripcion.html?need=1");
    return;
  }

  window.AccessGate = {
    cachedAccess,
    isReadOnly() {
      try {
        return sessionStorage.getItem("gestionweb.readonly") === "1";
      } catch {
        return false;
      }
    },
    reveal() {
      document.documentElement.classList.remove("access-pending");
    },
  };
})();
