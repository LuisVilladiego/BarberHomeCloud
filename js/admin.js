(function () {
  const gateEl = document.getElementById("admin-gate");
  const gateMsg = document.getElementById("admin-gate-msg");
  const gateLogin = document.getElementById("admin-gate-login");
  const appEl = document.getElementById("admin-app");
  const errorEl = document.getElementById("admin-error");
  const kpisEl = document.getElementById("admin-kpis");
  const negociosBody = document.getElementById("negocios-body");
  const pagosBody = document.getElementById("pagos-body");
  const userEmailEl = document.getElementById("admin-user-email");

  const PLATFORM_ADMIN_EMAILS = new Set(["adminbarbercloud@gmail.com"]);

  let negocios = [];
  let activeTab = "negocios";

  function withTimeout(promise, ms, message) {
    return Promise.race([
      promise,
      new Promise((_, reject) => {
        window.setTimeout(() => reject(new Error(message || "Tiempo de espera agotado.")), ms);
      }),
    ]);
  }

  function readSessionFromStorage() {
    return window.AdminSession?.readAdminSession?.() || null;
  }

  function accessTokenFromStorage() {
    return readSessionFromStorage()?.token || "";
  }

  function isKnownPlatformAdmin(email) {
    return PLATFORM_ADMIN_EMAILS.has(String(email || "").trim().toLowerCase());
  }

  const formatMoney = (amount) =>
    new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      maximumFractionDigits: 0,
    }).format(Number(amount) || 0);

  function formatDate(value) {
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("es-CO", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function toLocalInput(value) {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function fromLocalInput(value) {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  function showError(message) {
    if (!errorEl) return;
    errorEl.hidden = !message;
    errorEl.textContent = message || "";
  }

  function statusTone(active, status) {
    if (active) return "ok";
    if (status === "canceled" || status === "expired") return "paused";
    return "paused";
  }

  async function accessToken() {
    const stored = accessTokenFromStorage();
    if (stored) return stored;
    const client = window.SupabaseClient?.getClient?.();
    if (!client) return "";
    const { data } = await client.auth.getSession();
    return data?.session?.access_token || "";
  }

  async function api(path, options = {}) {
    const token = await accessToken();
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch(path, {
        ...options,
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          ...(options.headers || {}),
        },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const err = new Error(data?.error || `Error ${res.status}`);
        err.status = res.status;
        throw err;
      }
      return data;
    } catch (err) {
      if (err.name === "AbortError") {
        throw new Error("El servidor tardó demasiado. Revisa SUPABASE_SERVICE_ROLE_KEY en Vercel.");
      }
      throw err;
    } finally {
      window.clearTimeout(timer);
    }
  }

  function showGate(message, withLogin = false) {
    gateEl.hidden = false;
    appEl.hidden = true;
    gateMsg.textContent = message;
    gateLogin.hidden = !withLogin;
  }

  function showApp(email) {
    document.documentElement.classList.add("admin-authed");
    gateEl.hidden = true;
    appEl.hidden = false;
    if (userEmailEl) userEmailEl.textContent = email || "";
  }

  function ensureAccessSync() {
    const session = readSessionFromStorage();
    if (!session) {
      location.replace("admin-login.html");
      return null;
    }
    if (!isKnownPlatformAdmin(session.email)) {
      showGate(`La cuenta ${session.email} no está autorizada.`, false);
      return null;
    }
    showApp(session.email);
    return session;
  }

  function renderKpis(data) {
    if (!kpisEl || !data?.counts) return;
    const c = data.counts;
    kpisEl.innerHTML = [
      { label: "Negocios", value: c.total, hint: "Tenants registrados" },
      { label: "Con acceso", value: c.with_access, hint: "Periodo vigente" },
      { label: "En prueba", value: c.trial, hint: "Trial activo" },
      { label: "Cancelación prog.", value: c.pending_cancel, hint: "No renovarán solos" },
      { label: "MRR estimado", value: formatMoney(data.mrrCop), hint: "Planes con acceso" },
      { label: "Ingresos 30 días", value: formatMoney(data.revenue30dCop), hint: "Pagos aprobados" },
    ]
      .map(
        (k) => `
      <article class="admin-kpi">
        <p class="admin-kpi__label">${k.label}</p>
        <p class="admin-kpi__value">${k.value}</p>
        <p class="admin-kpi__hint">${k.hint}</p>
      </article>`
      )
      .join("");
  }

  function renderNegocios(rows) {
    if (!negociosBody) return;
    if (!rows.length) {
      negociosBody.innerHTML =
        '<tr><td colspan="7" class="admin-empty">No hay negocios que coincidan con el filtro.</td></tr>';
      return;
    }

    negociosBody.innerHTML = rows
      .map((n) => {
        const tone = statusTone(n.access_active, n.subscription_status);
        return `
        <tr>
          <td>
            <strong>${n.name || "Sin nombre"}</strong>
            <div class="admin-table__slug">/${n.slug || "—"}</div>
          </td>
          <td>${n.owner_email || "—"}</td>
          <td>${n.plan_label || n.plan_id}</td>
          <td><span class="status status--${tone}">${n.subscription_status}${n.cancel_at_period_end ? " · cancela" : ""}</span></td>
          <td>${formatDate(n.current_period_end)}</td>
          <td>${n.access_active ? "Sí" : "No"}</td>
          <td><button class="btn btn--ghost btn--sm" type="button" data-edit="${n.id}">Editar</button></td>
        </tr>`;
      })
      .join("");
  }

  function renderPagos(rows) {
    if (!pagosBody) return;
    if (!rows.length) {
      pagosBody.innerHTML = '<tr><td colspan="6" class="admin-empty">Sin pagos registrados.</td></tr>';
      return;
    }

    pagosBody.innerHTML = rows
      .map((p) => {
        const approved = String(p.status).toUpperCase() === "APPROVED";
        return `
        <tr>
          <td>${formatDate(p.created_at)}</td>
          <td>${p.negocio_name}${p.negocio_slug ? `<div class="admin-table__slug">/${p.negocio_slug}</div>` : ""}</td>
          <td>${p.plan_id || "—"}</td>
          <td>${formatMoney(p.amount_cop)}</td>
          <td><span class="status status--${approved ? "ok" : "paused"}">${p.status}</span></td>
          <td><code>${p.reference}</code></td>
        </tr>`;
      })
      .join("");
  }

  async function loadOverview() {
    const data = await api("/api/admin/overview");
    renderKpis(data);
  }

  async function loadNegocios() {
    const q = document.getElementById("filter-q")?.value?.trim() || "";
    const status = document.getElementById("filter-status")?.value || "";
    const plan = document.getElementById("filter-plan")?.value || "";
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    if (plan) params.set("plan", plan);

    const data = await api(`/api/admin/negocios?${params.toString()}`);
    negocios = data.negocios || [];
    renderNegocios(negocios);
  }

  async function loadPagos() {
    const data = await api("/api/admin/pagos?limit=80");
    renderPagos(data.pagos || []);
  }

  async function refreshAll() {
    showError("");
    await Promise.all([loadOverview(), loadNegocios(), loadPagos()]);
  }

  function openEdit(id) {
    const n = negocios.find((row) => row.id === id);
    if (!n) return;
    document.getElementById("edit-id").value = n.id;
    document.getElementById("edit-title").textContent = n.name || "Editar suscripción";
    document.getElementById("edit-subtitle").textContent = `/${n.slug} · ${n.owner_email || "sin email"}`;
    document.getElementById("edit-plan").value = n.plan_id || "pro";
    document.getElementById("edit-status").value = n.subscription_status || "expired";
    document.getElementById("edit-start").value = toLocalInput(n.current_period_start);
    document.getElementById("edit-end").value = toLocalInput(n.current_period_end);
    document.getElementById("edit-last-payment").value = toLocalInput(n.last_payment_at);
    document.getElementById("edit-cancel").checked = !!n.cancel_at_period_end;
    document.getElementById("edit-modal").hidden = false;
  }

  function closeEdit() {
    document.getElementById("edit-modal").hidden = true;
  }

  document.querySelectorAll(".admin-tabs__btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeTab = btn.getAttribute("data-tab") || "negocios";
      document.querySelectorAll(".admin-tabs__btn").forEach((el) => {
        el.classList.toggle("is-active", el === btn);
      });
      document.getElementById("tab-negocios").hidden = activeTab !== "negocios";
      document.getElementById("tab-pagos").hidden = activeTab !== "pagos";
    });
  });

  document.getElementById("btn-refresh")?.addEventListener("click", refreshAll);
  document.getElementById("filter-q")?.addEventListener("input", () => {
    window.clearTimeout(window.__adminFilterT);
    window.__adminFilterT = window.setTimeout(loadNegocios, 250);
  });
  document.getElementById("filter-status")?.addEventListener("change", loadNegocios);
  document.getElementById("filter-plan")?.addEventListener("change", loadNegocios);

  negociosBody?.addEventListener("click", (event) => {
    const id = event.target.closest("[data-edit]")?.getAttribute("data-edit");
    if (id) openEdit(id);
  });

  document.querySelectorAll("[data-close-edit]").forEach((el) => {
    el.addEventListener("click", closeEdit);
  });

  document.getElementById("edit-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const saveBtn = document.getElementById("edit-save");
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = "Guardando…";
    }
    showError("");

    try {
      await api("/api/admin/negocios", {
        method: "PATCH",
        body: JSON.stringify({
          id: document.getElementById("edit-id").value,
          plan_id: document.getElementById("edit-plan").value,
          subscription_status: document.getElementById("edit-status").value,
          current_period_start: fromLocalInput(document.getElementById("edit-start").value),
          current_period_end: fromLocalInput(document.getElementById("edit-end").value),
          last_payment_at: fromLocalInput(document.getElementById("edit-last-payment").value),
          cancel_at_period_end: document.getElementById("edit-cancel").checked,
        }),
      });
      closeEdit();
      await refreshAll();
    } catch (err) {
      showError(err.message || "No se pudo guardar.");
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = "Guardar";
      }
    }
  });

  document.getElementById("admin-logout")?.addEventListener("click", async () => {
    try {
      localStorage.removeItem("barbercloud.auth");
      const client = window.SupabaseClient?.getClient?.();
      await client?.auth?.signOut?.();
    } catch {
      /* ignore */
    }
    location.href = "admin-login.html";
  });

  (function boot() {
    const session = ensureAccessSync();
    if (!session) return;
    refreshAll().catch((err) => {
      showError(err.message || "No se pudo cargar el panel.");
    });
  })();
})();
