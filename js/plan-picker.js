/**
 * Modal "Elige tu plan" reutilizable en BarberCloud.
 * Conecta con Billing.startCheckout → Wompi.
 */
(function () {
  const GUARANTEE = "Si no te gusta, te devolvemos tu dinero (30 días)";

  let selectedPlanId = "basic";
  let billingPeriod = "monthly";
  let wired = false;

  function plansList() {
    return window.Plans?.PLANS || [];
  }

  function features(plan) {
    return window.Plans?.planFeatures?.(plan) || window.Plans?.FEATURES || [];
  }

  function priceLabel(plan, period) {
    if (window.Plans?.priceLabel) return window.Plans.priceLabel(plan, period);
    const cop = Number(plan?.price) || (Number(plan?.priceUsd) || 0) * 4000;
    const formatted = new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      maximumFractionDigits: 0,
    }).format(cop);
    return `${formatted} al mes`;
  }

  function ensureModals() {
    if (document.getElementById("choose-plan-modal")) return;

    const wrap = document.createElement("div");
    wrap.innerHTML = `
      <div class="modal choose-plan-modal" id="choose-plan-modal" hidden>
        <div class="modal__backdrop" data-close-choose-plan></div>
        <div
          class="modal__dialog choose-plan-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="choose-plan-title"
        >
          <button class="choose-plan-close icon-btn" type="button" data-close-choose-plan aria-label="Cerrar">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M7 7l10 10M17 7 7 17" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
            </svg>
          </button>
          <h2 id="choose-plan-title" class="choose-plan-title">Elige tu plan</h2>
          <ul class="choose-plan-trust">
            <li>Cambia de plan o cancela en 1 click</li>
            <li>30 días de garantía. Te devolvemos tu dinero.</li>
          </ul>
          <div class="choose-plan-billing">
            <span class="choose-plan-billing__label">¿Cómo prefieres pagar?</span>
            <div class="choose-plan-toggle" role="group" aria-label="Frecuencia de pago">
              <button type="button" class="choose-plan-toggle__btn is-active" data-period="monthly">Mensual</button>
              <button type="button" class="choose-plan-toggle__btn" data-period="annual">
                Anual <small>Ahorras 16%</small>
              </button>
            </div>
          </div>
          <p class="choose-plan-question">Elige el plan para tu barbería</p>
          <div class="choose-plan-cards" id="choose-plan-cards"></div>
          <p class="choose-plan-error auth-error" id="choose-plan-error" hidden></p>
          <div class="choose-plan-footer">
            <button type="button" class="btn btn--dark choose-plan-cta" id="choose-plan-cta">
              Empezar con el plan Basic
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="m10 7 6 5-6 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </div>
        </div>
      </div>

      <div class="modal sub-features-modal" id="sub-features-modal" hidden>
        <div class="modal__backdrop" data-close-sub-features></div>
        <div
          class="modal__dialog sub-features-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sub-features-title"
        >
          <button class="choose-plan-close icon-btn" type="button" data-close-sub-features aria-label="Cerrar">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M7 7l10 10M17 7 7 17" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
            </svg>
          </button>
          <h2 id="sub-features-title" class="sub-features-title">Suscríbete y accede a todo</h2>
          <p class="sub-features-lead">
            BarberCloud automatiza confirmaciones, recordatorios y tu link de reservas público.
          </p>
          <ul class="sub-features-list">
            <li>Mensajes automáticos por WhatsApp</li>
            <li>Recordatorios y confirmaciones sin esfuerzo</li>
            <li>Google Calendar y autoagenda en línea</li>
            <li>Panel completo para gestionar tu barbería</li>
          </ul>
          <div class="sub-features-actions">
            <button class="btn btn--secondary" type="button" data-close-sub-features>Más tarde</button>
            <button class="btn btn--primary" type="button" id="sub-features-plans">Ver planes</button>
          </div>
        </div>
      </div>`;

    document.body.appendChild(wrap);
  }

  function modal(id) {
    return document.getElementById(id);
  }

  function showError(message) {
    const el = document.getElementById("choose-plan-error");
    if (!el) return;
    el.hidden = !message;
    el.textContent = message || "";
  }

  function selectedPlan() {
    return window.Plans?.find?.(selectedPlanId) || plansList()[0] || null;
  }

  function renderCards() {
    const box = document.getElementById("choose-plan-cards");
    if (!box) return;

    const list = features(selectedPlan());
    box.innerHTML = plansList()
      .map((plan) => {
        const selected = plan.id === selectedPlanId;
        const featureItems = (selected ? list : features(plan))
          .map((item) => `<li>${item}</li>`)
          .join("");
        return `
          <label class="choose-plan-card${selected ? " is-selected" : ""}">
            <input type="radio" name="choose-plan" value="${plan.id}"${selected ? " checked" : ""} />
            <span class="choose-plan-card__radio" aria-hidden="true"></span>
            <div class="choose-plan-card__main">
              <div class="choose-plan-card__head">
                <strong>${plan.label || plan.name}</strong>
                <span class="choose-plan-card__price">${priceLabel(plan, billingPeriod)}</span>
              </div>
              <p class="choose-plan-card__meta">${window.Plans?.planSummary?.(plan) || ""}</p>
              ${
                selected
                  ? `
              <div class="choose-plan-card__details">
                <p class="choose-plan-card__includes-title">¿Qué incluye?</p>
                <ul class="choose-plan-card__includes">${featureItems}</ul>
                <p class="choose-plan-card__guarantee">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M5 12.5 9.5 17 19 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                  ${GUARANTEE}
                </p>
              </div>`
                  : ""
              }
            </div>
          </label>`;
      })
      .join("");
  }

  function renderToggle() {
    document.querySelectorAll(".choose-plan-toggle__btn").forEach((btn) => {
      const active = btn.getAttribute("data-period") === billingPeriod;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function updateCta() {
    const plan = selectedPlan();
    const cta = document.getElementById("choose-plan-cta");
    if (!cta || !plan) return;
    cta.innerHTML = `
      Empezar con el plan ${plan.label || plan.name}
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="m10 7 6 5-6 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;
  }

  function render() {
    renderToggle();
    renderCards();
    updateCta();
  }

  function openChoose(options = {}) {
    ensureModals();
    wireOnce();

    selectedPlanId = String(options.planId || plansList()[0]?.id || "basic");
    billingPeriod = options.period === "annual" ? "annual" : "monthly";
    showError("");

    render();
    const el = modal("choose-plan-modal");
    if (el) {
      el.hidden = false;
      document.body.classList.add("choose-plan-open");
      document.getElementById("choose-plan-cta")?.focus();
    }
  }

  function closeChoose() {
    const el = modal("choose-plan-modal");
    if (el) el.hidden = true;
    document.body.classList.remove("choose-plan-open");
    showError("");
  }

  function openFeatures() {
    ensureModals();
    wireOnce();
    const el = modal("sub-features-modal");
    if (el) el.hidden = false;
  }

  function closeFeatures() {
    const el = modal("sub-features-modal");
    if (el) el.hidden = true;
  }

  async function startCheckout() {
    const cta = document.getElementById("choose-plan-cta");
    const plan = selectedPlan();
    if (!plan) return;

    showError("");
    const label = cta?.innerHTML;
    if (cta) {
      cta.disabled = true;
      cta.textContent = "Preparando pago…";
    }

    const res = await window.Billing?.startCheckout?.(selectedPlanId, billingPeriod);
    if (!res?.ok) {
      showError(res?.message || "No se pudo iniciar el pago.");
      if (cta) {
        cta.disabled = false;
        updateCta();
      }
      return;
    }

    location.href = res.checkoutUrl;
  }

  function wireOnce() {
    if (wired) return;
    wired = true;

    document.addEventListener("click", (event) => {
      if (event.target.closest("[data-close-choose-plan]")) {
        closeChoose();
        return;
      }
      if (event.target.closest("[data-close-sub-features]")) {
        closeFeatures();
        return;
      }

      const periodBtn = event.target.closest(".choose-plan-toggle__btn");
      if (periodBtn) {
        billingPeriod = periodBtn.getAttribute("data-period") === "annual" ? "annual" : "monthly";
        render();
        return;
      }

      const card = event.target.closest(".choose-plan-card");
      if (card) {
        const input = card.querySelector('input[type="radio"]');
        if (input?.value) {
          selectedPlanId = input.value;
          render();
        }
        return;
      }

      if (event.target.closest("#choose-plan-cta")) {
        startCheckout();
        return;
      }

      if (event.target.closest("#sub-features-plans")) {
        closeFeatures();
        openChoose({ planId: selectedPlanId, period: billingPeriod });
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      if (!modal("choose-plan-modal")?.hidden) closeChoose();
      else if (!modal("sub-features-modal")?.hidden) closeFeatures();
    });
  }

  window.PlanPicker = {
    open: openChoose,
    close: closeChoose,
    openFeatures,
    closeFeatures,
  };
})();
