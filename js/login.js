(function () {
  const form = document.getElementById("login-form");
  const verifyForm = document.getElementById("verify-form");
  const recoverRequestForm = document.getElementById("recover-request-form");
  const recoverResetForm = document.getElementById("recover-reset-form");
  const errorEl = document.getElementById("login-error");
  const verifyError = document.getElementById("verify-error");
  const recoverRequestError = document.getElementById("recover-request-error");
  const recoverResetError = document.getElementById("recover-reset-error");
  const submitBtn = document.getElementById("login-submit");
  const titleEl = document.getElementById("login-title");
  const leadEl = document.getElementById("login-lead");
  const nameField = document.getElementById("field-name");
  const verifyLead = document.getElementById("verify-lead");
  const verifyCode = document.getElementById("verify-code");
  const verifyDemo = document.getElementById("verify-demo");
  const verifyDemoCode = document.getElementById("verify-demo-code");
  const recoverDemo = document.getElementById("recover-demo");
  const recoverDemoCode = document.getElementById("recover-demo-code");
  const resendBtn = document.getElementById("verify-resend");
  const authHub = document.getElementById("auth-hub");
  const authEmailPanel = document.getElementById("auth-email-panel");
  const googleBtn = document.getElementById("btn-google-auth");
  const emailAuthBtn = document.getElementById("btn-email-auth");
  const emailAuthBack = document.getElementById("auth-email-back");
  const authSwitchBtn = document.getElementById("btn-auth-switch");
  const authSwitchLead = document.getElementById("auth-switch-lead");
  const googleAuthLabel = document.getElementById("google-auth-label");
  const emailAuthLabel = document.getElementById("email-auth-label");
  const forgotWrap = document.getElementById("forgot-wrap");
  const tabs = document.querySelector(".auth-tabs");
  const passwordInput = form?.querySelector('input[name="password"]');
  let mode = "signup";
  let pending = null;
  let submitLockedUntil = 0;

  function lockSubmit(ms) {
    submitLockedUntil = Date.now() + ms;
  }

  function submitLockRemainingSec() {
    return Math.max(0, Math.ceil((submitLockedUntil - Date.now()) / 1000));
  }

  function showBox(el, msg) {
    if (!el) return;
    el.hidden = !msg;
    el.textContent = msg || "";
  }

  function showError(msg) {
    showBox(errorEl, msg);
  }

  function showVerifyError(msg) {
    showBox(verifyError, msg);
  }

  function sixDigitCode() {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  function hubCopy(nextMode) {
    const isSignup = nextMode === "signup";
    return {
      title: isSignup ? "Crea tu cuenta" : "Entra a tu negocio",
      lead: isSignup
        ? "7 días de prueba gratis con acceso completo. Luego eliges un plan."
        : "Abre tu panel para gestionar citas, clientes, reservas y puntos de fidelidad.",
      googleLabel: isSignup ? "Crear cuenta con Gmail" : "Entrar con Gmail",
      emailLabel: isSignup
        ? "Crear cuenta con email y contraseña"
        : "Entrar con email y contraseña",
      switchLead: isSignup ? "¿Ya tienes cuenta?" : "¿No tienes cuenta?",
      switchAction: isSignup ? "Entrar" : "Crear cuenta",
    };
  }

  function applyHubCopy(nextMode) {
    const copy = hubCopy(nextMode);
    if (titleEl) titleEl.textContent = copy.title;
    if (leadEl) leadEl.textContent = copy.lead;
    if (googleAuthLabel) googleAuthLabel.textContent = copy.googleLabel;
    if (emailAuthLabel) emailAuthLabel.textContent = copy.emailLabel;
    if (authSwitchLead) authSwitchLead.textContent = copy.switchLead;
    if (authSwitchBtn) authSwitchBtn.textContent = copy.switchAction;
  }

  function hideAllForms() {
    if (form) form.hidden = true;
    if (verifyForm) verifyForm.hidden = true;
    if (recoverRequestForm) recoverRequestForm.hidden = true;
    if (recoverResetForm) recoverResetForm.hidden = true;
    if (authEmailPanel) authEmailPanel.hidden = true;
  }

  function showHub(nextMode = mode) {
    mode = nextMode;
    hideAllForms();
    if (authHub) authHub.hidden = false;
    if (tabs) tabs.hidden = true;
    applyHubCopy(mode);
    showError("");
  }

  function showEmailPanel(nextMode = mode) {
    mode = nextMode;
    hideAllForms();
    if (authHub) authHub.hidden = true;
    if (authEmailPanel) authEmailPanel.hidden = false;
    if (form) form.hidden = false;
    if (tabs) tabs.hidden = false;
    document.querySelectorAll("[data-auth-mode]").forEach((btn) => {
      btn.classList.toggle("is-active", btn.getAttribute("data-auth-mode") === mode);
    });
    if (nameField) nameField.hidden = mode !== "signup";
    if (submitBtn) submitBtn.textContent = mode === "signup" ? "Crear cuenta" : "Entrar";
    if (passwordInput) {
      passwordInput.autocomplete = mode === "signup" ? "new-password" : "current-password";
    }
    if (forgotWrap) forgotWrap.hidden = mode !== "login";
    applyHubCopy(mode);
    showError("");
    form?.querySelector('input[name="email"]')?.focus();
  }

  function setMode(next) {
    if (authEmailPanel && !authEmailPanel.hidden) {
      showEmailPanel(next);
      return;
    }
    showHub(next);
  }

  function showVerifyStep(send) {
    hideAllForms();
    if (authHub) authHub.hidden = true;
    if (verifyForm) verifyForm.hidden = false;
    if (titleEl) titleEl.textContent = "Verifica tu correo";
    if (leadEl) {
      leadEl.textContent = `Enviamos un código de 6 dígitos a ${pending.email}.`;
    }
    const failed = !send || send.ok === false || send.demo;
    if (verifyLead) {
      verifyLead.hidden = false;
      verifyLead.textContent = failed
        ? "No se pudo enviar el correo. Usa el código de respaldo o pulsa Reenviar."
        : "Revisa tu bandeja de entrada y el spam. El código caduca en 10 minutos.";
    }
    if (verifyDemo && verifyDemoCode) {
      verifyDemo.hidden = !failed;
      verifyDemoCode.textContent = failed ? pending?.code || "" : "";
    }
    if (verifyCode) {
      verifyCode.required = true;
      verifyCode.focus();
    }
  }

  function showRecoverRequest() {
    hideAllForms();
    if (authHub) authHub.hidden = true;
    if (recoverRequestForm) recoverRequestForm.hidden = false;
    if (titleEl) titleEl.textContent = "Recuperar contraseña";
    if (leadEl) {
      leadEl.textContent =
        "Te enviaremos un código de 6 dígitos a tu correo para crear una contraseña nueva.";
    }
    showBox(recoverRequestError, "");
  }

  function showRecoverReset(send) {
    hideAllForms();
    if (authHub) authHub.hidden = true;
    if (recoverResetForm) recoverResetForm.hidden = false;
    if (titleEl) titleEl.textContent = "Nueva contraseña";
    if (leadEl) leadEl.textContent = `Enviamos un código a ${pending.email}.`;
    const failed = !send || send.ok === false || send.demo;
    if (recoverDemo && recoverDemoCode) {
      recoverDemo.hidden = !failed;
      recoverDemoCode.textContent = failed ? pending?.code || "" : "";
    }
    showBox(recoverResetError, failed ? send?.message || "" : "");
  }

  function hideVerifyStep() {
    pending = null;
    if (verifyCode) verifyCode.required = false;
    if (verifyForm) verifyForm.reset();
    if (verifyDemo) verifyDemo.hidden = true;
    showVerifyError("");
    showHub("signup");
  }

  const AUTH_NEXT_KEY = "gestionweb.auth.next";
  const PLATFORM_ADMIN_EMAIL = "adminbarbercloud@gmail.com";

  function readAuthNext() {
    const params = new URLSearchParams(location.search);
    const fromUrl = params.get("next");
    if (fromUrl) {
      try {
        sessionStorage.setItem(AUTH_NEXT_KEY, fromUrl);
      } catch {
        /* ignore */
      }
      return fromUrl;
    }
    try {
      return sessionStorage.getItem(AUTH_NEXT_KEY) || "";
    } catch {
      return "";
    }
  }

  function clearAuthNext() {
    try {
      sessionStorage.removeItem(AUTH_NEXT_KEY);
    } catch {
      /* ignore */
    }
  }

  async function isPlatformAdmin() {
    try {
      const client = await window.SupabaseClient?.getClient?.();
      if (!client) return false;
      const { data } = await client.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) return false;
      const res = await fetch("/api/admin/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async function afterAuth() {
    await window.BarberAuth?.applyPendingPassword?.();
    const params = new URLSearchParams(location.search);
    const next = readAuthNext();
    const plan = params.get("plan");
    const user = await window.BarberAuth?.currentUser?.();
    const userEmail = String(user?.email || "").trim().toLowerCase();
    const isKnownPlatformAdmin = userEmail === PLATFORM_ADMIN_EMAIL;

    // Dueño de la plataforma → panel SaaS (/admin), antes del flujo del negocio.
    if (next === "admin" || isKnownPlatformAdmin || (!next && (await isPlatformAdmin()))) {
      clearAuthNext();
      location.href = "admin.html";
      return;
    }

    await window.Tenant?.syncWithAuthenticatedUser?.();

    // Desde landing «Elegir plan»: login primero, pago después.
    if (next === "suscripcion") {
      clearAuthNext();
      const qs = new URLSearchParams({ need: "1" });
      if (plan) qs.set("plan", plan);
      location.href = `suscripcion.html?${qs.toString()}#plans`;
      return;
    }

    const trial = await window.Billing?.startTrial?.();
    if (trial?.ok) {
      await window.Tenant?.syncWithAuthenticatedUser?.();
      location.href = "index.html";
      return;
    }

    if (window.Billing?.isActive?.() || window.Tenant?.hasActiveSubscription?.()) {
      location.href = "index.html";
      return;
    }

    location.href = "suscripcion.html?need=1";
  }

  async function sendStaffCode(email, name, type) {
    const code = sixDigitCode();
    pending = {
      email,
      name: name || pending?.name || "",
      code: "",
      otpToken: "",
      password: pending?.password || "",
      expires: Date.now() + 10 * 60 * 1000,
      type: type || "verify",
    };
    let send;
    if (type === "recover") {
      send = await window.EmailService.sendRecoveryCode({
        toEmail: email,
        toName: name || "barbero",
        code,
      });
    } else {
      send = await window.EmailService.sendVerificationCode({
        toEmail: email,
        toName: name || "barbero",
        code,
        productLabel: "Gestiónweb.app",
      });
    }
    if (send?.otpToken) pending.otpToken = send.otpToken;
    if (send?.code) pending.code = send.code;
    else if (!send?.otpToken && code) pending.code = code;
    return send;
  }

  async function verifyStaffCode(email, code, type) {
    if (pending?.otpToken) {
      const res = await fetch("/api/auth/otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "verify",
          email,
          code,
          otpToken: pending.otpToken,
          type: type || pending.type || "verify",
        }),
      });
      const data = await res.json().catch(() => ({}));
      return !!data.ok;
    }
    return String(code || "").replace(/\D/g, "") === String(pending?.code || "").replace(/\D/g, "");
  }

  document.querySelectorAll("[data-auth-mode]").forEach((btn) => {
    btn.addEventListener("click", () => showEmailPanel(btn.getAttribute("data-auth-mode")));
  });

  emailAuthBtn?.addEventListener("click", () => showEmailPanel(mode));
  emailAuthBack?.addEventListener("click", () => showHub(mode));

  authSwitchBtn?.addEventListener("click", () => {
    showHub(mode === "signup" ? "login" : "signup");
  });

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    showError("");
    const waitSec = submitLockRemainingSec();
    if (waitSec > 0) {
      showError(`Espera ${waitSec} segundos e inténtalo de nuevo.`);
      return;
    }
    const fd = new FormData(form);
    const email = String(fd.get("email") || "").trim();
    const password = String(fd.get("password") || "");
    const name = String(fd.get("name") || "").trim();
    if (mode === "signup" && !name) {
      showError("Escribe tu nombre.");
      return;
    }
    submitBtn.disabled = true;
    const prev = submitBtn.textContent;
    submitBtn.textContent = mode === "signup" ? "Creando…" : "Entrando…";

    if (mode === "login") {
      const result = await window.BarberAuth.signIn(email, password);
      submitBtn.disabled = false;
      submitBtn.textContent = prev;
      if (!result.ok) {
        if (/espera \d+ segundos/i.test(result.message || "")) {
          const sec = Number(result.message.match(/(\d+)/)?.[1] || 10);
          lockSubmit(sec * 1000);
        }
        showError(result.message);
        return;
      }
      afterAuth();
      return;
    }

    pending = { password, email, name };
    const signup = await window.BarberAuth.signUp(email, password, name);
    if (!signup.ok) {
      submitBtn.disabled = false;
      submitBtn.textContent = prev;
      if (/espera \d+ segundos/i.test(signup.message || "")) {
        const sec = Number(signup.message.match(/(\d+)/)?.[1] || 10);
        lockSubmit(sec * 1000);
      }
      if (signup.existing) {
        showEmailPanel("login");
        form.querySelector('input[name="email"]').value = email;
      }
      showError(signup.message);
      return;
    }

    if (signup.session) {
      submitBtn.disabled = false;
      submitBtn.textContent = prev;
      await afterAuth();
      return;
    }

    let send = { ok: false, demo: true };
    try {
      send = await sendStaffCode(email, name, "verify");
    } catch (err) {
      console.error("Signup email", err);
    }
    pending.password = password;
    submitBtn.disabled = false;
    submitBtn.textContent = prev;
    showVerifyStep(send);
  });

  googleBtn?.addEventListener("click", async () => {
    showError("");
    googleBtn.disabled = true;
    try {
      const result = await window.BarberAuth.signInWithGoogle();
      if (result.redirect) return;
      if (!result.ok) {
        showError(result.message);
        return;
      }
      await afterAuth();
    } catch (err) {
      showError(err?.message || "No se pudo entrar con Google.");
    } finally {
      googleBtn.disabled = false;
    }
  });

  document.getElementById("btn-forgot")?.addEventListener("click", () => {
    const email = String(form?.querySelector('input[name="email"]')?.value || "").trim();
    showRecoverRequest();
    const input = recoverRequestForm?.querySelector('input[name="email"]');
    if (input && email) input.value = email;
    input?.focus();
  });

  document.getElementById("recover-back")?.addEventListener("click", () => showEmailPanel("login"));
  document.getElementById("recover-reset-back")?.addEventListener("click", () => showRecoverRequest());
  document.getElementById("recover-resend")?.addEventListener("click", async () => {
    if (!pending?.email) return;
    const btn = document.getElementById("recover-resend");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Enviando…";
    }
    let send = { ok: false, demo: true };
    try {
      send = await sendStaffCode(pending.email, pending.name, "recover");
    } catch (err) {
      console.error("Recover resend", err);
    }
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Reenviar código";
    }
    showRecoverReset(send);
  });

  recoverRequestForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    showBox(recoverRequestError, "");
    const email = String(new FormData(recoverRequestForm).get("email") || "").trim();
    const btn = document.getElementById("recover-send");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Enviando…";
    }
    let send = { ok: false, demo: true };
    try {
      send = await sendStaffCode(email, "", "recover");
    } catch (err) {
      console.error("Recover email", err);
    }
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Enviar código";
    }
    showRecoverReset(send);
  });

  recoverResetForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    showBox(recoverResetError, "");
    if (!pending || pending.type !== "recover") {
      showRecoverRequest();
      return;
    }
    if (Date.now() > pending.expires) {
      showBox(recoverResetError, "El código venció. Solicita uno nuevo.");
      return;
    }
    const fd = new FormData(recoverResetForm);
    const code = String(fd.get("code") || "").replace(/\D/g, "");
    const password = String(fd.get("password") || "");
    const confirm = String(fd.get("passwordConfirm") || "");
    const codeOk = await verifyStaffCode(pending.email, code, "recover");
    if (!codeOk) {
      showBox(recoverResetError, "Ese código no coincide. Revisa el correo.");
      return;
    }
    if (password.length < 6) {
      showBox(recoverResetError, "La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    if (password !== confirm) {
      showBox(recoverResetError, "Las contraseñas no coinciden.");
      return;
    }
    const resetRes = pending.otpToken
      ? await fetch("/api/auth/reset-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: pending.email,
            code,
            password,
            otpToken: pending.otpToken,
          }),
        })
      : null;
    const resetData = resetRes ? await resetRes.json().catch(() => ({})) : { ok: false };
    if (!resetData.ok) {
      if (!pending.otpToken) {
        const fallback = await window.BarberAuth.completePasswordReset(pending.email, password);
        if (fallback.needsGoogle) {
          showEmailPanel("login");
          showError(fallback.message);
          return;
        }
        if (fallback.session || (await window.BarberAuth.session())) {
          afterAuth();
          return;
        }
      }
      if (!resetData.ok) {
        showBox(recoverResetError, resetData.message || "No se pudo guardar la contraseña.");
        return;
      }
    }
    const login = await window.BarberAuth.signIn(pending.email, password);
    if (!login.ok) {
      showEmailPanel("login");
      showError("Contraseña actualizada. Entra con tu correo.");
      return;
    }
    afterAuth();
  });

  resendBtn?.addEventListener("click", async () => {
    if (!pending?.email) return;
    resendBtn.disabled = true;
    resendBtn.textContent = "Enviando…";
    let send = { ok: false, demo: true };
    try {
      send = await sendStaffCode(pending.email, pending.name, "verify");
    } catch (err) {
      console.error("Resend email", err);
    }
    resendBtn.disabled = false;
    resendBtn.textContent = "Reenviar código";
    showVerifyStep(send);
    showVerifyError(send?.ok ? "" : send?.message || "No se pudo reenviar. Usa el código de respaldo.");
  });

  verifyForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    showVerifyError("");
    if (!pending) {
      hideVerifyStep();
      return;
    }
    if (Date.now() > pending.expires) {
      showVerifyError("El código venció. Vuelve a crear la cuenta para pedir otro.");
      return;
    }
    const code = String(new FormData(verifyForm).get("code") || "").replace(/\D/g, "");
    const codeOk = await verifyStaffCode(pending.email, code, "verify");
    if (!codeOk) {
      showVerifyError("Ese código no coincide. Revisa el correo.");
      return;
    }
    const btn = document.getElementById("verify-submit");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Verificando…";
    }
    const session = await window.BarberAuth.session();
    if (!session) {
      const login = await window.BarberAuth.signIn(pending.email, pending.password);
      if (!login.ok) {
        if (btn) {
          btn.disabled = false;
          btn.textContent = "Verificar";
        }
        showVerifyError(login.message || "No se pudo entrar. Revisa correo y contraseña.");
        return;
      }
    }
    afterAuth();
  });

  document.getElementById("verify-back")?.addEventListener("click", () => hideVerifyStep());

  const params = new URLSearchParams(location.search);
  const hashParams = new URLSearchParams(location.hash.replace(/^#/, ""));
  const initialMode = params.get("mode") === "login" ? "login" : "signup";
  const authError =
    params.get("error_description") ||
    hashParams.get("error_description") ||
    params.get("error") ||
    hashParams.get("error");
  const bootError = authError
    ? decodeURIComponent(String(authError).replace(/\+/g, " "))
    : params.get("idle") === "1"
      ? "Cerramos la sesión por inactividad. Vuelve a entrar."
      : "";

  async function bootstrap() {
    readAuthNext();

    const googleIdToken = hashParams.get("id_token");
    if (googleIdToken) {
      history.replaceState(null, "", location.pathname + location.search);
      const result = await window.BarberAuth.signInWithGoogleIdToken(googleIdToken);
      if (!result.ok) {
        showHub(initialMode);
        showError(result.message);
        return;
      }
      await afterAuth();
      return;
    }

    const isOAuthReturn =
      hashParams.has("access_token") ||
      hashParams.has("error") ||
      hashParams.has("error_description") ||
      !!authError;

    if (isOAuthReturn) {
      const client = await window.SupabaseClient?.getClient?.();
      if (client) {
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const { data, error } = await client.auth.getSession();
        if (error && !bootError) {
          showHub(initialMode);
          showError(window.BarberAuth.authErrorMessage(error));
          history.replaceState(null, "", location.pathname + location.search);
          return;
        }
        if (data?.session) {
          history.replaceState(null, "", location.pathname + location.search);
          await afterAuth();
          return;
        }
      }
    }

    showHub(initialMode);
    if (bootError) showError(bootError);
    else if (authError) {
      showError(decodeURIComponent(String(authError).replace(/\+/g, " ")));
    }

    const s = await window.BarberAuth?.session?.();
    if (s && params.get("idle") !== "1") await afterAuth();
  }

  bootstrap();
})();
