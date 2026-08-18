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
  const googleWrap = document.getElementById("google-auth-wrap");
  const googleBtn = document.getElementById("btn-google-auth");
  const forgotWrap = document.getElementById("forgot-wrap");
  const tabs = document.querySelector(".auth-tabs");
  const passwordInput = form?.querySelector('input[name="password"]');
  let mode = "login";
  let pending = null;

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

  function setChrome({ title, lead, showTabs, showGoogle, showForgot }) {
    if (titleEl && title) titleEl.textContent = title;
    if (leadEl && lead) leadEl.textContent = lead;
    if (tabs) tabs.hidden = !showTabs;
    if (googleWrap) googleWrap.hidden = !showGoogle;
    if (forgotWrap) forgotWrap.hidden = !showForgot;
  }

  function hideAllForms() {
    if (form) form.hidden = true;
    if (verifyForm) verifyForm.hidden = true;
    if (recoverRequestForm) recoverRequestForm.hidden = true;
    if (recoverResetForm) recoverResetForm.hidden = true;
  }

  function setMode(next) {
    mode = next;
    document.querySelectorAll("[data-auth-mode]").forEach((btn) => {
      btn.classList.toggle("is-active", btn.getAttribute("data-auth-mode") === mode);
    });
    hideAllForms();
    if (form) form.hidden = false;
    if (nameField) nameField.hidden = mode !== "signup";
    if (submitBtn) submitBtn.textContent = mode === "signup" ? "Crear cuenta" : "Entrar";
    if (passwordInput) {
      passwordInput.autocomplete = mode === "signup" ? "new-password" : "current-password";
    }
    setChrome({
      title: mode === "signup" ? "Crea tu cuenta" : "Entra a tu barbería",
      lead:
        mode === "signup"
          ? "Crea tu cuenta. Te enviaremos un código de 6 dígitos a tu correo."
          : "Usa tu correo y contraseña para abrir el panel y gestionar citas, clientes y reservas.",
      showTabs: true,
      showGoogle: true,
      showForgot: mode === "login",
    });
    showError("");
  }

  function showVerifyStep(send) {
    hideAllForms();
    if (verifyForm) verifyForm.hidden = false;
    setChrome({
      title: "Verifica tu correo",
      lead: `Enviamos un código de 6 dígitos a ${pending.email}.`,
      showTabs: false,
      showGoogle: false,
      showForgot: false,
    });
    const failed = !send || send.ok === false || send.demo;
    if (verifyLead) {
      verifyLead.hidden = false;
      verifyLead.textContent = failed
        ? "No se pudo enviar el correo. Usa el código de respaldo o pulsa Reenviar."
        : "Revisa tu bandeja de entrada y el spam. El código caduca en 10 minutos.";
    }
    if (verifyDemo && verifyDemoCode) {
      verifyDemo.hidden = !failed;
      verifyDemoCode.textContent = failed ? pending.code : "";
    }
    if (verifyCode) {
      verifyCode.required = true;
      verifyCode.focus();
    }
  }

  function showRecoverRequest() {
    hideAllForms();
    if (recoverRequestForm) recoverRequestForm.hidden = false;
    setChrome({
      title: "Recuperar contraseña",
      lead: "Te enviaremos un código de 6 dígitos a tu correo para crear una contraseña nueva.",
      showTabs: false,
      showGoogle: true,
      showForgot: false,
    });
    showBox(recoverRequestError, "");
  }

  function showRecoverReset(send) {
    hideAllForms();
    if (recoverResetForm) recoverResetForm.hidden = false;
    setChrome({
      title: "Nueva contraseña",
      lead: `Enviamos un código a ${pending.email}.`,
      showTabs: false,
      showGoogle: false,
      showForgot: false,
    });
    const failed = !send || send.ok === false || send.demo;
    if (recoverDemo && recoverDemoCode) {
      recoverDemo.hidden = !failed;
      recoverDemoCode.textContent = failed ? pending.code : "";
    }
    showBox(recoverResetError, failed ? send?.message || "" : "");
  }

  function hideVerifyStep() {
    pending = null;
    if (verifyCode) verifyCode.required = false;
    if (verifyForm) verifyForm.reset();
    if (verifyDemo) verifyDemo.hidden = true;
    showVerifyError("");
    setMode("login");
  }

  async function afterAuth() {
    await window.BarberAuth?.applyPendingPassword?.();
    await window.BarberAuth?.hydrateOwnNegocio?.();
    if (!window.Tenant?.hasExistingBusiness?.()) {
      location.href = "onboarding.html";
      return;
    }
    if (!window.Tenant?.hasActiveSubscription?.()) {
      location.href = "suscripcion.html?need=1";
      return;
    }
    await window.BarberAuth?.claimCurrentNegocio?.();
    location.href = "index.html";
  }

  async function sendStaffCode(email, name, type) {
    const code = sixDigitCode();
    pending = {
      email,
      name: name || pending?.name || "",
      code,
      password: pending?.password || "",
      expires: Date.now() + 10 * 60 * 1000,
      type: type || "verify",
    };
    if (type === "recover") {
      return window.EmailService.sendRecoveryCode({
        toEmail: email,
        toName: name || "barbero",
        code,
      });
    }
    return window.EmailService.sendVerificationCode({
      toEmail: email,
      toName: name || "barbero",
      code,
      productLabel: "BarberCloud",
    });
  }

  document.querySelectorAll("[data-auth-mode]").forEach((btn) => {
    btn.addEventListener("click", () => setMode(btn.getAttribute("data-auth-mode")));
  });

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    showError("");
    const fd = new FormData(form);
    const email = String(fd.get("email") || "").trim();
    const password = String(fd.get("password") || "");
    const name = String(fd.get("name") || "").trim();
    submitBtn.disabled = true;
    const prev = submitBtn.textContent;
    submitBtn.textContent = mode === "signup" ? "Creando…" : "Entrando…";

    if (mode === "login") {
      const result = await window.BarberAuth.signIn(email, password);
      submitBtn.disabled = false;
      submitBtn.textContent = prev;
      if (!result.ok) {
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
      showError(signup.message);
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

  document.getElementById("recover-back")?.addEventListener("click", () => setMode("login"));
  document.getElementById("recover-reset-back")?.addEventListener("click", () => showRecoverRequest());

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
    if (code !== pending.code) {
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
    const result = await window.BarberAuth.completePasswordReset(pending.email, password);
    if (result.needsGoogle) {
      setMode("login");
      showError(result.message);
      return;
    }
    if (result.session || (await window.BarberAuth.session())) {
      afterAuth();
      return;
    }
    const login = await window.BarberAuth.signIn(pending.email, password);
    if (!login.ok) {
      setMode("login");
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
    if (code !== pending.code) {
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
  const authError = params.get("error_description") || hashParams.get("error_description");
  if (authError) showError(decodeURIComponent(authError.replace(/\+/g, " ")));
  if (params.get("idle") === "1") {
    showError("Cerramos la sesión por inactividad. Vuelve a entrar.");
  }

  const googleIdToken = hashParams.get("id_token");
  if (googleIdToken) {
    history.replaceState(null, "", location.pathname + location.search);
    window.BarberAuth.signInWithGoogleIdToken(googleIdToken).then((result) => {
      if (!result.ok) {
        showError(result.message);
        return;
      }
      afterAuth();
    });
    return;
  }

  window.BarberAuth?.session?.().then((s) => {
    if (s && params.get("idle") !== "1") afterAuth();
  });
})();
