/**
 * BarberCloud landing — precios desde el modelo de negocio, copy público.
 */
(function () {
  const POPULAR_PLAN_ID = "pro";

  const FEATURE_LABELS = {
    "Todo Basic": "Incluye Basic",
    "Todo Pro": "Incluye Pro",
    Autoagenda: "Link de reservas",
    "Autoagenda básica": "Link de reservas",
    Marketplace: "Tienda en tu link",
    "Reportes y analytics": "Reportes del negocio",
    "Configuración avanzada": "Más control del equipo",
    "Soporte prioritario": "Atención prioritaria",
  };

  function publicFeature(text) {
    return FEATURE_LABELS[text] || text;
  }

  function renderPlans() {
    const container = document.getElementById("landing-pricing-grid");
    if (!container || !window.Plans) return;

    const plans = window.Plans.PLANS || [];

    container.innerHTML = plans
      .map((plan) => {
        const popular = plan.id === POPULAR_PLAN_ID;
        const features = (window.Plans.planFeatures?.(plan) || []).map(publicFeature);
        const cop = window.Plans.formatMoney(window.Plans.displayCop(plan, "monthly"));
        const items = features
          .map((f) => `<li>${f}</li>`)
          .join("");

        return `
          <article class="landing-plan${popular ? " is-popular" : ""}">
            ${popular ? '<span class="landing-plan__badge">Recomendado</span>' : ""}
            <p class="landing-plan__name">${plan.label || plan.name}</p>
            <p class="landing-plan__price">${cop}</p>
            <p class="landing-plan__period">al mes</p>
            <ul class="landing-plan__features">${items}</ul>
            <a class="landing-btn landing-btn--${popular ? "primary" : "ghost"}" href="login.html">
              Empezar
            </a>
          </article>`;
      })
      .join("");
  }

  function initNav() {
    const nav = document.querySelector(".landing-nav");
    const toggle = document.getElementById("landing-nav-toggle");
    if (!nav) return;

    const onScroll = () => nav.classList.toggle("is-scrolled", window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    toggle?.addEventListener("click", () => {
      const open = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      toggle.setAttribute("aria-label", open ? "Cerrar menú" : "Abrir menú");
    });

    nav.querySelectorAll(".landing-nav__panel a").forEach((link) => {
      link.addEventListener("click", () => {
        nav.classList.remove("is-open");
        toggle?.setAttribute("aria-expanded", "false");
      });
    });
  }

  renderPlans();
  initNav();
})();
