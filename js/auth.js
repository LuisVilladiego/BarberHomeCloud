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

  window.BarberAuth = {
    session,
    currentUser,
    signUp,
    signIn,
    signOut,
    claimCurrentNegocio,
    authErrorMessage,
  };
})();
