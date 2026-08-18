(function () {
  const form = document.getElementById("login-form");
  const errorEl = document.getElementById("login-error");
  const submitBtn = document.getElementById("login-submit");
  const titleEl = document.getElementById("login-title");
  const leadEl = document.getElementById("login-lead");
  const nameField = document.getElementById("field-name");
  const passwordInput = form?.querySelector('input[name="password"]');
  let mode = "login";

  function showError(msg) {
    if (!errorEl) return;
    errorEl.hidden = !msg;
    errorEl.textContent = msg || "";
  }

  function setMode(next) {
    mode = next;
    document.querySelectorAll("[data-auth-mode]").forEach((btn) => {
      btn.classList.toggle("is-active", btn.getAttribute("data-auth-mode") === mode);
    });
    if (nameField) nameField.hidden = mode !== "signup";
    if (titleEl) titleEl.textContent = mode === "signup" ? "Crea tu cuenta" : "Entra a tu barbería";
    if (leadEl) {
      leadEl.textContent =
        mode === "signup"
          ? "Regístrate para configurar tu barbería y recibir reservas en tu propio enlace."
          : "Usa tu correo y contraseña para abrir el panel y gestionar citas, clientes y reservas.";
    }
    if (submitBtn) submitBtn.textContent = mode === "signup" ? "Crear cuenta" : "Entrar";
    if (passwordInput) {
      passwordInput.autocomplete = mode === "signup" ? "new-password" : "current-password";
    }
    showError("");
  }

  function afterAuth() {
    if (window.Tenant?.hasExistingBusiness?.()) {
      window.BarberAuth?.claimCurrentNegocio?.().finally(() => {
        location.href = "index.html";
      });
      return;
    }
    location.href = "onboarding.html";
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
    const result =
      mode === "signup"
        ? await window.BarberAuth.signUp(email, password, name)
        : await window.BarberAuth.signIn(email, password);
    submitBtn.disabled = false;
    submitBtn.textContent = prev;
    if (!result.ok) {
      showError(result.message);
      return;
    }
    if (mode === "signup" && !result.session) {
      showError(
        "Te enviamos un correo de confirmación. Ábrelo y entra al enlace: te llevará al sitio en Vercel, no a localhost."
      );
      setMode("login");
      return;
    }
    afterAuth();
  });

  const params = new URLSearchParams(location.search);
  const hashParams = new URLSearchParams(location.hash.replace(/^#/, ""));
  const authError = params.get("error_description") || hashParams.get("error_description");
  if (authError) showError(decodeURIComponent(authError.replace(/\+/g, " ")));

  window.BarberAuth?.session?.().then((s) => {
    if (s) afterAuth();
  });
})();
