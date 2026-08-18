/**
 * Auth de barberos (Supabase). Los clientes de Rewards siguen en el flujo público.
 */
(function () {
  async function getClient() {
    return window.SupabaseClient?.getClient?.() || null;
  }

  async function session() {
    const client = await getClient();
    if (!client) return null;
    const { data } = await client.auth.getSession();
    return data.session || null;
  }

  async function currentUser() {
    const s = await session();
    return s?.user || null;
  }

  function authErrorMessage(err) {
    const raw = String(err?.message || err || "");
    if (/rate limit/i.test(raw)) return "";
    if (/email not confirmed/i.test(raw)) {
      return "Correo o contraseña incorrectos. Si acabas de registrarte, revisa el código que te enviamos al correo.";
    }
    if (/invalid login/i.test(raw)) return "Correo o contraseña incorrectos.";
    if (/already registered/i.test(raw)) return "Ese correo ya tiene una cuenta. Entra en su lugar.";
    if (/password/i.test(raw) && /6/i.test(raw)) return "La contraseña debe tener al menos 6 caracteres.";
    if (/email/i.test(raw) && /invalid/i.test(raw)) return "Revisa el correo.";
    return raw || "No se pudo completar la acción.";
  }

  function authRedirectUrl() {
    const path = "/login.html";
    const host = location.hostname;
    if (host === "localhost" || host === "127.0.0.1") {
      return `https://barber-home-cloud.vercel.app${path}`;
    }
    return `${location.origin}${path}`;
  }

  async function signUp(email, password, name) {
    const client = await getClient();
    if (!client) return { ok: false, message: "Supabase no está configurado." };
    const { data, error } = await client.auth.signUp({
      email: String(email || "").trim(),
      password,
      options: {
        data: { name: String(name || "").trim() },
        emailRedirectTo: authRedirectUrl(),
      },
    });
    if (
      error &&
      /rate limit|already registered|user already|límite de correos/i.test(error.message || "")
    ) {
      return { ok: true, session: null, existing: true };
    }
    if (error) return { ok: false, message: authErrorMessage(error) };
    return { ok: true, user: data.user, session: data.session };
  }

  async function signIn(email, password) {
    const client = await getClient();
    if (!client) return { ok: false, message: "Supabase no está configurado." };
    const { data, error } = await client.auth.signInWithPassword({
      email: String(email || "").trim(),
      password,
    });
    if (error) return { ok: false, message: authErrorMessage(error) };
    return { ok: true, user: data.user, session: data.session };
  }

  async function signOut() {
    const client = await getClient();
    if (!client) return { ok: true };
    const { error } = await client.auth.signOut();
    if (error) return { ok: false, message: authErrorMessage(error) };
    return { ok: true };
  }

  async function claimCurrentNegocio() {
    const user = await currentUser();
    if (!user || !window.SupabaseData?.enabled?.()) return { ok: false, skipped: true };
    const cached = window.Tenant?.cached?.();
    const id = window.Tenant?.currentId?.();
    if (!id && !cached?.slug) return { ok: false, skipped: true };
    let auto = {};
    try {
      auto = JSON.parse(localStorage.getItem("barbercloud.autoagenda") || "{}");
    } catch {
      auto = {};
    }
    let sub = {};
    try {
      sub = JSON.parse(localStorage.getItem("barbercloud.subscription") || "{}");
    } catch {
      sub = {};
    }
    return window.SupabaseData.upsertNegocio({
      id: id || cached?.id,
      slug: cached?.slug || auto.slug,
      name: cached?.name || auto.title || "",
      owner_id: user.id,
      subscription_status: sub.status || cached?.subscription_status || "trialing",
      plan_id: sub.planId || cached?.plan_id || "100",
      autoagenda: auto,
      whatsapp: "",
      onboarding_completed: true,
    });
  }

  function oauthRedirectUrl() {
    return `${location.origin}/login.html`;
  }

  const PENDING_PW_KEY = "barbercloud.pending_pw";

  function savePendingPassword(email, password) {
    try {
      sessionStorage.setItem(
        PENDING_PW_KEY,
        JSON.stringify({
          email: String(email || "").trim().toLowerCase(),
          password,
          exp: Date.now() + 15 * 60 * 1000,
        })
      );
    } catch {
      /* ignore */
    }
  }

  async function applyPendingPassword() {
    try {
      const raw = sessionStorage.getItem(PENDING_PW_KEY);
      if (!raw) return;
      const pending = JSON.parse(raw);
      if (!pending?.password || Date.now() > pending.exp) {
        sessionStorage.removeItem(PENDING_PW_KEY);
        return;
      }
      const user = await currentUser();
      if (!user?.email || String(user.email).toLowerCase() !== pending.email) return;
      const client = await getClient();
      if (!client) return;
      const { error } = await client.auth.updateUser({ password: pending.password });
      if (!error) sessionStorage.removeItem(PENDING_PW_KEY);
    } catch {
      /* ignore */
    }
  }

  async function signInWithGoogleIdToken(credential) {
    const client = await getClient();
    if (!client) return { ok: false, message: "Supabase no está configurado." };
    const { data, error } = await client.auth.signInWithIdToken({
      provider: "google",
      token: credential,
    });
    if (error) return { ok: false, message: authErrorMessage(error) };
    return { ok: true, user: data.user, session: data.session };
  }

  async function signInWithGoogle() {
    const client = await getClient();
    if (!client) return { ok: false, message: "Supabase no está configurado." };
    try {
      if (window.GoogleAuth?.signInCredential) {
        const credential = await window.GoogleAuth.signInCredential();
        return await signInWithGoogleIdToken(credential);
      }
    } catch (err) {
      const msg = String(err?.message || "");
      if (/cancelado/i.test(msg)) {
        return { ok: false, message: "Inicio de sesión con Google cancelado." };
      }
      console.warn("Google credential", err);
    }
    const { error } = await client.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: oauthRedirectUrl(),
        queryParams: { prompt: "select_account" },
      },
    });
    if (error) {
      return {
        ok: false,
        message:
          "No se pudo entrar con Google. Revisa que el proveedor esté activo o usa correo y contraseña.",
      };
    }
    return { ok: true, redirect: true };
  }

  async function updatePassword(password) {
    const client = await getClient();
    if (!client) return { ok: false, message: "Supabase no está configurado." };
    const { error } = await client.auth.updateUser({ password });
    if (error) return { ok: false, message: authErrorMessage(error) };
    return { ok: true };
  }

  async function completePasswordReset(email, password) {
    savePendingPassword(email, password);
    const updated = await updatePassword(password);
    if (updated.ok) {
      try {
        sessionStorage.removeItem(PENDING_PW_KEY);
      } catch {
        /* ignore */
      }
      return { ok: true };
    }
    const login = await signIn(email, password);
    if (login.ok) {
      try {
        sessionStorage.removeItem(PENDING_PW_KEY);
      } catch {
        /* ignore */
      }
      return { ok: true, session: login.session };
    }
    return {
      ok: true,
      needsGoogle: true,
      message: "Código verificado. Entra con Google para guardar la contraseña nueva.",
    };
  }

  async function hydrateOwnNegocio() {
    if (!window.SupabaseData?.enabled?.()) return null;
    return (await window.SupabaseData.fetchOwnNegocio?.()) || null;
  }

  window.BarberAuth = {
    session,
    currentUser,
    signUp,
    signIn,
    signOut,
    signInWithGoogle,
    signInWithGoogleIdToken,
    updatePassword,
    completePasswordReset,
    applyPendingPassword,
    hydrateOwnNegocio,
    claimCurrentNegocio,
    authErrorMessage,
  };
})();
