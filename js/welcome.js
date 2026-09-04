/**
 * Bienvenida guiada tras activar acceso (trial de 7 días o membresía pagada).
 *
 * Orden post-registro / post-pago:
 * 1. Login/registro (landing «Empieza gratis» o «Elegir plan»)
 * 2. Trial automático o pago Wompi en suscripcion.html
 * 3. Wizard (este archivo): intro → preguntas → WhatsApp → cita de prueba
 * 4. Tour calendario (6 coachmarks)
 * 5. Outro: «¡Listo!» → Ir al panel
 * 6. Dashboard Inicio con formularios vacíos → Autoagenda
 */
(function () {
  const STORAGE_KEY = "gestionweb.welcome";
  const AUTH_KEY = "gestionweb.auth";

  function userFromAuthStorage() {
    try {
      const data = JSON.parse(localStorage.getItem(AUTH_KEY) || "{}");
      return data?.user || data?.currentSession?.user || data?.session?.user || null;
    } catch {
      return null;
    }
  }

  function currentUserId() {
    return String(userFromAuthStorage()?.id || "").trim();
  }

  function storageKey() {
    const id = currentUserId();
    return id ? `${STORAGE_KEY}.${id}` : STORAGE_KEY;
  }

  function metadataCompleted(user) {
    const meta = user?.user_metadata || {};
    return meta.welcome_tour_completed === true || !!meta.welcome_tour_completed_at;
  }

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(storageKey()) || "null");
      if (raw && typeof raw === "object") return raw;
    } catch {
      /* ignore */
    }
    try {
      const legacy = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return legacy && typeof legacy === "object" ? legacy : {};
    } catch {
      return {};
    }
  }

  function save(patch) {
    try {
      const next = { ...load(), ...patch };
      localStorage.setItem(storageKey(), JSON.stringify(next));
      const id = currentUserId();
      if (id && next.seen) localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }

  async function persistCompleted() {
    const completedAt = new Date().toISOString();
    save({ seen: true, stage: "done", completedAt });
    try {
      const client = window.SupabaseClient?.getClient?.();
      if (!client) return;
      await client.auth.updateUser({
        data: {
          welcome_tour_completed: true,
          welcome_tour_completed_at: completedAt,
        },
      });
    } catch (err) {
      console.warn("[welcome] no se pudo guardar el recorrido en la cuenta", err);
    }
  }

  const STEPS = [
    { id: "intro", kind: "intro" },
    {
      id: "dailyVolume",
      kind: "choice",
      question: "¿Cuántas citas gestionas al día?",
      note: "Puedes usar Gestiónweb.app para confirmar citas presenciales, reuniones virtuales, clases, enviar recordatorios y más.",
      options: [
        { id: "1-15", label: "Entre 1 y 15" },
        { id: "16-40", label: "Entre 16 y 40" },
        { id: "40+", label: "Más de 40" },
      ],
    },
    {
      id: "calendarSource",
      kind: "choice",
      question: "¿Dónde llevas tu agenda ahora?",
      options: [
        {
          id: "google",
          icon: "google",
          label: "En Google Calendar",
          desc: "Sincronizaremos Gestiónweb.app con tu Google Calendar existente.",
        },
        {
          id: "otra-app",
          icon: "grid",
          label: "En otra app",
          desc: "Cuéntanos cuál usas y te ayudamos con la transición.",
        },
        {
          id: "papel",
          icon: "notebook",
          label: "En una agenda de papel",
          desc: "Te crearemos un calendario dentro de Gestiónweb.app.",
        },
        {
          id: "ninguna",
          icon: "question",
          label: "Todavía no tengo una agenda",
          desc: "Sin problema, te ayudamos a empezar desde cero.",
        },
      ],
    },
    {
      id: "testBooking",
      kind: "phone",
      question: "¿Listo para crear tu primera cita de prueba?",
      fieldLabel: "¿Cuál es tu WhatsApp?",
      placeholder: "Número de WhatsApp",
      hint: "Te enviaremos un mensaje de prueba a este número.",
      cta: "Crear cita y enviar",
    },
    { id: "done", kind: "outro" },
  ];

  const COUNTRY_CODES = [
    { code: "+57", flag: "🇨🇴" },
    { code: "+1", flag: "🇺🇸" },
    { code: "+52", flag: "🇲🇽" },
    { code: "+54", flag: "🇦🇷" },
    { code: "+51", flag: "🇵🇪" },
    { code: "+56", flag: "🇨🇱" },
  ];

  function hasAuthSession() {
    try {
      const raw = localStorage.getItem(AUTH_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      return !!(data?.access_token || data?.currentSession?.access_token || data?.user);
    } catch {
      return false;
    }
  }

  /** Solo la primera vez de esa cuenta: local por usuario + user_metadata en Supabase. */
  async function pending() {
    if (!hasAuthSession()) return false;
    if (load().seen) return false;

    const stored = userFromAuthStorage();
    if (metadataCompleted(stored)) {
      save({ seen: true, completedAt: stored.user_metadata?.welcome_tour_completed_at });
      return false;
    }

    try {
      const client = window.SupabaseClient?.getClient?.();
      const { data } = client ? await client.auth.getUser() : { data: null };
      if (metadataCompleted(data?.user)) {
        save({
          seen: true,
          completedAt: data.user.user_metadata?.welcome_tour_completed_at,
        });
        return false;
      }
    } catch {
      /* si falla la red, usa solo el storage local */
    }

    if (window.Tenant?.hasActiveSubscription?.()) return true;
    return !!window.Billing?.isActive?.(window.Billing.cached?.());
  }

  function currentPage() {
    return (location.pathname.split("/").pop() || "index.html").toLowerCase();
  }

  function isPanelPage() {
    const page = currentPage();
    return page === "" || page === "index.html";
  }

  function isCalendarPage() {
    return currentPage() === "calendario.html";
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(
      /[&<>"']/g,
      (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]
    );
  }

  function publicLink() {
    try {
      const auto = JSON.parse(localStorage.getItem("gestionweb.autoagenda") || "{}");
      const slug = auto?.slug || window.Tenant?.cached?.()?.slug || "";
      if (!slug || !window.Tenant?.validateSlug?.(slug)?.ok) return "";
      return window.Tenant.displayLink(slug);
    } catch {
      return "";
    }
  }

  const WHATSAPP_PATH =
    "M12 2.1A9.9 9.9 0 0 0 3.3 17L2 22l5.2-1.3A9.9 9.9 0 1 0 12 2.1Zm5.5 14.1c-.2.7-1.3 1.2-2.1 1.4-.6.1-1.3.2-3.7-.8-3.1-1.3-5.1-4.5-5.2-4.7-.2-.2-1.2-1.6-1.2-3.1 0-1.4.8-2.2 1.1-2.4.3-.3.7-.3.9-.3h.7c.2 0 .5-.1.7.6.3.8.9 2.1 1 2.3.1.1.1.3 0 .5l-.5.7c-.1.2-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.3 2.4 1.5.3.1.5.1.7-.1l.9-1.1c.2-.2.4-.2.7-.1l2.1 1c.3.1.4.3.4.4 0 .3 0 1.4-.3 2.1Z";

  function whatsappGlyph(size, opacity) {
    return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" style="opacity:${opacity}" aria-hidden="true">
        <path fill="#25d366" d="${WHATSAPP_PATH}" />
      </svg>`;
  }

  function introHtml() {
    return `
      <div class="welcome-icons" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="40" height="40" fill="none">
          <rect x="5" y="2.4" width="14" height="19.2" rx="3.2" stroke="#1f2937" stroke-width="1.6" />
          <path d="M10 18.6h4" stroke="#1f2937" stroke-width="1.6" stroke-linecap="round" />
          <circle cx="17" cy="7.6" r="4.4" fill="#25d366" />
          <path d="m15.1 7.7 1.3 1.3 2.4-2.5" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        ${whatsappGlyph(30, 1)}
        ${whatsappGlyph(30, 0.55)}
        ${whatsappGlyph(30, 0.22)}
        <svg viewBox="0 0 24 24" width="32" height="32" aria-hidden="true">
          <circle cx="12" cy="7.3" r="3.8" fill="#1f2937" />
          <path d="M4.6 21c.9-4.2 3.8-6.4 7.4-6.4s6.5 2.2 7.4 6.4H4.6Z" fill="#1f2937" />
        </svg>
      </div>
      <h2 id="welcome-title">¡Bienvenido a Gestiónweb.app!</h2>
      <p class="welcome-lead">Automatiza la gestión de citas por WhatsApp y ahorra cientos de horas.</p>
      <p class="welcome-lead">Vamos a configurarlo en menos de 2 minutos.</p>`;
  }

  const OPTION_ICONS = {
    google: `<svg viewBox="0 0 48 48" width="22" height="22" aria-hidden="true">
        <path fill="#EA4335" d="M24 9.5c3.54 0 5.71 1.52 7.03 2.79l5.13-5.01C33.64 4.51 29.28 3 24 3 14.82 3 6.73 8.48 3.45 16.97l6.02 4.67C10.9 14.56 16.92 9.5 24 9.5z"/>
        <path fill="#4285F4" d="M46.5 24.5c0-1.64-.15-3.22-.42-4.74H24v9.01h12.67c-.55 2.95-2.21 5.45-4.71 7.13l7.3 5.66C43.98 37.13 46.5 31.28 46.5 24.5z"/>
        <path fill="#FBBC05" d="M10.47 28.09a14.5 14.5 0 0 1 0-8.18l-6.02-4.67a23.93 23.93 0 0 0 0 21.52l6.02-4.67z"/>
        <path fill="#34A853" d="M24 45c5.28 0 9.72-1.74 12.96-4.74l-7.3-5.66c-2.03 1.36-4.63 2.17-5.66 2.17-7.08 0-13.1-4.78-15.26-11.23l-6.02 4.67C6.73 39.52 14.82 45 24 45z"/>
      </svg>`,
    grid: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true">
        <rect x="3.5" y="3.5" width="17" height="17" rx="2.5" stroke="currentColor" stroke-width="1.6"/>
        <path d="M3.5 9h17M3.5 15h17M9 3.5v17M15 3.5v17" stroke="currentColor" stroke-width="1.3"/>
      </svg>`,
    notebook: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true">
        <rect x="6" y="3.5" width="13" height="17" rx="2.2" stroke="currentColor" stroke-width="1.6"/>
        <path d="M10 3.5v17" stroke="currentColor" stroke-width="1.3"/>
        <path d="M4.6 7.5h3M4.6 12h3M4.6 16.5h3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
      </svg>`,
    question: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="8.6" stroke="currentColor" stroke-width="1.6"/>
        <path d="M9.9 9.4a2.2 2.2 0 1 1 3.4 1.8c-.8.5-1.2 1-1.2 1.8M12 16.6h.01" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
      </svg>`,
  };

  function optionBodyHtml(option) {
    if (!option.icon && !option.desc) return escapeHtml(option.label);
    const icon = OPTION_ICONS[option.icon] || "";
    return `
      ${icon ? `<span class="welcome-choice__icon">${icon}</span>` : ""}
      <span class="welcome-choice__text">
        <strong>${escapeHtml(option.label)}</strong>
        ${option.desc ? `<small>${escapeHtml(option.desc)}</small>` : ""}
      </span>`;
  }

  function choiceHtml(step, answer) {
    const options = step.options
      .map(
        (option) => `
        <button
          type="button"
          class="welcome-choice${option.id === answer ? " is-selected" : ""}"
          data-option="${escapeHtml(option.id)}"
          aria-pressed="${option.id === answer ? "true" : "false"}"
        >${optionBodyHtml(option)}</button>`
      )
      .join("");

    return `
      <h2 id="welcome-title" class="welcome-question">${escapeHtml(step.question)}</h2>
      <div class="welcome-choices" role="group" aria-labelledby="welcome-title">${options}</div>
      ${
        step.note
          ? `<p class="welcome-note"><span aria-hidden="true">*</span> ${escapeHtml(step.note)}</p>`
          : ""
      }`;
  }

  function savedPhone() {
    try {
      const settings = JSON.parse(localStorage.getItem("gestionweb_settings") || "{}");
      const raw = String(settings.waPhone || "").trim();
      const match = raw.match(/^(\+\d{1,3})\s*(.*)$/);
      if (match) return { cc: match[1], number: match[2].trim() };
      return { cc: "+57", number: raw };
    } catch {
      return { cc: "+57", number: "" };
    }
  }

  /** Mismo destino que usa el onboarding para el WhatsApp del negocio. */
  function saveWhatsAppSetting(display) {
    try {
      const prev = JSON.parse(localStorage.getItem("gestionweb_settings") || "{}");
      localStorage.setItem(
        "gestionweb_settings",
        JSON.stringify({ ...prev, waPhone: display, waConnected: true })
      );
    } catch {
      /* ignore */
    }
  }

  function phoneHtml(step) {
    const saved = savedPhone();
    const options = COUNTRY_CODES.map(
      (c) =>
        `<option value="${c.code}"${c.code === saved.cc ? " selected" : ""}>${c.flag} ${c.code}</option>`
    ).join("");

    return `
      <h2 id="welcome-title" class="welcome-question">${escapeHtml(step.question)}</h2>
      <label class="field welcome-field">
        <span class="field__label">${escapeHtml(step.fieldLabel)}</span>
        <div class="phone-input">
          <select class="phone-input__select" id="welcome-cc" aria-label="Código de país">${options}</select>
          <input
            id="welcome-phone"
            type="tel"
            inputmode="tel"
            autocomplete="tel"
            maxlength="20"
            placeholder="${escapeHtml(step.placeholder)}"
            value="${escapeHtml(saved.number)}"
          />
        </div>
        <span class="welcome-hint">${escapeHtml(step.hint)}</span>
      </label>
      <p class="auth-error welcome-error" hidden></p>`;
  }

  function businessName() {
    return window.Tenant?.cached?.()?.name || "tu negocio";
  }

  function formatWhen(date, time) {
    const d = new Date(`${date}T${String(time).length === 5 ? time : `${time}:00`}`);
    if (Number.isNaN(d.getTime())) return `${date} ${time}`;
    const day = d.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" });
    return `${day} a las ${time}`;
  }

  /** Primer hueco libre de mañana para no chocar con la agenda real. */
  function nextFreeSlot() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const date = [
      tomorrow.getFullYear(),
      String(tomorrow.getMonth() + 1).padStart(2, "0"),
      String(tomorrow.getDate()).padStart(2, "0"),
    ].join("-");

    for (let hour = 9; hour <= 19; hour += 1) {
      const time = `${String(hour).padStart(2, "0")}:00`;
      if (window.BookingStore?.isSlotFree?.(date, time, 30) !== false) {
        return { date, time };
      }
    }
    return { date, time: "09:00" };
  }

  function outroStarsHtml() {
    return `
      <div class="welcome-outro-stars" aria-hidden="true">
        <span class="welcome-outro-star welcome-outro-star--left">
          <svg viewBox="0 0 56 56" width="56" height="56" aria-hidden="true">
            <path fill="#22c55e" d="M28 6l6.2 12.6L48 20.4 35.8 30.8l3.6 13.6L28 38.4l-11.4 6 3.6-13.6L8 20.4l13.8-1.8L28 6z"/>
            <circle cx="22" cy="26" r="2" fill="#14532d"/>
            <circle cx="34" cy="26" r="2" fill="#14532d"/>
            <path d="M22 32.5c2.2 2.2 9.8 2.2 12 0" stroke="#14532d" stroke-width="1.8" stroke-linecap="round" fill="none"/>
          </svg>
        </span>
        <span class="welcome-outro-star welcome-outro-star--center">
          <svg viewBox="0 0 72 72" width="72" height="72" aria-hidden="true">
            <defs>
              <linearGradient id="welcome-outro-star-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#f472b6"/>
                <stop offset="100%" stop-color="#fb923c"/>
              </linearGradient>
            </defs>
            <path fill="url(#welcome-outro-star-grad)" d="M36 4l8.8 17.8L64 24.8l-14.4 10.6L53.6 58 36 48.6 18.4 58l3.6-22.6L8 24.8l19.2-3L36 4z"/>
            <path d="m26 36.5 6.2 6.2L46 28.9" stroke="#0f172a" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
          </svg>
        </span>
        <span class="welcome-outro-star welcome-outro-star--right">
          <svg viewBox="0 0 56 56" width="56" height="56" aria-hidden="true">
            <path fill="#3b82f6" d="M28 6l6.2 12.6L48 20.4 35.8 30.8l3.6 13.6L28 38.4l-11.4 6 3.6-13.6L8 20.4l13.8-1.8L28 6z"/>
            <circle cx="22" cy="25" r="2" fill="#1e3a8a"/>
            <circle cx="34" cy="25" r="2" fill="#1e3a8a"/>
            <path d="M22 31.5c2.2 3 9.8 3 12 0" stroke="#1e3a8a" stroke-width="1.8" stroke-linecap="round" fill="none"/>
          </svg>
        </span>
      </div>`;
  }

  function outroHtml() {
    const link = publicLink();
    const linkBlock = link
      ? `<p class="welcome-outro__link">Tu enlace de reservas: <strong>${escapeHtml(link)}</strong></p>`
      : `<p class="welcome-outro__link">En Autoagenda podrás personalizar el enlace que compartirás con tus clientes.</p>`;
    return `
      ${outroStarsHtml()}
      <h2 id="welcome-title" class="welcome-outro__title">¡Listo! Ya tienes todo para empezar</h2>
      <p class="welcome-outro__lead">Tu membresía está activa. Gestiónweb.app se encargará de confirmar tus citas por WhatsApp.</p>
      ${linkBlock}`;
  }

  function open(options = {}) {
    const state = load();
    const answers = { ...(state.answers || {}) };
    let index = Math.max(
      0,
      STEPS.findIndex((step) => step.id === options.startAt)
    );

    const overlay = document.createElement("div");
    overlay.className = "welcome-overlay";
    overlay.id = "welcome-overlay";
    overlay.innerHTML = `
      <div class="welcome-card" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
        <div class="welcome-card__body"></div>
        <div class="welcome-actions">
          <button class="btn btn--secondary welcome-back" type="button" hidden>Atrás</button>
          <button class="btn btn--primary welcome-next" type="button">Siguiente</button>
        </div>
      </div>`;

    const card = overlay.querySelector(".welcome-card");
    const body = overlay.querySelector(".welcome-card__body");
    const backBtn = overlay.querySelector(".welcome-back");
    const nextBtn = overlay.querySelector(".welcome-next");

    let testBooking = state.testBooking || null;
    let waFallbackUrl = state.waUrl || "";

    async function close() {
      await persistCompleted();
      save({ pendingAutoagenda: true, answers });
      document.body.classList.remove("welcome-open");
      overlay.remove();
      location.assign("index.html");
    }

    function phoneFields() {
      return {
        cc: body.querySelector("#welcome-cc"),
        number: body.querySelector("#welcome-phone"),
      };
    }

    function typedPhone() {
      const { cc, number } = phoneFields();
      if (!cc || !number) return { display: "", digits: "" };
      const display = `${cc.value} ${number.value.trim()}`.trim();
      const digits =
        window.Security?.sanitizeWhatsAppPhone?.(display) ||
        (() => {
          const only = display.replace(/\D/g, "");
          return only.length >= 7 && only.length <= 15 ? only : "";
        })();
      return { display, digits };
    }

    function showError(message) {
      const box = body.querySelector(".welcome-error");
      if (!box) return;
      box.textContent = message || "";
      box.hidden = !message;
    }

    function render() {
      const step = STEPS[index];
      const answer = answers[step.id];

      const isOutro = step.kind === "outro";
      card.classList.toggle("welcome-card--center", step.kind === "intro" || isOutro);
      card.classList.toggle("welcome-outro--dark", isOutro);
      overlay.classList.toggle("welcome-overlay--outro", isOutro);

      if (step.kind === "intro") body.innerHTML = introHtml();
      else if (isOutro) body.innerHTML = outroHtml();
      else if (step.kind === "phone") body.innerHTML = phoneHtml(step);
      else body.innerHTML = choiceHtml(step, answer);

      backBtn.hidden = index === 0 || isOutro;
      const isLast = index === STEPS.length - 1;
      nextBtn.textContent = isLast ? "Ir al panel" : step.cta || "Siguiente";
      nextBtn.classList.toggle("welcome-outro__btn", isOutro);

      if (step.kind === "choice") nextBtn.disabled = !answer;
      else if (step.kind === "phone") nextBtn.disabled = !typedPhone().digits;
      else nextBtn.disabled = false;

      if (step.kind === "phone") phoneFields().number?.focus();
      else nextBtn.focus();
    }

    /** Crea la cita de prueba y abre WhatsApp con el mensaje ya escrito. */
    async function sendTestBooking() {
      const { display, digits } = typedPhone();
      if (!digits) {
        showError("Escribe un número de WhatsApp válido.");
        return false;
      }

      showError("");
      answers.testBooking = display;
      saveWhatsAppSetting(display);

      const slot = nextFreeSlot();
      const label = nextBtn.textContent;
      nextBtn.disabled = true;
      nextBtn.textContent = "Creando…";

      let result = null;
      try {
        result = await window.BookingStore?.bookAtomically?.({
          name: "Cita de prueba",
          phone: display,
          date: slot.date,
          time: slot.time,
          duration: 30,
          serviceName: "Cita de prueba",
          status: "pending_confirmation",
          source: "admin",
          notes: "Creada desde la bienvenida de Gestiónweb.app.",
        });
      } catch (err) {
        console.warn("[welcome] cita de prueba", err);
      }

      if (result && result.ok === false) {
        showError(result.message || "No se pudo crear la cita de prueba.");
        nextBtn.disabled = false;
        nextBtn.textContent = label;
        return false;
      }

      const created = result?.booking;
      testBooking = created
        ? { id: created.id, date: created.date, time: created.time }
        : null;

      const message = `Hola, soy ${businessName()}. Esta es una cita de prueba para el ${formatWhen(
        slot.date,
        slot.time
      )}. Responde CONFIRMAR para probar la confirmación automática por WhatsApp.`;
      const url =
        window.Security?.buildWhatsAppUrl?.(digits, message) ||
        `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;

      const opened = window.open(url, "_blank", "noopener");
      waFallbackUrl = opened ? "" : url;

      save({ answers, testBooking, waUrl: waFallbackUrl });
      return true;
    }

    async function goNext() {
      const step = STEPS[index];
      if (step.kind === "phone") {
        if (!(await sendTestBooking())) return;
        // La cita creada se enseña con globos sobre el calendario.
        if (testBooking?.id) {
          save({ stage: "coachmark" });
          if (!isCalendarPage()) {
            location.assign("calendario.html");
            return;
          }
          overlay.remove();
          document.body.classList.remove("welcome-open");
          runCoachmark("coachmark");
          return;
        }
      }
      if (index >= STEPS.length - 1) {
        close();
        return;
      }
      index += 1;
      render();
    }

    body.addEventListener("click", (event) => {
      const button = event.target.closest("[data-option]");
      if (!button) return;
      const step = STEPS[index];
      answers[step.id] = button.getAttribute("data-option");
      save({ answers });
      body.querySelectorAll("[data-option]").forEach((el) => {
        const selected = el === button;
        el.classList.toggle("is-selected", selected);
        el.setAttribute("aria-pressed", selected ? "true" : "false");
      });
      nextBtn.disabled = false;
    });

    body.addEventListener("input", (event) => {
      if (!event.target.closest("#welcome-phone, #welcome-cc")) return;
      showError("");
      nextBtn.disabled = !typedPhone().digits;
    });

    body.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || !event.target.closest("#welcome-phone")) return;
      event.preventDefault();
      if (!nextBtn.disabled) goNext();
    });

    nextBtn.addEventListener("click", () => {
      goNext();
    });

    backBtn.addEventListener("click", () => {
      if (index === 0) return;
      index -= 1;
      render();
    });

    document.body.appendChild(overlay);
    document.body.classList.add("welcome-open");
    render();
  }

  function selectorFor(id) {
    const value = window.CSS?.escape ? CSS.escape(id) : String(id).replace(/["\\]/g, "\\$&");
    return `.gcal__event[data-booking-id="${value}"]`;
  }

  /** El calendario se pinta de forma asíncrona, así que esperamos a la cita. */
  function waitForEvent(id, timeoutMs = 6000) {
    return new Promise((resolve) => {
      const deadline = Date.now() + timeoutMs;
      const tick = () => {
        const el = document.querySelector(selectorFor(id));
        if (el) return resolve(el);
        if (Date.now() >= deadline) return resolve(null);
        setTimeout(tick, 150);
      };
      tick();
    });
  }

  const COACHMARK_STAGES = [
    "coachmark",
    "coachmark-wa",
    "coachmark-pending",
    "coachmark-confirmed",
    "coachmark-cancelled",
    "coachmark-try",
  ];

  function coachmarkStatusForStage(stage) {
    const statusByStage = {
      "coachmark-confirmed": "confirmed",
      "coachmark-cancelled": "cancelled",
      "coachmark-pending": "pending_confirmation",
      "coachmark-try": "pending_confirmation",
    };
    return statusByStage[stage] || "pending_confirmation";
  }

  function userWhatsAppDisplay() {
    const state = load();
    if (state.answers?.testBooking) return state.answers.testBooking;
    const saved = savedPhone();
    return `${saved.cc} ${saved.number}`.trim();
  }

  function nextCoachmarkStage(stage) {
    const index = COACHMARK_STAGES.indexOf(stage);
    return index >= 0 && index < COACHMARK_STAGES.length - 1
      ? COACHMARK_STAGES[index + 1]
      : null;
  }

  function prevCoachmarkStage(stage) {
    const index = COACHMARK_STAGES.indexOf(stage);
    return index > 0 ? COACHMARK_STAGES[index - 1] : null;
  }

  function coachmarkPopHtml(stage) {
    if (stage === "coachmark-wa") {
      return `
        <span class="welcome-coach__arrow" aria-hidden="true"></span>
        <div class="welcome-coach__head">
          <span class="welcome-coach__wa-icon" aria-hidden="true">${whatsappGlyph(28, 1)}</span>
          <h3 class="welcome-coach__title" id="welcome-coach-text">¡WhatsApp enviado automáticamente!</h3>
        </div>
        <p class="welcome-coach__desc">
          ¡Magia! <span aria-hidden="true">✨</span> Luego de crear la cita, Gestiónweb.app le envió un mensaje a tu cliente para confirmar.
        </p>
        <div class="welcome-coach__actions welcome-coach__actions--split">
          <button class="btn btn--secondary welcome-coach__back" type="button">Atrás</button>
          <button class="btn btn--primary welcome-coach__next" type="button">Siguiente</button>
        </div>`;
    }

    if (stage === "coachmark-pending") {
      return `
        <span class="welcome-coach__arrow" aria-hidden="true"></span>
        <div class="welcome-coach__head">
          <span class="welcome-coach__pending-icon" aria-hidden="true"></span>
          <h3 class="welcome-coach__title" id="welcome-coach-text">Amarillo significa &lsquo;Esperando respuesta&rsquo;</h3>
        </div>
        <p class="welcome-coach__desc">
          Al enviarse el mensaje, la cita cambia a amarillo automáticamente. Así sabes de un vistazo que estamos esperando que tu cliente confirme.
        </p>
        <div class="welcome-coach__actions welcome-coach__actions--split">
          <button class="btn btn--secondary welcome-coach__back" type="button">Atrás</button>
          <button class="btn btn--primary welcome-coach__next" type="button">Siguiente</button>
        </div>`;
    }

    if (stage === "coachmark-confirmed") {
      return `
        <span class="welcome-coach__arrow" aria-hidden="true"></span>
        <div class="welcome-coach__head">
          <span class="welcome-coach__confirmed-icon" aria-hidden="true"></span>
          <h3 class="welcome-coach__title" id="welcome-coach-text">Verde significa &lsquo;Confirmado&rsquo;</h3>
        </div>
        <p class="welcome-coach__desc">
          Cuando tu cliente responde &ldquo;<strong>Sí</strong>&rdquo; en WhatsApp, Gestiónweb.app detecta la respuesta y marca la cita en verde automáticamente.
        </p>
        <div class="welcome-coach__actions welcome-coach__actions--split">
          <button class="btn btn--secondary welcome-coach__back" type="button">Atrás</button>
          <button class="btn btn--primary welcome-coach__next" type="button">Siguiente</button>
        </div>`;
    }

    if (stage === "coachmark-cancelled") {
      return `
        <span class="welcome-coach__arrow" aria-hidden="true"></span>
        <div class="welcome-coach__head">
          <span class="welcome-coach__cancelled-icon" aria-hidden="true"></span>
          <h3 class="welcome-coach__title" id="welcome-coach-text">Rojo significa &lsquo;Cancelado&rsquo;</h3>
        </div>
        <p class="welcome-coach__desc">
          Si tu cliente responde &ldquo;<strong>No</strong>&rdquo;, la cita se pone roja para que sepas que tu cliente canceló.
        </p>
        <div class="welcome-coach__actions welcome-coach__actions--split">
          <button class="btn btn--secondary welcome-coach__back" type="button">Atrás</button>
          <button class="btn btn--primary welcome-coach__next" type="button">Siguiente</button>
        </div>`;
    }

    if (stage === "coachmark-try") {
      const phone = escapeHtml(userWhatsAppDisplay());
      return `
        <span class="welcome-coach__arrow" aria-hidden="true"></span>
        <div class="welcome-coach__head">
          <span class="welcome-coach__try-icon" aria-hidden="true">📱</span>
          <h3 class="welcome-coach__title" id="welcome-coach-text">Haz la prueba ahora</h3>
        </div>
        <p class="welcome-coach__desc">
          Abre tu WhatsApp (<strong>${phone}</strong>) y responde &ldquo;<strong>Sí</strong>&rdquo; para confirmar esta cita de ejemplo y ponerla en verde <span aria-hidden="true">🟢</span>.
        </p>
        <div class="welcome-coach__actions welcome-coach__actions--split">
          <button class="btn btn--secondary welcome-coach__back" type="button">Atrás</button>
          <button class="btn btn--primary welcome-coach__next" type="button">Siguiente</button>
        </div>`;
    }

    return `
      <span class="welcome-coach__arrow" aria-hidden="true"></span>
      <p class="welcome-coach__text" id="welcome-coach-text">
        <span aria-hidden="true">🎉</span> Creamos esta cita para mostrarte la magia de Gestiónweb.app.
      </p>
      <div class="welcome-coach__actions">
        <button class="btn btn--primary welcome-coach__next" type="button">Siguiente</button>
      </div>`;
  }

  function openCoachmark(target, initialStage, onComplete) {
    let stage = COACHMARK_STAGES.includes(initialStage) ? initialStage : "coachmark";
    const bookingId = load().testBooking?.id;
    let targetEl = target;

    const layer = document.createElement("div");
    layer.className = "welcome-coach";
    layer.id = "welcome-coach";
    layer.innerHTML = `
      <div class="welcome-coach__dim"></div>
      <div class="welcome-coach__pop" role="dialog" aria-modal="true" aria-labelledby="welcome-coach-text"></div>`;

    const pop = layer.querySelector(".welcome-coach__pop");
    const MARGIN = 12;
    const GAP = 14;

    function bindTarget(el) {
      if (!el) return;
      if (targetEl && targetEl !== el) targetEl.classList.remove("welcome-target");
      targetEl = el;
      targetEl.classList.add("welcome-target");
    }

    async function applyStageVisuals() {
      if (!bookingId || !window.BookingStore?.patchBooking) return;
      window.BookingStore.patchBooking(bookingId, {
        status: coachmarkStatusForStage(stage),
      });
      const el = await waitForEvent(bookingId, 2000);
      if (el) bindTarget(el);
    }

    function place() {
      if (!targetEl) return;
      const rect = targetEl.getBoundingClientRect();
      const width = pop.offsetWidth;
      const height = pop.offsetHeight;

      let below = true;
      let top = rect.bottom + GAP;
      if (top + height + MARGIN > window.innerHeight) {
        const above = rect.top - GAP - height;
        if (above >= MARGIN) {
          top = above;
          below = false;
        } else {
          top = Math.max(MARGIN, window.innerHeight - height - MARGIN);
        }
      }

      const centerX = rect.left + rect.width / 2;
      const left = Math.min(
        Math.max(centerX - width / 2, MARGIN),
        Math.max(window.innerWidth - width - MARGIN, MARGIN)
      );

      pop.classList.toggle("welcome-coach__pop--below", below);
      pop.classList.toggle("welcome-coach__pop--wa", stage === "coachmark-wa");
      pop.classList.toggle("welcome-coach__pop--pending", stage === "coachmark-pending");
      pop.classList.toggle("welcome-coach__pop--confirmed", stage === "coachmark-confirmed");
      pop.classList.toggle("welcome-coach__pop--cancelled", stage === "coachmark-cancelled");
      pop.classList.toggle("welcome-coach__pop--try", stage === "coachmark-try");
      pop.style.top = `${Math.round(top)}px`;
      pop.style.left = `${Math.round(left)}px`;

      const arrow = pop.querySelector(".welcome-coach__arrow");
      if (arrow) {
        arrow.style.left = `${Math.round(
          Math.min(Math.max(centerX - left, 22), Math.max(width - 22, 22))
        )}px`;
      }
    }

    async function renderStep() {
      await applyStageVisuals();
      pop.innerHTML = coachmarkPopHtml(stage);
      save({ stage });

      const nextBtn = pop.querySelector(".welcome-coach__next");
      const backBtn = pop.querySelector(".welcome-coach__back");

      nextBtn?.addEventListener("click", async () => {
        const next = nextCoachmarkStage(stage);
        if (next) {
          stage = next;
          await renderStep();
          return;
        }
        finish();
      });

      backBtn?.addEventListener("click", async () => {
        const prev = prevCoachmarkStage(stage);
        if (!prev) return;
        stage = prev;
        await renderStep();
      });

      place();
      requestAnimationFrame(place);
      (nextBtn || pop.querySelector(".welcome-coach__next"))?.focus();
    }

    function finish() {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      targetEl?.classList.remove("welcome-target");
      layer.remove();
      document.body.classList.remove("welcome-open");
      onComplete();
    }

    bindTarget(target);
    targetEl.scrollIntoView({ block: "center", inline: "nearest" });
    document.body.appendChild(layer);
    document.body.classList.add("welcome-open");
    renderStep();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
  }

  async function runCoachmark(startStage = "coachmark") {
    const info = load().testBooking;
    if (info?.date) {
      window.BarberCalendar?.goToDate?.(info.date);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }
    const target = info?.id ? await waitForEvent(info.id) : null;
    if (!target) {
      open({ startAt: "done" });
      return;
    }
    openCoachmark(target, startStage, () => {
      persistCompleted();
      save({ stage: "outro", pendingAutoagenda: true });
      open({ startAt: "done" });
    });
  }

  /** Retoma el tour en la etapa guardada, sin comprobar si toca mostrarlo. */
  function resume() {
    if (document.getElementById("welcome-overlay") || document.getElementById("welcome-coach")) {
      return;
    }
    if (!isPanelPage() && !isCalendarPage()) return;
    const stage = load().stage;
    if (COACHMARK_STAGES.includes(stage)) {
      if (isCalendarPage()) runCoachmark(stage);
      else location.assign("calendario.html");
      return;
    }
    if (stage === "outro") {
      open({ startAt: "done" });
      return;
    }
    if (isPanelPage()) open();
  }

  async function maybeOpen() {
    try {
      if (await pending()) resume();
    } catch (err) {
      console.warn("[welcome]", err);
    }
  }

  window.WelcomeTour = {
    open,
    resume,
    pending,
    load,
    save,
    reset() {
      try {
        localStorage.removeItem(storageKey());
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        /* ignore */
      }
    },
  };

  if (window.AppShell?.panelReady) maybeOpen();
  else window.addEventListener("gestionweb:panel-ready", maybeOpen, { once: true });
})();
