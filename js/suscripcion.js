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
    demoUsed: 42,
    payment: {
      holder: "Luis Villadiego",
      last4: "4242",
      expiry: "08/28",
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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

  function bookingsInPeriod(state) {
    try {
      const list = JSON.parse(localStorage.getItem(BOOKINGS_KEY) || "[]");
      const start = state.periodStart;
      const end = state.periodEnd;
      return list.filter((b) => {
        const day = (b.date || b.createdAt || "").slice(0, 10);
        return day >= start && day <= end;
      });
    } catch {
      return [];
    }
  }

  function usedCount(state) {
    const real = bookingsInPeriod(state).length;
    return Math.max(real, Number(state.demoUsed) || 0);
  }

  let state = load();
  save(state);

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

  function render() {
    const plan = currentPlan(state);
    const used = usedCount(state);
    const pct = Math.min(100, Math.round((used / plan.limit) * 100));

    planTitle.textContent = `Tienes el plan de ${plan.limit} citas al mes`;
    if (state.cancelAtPeriodEnd) {
      planNext.textContent = `Se cancelará el ${formatDate(state.periodEnd)}`;
      planStatus.textContent = "Cancelación programada";
      planStatus.className = "status status--paused";
    } else {
      planNext.textContent = `Próximo cargo: ${formatDate(state.nextCharge)} · ${formatMoney(plan.price)}`;
      planStatus.textContent = state.status === "active" ? "Activo" : "Pausado";
      planStatus.className = `status ${state.status === "active" ? "status--ok" : "status--paused"}`;
    }

    billingPeriod.textContent = `Período de facturación: ${formatDate(state.periodStart, "long")} - ${formatDate(state.periodEnd, "long")}`;
    usageUsed.textContent = String(used);
    usageLabel.textContent = ` / ${plan.limit} citas usadas este período`;
    usageBar.style.width = `${pct}%`;
    usagePct.textContent = `${pct}% usado`;
    usageLimit.textContent = `Límite del plan: ${plan.limit}`;
    if (overageCost) overageCost.textContent = formatMoney(state.overageCost);
    if (billingFrequency) billingFrequency.textContent = state.billingFrequency || "Mensual";
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
    // Actualizar facturas demo al precio del plan actual
    state.invoices = (state.invoices || []).map((inv) => ({
      ...inv,
      amount: currentPlan(state).price,
    }));
    save(state);
    render();
    closeModal("plan-modal");
    window.AppShell?.toast("Plan actualizado");
  });

  document.getElementById("btn-payment")?.addEventListener("click", () => {
    const form = document.getElementById("payment-form");
    form.holder.value = state.payment?.holder || "";
    form.number.value = state.payment?.last4 ? `•••• •••• •••• ${state.payment.last4}` : "";
    form.expiry.value = state.payment?.expiry || "";
    form.cvc.value = "";
    openModal("payment-modal");
  });

  document.getElementById("payment-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const number = String(fd.get("number") || "").replace(/\D/g, "");
    state.payment = {
      holder: String(fd.get("holder") || "").trim(),
      last4: number.slice(-4) || state.payment?.last4 || "4242",
      expiry: String(fd.get("expiry") || "").trim(),
    };
    save(state);
    closeModal("payment-modal");
    window.AppShell?.toast("Método de pago guardado");
  });

  document.getElementById("btn-history")?.addEventListener("click", () => {
    const list = document.getElementById("history-list");
    const bookings = bookingsInPeriod(state);
    if (!bookings.length) {
      list.innerHTML = `<p class="empty-hint">Aún no hay citas registradas en este período. El consumo demo muestra ${state.demoUsed} citas.</p>`;
    } else {
      list.innerHTML = bookings
        .map(
          (b) => `
          <article class="diagnostic-item">
            <div class="diagnostic-item__top">
              <strong>${b.serviceName || b.name || "Cita"}</strong>
              <span class="status status--ok">${b.status || "ok"}</span>
            </div>
            <p>${b.date || ""} ${b.time || ""} · ${b.phone || ""}</p>
          </article>`
        )
        .join("");
    }
    openModal("history-modal");
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
  document.querySelectorAll("[data-close-payment]").forEach((el) =>
    el.addEventListener("click", () => closeModal("payment-modal"))
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

  render();
})();
