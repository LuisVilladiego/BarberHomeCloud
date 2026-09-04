/**
 * Gestiónweb.app landing — precios, tema claro/oscuro y microinteracciones.
 */
(function () {
  const POPULAR_PLAN_ID = "pro";
  const THEME_KEY = "gestionweb.landing_theme";

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

  function currentTheme() {
    return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
  }

  function readThemeKey() {
    try {
      return localStorage.getItem(THEME_KEY) || localStorage.getItem("barbercloud.landing_theme");
    } catch {
      return null;
    }
  }

  function syncThemeButton() {
    const light = currentTheme() === "light";
    document.querySelectorAll("[data-theme-toggle]").forEach((btn) => {
      btn.setAttribute("aria-label", light ? "Cambiar a tema oscuro" : "Cambiar a tema claro");
      btn.setAttribute("aria-pressed", light ? "true" : "false");
    });
  }

  function applyTheme(theme) {
    const next = theme === "light" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* ignore */
    }
    syncThemeButton();
  }

  function initTheme() {
    syncThemeButton();
    document.querySelectorAll("[data-theme-toggle]").forEach((btn) => {
      btn.addEventListener("click", () => {
        applyTheme(currentTheme() === "dark" ? "light" : "dark");
      });
    });
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
        const items = features.map((f) => `<li>${f}</li>`).join("");

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

  function initReveal() {
    const els = document.querySelectorAll(
      ".landing-product article, .landing-shop-item, .landing-plan, .landing-steps li, .landing-cta__box, .landing-trust"
    );
    if (!els.length) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) {
      els.forEach((el) => el.classList.add("is-inview"));
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-inview");
          io.unobserve(entry.target);
        });
      },
      { threshold: 0.14, rootMargin: "0px 0px -8% 0px" }
    );

    els.forEach((el, i) => {
      el.classList.add("landing-reveal");
      el.style.setProperty("--d", `${(i % 3) * 90}ms`);
      io.observe(el);
    });
  }

  function showToast(message) {
    const toast = document.getElementById("landing-toast");
    if (!toast) return;
    toast.hidden = false;
    toast.textContent = message;
    toast.classList.add("is-on");
    window.clearTimeout(showToast._t);
    showToast._t = window.setTimeout(() => {
      toast.classList.remove("is-on");
    }, 2200);
  }

  function initShopDemo() {
    document.querySelectorAll("[data-shop-add]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const name = btn.closest("article")?.querySelector("h3")?.textContent?.trim() || "Producto";
        showToast(`${name} agregado al pedido`);
      });
    });
  }

  initTheme();
  renderPlans();
  initNav();
  initReveal();
  initShopDemo();
})();
