(function () {
  async function initOnboarding() {
    if (/force=1/.test(location.search)) return;
    const user = await window.BarberAuth?.currentUser?.();
    if (user && window.Tenant?.syncWithAuthenticatedUser) {
      const sync = await window.Tenant.syncWithAuthenticatedUser();
      if (!sync?.needsOnboarding && sync?.negocio) {
        location.replace("index.html");
      }
      return;
    }
    if (!window.SupabaseData?.enabled?.() && window.Tenant?.hasExistingBusiness?.()) {
      location.replace("index.html");
    }
  }

  initOnboarding();

  const DAYS = [
    { key: "lun", label: "Lunes", start: "08:00", end: "19:00", enabled: true },
    { key: "mar", label: "Martes", start: "08:00", end: "19:00", enabled: true },
    { key: "mie", label: "Miércoles", start: "08:00", end: "19:00", enabled: true },
    { key: "jue", label: "Jueves", start: "08:00", end: "19:00", enabled: true },
    { key: "vie", label: "Viernes", start: "08:00", end: "19:00", enabled: true },
    { key: "sab", label: "Sábado", start: "08:00", end: "16:00", enabled: true },
    { key: "dom", label: "Domingo", start: "09:00", end: "14:00", enabled: false },
  ];

  const state = {
    business: "",
    owner: "",
    city: "",
    days: DAYS.map((d) => ({ ...d })),
    services: [
      { name: "Corte", duration: 45, price: 25000 },
      { name: "Corte + Barba", duration: 60, price: 35000 },
    ],
    cc: "+57",
    phone: "",
    slug: "",
    description: "",
  };

  const steps = [...document.querySelectorAll("[data-step]")];
  const progress = document.getElementById("ob-progress");
  const backBtn = document.getElementById("ob-back");
  const nextBtn = document.getElementById("ob-next");
  const errorEl = document.getElementById("ob-error");
  let step = 1;
  const TOTAL = 7;

  function showError(msg) {
    errorEl.hidden = !msg;
    errorEl.textContent = msg || "";
  }

  function readStep() {
    state.business = document.getElementById("ob-business")?.value.trim() || "";
    state.owner = document.getElementById("ob-owner")?.value.trim() || "";
    state.city = document.getElementById("ob-city")?.value.trim() || "";
    state.cc = document.getElementById("ob-cc")?.value || "+57";
    state.phone = document.getElementById("ob-phone")?.value.trim() || "";
    state.slug = document.getElementById("ob-slug")?.value.trim() || "";
    state.description = document.getElementById("ob-desc")?.value.trim() || "";
    document.querySelectorAll(".ob-day").forEach((row) => {
      const key = row.getAttribute("data-day");
      const day = state.days.find((d) => d.key === key);
      if (!day) return;
      day.enabled = row.querySelector('input[type="checkbox"]').checked;
      day.start = row.querySelector('[data-start]').value;
      day.end = row.querySelector('[data-end]').value;
    });
    state.services = [...document.querySelectorAll(".ob-service")].map((row) => ({
      name: row.querySelector('[data-sname]').value.trim(),
      duration: Number(row.querySelector('[data-sdur]').value) || 60,
      price: Number(row.querySelector('[data-sprice]').value) || 0,
    }));
  }

  function suggestedSlug() {
    return window.Tenant?.normalizeSlug?.(state.business) || "";
  }

  function validateStep(n) {
    readStep();
    if (n === 1) {
      if (state.business.length < 2) return "Escribe el nombre de tu barbería.";
    }
    if (n === 2) {
      if (!state.days.some((d) => d.enabled)) return "Activa al menos un día.";
    }
    if (n === 3) {
      if (!state.services.some((s) => s.name)) return "Agrega al menos un servicio con nombre.";
    }
    if (n === 4) {
      const digits = state.phone.replace(/\D/g, "");
      if (digits.length < 7) return "Ingresa un WhatsApp válido.";
    }
    if (n === 5) {
      const v = window.Tenant?.validateSlug?.(state.slug || suggestedSlug());
      if (!v?.ok) return v?.message || "Elige un enlace público válido.";
      state.slug = v.slug;
    }
    return "";
  }

  function renderDays() {
    const box = document.getElementById("ob-days");
    box.innerHTML = state.days
      .map(
        (d) => `
        <label class="ob-day" data-day="${d.key}">
          <input type="checkbox" ${d.enabled ? "checked" : ""} />
          <span>${d.label}</span>
          <input type="time" data-start value="${d.start}" />
          <input type="time" data-end value="${d.end}" />
        </label>`
      )
      .join("");
  }

  function renderServices() {
    const box = document.getElementById("ob-services");
    box.innerHTML = state.services
      .map(
        (s, i) => `
        <div class="ob-service">
          <input data-sname type="text" maxlength="60" placeholder="Nombre" value="${escapeHtml(s.name)}" />
          <input data-sdur type="number" min="15" step="15" value="${s.duration}" aria-label="Minutos" />
          <input data-sprice type="number" min="0" step="1000" value="${s.price}" aria-label="Precio" />
          <button type="button" class="btn btn--ghost ob-service-remove" data-remove="${i}" ${
            state.services.length < 2 ? "hidden" : ""
          }>✕</button>
        </div>`
      )
      .join("");
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function syncSlugPreview() {
    readStep();
    const slug = window.Tenant?.normalizeSlug?.(state.slug || suggestedSlug()) || "tu-barberia";
    const live = document.getElementById("ob-slug-live");
    if (live) live.textContent = slug;
    const slugInput = document.getElementById("ob-slug");
    if (slugInput && !slugInput.dataset.touched) slugInput.value = suggestedSlug();
    const link = window.Tenant?.displayLink?.(slug) || `barber-home-cloud.vercel.app/${slug}`;
    const share = document.getElementById("ob-share-link");
    const open = document.getElementById("ob-open");
    const finalLink = document.getElementById("ob-final-link");
    if (share) share.textContent = link;
    if (finalLink) finalLink.textContent = link;
    if (open) open.href = window.Tenant?.publicUrl?.(slug) || `booking.html?s=${encodeURIComponent(slug)}`;
  }

  async function checkSlug() {
    const v = window.Tenant?.validateSlug?.(document.getElementById("ob-slug").value);
    const hint = document.getElementById("ob-slug-hint");
    if (!v?.ok) {
      hint.textContent = v?.message || "";
      hint.className = "field__hint is-err";
      return false;
    }
    const avail = await window.SupabaseData?.slugAvailability?.(v.slug);
    if (avail && avail.ok && avail.available === false) {
      hint.textContent = "Ese enlace ya está tomado. Prueba otro.";
      hint.className = "field__hint is-err";
      return false;
    }
    hint.textContent = window.Tenant?.displayLink?.(v.slug) || "";
    hint.className = "field__hint";
    return true;
  }

  function showStep(n) {
    step = n;
    steps.forEach((el) => {
      el.hidden = Number(el.dataset.step) !== n;
    });
    progress.style.width = `${(n / TOTAL) * 100}%`;
    backBtn.hidden = n === 1 || n === 7;
    nextBtn.textContent = n === 6 ? "Terminar" : n === 7 ? "Ir al panel" : "Siguiente";
    showError("");
    if (n === 2) renderDays();
    if (n === 3) renderServices();
    if (n >= 5) syncSlugPreview();
  }

  function buildAutoagenda() {
    const slug = window.Tenant.validateSlug(state.slug || suggestedSlug()).slug;
    const days = {};
    state.days.forEach((d) => {
      days[d.key] = { enabled: d.enabled, start: d.start, end: d.end };
    });
    const services = state.services
      .filter((s) => s.name)
      .map((s, i) => ({
        id: `type-${i + 1}`,
        name: s.name,
        duration: s.duration,
        price: s.price,
        scheduleId: "sch-default",
      }));
    return {
      slug,
      title: state.business,
      description:
        state.description ||
        `Reserva con ${state.business}${state.city ? ` en ${state.city}` : ""}.`,
      avatarDataUrl: "",
      schedules: [
        {
          id: "sch-default",
          name: "Horario principal",
          days,
        },
      ],
      appointmentTypes: services,
    };
  }

  async function finish() {
    readStep();
    const err = validateStep(5);
    if (err) {
      showError(err);
      showStep(5);
      return;
    }
    const slugOk = await checkSlug();
    if (!slugOk) {
      showStep(5);
      return;
    }
    const auto = buildAutoagenda();
    localStorage.setItem("barbercloud.autoagenda", JSON.stringify(auto));
    const settings = {
      name: state.owner || state.business,
      waPhone: `${state.cc} ${state.phone}`.trim(),
      waConnected: true,
      lang: "es",
    };
    try {
      const prev = JSON.parse(localStorage.getItem("barbercloud_settings") || "{}");
      localStorage.setItem("barbercloud_settings", JSON.stringify({ ...prev, ...settings }));
    } catch {
      localStorage.setItem("barbercloud_settings", JSON.stringify(settings));
    }
    window.Tenant.markOnboarded();
    const user = await window.BarberAuth?.currentUser?.();
    // En la nube el estado real lo fija el webhook de Wompi: nace sin pagar.
    const subStatus = user ? "incomplete" : "trialing";
    localStorage.setItem(
      "barbercloud.subscription",
      JSON.stringify({
        planId: "100",
        status: subStatus,
        cancelAtPeriodEnd: false,
        payment: { provider: "pending" },
      })
    );
    if (window.SupabaseData?.enabled?.()) {
      const payload = {
        slug: auto.slug,
        name: auto.title,
        owner_id: user?.id || undefined,
        subscription_status: subStatus,
        plan_id: "100",
        autoagenda: auto,
        whatsapp: settings.waPhone,
        onboarding_completed: true,
      };
      const own = await window.SupabaseData.fetchOwnNegocio?.();
      if (own?.id && own.owner_id === user?.id) payload.id = own.id;
      const r = await window.SupabaseData.upsertNegocio(payload);
      if (!r.ok && r.message) console.warn("[onboarding] negocio", r.message);
    }
    syncSlugPreview();
    const hint = document.getElementById("ob-cloud-hint");
    if (hint && user) hint.hidden = true;
    showStep(7);
  }

  document.getElementById("ob-add-service")?.addEventListener("click", () => {
    readStep();
    state.services.push({ name: "", duration: 45, price: 0 });
    renderServices();
  });
  document.getElementById("ob-services")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-remove]");
    if (!btn) return;
    readStep();
    const idx = Number(btn.getAttribute("data-remove"));
    state.services.splice(idx, 1);
    if (!state.services.length) state.services.push({ name: "Corte", duration: 45, price: 0 });
    renderServices();
  });
  document.getElementById("ob-slug")?.addEventListener("input", () => {
    document.getElementById("ob-slug").dataset.touched = "1";
    syncSlugPreview();
  });
  document.getElementById("ob-business")?.addEventListener("input", syncSlugPreview);
  document.getElementById("ob-copy")?.addEventListener("click", async () => {
    syncSlugPreview();
    const text = document.getElementById("ob-share-link")?.textContent || "";
    try {
      await navigator.clipboard.writeText(
        window.Tenant?.publicUrl?.(state.slug || suggestedSlug()) || text
      );
      nextBtn.focus();
    } catch {
      /* ignore */
    }
  });

  backBtn.addEventListener("click", () => showStep(Math.max(1, step - 1)));
  nextBtn.addEventListener("click", async () => {
    if (step === 7) {
      const user = await window.BarberAuth?.currentUser?.();
      if (user && !window.Tenant?.hasActiveSubscription?.()) {
        location.href = "suscripcion.html?need=1";
        return;
      }
      location.href = "index.html";
      return;
    }
    if (step < 6) {
      const err = validateStep(step);
      if (err) {
        showError(err);
        return;
      }
      if (step === 5) {
        const ok = await checkSlug();
        if (!ok) return;
      }
      showStep(step + 1);
      return;
    }
    nextBtn.disabled = true;
    await finish();
    nextBtn.disabled = false;
  });

  renderDays();
  renderServices();
  showStep(1);
})();
