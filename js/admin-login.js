(function () {
  const ADMIN_EMAIL = "adminbarbercloud@gmail.com";
  const form = document.getElementById("admin-login-form");
  const errorEl = document.getElementById("admin-login-error");
  const submitBtn = document.getElementById("admin-login-submit");

  function showError(message) {
    if (!errorEl) return;
    errorEl.hidden = !message;
    errorEl.textContent = message || "";
  }

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    showError("");

    const client = window.SupabaseClient?.getClient?.();
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
      showError(
        /invalid/i.test(error.message || "")
          ? "Correo o contraseña incorrectos."
          : error.message || "No se pudo entrar."
      );
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Entrar al panel";
      }
      return;
    }

    const email = String(data?.user?.email || "").trim().toLowerCase();
    if (email !== ADMIN_EMAIL) {
      await client.auth.signOut();
      showError("Esta cuenta no está autorizada como administrador.");
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Entrar al panel";
      }
      return;
    }

    location.replace("admin.html");
  });
})();
