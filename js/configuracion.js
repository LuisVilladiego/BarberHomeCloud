(function () {
  const KEY = "barbercloud_settings";
  const defaults = {
    email: "barberhomeluisvilladiego20@gmail.com",
    name: "luis villadiego",
    lang: "es",
    waPhone: "+57 300 000 0000",
    waConnected: true,
    waFrom: "08:00",
    waTo: "20:00",
    notifFail: true,
    notifBooking: true,
    notifWeekly: false,
    referCode: "",
    referCredits: 0,
    referInvites: 0,
  };

  const views = {
    hub: document.getElementById("view-hub"),
    cuenta: document.getElementById("view-cuenta"),
    whatsapp: document.getElementById("view-whatsapp"),
    notificaciones: document.getElementById("view-notificaciones"),
  };

  function load() {
    try {
      return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) || "{}") };
    } catch {
      return { ...defaults };
    }
  }

  function save(data) {
    localStorage.setItem(KEY, JSON.stringify(data));
  }

  let state = load();
  if (!state.referCode) {
    state.referCode = "luis" + Math.random().toString(36).slice(2, 7);
    save(state);
  }

  function toast(msg) {
    window.AppShell?.toast(msg);
  }

  function syncUserChrome() {
    const name = state.name || defaults.name;
    document.querySelectorAll(".user__name").forEach((el) => {
      el.textContent = name;
    });
    document.querySelectorAll(".user__avatar").forEach((el) => {
      el.textContent = (name.trim()[0] || "I").toUpperCase();
    });
  }

  function showView(name) {
    Object.entries(views).forEach(([key, el]) => {
      if (!el) return;
      el.hidden = key !== name;
    });
    const hash = name === "hub" ? "" : "#" + name;
    const base = location.pathname.split("/").pop() || "configuracion.html";
    history.replaceState(null, "", hash ? base + hash : base);
  }

  function fillForm() {
    const emailEl = document.getElementById("account-email");
    const nameEl = document.getElementById("account-name");
    if (emailEl) emailEl.textContent = state.email;
    if (nameEl) nameEl.value = state.name;

    document.querySelectorAll('input[name="lang"]').forEach((radio) => {
      radio.checked = radio.value === state.lang;
    });

    const waPhone = document.getElementById("wa-phone");
    const waConnected = document.getElementById("wa-connected");
    const waFrom = document.getElementById("wa-from");
    const waTo = document.getElementById("wa-to");
    if (waPhone) waPhone.value = state.waPhone;
    if (waConnected) waConnected.checked = !!state.waConnected;
    if (waFrom) waFrom.value = state.waFrom;
    if (waTo) waTo.value = state.waTo;

    const nf = document.getElementById("notif-fail");
    const nb = document.getElementById("notif-booking");
    const nw = document.getElementById("notif-weekly");
    if (nf) nf.checked = !!state.notifFail;
    if (nb) nb.checked = !!state.notifBooking;
    if (nw) nw.checked = !!state.notifWeekly;

    const hubWa = document.getElementById("hub-wa-summary");
    if (hubWa) {
      hubWa.textContent = state.waConnected
        ? `Conectado · ${state.waPhone}`
        : "Sesión desconectada";
    }

    const link = document.getElementById("refer-link");
    if (link) {
      link.value = `${location.origin}${location.pathname.replace(/[^/]+$/, "")}index.html?ref=${state.referCode}`;
    }
    const stats = document.getElementById("refer-stats");
    if (stats) {
      stats.textContent = `Créditos ganados: ${state.referCredits} · Invitaciones: ${state.referInvites}`;
    }

    syncUserChrome();
  }

  function openModal(id) {
    const el = document.getElementById(id);
    if (el) el.hidden = false;
  }

  function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.hidden = true;
  }

  document.querySelector("[data-open-cuenta]")?.addEventListener("click", () => showView("cuenta"));
  document.querySelector("[data-open-whatsapp]")?.addEventListener("click", () => showView("whatsapp"));
  document
    .querySelector("[data-open-notificaciones]")
    ?.addEventListener("click", () => showView("notificaciones"));
  document.querySelectorAll("[data-back-hub]").forEach((btn) => {
    btn.addEventListener("click", () => showView("hub"));
  });

  document.getElementById("btn-save-account")?.addEventListener("click", () => {
    const name = document.getElementById("account-name")?.value.trim();
    if (!name) {
      toast("Escribe un nombre válido.");
      return;
    }
    state.name = name;
    save(state);
    syncUserChrome();
    toast("Nombre guardado.");
  });

  document.querySelectorAll('input[name="lang"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      if (!radio.checked) return;
      state.lang = radio.value;
      save(state);
      const labels = { es: "Español", en: "Inglés", pt: "Portugués" };
      toast(`Idioma: ${labels[state.lang] || state.lang}`);
      document.documentElement.lang = state.lang === "en" ? "en" : state.lang === "pt" ? "pt" : "es";
    });
  });

  document.getElementById("btn-refer")?.addEventListener("click", () => {
    fillForm();
    openModal("refer-modal");
  });
  document.querySelectorAll("[data-close-refer]").forEach((el) => {
    el.addEventListener("click", () => closeModal("refer-modal"));
  });
  document.getElementById("btn-copy-refer")?.addEventListener("click", async () => {
    const link = document.getElementById("refer-link")?.value || "";
    try {
      await navigator.clipboard.writeText(link);
      toast("Link copiado.");
    } catch {
      document.getElementById("refer-link")?.select();
      toast("Copia el link manualmente.");
    }
  });

  document.getElementById("btn-delete-account")?.addEventListener("click", () => {
    const input = document.getElementById("delete-confirm");
    const confirmBtn = document.getElementById("btn-confirm-delete");
    if (input) input.value = "";
    if (confirmBtn) confirmBtn.disabled = true;
    openModal("delete-modal");
  });
  document.querySelectorAll("[data-close-delete]").forEach((el) => {
    el.addEventListener("click", () => closeModal("delete-modal"));
  });
  document.getElementById("delete-confirm")?.addEventListener("input", (e) => {
    const btn = document.getElementById("btn-confirm-delete");
    if (btn) btn.disabled = e.target.value.trim().toUpperCase() !== "ELIMINAR";
  });
  document.getElementById("btn-confirm-delete")?.addEventListener("click", () => {
    const keys = Object.keys(localStorage).filter(
      (k) => k.startsWith("barbercloud") || k.startsWith("confirmafy")
    );
    keys.forEach((k) => localStorage.removeItem(k));
    closeModal("delete-modal");
    toast("Cuenta local eliminada. Reiniciando…");
    setTimeout(() => {
      location.href = "index.html";
    }, 900);
  });

  document.getElementById("btn-save-wa")?.addEventListener("click", () => {
    state.waPhone = document.getElementById("wa-phone")?.value.trim() || state.waPhone;
    state.waConnected = !!document.getElementById("wa-connected")?.checked;
    save(state);
    fillForm();
    toast("WhatsApp actualizado.");
  });
  document.getElementById("btn-save-wa-hours")?.addEventListener("click", () => {
    state.waFrom = document.getElementById("wa-from")?.value || state.waFrom;
    state.waTo = document.getElementById("wa-to")?.value || state.waTo;
    save(state);
    toast("Horario de envío guardado.");
  });

  document.getElementById("btn-save-notif")?.addEventListener("click", () => {
    state.notifFail = !!document.getElementById("notif-fail")?.checked;
    state.notifBooking = !!document.getElementById("notif-booking")?.checked;
    state.notifWeekly = !!document.getElementById("notif-weekly")?.checked;
    save(state);
    toast("Preferencias de notificaciones guardadas.");
  });

  const supabaseStatus = document.getElementById("supabase-status");
  function refreshSupabaseStatus() {
    if (!supabaseStatus) return;
    if (window.SupabaseData?.enabled?.()) {
      supabaseStatus.textContent = "Estado: conectado · listo para sincronizar";
    } else {
      supabaseStatus.textContent =
        "Estado: no configurado (completa url y anonKey en js/supabase-config.js)";
    }
  }
  refreshSupabaseStatus();

  document.getElementById("btn-supabase-pull")?.addEventListener("click", async () => {
    if (!window.SupabaseData?.enabled?.()) {
      toast("Configura Supabase primero.");
      return;
    }
    toast("Bajando datos…");
    const r = await window.SupabaseData.pullToLocalCache();
    toast(
      r?.ok
        ? `Listo: ${r.citas || 0} citas, ${r.clientes || 0} clientes, ${r.productos || 0} productos`
        : "No se pudo bajar"
    );
  });

  document.getElementById("btn-supabase-migrate")?.addEventListener("click", async () => {
    if (!window.SupabaseData?.enabled?.()) {
      toast("Configura Supabase primero.");
      return;
    }
    toast("Subiendo datos locales…");
    const r = await window.SupabaseData.migrateFromLocalStorage();
    if (!r?.ok) {
      toast(r?.message || "Falló la migración");
      return;
    }
    const rep = r.report || {};
    const locales =
      (rep.locales?.citas || 0) + (rep.locales?.clientes || 0) + (rep.locales?.productos || 0);
    if (!locales) {
      toast(
        "Este navegador no tiene datos locales. Ábrelo en localhost (donde ya usabas BarberHome) y pulsa de nuevo."
      );
      return;
    }
    toast(
      `Subido: ${rep.citas || 0} citas, ${rep.clientes || 0} clientes, ${rep.productos || 0} productos`
    );
    if (rep.errores?.length) {
      console.warn("[Supabase migrate]", rep.errores);
      toast(`Error al subir: ${rep.errores[0]}`);
    }
  });

  fillForm();

  async function refreshAuthCard() {
    const label = document.getElementById("auth-session-label");
    const loginBtn = document.getElementById("btn-auth-login");
    const logoutBtn = document.getElementById("btn-auth-logout");
    if (!label) return;
    if (!window.BarberAuth) {
      label.textContent = "Carga auth.js para gestionar la sesión.";
      return;
    }
    const user = await window.BarberAuth.currentUser();
    if (user) {
      label.textContent = `Sesión: ${user.email}`;
      if (loginBtn) loginBtn.hidden = true;
      if (logoutBtn) logoutBtn.hidden = false;
    } else {
      label.textContent = "Sin sesión de barbero en la nube";
      if (loginBtn) loginBtn.hidden = false;
      if (logoutBtn) logoutBtn.hidden = true;
    }
  }
  refreshAuthCard();
  document.getElementById("btn-auth-logout")?.addEventListener("click", async () => {
    if (window.AppShell?.logout) {
      await window.AppShell.logout();
      return;
    }
    await window.BarberAuth?.signOut?.();
    location.href = "login.html";
  });

  const initial = (location.hash || "").replace("#", "");
  if (views[initial]) showView(initial);
  else showView("hub");

  window.addEventListener("hashchange", () => {
    const name = (location.hash || "").replace("#", "") || "hub";
    if (views[name]) showView(name);
  });
})();
