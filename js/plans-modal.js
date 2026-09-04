/**
 * Modal de upsell de planes Gestiónweb.app. Se inyecta en páginas con sidebar.
 */
(function () {
  const MODAL_ID = "plans-upsell-modal";

  const ICONS = {
    chat: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 18.5 4 20v-3.5A6.5 6.5 0 0 1 12 4.5 6.5 6.5 0 0 1 18.5 11 6.5 6.5 0 0 1 7 18.5Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>`,
    stars: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m12 3 2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 15.4 7.2 17.9l.9-5.4L4.2 8.7l5.4-.8L12 3Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>`,
    calendar: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2" stroke="currentColor" stroke-width="1.7"/><path d="M3.5 10h17M8 3.5V7M16 3.5V7" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`,
    check: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7.5 12.5 10.5 15.5 16.5 8.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  };

  const CATEGORIES = [
    {
      title: "MENSAJES AUTOMÁTICOS",
      icon: "chat",
      items: [
        { title: "Mensaje al agendar", desc: "Mensaje inmediato al crear cita" },
        { title: "Mensaje para confirmar cita", desc: "Pide confirmación antes de la cita" },
        { title: "Recordatorio el día de la cita", desc: "Un segundo aviso el mismo día" },
        { title: "Mensaje después de la cita", desc: "Pide reseñas, comparte tus redes y reagenda" },
      ],
    },
    {
      title: "TU MARCA, TU VOZ",
      icon: "stars",
      items: [{ title: "Agrega tu logo a los mensajes", desc: "Personaliza cada recordatorio con tu marca" }],
    },
    {
      title: "TU AGENDA, CONECTADA",
      icon: "calendar",
      items: [{ title: "Sincroniza con Google Calendar", desc: "Mantén tus citas al día en un solo lugar" }],
    },
  ];

  let modalEl = null;
  let lastFocus = null;

  function hasActiveSub() {
    if (window.Billing?.isActive?.(window.Billing.cached?.())) return true;
    if (window.Tenant?.hasActiveSubscription?.()) return true;
    try {
      const raw = localStorage.getItem("gestionweb.subscription");
      if (!raw) return false;
      const status = String(JSON.parse(raw)?.status || "").toLowerCase();
      return (
        status === "active" ||
        status === "trialing" ||
        status === "trial" ||
        status === "past_due"
      );
    } catch {
      return false;
    }
  }

  function renderFeatureItems(items) {
    return items
      .map(
        (item) => `
        <li class="plans-modal__item">
          <span class="plans-modal__check">${ICONS.check}</span>
          <div>
            <strong>${item.title}</strong>
            <span>${item.desc}</span>
          </div>
        </li>`
      )
      .join("");
  }

  function renderCategories() {
    return CATEGORIES.map(
      (cat) => `
      <section class="plans-modal__group">
        <header class="plans-modal__group-head">
          <span class="plans-modal__group-icon">${ICONS[cat.icon]}</span>
          <h3>${cat.title}</h3>
        </header>
        <ul class="plans-modal__list">
          ${renderFeatureItems(cat.items)}
        </ul>
      </section>`
    ).join("");
  }

  function ensureModal() {
    if (modalEl) return modalEl;
    const existing = document.getElementById(MODAL_ID);
    if (existing) {
      modalEl = existing;
      return modalEl;
    }

    const wrap = document.createElement("div");
    wrap.innerHTML = `
      <div class="modal plans-modal" id="${MODAL_ID}" hidden>
        <div class="modal__backdrop" data-close-plans-modal></div>
        <div class="modal__dialog plans-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="plans-modal-title">
          <header class="plans-modal__head">
            <div class="plans-modal__intro">
              <h2 id="plans-modal-title">Suscríbete y accede a todo Gestiónweb.app</h2>
              <p class="plans-modal__lead">Elimina las inasistencias, automatiza tus mensajes y llena tu agenda.</p>
            </div>
            <button class="icon-btn plans-modal__close" type="button" data-close-plans-modal aria-label="Cerrar">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M7 7l10 10M17 7 7 17" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
              </svg>
            </button>
          </header>
          <div class="plans-modal__body">
            <div class="plans-modal__features">
              ${renderCategories()}
            </div>
          </div>
          <footer class="plans-modal__foot">
            <a class="btn btn--dark plans-modal__cta" href="suscripcion.html?need=1#plans">Ver planes</a>
          </footer>
        </div>
      </div>`;

    modalEl = wrap.firstElementChild;
    document.body.appendChild(modalEl);

    modalEl.querySelectorAll("[data-close-plans-modal]").forEach((el) => {
      el.addEventListener("click", close);
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && modalEl && !modalEl.hidden) close();
    });

    return modalEl;
  }

  function ensureSidebarPromo() {
    document.querySelectorAll(".sidebar").forEach((sidebar) => {
      if (sidebar.querySelector(".sidebar-promo")) return;

      const promo = document.createElement("div");
      promo.className = "sidebar-promo";
      promo.innerHTML = `
        <p class="sidebar-promo__eyebrow">Gestiónweb.app</p>
        <p class="sidebar-promo__title">Más citas, menos ausencias</p>
        <p class="sidebar-promo__text">Automatiza confirmaciones y recordatorios por WhatsApp.</p>
        <div class="sidebar-promo__actions">
          <button class="sidebar-promo__link" type="button" data-open-plans-modal>Conoce más</button>
          <a class="sidebar-promo__cta" href="suscripcion.html?need=1#plans">Escoger plan</a>
        </div>`;

      const userBtn = sidebar.querySelector(".user");
      if (userBtn) sidebar.insertBefore(promo, userBtn);
      else sidebar.appendChild(promo);
    });

    document.querySelectorAll("[data-open-plans-modal]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        open();
      });
    });
  }

  function updatePromoVisibility() {
    const show = !hasActiveSub();
    document.querySelectorAll(".sidebar-promo").forEach((el) => {
      el.hidden = !show;
    });
  }

  function open() {
    ensureModal();
    lastFocus = document.activeElement;
    modalEl.hidden = false;
    document.body.classList.add("plans-modal-open");
    modalEl.querySelector(".plans-modal__close")?.focus();
  }

  function close() {
    if (!modalEl || modalEl.hidden) return;
    modalEl.hidden = true;
    document.body.classList.remove("plans-modal-open");
    if (lastFocus && typeof lastFocus.focus === "function") lastFocus.focus();
  }

  function maybeOpenFromQuery() {
    const params = new URLSearchParams(location.search);
    if (params.get("plans") === "1" || params.get("upsell") === "1") open();
  }

  function init() {
    if (!document.querySelector(".sidebar")) return;
    ensureModal();
    ensureSidebarPromo();
    updatePromoVisibility();
    maybeOpenFromQuery();

    window.addEventListener("gestionweb:billing-updated", updatePromoVisibility);
  }

  window.PlansModal = { init, open, close };
})();
