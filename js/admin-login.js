(function () {
  const ADMIN_EMAIL = "adminbarbercloud@gmail.com";
  const form = document.getElementById("admin-login-form");
  const errorEl = document.getElementById("admin-login-error");
  const submitBtn = document.getElementById("admin-login-submit");
  const googleBtn = document.getElementById("admin-login-google");

  function showError(message) {
    if (!errorEl) return;
    errorEl.hidden = !message;
    errorEl.textContent = message || "";
  }

  function adminRedirectUrl() {
    const host = location.hostname;
    if (host === "localhost" || host === "127.0.0.1") {
      return "https://barber-home-cloud.vercel.app/admin-login.html";
    }
    return `${location.origin}/admin-login.html`;
  }

  async function getClient() {
    return window.SupabaseClient?.getClient?.() || null;
  }

  async function finishIfAdmin(session) {
    const email = String(session?.user?.email || "").trim().toLowerCase();
    if (email !== ADMIN_EMAIL) {
      const client = await getClient();
      await client?.auth?.signOut?.();
      showError(`Solo ${ADMIN_EMAIL} puede entrar al panel de plataforma.`);
      return false;
    }
    location.replace("admin.html");
    return true;
  }

  async function bootstrapOAuthReturn() {
    const hashParams = new URLSearchParams(location.hash.replace(/^#/, ""));
    const params = new URLSearchParams(location.search);
    const authError =
      params.get("error_description") ||
      hashParams.get("error_description") ||
      params.get("error") ||
      hashParams.get("error");

    if (authError) {
      showError(decodeURIComponent(String(authError).replace(/\+/g, " ")));
      history.replaceState(null, "", location.pathname);
      return;
    }

    const isOAuthReturn =
      hashParams.has("access_token") ||
      hashParams.has("error") ||
      hashParams.has("error_description");

    if (!isOAuthReturn) return;

    const client = await getClient();
    if (!client) {
      showError("Supabase no está configurado.");
      history.replaceState(null, "", location.pathname);
      return;
    }

    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const { data, error } = await client.auth.getSession();
    history.replaceState(null, "", location.pathname);

    if (error) {
      showError(error.message || "No se pudo completar el inicio con Google.");
      return;
    }

    if (data?.session) {
      await finishIfAdmin(data.session);
    }
  }

  googleBtn?.addEventListener("click", async () => {
    showError("");
    const client = await getClient();
    if (!client) {
      showError("Supabase no está configurado.");
      return;
    }

    if (googleBtn) {
      googleBtn.disabled = true;
      googleBtn.textContent = "Redirigiendo a Google…";
    }

    const { error } = await client.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: adminRedirectUrl(),
        queryParams: {
          prompt: "select_account",
          login_hint: ADMIN_EMAIL,
        },
      },
    });

    if (error) {
      showError(
        /redirect/i.test(error.message || "")
          ? "Falta autorizar admin-login.html en Supabase → Authentication → URL Configuration → Redirect URLs."
          : error.message || "No se pudo iniciar sesión con Google."
      );
      if (googleBtn) {
        googleBtn.disabled = false;
        googleBtn.textContent = "Entrar con Google";
      }
    }
  });

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    showError("");

    const client = await getClient();
    if (!client) {
      showError("Supabase no está configurado.");
      return;
    }

    const password = String(new FormData(form).get("password") || "");
    if (password.length < 6) {
      showError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Entrando…";
    }

    const { data, error } = await client.auth.signInWithPassword({
      email: ADMIN_EMAIL,
      password,
    });

    if (error) {
      const msg = String(error.message || "");
      let friendly = msg;
      if (/invalid login credentials/i.test(msg)) {
        friendly =
          "Esta cuenta se creó con Google y no tiene contraseña. Usa «Entrar con Google» o pulsa «Reset password» en Supabase → Authentication → Users.";
      } else if (/email not confirmed/i.test(msg)) {
        friendly = "Confirma el correo en Supabase (Authentication → Users → Confirm user).";
      }
      showError(friendly);
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Entrar al panel";
      }
      return;
    }

    const ok = await finishIfAdmin(data?.session);
    if (!ok && submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Entrar al panel";
    }
  });

  bootstrapOAuthReturn();
})();
