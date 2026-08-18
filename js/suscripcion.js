(function () {
  const STORAGE_KEY = "barbercloud.subscription";
  const BOOKINGS_KEY = "barbercloud.bookings";
  const USD_TO_COP = 4000;

  // Planes BarberCloud (USD) convertidos a COP
  const PLANS = [
    { id: "50", limit: 50, priceUsd: 12, price: 12 * USD_TO_COP, label: "50 citas al mes" },
    { id: "100", limit: 100, priceUsd: 18, price: 18 * USD_TO_COP, label: "100 citas al mes" },
    { id: "200", limit: 200, priceUsd: 31, price: 31 * USD_TO_COP, label: "200 citas al mes" },
    { id: "300", limit: 300, priceUsd: 45, price: 45 * USD_TO_COP, label: "300 citas al mes" },
  ];

  const defaults = {
    planId: "100",
    status: "active",
    cancelAtPeriodEnd: false,
    currency: "COP",
    overageCost: Math.round(0.2 * USD_TO_COP),
    billingFrequency: "Mensual",
    periodStart: "2026-07-17",
    periodEnd: "2026-08-17",
    nextCharge: "2026-08-17",
    payment: {
      provider: "pending",
    },
    invoices: [
      { id: "inv-2026-07", label: "Julio 2026", amount: 18 * USD_TO_COP, date: "2026-07-17" },
      { id: "inv-2026-06", label: "Junio 2026", amount: 18 * USD_TO_COP, date: "2026-06-17" },
      { id: "inv-2026-05", label: "Mayo 2026", amount: 18 * USD_TO_COP, date: "2026-05-17" },
    ],
  };

  function formatMoney(amount) {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      maximumFractionDigits: 0,
    }).format(Number(amount) || 0);
  }

  function load() {
    try {
      const raw = { ...defaults, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") };
      delete raw.demoUsed;
      if (raw.payment && typeof raw.payment === "object") {
        delete raw.payment.last4;
        delete raw.payment.number;
        delete raw.payment.cvc;
        delete raw.payment.expiry;
        delete raw.payment.holder;
        raw.payment.provider = "pending";
      }
      if (raw.currency !== "COP") {
        raw.currency = "COP";
        raw.overageCost = defaults.overageCost;
        raw.invoices = defaults.invoices;
        if (["250", "500"].includes(raw.planId)) raw.planId = "200";
      }
      if (Number(raw.overageCost) > 0 && Number(raw.overageCost) < 10) {
        raw.overageCost = Math.round(Number(raw.overageCost) * USD_TO_COP);
      }
      return raw;
    } catch {
      return { ...defaults };
    }
  }

  function save(state) {
    delete state.demoUsed;
    if (state.payment && typeof state.payment === "object") {
      delete state.payment.last4;
      delete state.payment.number;
      delete state.payment.cvc;
      delete state.payment.expiry;
      delete state.payment.holder;
      state.payment.provider = "pending";
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    const id = window.Tenant?.currentId?.();
    const cached = window.Tenant?.cached?.();
    if (cached?.id || id) {
      window.Tenant?.setCurrent?.({
        ...cached,
        id: id || cached?.id,
        subscription_status: state.status || "active",
        plan_id: state.planId || cached?.plan_id || "100",
      });
    }
    if (id && cached?.slug && window.SupabaseData?.enabled?.()) {
      window.SupabaseData.upsertNegocio({
        id,
        slug: window.Tenant.cached?.()?.slug,
        name: window.Tenant.cached?.()?.name,
        subscription_status: state.status || "active",
        plan_id: state.planId || "100",
        autoagenda: window.Tenant.cached?.()?.autoagenda || {},
      }).catch((err) => console.warn("[suscripcion] sync negocio", err));
    }
  }

  function formatDate(iso, style = "short") {
    const d = new Date(`${iso}T12:00:00`);
    if (style === "long") {
      return d.toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });
    }
    return d.toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit", year: "numeric" });
  }

  function currentPlan(state) {
    return PLANS.find((p) => p.id === state.planId) || PLANS[1];
  }

  function toIsoDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function billingAnchorDay(state) {
    const charge = state.nextCharge || defaults.nextCharge;
    const parsed = new Date(`${charge}T12:00:00`);
    const day = parsed.getDate();
    return Number.isFinite(day) && day > 0 ? day : 17;
  }

  /** Ajusta el período para que siempre incluya la fecha de hoy. */
  function normalizeBillingPeriod(state) {
    const anchorDay = billingAnchorDay(state);
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const today = now.getDate();

    let endYear = y;
    let endMonth = m;
    if (today >= anchorDay) endMonth += 1;
    if (endMonth > 11) {
      endMonth = 0;
      endYear += 1;
    }

    const periodEnd = new Date(endYear, endMonth, anchorDay);
    const periodStart = new Date(endYear, endMonth - 1, anchorDay);
    state.periodStart = toIsoDate(periodStart);
    state.periodEnd = toIsoDate(periodEnd);
    if (!state.cancelAtPeriodEnd) state.nextCharge = state.periodEnd;
    return state;
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

  function bookingsInPeriod(state) {
    const start = state.periodStart;
    const end = state.periodEnd;
    return loadBookings().filter((b) => {
      if (!isActiveBooking(b)) return false;
      const day = String(b.date || b.createdAt || "").slice(0, 10);
      return day >= start && day <= end;
    });
  }

  function usedCount(state) {
    return bookingsInPeriod(state).length;
  }

  let stored = null;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch {
    stored = null;
  }
  let state = normalizeBillingPeriod(load());
  if (!stored) {
    state.status = "incomplete";
  } else {
    save(state);
  }

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

  function renderUsage(used) {
    const plan = currentPlan(state);
    const pct = Math.min(100, Math.round((used / plan.limit) * 100));
    usageUsed.textContent = String(used);
    usageLabel.textContent = ` / ${plan.limit} citas usadas este período`;
    usageBar.style.width = `${pct}%`;
    usagePct.textContent = `${pct}% usado`;
    usageLimit.textContent = `Límite del plan: ${plan.limit}`;
  }

  function refreshUsage() {
    state = normalizeBillingPeriod(state);
    save(state);
    billingPeriod.textContent = `Período de facturación: ${formatDate(state.periodStart, "long")} - ${formatDate(state.periodEnd, "long")}`;
    renderUsage(usedCount(state));
  }

  function render() {
    const plan = currentPlan(state);
    const used = usedCount(state);

    planTitle.textContent = `Tienes el plan de ${plan.limit} citas al mes`;
    if (state.cancelAtPeriodEnd) {
      planNext.textContent = `Se cancelará el ${formatDate(state.periodEnd)}`;
      planStatus.textContent = "Cancelación programada";
      planStatus.className = "status status--paused";
    } else {
      planNext.textContent = `Próximo cargo: ${formatDate(state.nextCharge)} · ${formatMoney(plan.price)}`;
      planStatus.textContent =
        state.status === "active" || state.status === "trialing"
          ? "Activo"
          : state.status === "incomplete"
            ? "Sin activar"
            : "Pausado";
      planStatus.className = `status ${
        state.status === "active" || state.status === "trialing" ? "status--ok" : "status--paused"
      }`;
    }

    billingPeriod.textContent = `Período de facturación: ${formatDate(state.periodStart, "long")} - ${formatDate(state.periodEnd, "long")}`;
    renderUsage(used);
    if (overageCost) overageCost.textContent = formatMoney(state.overageCost);
    if (billingFrequency) billingFrequency.textContent = state.billingFrequency || "Mensual";
    refreshUsage();
  }

  function openModal(id) {
    document.getElementById(id).hidden = false;
  }
  function closeModal(id) {
    document.getElementById(id).hidden = true;
  }

  function renderPlanOptions() {
    const box = document.getElementById("plan-options");
    box.innerHTML = PLANS.map((plan) => {
      const selected = plan.id === state.planId;
      return `
        <button type="button" class="plan-option ${selected ? "is-selected" : ""}" data-plan="${plan.id}">
          <span>
            <strong>${plan.label}</strong>
            <small>${formatMoney(plan.price)} / mes</small>
          </span>
          <span class="plan-option__badge">${selected ? "Actual" : "Elegir"}</span>
        </button>`;
    }).join("");
  }

  document.getElementById("btn-change-plan")?.addEventListener("click", () => {
    renderPlanOptions();
    openModal("plan-modal");
  });

  document.getElementById("plan-options")?.addEventListener("click", (e) => {
    const id = e.target.closest("[data-plan]")?.getAttribute("data-plan");
    if (!id) return;
    state.planId = id;
    state.status = "active";
    // Actualizar facturas demo al precio del plan actual
    state.invoices = (state.invoices || []).map((inv) => ({
      ...inv,
      amount: currentPlan(state).price,
    }));
    save(state);
    render();
    refreshNeedBanner();
    closeModal("plan-modal");
    window.AppShell?.toast("Plan actualizado");
  });

  document.getElementById("btn-payment")?.addEventListener("click", () => {
    openModal("payment-modal");
  });

  document.getElementById("btn-history")?.addEventListener("click", () => {
    const list = document.getElementById("history-list");
    openModal("history-modal");
    const bookings = bookingsInPeriod(state);
    if (!bookings.length) {
      list.innerHTML = `<p class="empty-hint">Aún no hay citas agendadas en este período de facturación.</p>`;
    } else {
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
    }
  });

  document.getElementById("btn-invoices")?.addEventListener("click", () => {
    const list = document.getElementById("invoice-list");
    list.innerHTML = (state.invoices || [])
      .map(
        (inv) => `
        <button type="button" class="manage-item" data-invoice="${inv.id}">
          <span class="manage-item__text">
            <strong>${inv.label}</strong>
            <small>${formatDate(inv.date)} · ${formatMoney(inv.amount)}</small>
          </span>
          <span class="btn btn--ghost" style="pointer-events:none;height:34px">Descargar</span>
        </button>`
      )
      .join("");
    openModal("invoices-modal");
  });

  document.getElementById("invoice-list")?.addEventListener("click", (e) => {
    const id = e.target.closest("[data-invoice]")?.getAttribute("data-invoice");
    if (!id) return;
    const inv = (state.invoices || []).find((i) => i.id === id);
    if (!inv) return;
    const blob = new Blob(
      [
        `Factura ${inv.label}\nFecha: ${inv.date}\nMonto: ${formatMoney(inv.amount)}\nMoneda: COP\nPlan BarberCloud\n`,
      ],
      { type: "text/plain;charset=utf-8" }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${inv.id}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    window.AppShell?.toast("Factura descargada");
  });

  document.getElementById("btn-faq")?.addEventListener("click", () => openModal("faq-modal"));

  document.getElementById("btn-cancel")?.addEventListener("click", () => {
    const lead = document.getElementById("cancel-lead");
    if (state.cancelAtPeriodEnd) {
      lead.textContent =
        "Ya programaste la cancelación. Puedes reactivar la renovación automática si cambiaste de opinión.";
      document.getElementById("btn-confirm-cancel").textContent = "Reactivar renovación";
    } else {
      lead.textContent = `Tu plan seguirá activo hasta el ${formatDate(
        state.periodEnd
      )}. Después no se renovará automáticamente.`;
      document.getElementById("btn-confirm-cancel").textContent = "Cancelar al final del período";
    }
    openModal("cancel-modal");
  });

  document.getElementById("btn-confirm-cancel")?.addEventListener("click", () => {
    state.cancelAtPeriodEnd = !state.cancelAtPeriodEnd;
    save(state);
    render();
    closeModal("cancel-modal");
    window.AppShell?.toast(
      state.cancelAtPeriodEnd ? "Cancelación programada" : "Renovación reactivada"
    );
  });

  document.querySelectorAll("[data-close-plan]").forEach((el) =>
    el.addEventListener("click", () => closeModal("plan-modal"))
  );
  function refreshNeedBanner() {
    const needEl = document.getElementById("sub-need");
    if (!needEl) return;
    const need =
      new URLSearchParams(location.search).get("need") === "1" || state.status === "incomplete";
    needEl.hidden = !need || state.status === "active" || state.status === "trialing";
  }

  document.querySelectorAll("[data-close-payment]").forEach((el) =>
    el.addEventListener("click", () => {
      state.status = "active";
      save(state);
      render();
      refreshNeedBanner();
      closeModal("payment-modal");
      window.AppShell?.toast("Suscripción activa. Ya puedes entrar al panel.");
    })
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
    if (e.key === BOOKINGS_KEY) refreshUsage();
  });

  window.addEventListener("barbercloud:bookings-changed", refreshUsage);
  window.BookingStore?.subscribe?.(refreshUsage);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refreshUsage();
  });

  refreshNeedBanner();
  render();
})();
