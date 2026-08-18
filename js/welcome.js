/**
 * Bienvenida guiada tras activar la suscripción. Se muestra una sola vez sobre
 * el panel y guarda las respuestas para personalizar la cuenta.
 */
(function () {
  const STORAGE_KEY = "barbercloud.welcome";
  const AUTH_KEY = "barbercloud.auth";

  const STEPS = [
    { id: "intro", kind: "intro" },
    {
      id: "dailyVolume",
      kind: "choice",
      question: "¿Cuántas citas gestionas al día?",
      note: "Puedes usar BarberCloud para confirmar citas presenciales, reuniones virtuales, clases, enviar recordatorios y más.",
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
          desc: "Sincronizaremos BarberCloud con tu Google Calendar existente.",
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
          desc: "Te crearemos un calendario dentro de BarberCloud.",
        },
        {
          id: "ninguna",
          icon: "question",
          label: "Todavía no tengo una agenda",
          desc: "Sin problema, te ayudamos a empezar desde cero.",
        },
      ],
    },
    { id: "done", kind: "outro" },
  ];

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return raw && typeof raw === "object" ? raw : {};
    } catch {
      return {};
    }
  }

  function save(patch) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...load(), ...patch }));
    } catch {
      /* ignore */
    }
  }

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

  /** Queda pendiente mientras el barbero con plan activo no la haya completado. */
  function pending() {
    if (load().seen) return false;
    if (!hasAuthSession()) return false;
    return !!window.Tenant?.hasActiveSubscription?.();
  }

  function isPanelPage() {
    const page = (location.pathname.split("/").pop() || "index.html").toLowerCase();
    return page === "" || page === "index.html";
  }

  function shouldShow() {
    if (document.getElementById("welcome-overlay")) return false;
    if (!isPanelPage()) return false;
    return pending();
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(
      /[&<>"']/g,
      (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]
    );
  }

  function publicLink() {
    try {
      const auto = JSON.parse(localStorage.getItem("barbercloud.autoagenda") || "{}");
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
      <h2 id="welcome-title">¡Bienvenido a BarberCloud!</h2>
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

  function outroHtml() {
    const link = publicLink();
    return `
      <div class="welcome-icons" aria-hidden="true">
        <span class="welcome-check">
          <svg viewBox="0 0 24 24" width="30" height="30" fill="none">
            <path d="m5 12.6 4.4 4.4L19 7.4" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </span>
      </div>
      <h2 id="welcome-title">¡Todo listo!</h2>
      <p class="welcome-lead">
        Tu plan está activo. Ya puedes gestionar tus citas y enviar confirmaciones por WhatsApp.
      </p>
      ${
        link
          ? `<p class="welcome-note welcome-note--center">Tu enlace de reservas: <strong>${escapeHtml(link)}</strong></p>`
          : ""
      }`;
  }

  function open() {
    const answers = { ...(load().answers || {}) };
    let index = 0;

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

    function close() {
      save({ seen: true, answers, completedAt: new Date().toISOString() });
      document.body.classList.remove("welcome-open");
      overlay.remove();
    }

    function render() {
      const step = STEPS[index];
      const answer = answers[step.id];

      card.classList.toggle("welcome-card--center", step.kind !== "choice");

      if (step.kind === "intro") body.innerHTML = introHtml();
      else if (step.kind === "outro") body.innerHTML = outroHtml();
      else body.innerHTML = choiceHtml(step, answer);

      backBtn.hidden = index === 0;
      const isLast = index === STEPS.length - 1;
      nextBtn.textContent = isLast ? "Ir al panel" : "Siguiente";
      nextBtn.disabled = step.kind === "choice" && !answer;
      nextBtn.focus();
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

    nextBtn.addEventListener("click", () => {
      if (index >= STEPS.length - 1) {
        close();
        return;
      }
      index += 1;
      render();
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

  function maybeOpen() {
    if (shouldShow()) open();
  }

  window.WelcomeTour = {
    open,
    pending,
    reset() {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        /* ignore */
      }
    },
  };

  if (window.AppShell?.panelReady) maybeOpen();
  else window.addEventListener("barbercloud:panel-ready", maybeOpen, { once: true });
})();
