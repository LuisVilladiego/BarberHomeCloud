/**
 * Inicio de sesión con Google (Puntos Barberhome) vía Google Identity Services.
 * Usa scopes de perfil/correo, separados del OAuth de Google Calendar.
 */
(function () {
  const SCOPES = "openid email profile";
  let tokenClient = null;
  let pendingResolve = null;
  let pendingReject = null;

  function cfg() {
    return window.GoogleConfig || {};
  }

  function waitForGis(timeoutMs = 12000) {
    return new Promise((resolve, reject) => {
      if (window.google?.accounts?.oauth2) {
        resolve();
        return;
      }
      const start = Date.now();
      const id = setInterval(() => {
        if (window.google?.accounts?.oauth2) {
          clearInterval(id);
          resolve();
        } else if (Date.now() - start > timeoutMs) {
          clearInterval(id);
          reject(new Error("No se cargó Google Identity Services. Recarga la página."));
        }
      }, 100);
    });
  }

  function ensureTokenClient() {
    const clientId = cfg().clientId;
    if (!clientId) throw new Error("Falta GoogleConfig.clientId");
    if (tokenClient) return tokenClient;

    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES,
      callback: (response) => {
        if (response.error) {
          pendingReject?.(new Error(response.error));
          pendingResolve = null;
          pendingReject = null;
          return;
        }
        pendingResolve?.(response);
        pendingResolve = null;
        pendingReject = null;
      },
      error_callback: (err) => {
        pendingReject?.(new Error(err?.message || "Error de autenticación Google"));
        pendingResolve = null;
        pendingReject = null;
      },
    });
    return tokenClient;
  }

  function requestToken(prompt) {
    return new Promise((resolve, reject) => {
      pendingResolve = resolve;
      pendingReject = reject;
      const options = {};
      if (prompt) options.prompt = prompt;
      ensureTokenClient().requestAccessToken(options);
    });
  }

  async function fetchUserProfile(accessToken) {
    const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.error?.message || `No se pudo leer tu perfil de Google (${res.status})`);
    }
    return {
      sub: data.sub || "",
      email: data.email || "",
      name: data.name || data.given_name || "Usuario Google",
      picture: data.picture || "",
      emailVerified: data.email_verified !== false,
    };
  }

  async function signIn(options = {}) {
    await waitForGis();
    const response = await requestToken(options.prompt || "select_account");
    const profile = await fetchUserProfile(response.access_token);
    if (!profile.sub) throw new Error("No se pudo identificar tu cuenta de Google.");
    if (!profile.email) {
      throw new Error("Tu cuenta de Google no tiene un correo visible. Usa otra cuenta.");
    }
    if (!profile.emailVerified) {
      throw new Error("Tu correo de Google no está verificado.");
    }
    return profile;
  }

  window.GoogleAuth = {
    signIn,
    waitForGis,
  };
})();
