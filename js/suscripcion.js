(function () {
  const SUB_KEY = "gestionweb.subscription";
  const BOOKINGS_KEY = "gestionweb.bookings";
  const OVERAGE_COP = 800;

  const formatMoney =
    window.Plans?.formatMoney ||
    ((amount) =>
      new Intl.NumberFormat("es-CO", {
        style: "currency",
        currency: "COP",
        maximumFractionDigits: 0,
      }).format(Number(amount) || 0));

  const PAGO_LABELS = {
    APPROVED: "Aprobado",
    DECLINED: "Rechazado",
    VOIDED: "Anulado",
    ERROR: "Error",
    PENDING: "Pendiente",
  };

  let state = {
    planId: "pro",
    status: "expired",
    periodStart: null,
    periodEnd: null,
    lastPaymentAt: null,
    cancelAtPeriodEnd: false,
  };
  let selectedPlanId = null;
  let pagos = [];
  let checkoutPlanId = "basic";
  let checkoutPeriod = "monthly";

  const GUARANTEE = "Si no te gusta, te devolvemos tu dinero (30 días)";

  const planTitle = document.getElementById("plan-title");
  const planNext = document.getElementById("plan-next-charge");
  const planStatus = document.getElementById("plan-status");
  const billingPeriod = document.getElementById("billing-period");
  const usageUsed = document.getElementById("usage-used");
  const usageLabel = document.getElementById("usage-label");
  const usageBar = document.getElementById("usage-bar");
  const usagePct = document.getElementById("usage-pct");
  const usageLimit = document.getElementById("usage-limit");
  const overageCost = document.getElementById("overage-cost");
  const billingFrequency = document.getElementById("billing-frequency");
  const paymentError = document.getElementById("payment-error");
  const paymentLead = document.getElementById("payment-lead");
  const pendingLead = document.getElementById("pending-lead");

  function plansList() {
    return window.Plans?.PLANS || [];
  }

  function currentPlan() {
    return (
      window.Plans?.find?.(state.planId) ||
      plansList().find((p) => p.id === "pro") ||
      plansList()[0] ||
      { id: "pro", maxAppointments: 100, price: 72000, label: "Pro" }
    );
  }

  function isActive() {
    return !!window.Billing?.isActive?.(state);
  }

  function isPendingCancellation() {
    return !!window.Billing?.isPendingCancellation?.(state);
  }

  function cancelModalMessage() {
    if (!isActive()) {
      return "Tu suscripción no está activa, así que no hay nada que cancelar. No se hará ningún cobro automático.";
    }
    if (isPendingCancellation()) {
      return `Ya programaste la cancelación. Tu plan sigue activo hasta el ${formatDate(
        state.periodEnd
      )}. Después se desactiva el enlace público y el panel queda solo para consultar tus datos.`;
    }
    const normalized = window.BusinessModel?.normalizeStatus?.(state.status) || state.status;
    if (normalized === "trial") {
      return `No hay renovación automática: tu prueba termina el ${formatDate(
        state.periodEnd
      )}. Si no activas un plan, ese día se desactiva el enlace público y el panel queda solo para consultar tus datos.`;
    }
    return `No hay renovación automática: tu plan está pagado hasta el ${formatDate(
      state.periodEnd
    )}. Si no pagas otro mes, ese día se desactiva el enlace público y el panel queda solo para consultar tus datos.`;
  }

  function toIsoDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function formatDate(value, style = "short") {
    if (!value) return "—";
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    if (style === "long") {
      return d.toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });
    }
    return d.toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit", year: "numeric" });
  }

  /** Sin pago vigente se muestra el mes corriente para que el consumo tenga sentido. */
  function periodBounds() {
    if (state.periodStart && state.periodEnd) {
      return {
        start: String(state.periodStart).slice(0, 10),
        end: String(state.periodEnd).slice(0, 10),
      };
    }
    const now = new Date();
    return {
      start: toIsoDate(new Date(now.getFullYear(), now.getMonth(), 1)),
      end: toIsoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
    };
  }

  function loadBookings() {
    if (window.BookingStore?.loadBookings) return window.BookingStore.loadBookings();
    try {
      const list = JSON.parse(localStorage.getItem(BOOKINGS_KEY) || "[]");
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }

  function isActiveBooking(booking) {
    if (window.BookingStore?.isActive) return window.BookingStore.isActive(booking);
    const status = String(booking?.status || "").toLowerCase();
    return status !== "cancelled" && status !== "canceled" && status !== "rejected";
  }

  function bookingsInPeriod() {
    const { start, end } = periodBounds();
    return loadBookings().filter((b) => {
      if (!isActiveBooking(b)) return false;
      const day = String(b.date || b.createdAt || "").slice(0, 10);
      return day >= start && day <= end;
    });
  }

  /** Caché local solo para pintar; el estado real lo escribe el webhook de Wompi. */
  function cacheLocal() {
    try {
      localStorage.setItem(
        SUB_KEY,
        JSON.stringify({
          planId: state.planId,
          status: state.status,
          periodStart: state.periodStart,
          periodEnd: state.periodEnd,
          lastPaymentAt: state.lastPaymentAt,
          cancelAtPeriodEnd: state.cancelAtPeriodEnd,
          payment: { provider: "wompi" },
        })
      );
    } catch {
      /* ignore */
    }
  }

  function readLocal() {
    try {
      const raw = JSON.parse(localStorage.getItem(SUB_KEY) || "{}");
      return {
        planId: raw.planId || "pro",
        status: window.BusinessModel?.normalizeStatus?.(raw.status) || raw.status || "expired",
        periodStart: raw.periodStart || null,
        periodEnd: raw.periodEnd || null,
        lastPaymentAt: raw.lastPaymentAt || null,
        cancelAtPeriodEnd: !!raw.cancelAtPeriodEnd,
      };
    } catch {
      return { ...state };
    }
  }

  function renderUsage() {
    const plan = currentPlan();
    const limit = plan.maxAppointments || plan.limit || 100;
    const used = bookingsInPeriod().length;
    const pct = Math.min(100, Math.round((used / limit) * 100));
    if (usageUsed) usageUsed.textContent = String(used);
    if (usageLabel) usageLabel.textContent = ` / ${limit} citas usadas este período`;
    if (usageBar) usageBar.style.width = `${pct}%`;
    if (usagePct) usagePct.textContent = `${pct}% usado`;
    if (usageLimit) usageLimit.textContent = `Límite del plan: ${limit}`;
  }

  function render() {
    const plan = currentPlan();
    const label = window.Billing?.statusLabel?.(state) || { text: "Sin activar", tone: "paused" };

    if (planTitle) {
      const exp = currentExperience();
      if (exp === "trial") planTitle.textContent = `Prueba del plan ${plan.label || plan.name}`;
      else if (exp === "past_due") planTitle.textContent = `${plan.label || plan.name} · pago pendiente`;
      else if (exp === "canceled") planTitle.textContent = `${plan.label || plan.name} · cancelación programada`;
      else planTitle.textContent = `Tienes el plan ${plan.label || plan.name}`;
    }
    if (planStatus) {
      planStatus.textContent = label.text;
      planStatus.className = `status status--${label.tone}`;
    }
    if (planNext) {
      if (isActive()) {
        const days = window.Billing?.daysLeft?.(state) || 0;
        if (isPendingCancellation()) {
          planNext.textContent = `Cancela el ${formatDate(state.periodEnd)} · quedan ${days} día${
            days === 1 ? "" : "s"
          } de acceso · no se renovará`;
        } else {
          planNext.textContent = `Pagado hasta ${formatDate(state.periodEnd)} · ${formatMoney(
            plan.price
          )} al mes · quedan ${days} día${days === 1 ? "" : "s"}`;
        }
      } else if (state.periodEnd) {
        planNext.textContent = `Venció el ${formatDate(state.periodEnd)} · ${formatMoney(
          plan.price
        )} para reactivar`;
      } else {
        planNext.textContent = `Sin pagos registrados · ${formatMoney(plan.price)} al mes`;
      }
    }

    const { start, end } = periodBounds();
    if (billingPeriod) {
      billingPeriod.textContent = `Período de facturación: ${formatDate(
        start,
        "long"
      )} - ${formatDate(end, "long")}`;
    }
    if (overageCost) overageCost.textContent = formatMoney(OVERAGE_COP);
    if (billingFrequency) billingFrequency.textContent = "Mensual (pago manual)";

    renderUsage();
    refreshNeedBanner();
    renderCancelManageItem();
    toggleViews();
  }

  function renderCancelManageItem() {
    const btn = document.getElementById("btn-cancel");
    if (!btn) return;
    const title = btn.querySelector(".manage-item__text strong");
    const subtitle = btn.querySelector(".manage-item__text small");
    if (!title || !subtitle) return;

    if (!isActive()) {
      title.textContent = "Cancelar suscripción";
      subtitle.textContent = "No hay suscripción activa que cancelar";
      btn.disabled = true;
      return;
    }

    btn.disabled = false;
    if (isPendingCancellation()) {
      title.textContent = "Cancelación programada";
      subtitle.textContent = `Activo hasta ${formatDate(state.periodEnd)} · no se renovará`;
      return;
    }

    title.textContent = "Cancelar suscripción";
    subtitle.textContent = "Cancela tu plan al final del período actual";
  }

  function currentExperience() {
    return (
      window.Billing?.experience?.(state) ||
      window.BusinessModel?.membershipExperience?.(state.status, state.periodEnd, {
        cancelAtPeriodEnd: !!state.cancelAtPeriodEnd,
      }) ||
      "none"
    );
  }

  function experienceCopy() {
    const exp = currentExperience();
    const days = window.Billing?.daysLeft?.(state) || 0;
    const endLabel = state.periodEnd ? formatDate(state.periodEnd, "long") : "el final del período";
    const plan = currentPlan();
    return (
      window.BusinessModel?.membershipCopy?.(exp, {
        daysLeft: days,
        endLabel,
        planLabel: plan.label || plan.name,
      }) || { title: "", detail: "", cta: "Elegir plan" }
    );
  }

  function refreshNeedBanner() {
    const needEl = document.getElementById("sub-need");
    if (!needEl) return;
    const exp = currentExperience();
    const restricted = window.BusinessModel?.isRestrictedExperience?.(exp);
    const copy = experienceCopy();
    needEl.hidden = !restricted && exp !== "past_due";
    if (!needEl.hidden) {
      needEl.innerHTML = `<strong>${copy.title}</strong> ${copy.detail}`;
    }
  }

  function openModal(id) {
    const el = document.getElementById(id);
    if (el) el.hidden = false;
  }
  function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.hidden = true;
  }

  function showPaymentError(message) {
    if (!paymentError) return;
    paymentError.hidden = !message;
    paymentError.textContent = message || "";
  }

  function features() {
    const plan = checkoutPlan();
    return window.Plans?.planFeatures?.(plan) || window.Plans?.FEATURES || [];
  }

  function priceLabel(plan, period) {
    if (window.Plans?.priceLabel) return window.Plans.priceLabel(plan, period);
    const cop = Number(plan?.price) || (Number(plan?.priceUsd) || 0) * 4000;
    return `${formatMoney(cop)} al mes`;
  }

  function checkoutPlan() {
    return (
      window.Plans?.find?.(checkoutPlanId) ||
      plansList()[0] ||
      { id: "basic", maxAppointments: 50, priceUsd: 12, label: "Basic" }
    );
  }

  function toggleViews() {
    const active = isActive();
    document.getElementById("sub-checkout")?.toggleAttribute("hidden", active);
    document.getElementById("sub-checkout-bar")?.toggleAttribute("hidden", active);
    document.getElementById("sub-active")?.toggleAttribute("hidden", !active);
    document.getElementById("sub-page-header")?.toggleAttribute("hidden", !active);
    if (!active) renderCheckout();
  }

  function showCheckoutError(message) {
    const el = document.getElementById("sub-plan-error");
    if (!el) return;
    el.hidden = !message;
    el.textContent = message || "";
  }

  function renderCheckoutToggle() {
    document.querySelectorAll("#sub-billing-toggle .choose-plan-toggle__btn").forEach((btn) => {
      const on = btn.getAttribute("data-period") === checkoutPeriod;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  function renderCheckoutCards() {
    const box = document.getElementById("sub-plan-cards");
    if (!box) return;
    const list = features();
    box.innerHTML = plansList()
      .map((plan) => {
        const selected = plan.id === checkoutPlanId;
        const featureItems = list.map((item) => `<li>${item}</li>`).join("");
        return `
          <label class="choose-plan-card${selected ? " is-selected" : ""}">
            <input type="radio" name="sub-plan" value="${plan.id}"${selected ? " checked" : ""} />
            <span class="choose-plan-card__radio" aria-hidden="true"></span>
            <div class="choose-plan-card__main">
              <div class="choose-plan-card__head">
                <strong>${plan.label || plan.name}</strong>
                <span class="choose-plan-card__price">${priceLabel(plan, checkoutPeriod)}</span>
              </div>
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

  function updateCheckoutCta() {
    const plan = checkoutPlan();
    const cta = document.getElementById("sub-plan-cta");
    if (!cta || !plan) return;
    cta.innerHTML = `
      Empezar con el plan ${plan.label || plan.name}
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="m10 7 6 5-6 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;
  }

  function renderCheckout() {
    const copy = experienceCopy();
    const title = document.getElementById("sub-checkout-title");
    if (title) title.textContent = copy.title || "Suscríbete y accede a Gestiónweb.app";
    renderCheckoutToggle();
    renderCheckoutCards();
    updateCheckoutCta();
    showCheckoutError("");
  }

  async function startCheckoutFromPage() {
    const cta = document.getElementById("sub-plan-cta");
    const plan = checkoutPlan();
    if (!plan) return;

    showCheckoutError("");
    if (cta) {
      cta.disabled = true;
      cta.textContent = "Preparando pago…";
    }

    const res = await window.Billing?.startCheckout?.(checkoutPlanId, checkoutPeriod);
    if (!res?.ok) {
      showCheckoutError(res?.message || "No se pudo iniciar el pago.");
      if (cta) {
        cta.disabled = false;
        updateCheckoutCta();
      }
      return;
    }

    location.href = res.checkoutUrl;
  }

  function openPlanPicker(planId) {
    window.PlanPicker?.open?.({ planId: planId || state.planId || "basic" });
  }

  function openPaymentModal(planId) {
    selectedPlanId = planId || state.planId;
    const plan = window.Plans?.find?.(selectedPlanId) || currentPlan();
    if (paymentLead) {
      const amount = window.Plans?.chargeCop?.(plan, "monthly") ?? plan.price;
      paymentLead.textContent = `Vas a pagar ${formatMoney(amount)} por un mes del plan ${
        plan.label || plan.name
      } en la página segura de Wompi. Gestiónweb.app no almacena números de tarjeta ni CVC.`;
    }
    showPaymentError("");
    openModal("payment-modal");
  }

  async function goToWompi() {
    const button = document.getElementById("btn-go-wompi");
    const planId = selectedPlanId || state.planId;
    showPaymentError("");
    if (button) {
      button.disabled = true;
      button.textContent = "Preparando…";
    }

    const res = await window.Billing?.startCheckout?.(planId);
    if (!res?.ok) {
      showPaymentError(res?.message || "No se pudo iniciar el pago.");
      if (button) {
        button.disabled = false;
        button.textContent = "Ir a pagar";
      }
      return;
    }
    location.href = res.checkoutUrl;
  }

  async function renderPagos() {
    const list = document.getElementById("invoice-list");
    if (!list) return;
    list.innerHTML = `<p class="empty-hint">Cargando pagos…</p>`;
    pagos = (await window.Billing?.fetchPagos?.()) || [];

    if (!pagos.length) {
      list.innerHTML = `<p class="empty-hint">Todavía no hay pagos registrados.</p>`;
      return;
    }

    list.innerHTML = pagos
      .map((pago) => {
        const status = String(pago.status || "").toUpperCase();
        const tone = status === "APPROVED" ? "ok" : "paused";
        const amount = formatMoney(Number(pago.amount_in_cents || 0) / 100);
        return `
        <div class="billing-history__row">
          <span class="billing-history__meta">
            <strong>${amount} · plan ${pago.plan_id || ""}</strong>
            <small>${formatDate(pago.created_at)} · ${pago.reference}</small>
          </span>
          <span class="status status--${tone}">${PAGO_LABELS[status] || status}</span>
          ${
            status === "APPROVED"
              ? `<button class="btn btn--ghost" type="button" data-receipt="${pago.reference}">Comprobante</button>`
              : ""
          }
        </div>`;
      })
      .join("");
  }

  function downloadReceipt(reference) {
    const pago = pagos.find((p) => p.reference === reference);
    if (!pago) return;
    const amount = formatMoney(Number(pago.amount_in_cents || 0) / 100);
    const lines = [
      "Gestiónweb.app · comprobante de pago",
      `Referencia: ${pago.reference}`,
      `Transacción Wompi: ${pago.wompi_transaction_id || "—"}`,
      `Fecha: ${formatDate(pago.created_at, "long")}`,
      `Plan: ${pago.plan_id}`,
      `Monto: ${amount} ${pago.currency || "COP"}`,
      `Medio de pago: ${pago.payment_method || "—"}`,
      `Periodo cubierto: ${formatDate(pago.period_start)} a ${formatDate(pago.period_end)}`,
      "",
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pago-${pago.reference}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    window.AppShell?.toast?.("Comprobante descargado");
  }

  /** Al volver de Wompi el webhook puede tardar unos segundos en confirmar. */
  async function handleReturnFromWompi() {
    const params = new URLSearchParams(location.search);
    const reference = params.get("ref");
    if (!reference) return;

    openModal("pending-modal");
    const pago = await window.Billing?.waitForPayment?.(reference);
    const status = String(pago?.status || "PENDING").toUpperCase();

    let goToPanel = false;

    if (status === "APPROVED") {
      await syncFromCloud();
      closeModal("pending-modal");
      goToPanel = window.WelcomeTour?.pending ? await window.WelcomeTour.pending() : false;
      window.AppShell?.toast?.(
        goToPanel
          ? "¡Pago aprobado! Te llevamos al panel."
          : "¡Pago aprobado! Tu suscripción está activa."
      );
    } else if (status === "PENDING") {
      if (pendingLead) {
        pendingLead.textContent =
          "Wompi todavía no confirma el pago. Si pagaste por PSE o transferencia puede tardar unos minutos; vuelve a esta página más tarde.";
      }
    } else {
      if (pendingLead) {
        pendingLead.textContent = `El pago quedó como ${
          PAGO_LABELS[status] || status
        }. No se hizo ningún cobro efectivo; puedes intentarlo de nuevo.`;
      }
    }

    const clean = new URL(location.href);
    clean.searchParams.delete("ref");
    clean.searchParams.delete("id");
    history.replaceState(null, "", clean.toString());

    if (goToPanel) setTimeout(() => location.assign("index.html"), 1200);
  }

  async function syncFromCloud() {
    if (window.Tenant?.syncWithAuthenticatedUser) {
      await window.Tenant.syncWithAuthenticatedUser();
    }
    if (!window.Billing?.enabled?.()) return;
    const fresh = await window.Billing.refresh();
    if (fresh) {
      state = {
        planId: fresh.planId || state.planId,
        status: fresh.status || state.status,
        periodStart: fresh.periodStart || state.periodStart,
        periodEnd: fresh.periodEnd || state.periodEnd,
        lastPaymentAt: fresh.lastPaymentAt || state.lastPaymentAt,
        cancelAtPeriodEnd: !!fresh.cancelAtPeriodEnd,
      };
      cacheLocal();
    }
    render();
  }

  document.getElementById("btn-change-plan")?.addEventListener("click", () => {
    openPlanPicker(state.planId);
  });

  document.getElementById("btn-payment")?.addEventListener("click", () => openPlanPicker(state.planId));
  document.getElementById("btn-pay-now")?.addEventListener("click", () => openPlanPicker(state.planId));
  document.getElementById("btn-go-wompi")?.addEventListener("click", goToWompi);

  document.getElementById("sub-plan-cta")?.addEventListener("click", startCheckoutFromPage);

  document.getElementById("sub-billing-toggle")?.addEventListener("click", (event) => {
    const btn = event.target.closest(".choose-plan-toggle__btn");
    if (!btn) return;
    checkoutPeriod = btn.getAttribute("data-period") === "annual" ? "annual" : "monthly";
    renderCheckout();
  });

  document.getElementById("sub-plan-cards")?.addEventListener("click", (event) => {
    const card = event.target.closest(".choose-plan-card");
    if (!card) return;
    const input = card.querySelector('input[type="radio"]');
    if (input?.value) {
      checkoutPlanId = input.value;
      renderCheckout();
    }
  });

  document.getElementById("btn-invoices")?.addEventListener("click", () => {
    openModal("invoices-modal");
    renderPagos();
  });

  document.getElementById("invoice-list")?.addEventListener("click", (e) => {
    const reference = e.target.closest("[data-receipt]")?.getAttribute("data-receipt");
    if (reference) downloadReceipt(reference);
  });

  document.getElementById("btn-history")?.addEventListener("click", () => {
    const list = document.getElementById("history-list");
    openModal("history-modal");
    if (!list) return;
    const bookings = bookingsInPeriod();
    if (!bookings.length) {
      list.innerHTML = `<p class="empty-hint">Aún no hay citas agendadas en este período de facturación.</p>`;
      return;
    }
    list.innerHTML = bookings
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))
      .map(
        (b) => `
        <article class="diagnostic-item">
          <div class="diagnostic-item__top">
            <strong>${b.serviceName || b.name || "Cita"}</strong>
            <span class="status status--ok">${b.status || "agendada"}</span>
          </div>
          <p>${b.date || ""} ${b.time || ""} · ${b.phone || ""}</p>
        </article>`
      )
      .join("");
  });

  document.getElementById("btn-faq")?.addEventListener("click", () => openModal("faq-modal"));

  document.getElementById("btn-cancel")?.addEventListener("click", () => {
    const lead = document.getElementById("cancel-lead");
    if (lead) lead.textContent = cancelModalMessage();
    const confirmBtn = document.getElementById("btn-confirm-cancel");
    if (confirmBtn) {
      confirmBtn.hidden = !isActive() || isPendingCancellation();
      confirmBtn.disabled = false;
      confirmBtn.textContent = "Cancelar al final del período";
    }
    openModal("cancel-modal");
  });

  document.getElementById("btn-confirm-cancel")?.addEventListener("click", async () => {
    const confirmBtn = document.getElementById("btn-confirm-cancel");
    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.textContent = "Cancelando…";
    }

    const res = await window.Billing?.cancelSubscription?.();
    if (!res?.ok) {
      window.AppShell?.toast?.(res?.message || "No se pudo cancelar la suscripción.");
      if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.textContent = "Cancelar al final del período";
      }
      return;
    }

    await syncFromCloud();
    closeModal("cancel-modal");
    window.AppShell?.toast?.(
      res.alreadyCanceled
        ? "La cancelación ya estaba programada."
        : `Listo. Tu plan sigue activo hasta el ${formatDate(res.periodEnd || state.periodEnd)}.`
    );
  });

  document.querySelectorAll("[data-close-payment]").forEach((el) =>
    el.addEventListener("click", () => closeModal("payment-modal"))
  );
  document.querySelectorAll("[data-close-pending]").forEach((el) =>
    el.addEventListener("click", () => closeModal("pending-modal"))
  );
  document.querySelectorAll("[data-close-history]").forEach((el) =>
    el.addEventListener("click", () => closeModal("history-modal"))
  );
  document.querySelectorAll("[data-close-invoices]").forEach((el) =>
    el.addEventListener("click", () => closeModal("invoices-modal"))
  );
  document.querySelectorAll("[data-close-faq]").forEach((el) =>
    el.addEventListener("click", () => closeModal("faq-modal"))
  );
  document.querySelectorAll("[data-close-cancel]").forEach((el) =>
    el.addEventListener("click", () => closeModal("cancel-modal"))
  );

  window.addEventListener("storage", (e) => {
    if (e.key === BOOKINGS_KEY) renderUsage();
  });
  window.addEventListener("gestionweb:bookings-changed", renderUsage);
  window.BookingStore?.subscribe?.(renderUsage);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") renderUsage();
  });

  state = { ...state, ...readLocal() };
  const billingCache = window.Billing?.cached?.();
  if (billingCache) {
    state = {
      ...state,
      planId: billingCache.planId || state.planId,
      status: billingCache.status || state.status,
      periodStart: billingCache.periodStart || state.periodStart,
      periodEnd: billingCache.periodEnd || state.periodEnd,
      lastPaymentAt: billingCache.lastPaymentAt || state.lastPaymentAt,
      cancelAtPeriodEnd: !!billingCache.cancelAtPeriodEnd,
    };
  }

  const urlPlan = new URLSearchParams(location.search).get("plan");
  if (urlPlan && plansList().some((p) => p.id === urlPlan)) {
    checkoutPlanId = urlPlan;
  }
  render();

  (async () => {
    await syncFromCloud();
    await handleReturnFromWompi();
  })();
})();
