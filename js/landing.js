/**
 * BarberCloud landing — precios dinámicos desde js/plans.js + business-model.js
 */
(function () {
  const POPULAR_PLAN_ID = "pro";

  function renderPlans() {
    const container = document.getElementById("landing-pricing-grid");
    if (!container || !window.Plans) return;

    const plans = window.Plans.PLANS || [];

    container.innerHTML = plans
      .map((plan) => {
        const popular = plan.id === POPULAR_PLAN_ID;
        const features = window.Plans.planFeatures?.(plan) || [];
        const cop = window.Plans.formatMoney(window.Plans.displayCop(plan, "monthly"));
        const usd = window.Plans.formatUsd(window.Plans.displayUsd(plan, "monthly"));
        const featureItems = features
          .map(
            (f) =>
              `<li><svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12.5 9.5 17 19 7.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>${f}</li>`
          )
          .join("");

        return `
          <article class="landing-plan${popular ? " is-popular" : ""}">
            ${popular ? '<span class="landing-plan__badge">Más popular</span>' : ""}
            <p class="landing-plan__limit">${window.Plans.planSummary?.(plan) || plan.label}</p>
            <p class="landing-plan__price">${cop}</p>
            <p class="landing-plan__usd">~${usd} USD / mes</p>
            <ul class="landing-plan__features">${featureItems}</ul>
            <a class="landing-btn landing-btn--${popular ? "primary" : "ghost"}" href="login.html?next=suscripcion&plan=${plan.id}#plans">
              Elegir plan
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
    });

    nav.querySelectorAll(".landing-nav__panel a").forEach((link) => {
      link.addEventListener("click", () => nav.classList.remove("is-open"));
    });
  }

  renderPlans();
  initNav();
})();
