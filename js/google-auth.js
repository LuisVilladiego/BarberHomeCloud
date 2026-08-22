/**
 * Inicio de sesión con Google (Puntos Barberhome) vía Google Identity Services.
 * Usa scopes de perfil/correo, separados del OAuth de Google Calendar.
 */
(function () {
  const SCOPES = "openid email profile";
  const CANONICAL_ORIGIN = "https://barber-home-cloud.vercel.app";
  let tokenClient = null;
  let pendingResolve = null;
  let pendingReject = null;

  function googleAuthError(err) {
    const raw = String(err?.type || err?.message || err || "");
    if (/origin/i.test(raw)) {
      return `Google no autoriza esta dirección. Entra desde ${CANONICAL_ORIGIN}`;
    }
    return err?.message || raw || "Error de autenticación Google";
  }

  function cfg() {
    return window.GoogleConfig || {};
  }

  function waitForGis(timeoutMs = 12000) {
    return new Promise((resolve, reject) => {
      const ready = () => window.google?.accounts?.oauth2;
      if (ready()) {
        resolve();
        return;
      }
      const start = Date.now();
      const id = setInterval(() => {
        if (ready()) {
          clearInterval(id);
          resolve();
        } else if (Date.now() - start > timeoutMs) {
          clearInterval(id);
          reject(new Error("No se cargó Google Identity Services. Recarga la página."));
        }
      }, 100);
    });
  }

  function waitForGoogleSignIn(timeoutMs = 12000) {
    return new Promise((resolve, reject) => {
      const ready = () => window.google?.accounts?.id;
      if (ready()) {
        resolve();
        return;
      }
      const start = Date.now();
      const id = setInterval(() => {
        if (ready()) {
          clearInterval(id);
          resolve();
        } else if (Date.now() - start > timeoutMs) {
          clearInterval(id);
          reject(new Error("No se cargó Google Sign-In. Recarga la página."));
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
          pendingReject?.(new Error(googleAuthError(response)));
          pendingResolve = null;
          pendingReject = null;
          return;
        }
        pendingResolve?.(response);
        pendingResolve = null;
        pendingReject = null;
      },
      error_callback: (err) => {
        pendingReject?.(new Error(googleAuthError(err)));
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
    const host = location.hostname;
    const local = host === "localhost" || host === "127.0.0.1";
    const known =
      location.origin === CANONICAL_ORIGIN ||
      local ||
      /barber-home-cloud.*\.vercel\.app$/i.test(host);
    if (!known) {
      throw new Error(`Google no autoriza esta dirección. Entra desde ${CANONICAL_ORIGIN}`);
    }
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

  async function signInCredential() {
    await waitForGoogleSignIn();
    const clientId = cfg().clientId;
    if (!clientId) throw new Error("Falta GoogleConfig.clientId");

    return new Promise((resolve, reject) => {
      const hostId = "barbercloud-google-credential-host";
      let host = document.getElementById(hostId);
      if (!host) {
        host = document.createElement("div");
        host.id = hostId;
        host.className = "google-credential-overlay";
        host.innerHTML =
          '<div class="google-credential-overlay__card" role="dialog" aria-modal="true" aria-labelledby="google-credential-title">' +
          '<p class="google-credential-overlay__lead" id="google-credential-title">Continúa con tu cuenta de Google</p>' +
          '<div id="barbercloud-google-credential-btn"></div>' +
          '<button type="button" class="btn btn--ghost btn--sm" id="barbercloud-google-credential-cancel">Cancelar</button>' +
          "</div>";
        document.body.appendChild(host);
      }

      host.hidden = false;
      const btnWrap = host.querySelector("#barbercloud-google-credential-btn");
      const cancelBtn = host.querySelector("#barbercloud-google-credential-cancel");
      if (!btnWrap || !cancelBtn) {
        reject(new Error("No se pudo abrir el inicio de sesión con Google."));
        return;
      }
      btnWrap.innerHTML = "";

      const cleanup = () => {
        host.hidden = true;
        btnWrap.innerHTML = "";
      };

      cancelBtn.onclick = () => {
        cleanup();
        reject(new Error("Inicio de sesión con Google cancelado."));
      };

      google.accounts.id.initialize({
        client_id: clientId,
        callback: (response) => {
          cleanup();
          if (response?.credential) resolve(response.credential);
          else reject(new Error("No se obtuvo credencial de Google."));
        },
        auto_select: false,
        cancel_on_tap_outside: false,
      });

      google.accounts.id.renderButton(btnWrap, {
        type: "standard",
        theme: "outline",
        size: "large",
        text: "continue_with",
        shape: "rectangular",
        width: 280,
      });

      requestAnimationFrame(() => {
        btnWrap.querySelector('[role="button"]')?.click();
      });
    });
  }

  function currentPageUrl() {
    return location.href.split("#")[0].split("?")[0];
  }

  async function signInIdToken() {
    await waitForGis();
    const clientId = cfg().clientId;
    if (!clientId) throw new Error("Falta GoogleConfig.clientId");
    const nonce = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const redirectUri = currentPageUrl();
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "id_token");
    url.searchParams.set("scope", "openid email profile");
    url.searchParams.set("nonce", nonce);
    url.searchParams.set("prompt", "select_account");

    return new Promise((resolve, reject) => {
      const popup = window.open(url.toString(), "barbercloud-google", "width=480,height=640");
      if (!popup) {
        reject(new Error("popup"));
        return;
      }
      const timer = setInterval(() => {
        if (popup.closed) {
          clearInterval(timer);
          reject(new Error("Inicio de sesión con Google cancelado."));
          return;
        }
        try {
          if (popup.location.origin !== location.origin) return;
          const params = new URLSearchParams(String(popup.location.hash || "").replace(/^#/, ""));
          const token = params.get("id_token");
          const err = params.get("error");
          popup.close();
          clearInterval(timer);
          if (token) resolve(token);
          else reject(new Error(err || "No se obtuvo el acceso de Google."));
        } catch {
          /* still on accounts.google.com */
        }
      }, 300);
    });
  }

  window.GoogleAuth = {
    signIn,
    signInCredential,
    signInIdToken,
    waitForGis,
    waitForGoogleSignIn,
  };
})();
