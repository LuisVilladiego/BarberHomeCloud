(function () {
  const USERS_KEY = "gestionweb.loyalty_users";
  const HISTORY_KEY = "gestionweb.loyalty_history";
  const SALES_KEY = "gestionweb.marketplace_sales";
  const PRODUCT_REDEEMS_KEY = "gestionweb.loyalty_product_redemptions";
  const EXPIRE_MONTHS = 12;

  const form = document.getElementById("points-assign-form");
  const lookupBox = document.getElementById("points-lookup");
  const table = document.getElementById("points-clients-table");
  const historyEl = document.getElementById("points-history");
  const searchInput = document.getElementById("points-search");
  const productRedeemsEl = document.getElementById("product-redeems-list");
  const productRedeemsBadge = document.getElementById("product-redeems-badge");

  function normalizeDoc(value, docType) {
    const type = String(docType || "CC").toUpperCase();
    const cleaned = String(value || "").replace(/\s+/g, "");
    if (type === "PAS") return cleaned.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
    return cleaned.replace(/\D/g, "");
  }

  function bindDocNumberInputs(root = document) {
    root.querySelectorAll("[data-doc-number], input[name='docNumber']").forEach((input) => {
      const scope = input.closest("form") || input.closest(".points-admin-form") || document;
      const typeEl = () => scope.querySelector("[name='docType'], #admin-doc-type");
      const sync = () => {
        const next = normalizeDoc(input.value, typeEl()?.value || "CC");
        if (input.value !== next) input.value = next;
        const docType = typeEl()?.value || "CC";
        input.inputMode = docType === "PAS" ? "text" : "numeric";
        input.pattern = docType === "PAS" ? "[A-Za-z0-9]*" : "[0-9]*";
      };
      input.addEventListener("input", sync);
      typeEl()?.addEventListener("change", sync);
      sync();
    });
  }

  function validateDocNumber(docType, docNumber) {
    if (!docNumber) return "El número de documento es obligatorio.";
    if (docType === "PAS") {
      if (!/^[A-Z0-9]{4,20}$/i.test(docNumber)) {
        return "Ingresa un pasaporte válido (letras y números, sin espacios).";
      }
      return "";
    }
    if (!/^\d+$/.test(docNumber)) return "El número de documento solo puede contener números.";
    if (docNumber.length < 5) return "El número de documento es demasiado corto.";
    return "";
  }

  function loadUsers() {
    try {
      return JSON.parse(localStorage.getItem(USERS_KEY) || "[]");
    } catch {
      return [];
    }
  }

  function saveUsers(users) {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
    if (window.SupabaseData?.enabled?.()) {
      Promise.resolve()
        .then(async () => {
          for (const u of (users || []).slice(0, 100)) {
            await window.SupabaseData.upsertCliente(u);
          }
        })
        .catch((err) => console.warn("[puntos] sync clientes", err));
    }
  }

  function loadHistory() {
    try {
      return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    } catch {
      return [];
    }
  }

  function saveHistory(items) {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, 200)));
  }

  function loadProductRedeems() {
    try {
      const list = JSON.parse(localStorage.getItem(PRODUCT_REDEEMS_KEY) || "[]");
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }

  function saveProductRedeems(list) {
    localStorage.setItem(PRODUCT_REDEEMS_KEY, JSON.stringify(list.slice(0, 200)));
  }

  function loadSales() {
    try {
      const list = JSON.parse(localStorage.getItem(SALES_KEY) || "[]");
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }

  /** Importa canjes antiguos guardados solo como ventas del marketplace. */
  function syncProductRedeemsFromSales() {
    const sales = loadSales().filter((s) => s && s.source === "loyalty-points");
    if (!sales.length) return loadProductRedeems();

    const list = loadProductRedeems();
    const known = new Set(
      list.flatMap((r) => [r.id, r.saleId].filter(Boolean).map(String))
    );
    let changed = false;

    sales.forEach((sale) => {
      const saleId = String(sale.id || "");
      const redeemId = String(sale.redeemId || "");
      if ((saleId && known.has(saleId)) || (redeemId && known.has(redeemId))) return;

      const item = Array.isArray(sale.items) ? sale.items[0] : null;
      const customer = sale.customer || {};
      const entry = {
        id: redeemId || `predeem-from-${saleId || Date.now().toString(36)}`,
        saleId: saleId || null,
        createdAt: sale.createdAt || new Date().toISOString(),
        productId: item?.productId || "",
        productName: item?.name || "Producto",
        pointsCost: Number(item?.pointsCost) || 0,
        valueCop: Number(item?.lineTotal ?? item?.price ?? sale.total) || 0,
        status: "pending",
        deliveredAt: null,
        pointsDeducted: true,
        customer: {
          userId: customer.userId || "",
          name: customer.name || "Cliente",
          docType: customer.docType || "CC",
          docNumber: customer.docNumber || "",
          phone: customer.phone || "",
          email: customer.email || "",
        },
      };
      list.unshift(entry);
      known.add(entry.id);
      if (saleId) known.add(saleId);
      changed = true;
    });

    if (changed) {
      list.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
      saveProductRedeems(list);
    }
    return list;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatWhen(iso) {
    try {
      return new Date(iso).toLocaleString("es-CO");
    } catch {
      return "—";
    }
  }

  function renderProductRedeems() {
    if (!productRedeemsEl) return;
    const list = syncProductRedeemsFromSales().slice().sort((a, b) => {
      const rank = (x) => (x.status === "delivered" ? 1 : 0);
      return rank(a) - rank(b) || String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
    });
    const pending = list.filter((r) => r.status !== "delivered");
    const recent = list.slice(0, 20);

    if (productRedeemsBadge) {
      const n = pending.length;
      productRedeemsBadge.hidden = n <= 0;
      productRedeemsBadge.textContent = n === 1 ? "1 pendiente" : `${n} pendientes`;
    }

    if (!recent.length) {
      productRedeemsEl.innerHTML =
        `<p class="empty-hint">Aún no hay canjes de productos. Cuando un cliente canjee en Puntos, aparecerá aquí.</p>`;
      return;
    }

    productRedeemsEl.innerHTML = recent
      .map((r) => {
        const c = r.customer || {};
        const pending = r.status !== "delivered";
        const pts = Number(r.pointsCost) || 0;
        return `
          <article class="points-product-redeem ${pending ? "is-pending" : "is-delivered"}">
            <div class="points-product-redeem__main">
              <div class="points-product-redeem__top">
                <strong>${escapeHtml(r.productName || "Producto")}</strong>
                <span class="points-product-redeem__chip">${pending ? "Por entregar" : "Entregado"}</span>
              </div>
              <p>
                ${escapeHtml(c.name || "Cliente")}
                · ${escapeHtml(c.docType || "CC")} ${escapeHtml(c.docNumber || "—")}
                ${c.phone ? ` · ${escapeHtml(c.phone)}` : ""}
              </p>
              <small>
                ${formatWhen(r.createdAt)}
                · −${pts} pts (ya descontados)
                ${r.deliveredAt ? ` · entregado ${formatWhen(r.deliveredAt)}` : ""}
              </small>
            </div>
            ${
              pending
                ? `<button type="button" class="btn btn--primary btn--sm" data-deliver-redeem="${escapeHtml(r.id)}">Marcar entregado</button>`
                : ""
            }
          </article>`;
      })
      .join("");
  }

  function markProductRedeemDelivered(id) {
    const list = loadProductRedeems();
    const idx = list.findIndex((r) => r.id === id);
    if (idx < 0) return false;
    if (list[idx].status === "delivered") return true;
    list[idx] = {
      ...list[idx],
      status: "delivered",
      deliveredAt: new Date().toISOString(),
    };
    saveProductRedeems(list);
    return true;
  }

  function expireDateFrom(iso) {
    const d = new Date(iso || Date.now());
    d.setMonth(d.getMonth() + EXPIRE_MONTHS);
    return d.toISOString();
  }

  function historyForUser(user, history) {
    const doc = normalizeDoc(user.docNumber);
    return (history || loadHistory()).filter((h) => {
      if (user.id && h.userId === user.id) return true;
      if (h.docNumber && normalizeDoc(h.docNumber) === doc) return true;
      return false;
    });
  }

  function fingerprint(entry) {
    return `${entry.at || ""}|${Number(entry.amount) || 0}`;
  }

  /** Suma activa desde el historial (fuente de verdad del saldo). */
  function balanceFromHistory(user, history) {
    const now = Date.now();
    let balance = 0;
    historyForUser(user, history).forEach((h) => {
      const amount = Number(h.amount) || 0;
      if (amount > 0) {
        const expMs = new Date(expireDateFrom(h.at)).getTime();
        if (!Number.isNaN(expMs) && expMs > now) balance += amount;
      } else {
        balance += amount;
      }
    });
    return Math.max(0, balance);
  }

  /** Historial = fuente de verdad; el ledger se reconcilia contra él. */
  function reconcileUser(user, history) {
    if (!user) return user;
    if (!Array.isArray(user.ledger)) user.ledger = [];

    const mine = historyForUser(user, history);
    const byFp = new Map(user.ledger.map((e) => [fingerprint(e), e]));

    mine.forEach((h) => {
      const fp = fingerprint(h);
      const amount = Number(h.amount) || 0;
      const isEarn = amount > 0;
      const existing = byFp.get(fp);
      if (existing) {
        if (isEarn && !existing.expiresAt) {
          existing.expiresAt = expireDateFrom(h.at);
        }
        return;
      }
      const entry = {
        type: isEarn ? "earn" : String(h.note || "").toLowerCase().includes("canje") ? "redeem" : "adjust",
        amount,
        at: h.at || new Date().toISOString(),
        expiresAt: isEarn ? expireDateFrom(h.at) : undefined,
        note: h.note || "",
        fromHistory: true,
      };
      user.ledger.push(entry);
      byFp.set(fp, entry);
    });

    user.points = balanceFromHistory(user, history);
    return user;
  }

  function reconcileAllUsers() {
    const history = loadHistory();
    const users = loadUsers().map((u) => reconcileUser(u, history));
    saveUsers(users);
    return users;
  }

  function findUser(docType, docNumber) {
    const doc = normalizeDoc(docNumber, docType);
    const users = reconcileAllUsers();
    return users.find((u) => u.docType === docType && normalizeDoc(u.docNumber, docType) === doc);
  }

  function showLookup(user) {
    if (!user) {
      lookupBox.hidden = true;
      return;
    }
    lookupBox.hidden = false;
    document.getElementById("lookup-name").textContent = user.name || "Cliente";
    document.getElementById("lookup-meta").textContent = `${user.docType} ${user.docNumber} · ${user.email || "Sin correo"} · ${user.phone || ""}`;
    document.getElementById("lookup-points").textContent = String(user.points || 0);
  }

  function renderClients(filter = "") {
    const q = filter.trim().toLowerCase();
    const users = reconcileAllUsers()
      .slice()
      .sort((a, b) => (b.points || 0) - (a.points || 0))
      .filter((u) => {
        if (!q) return true;
        return (
          String(u.name || "").toLowerCase().includes(q) ||
          String(u.docNumber || "").toLowerCase().includes(q) ||
          String(u.email || "").toLowerCase().includes(q)
        );
      });

    const head = `
      <div class="table__head" role="row">
        <div role="columnheader">Cliente</div>
        <div role="columnheader">Documento</div>
        <div role="columnheader">Puntos</div>
        <div role="columnheader" class="sr-only">Acciones</div>
      </div>`;

    const rows = users
      .map(
        (u) => `
      <div class="table__row" role="row">
        <div role="cell">
          <strong>${escapeHtml(u.name || "Sin nombre")}</strong>
          <div class="points-table__sub">${escapeHtml(u.email || "—")} · ${escapeHtml(u.phone || "—")}</div>
        </div>
        <div role="cell">${escapeHtml(u.docType)} ${escapeHtml(u.docNumber)}</div>
        <div role="cell"><strong class="points-table__pts">${u.points || 0}</strong></div>
        <div role="cell" class="row-actions">
          <button class="btn btn--secondary btn--sm" type="button" data-fill-doc="${escapeHtml(u.docType)}|${escapeHtml(u.docNumber)}">Usar</button>
        </div>
      </div>`
      )
      .join("");

    table.innerHTML =
      head +
      (rows ||
        `<p class="empty-hint" style="padding:16px 22px">Aún no hay clientes registrados en Rewards.</p>`);
  }

  function renderHistory() {
    const items = loadHistory();
    if (!items.length) {
      historyEl.innerHTML = `<p class="empty-hint">Todavía no hay movimientos de puntos.</p>`;
      return;
    }
    historyEl.innerHTML = items
      .map((h) => {
        const sign = h.amount > 0 ? "+" : "";
        const cls = h.amount >= 0 ? "is-plus" : "is-minus";
        return `
        <article class="points-history__item">
          <div>
            <strong>${escapeHtml(h.name || h.docNumber)}</strong>
            <p>${escapeHtml(h.docType)} ${escapeHtml(h.docNumber)} · ${escapeHtml(h.note || "Ajuste manual")}</p>
            <small>${new Date(h.at).toLocaleString("es-CO")}</small>
          </div>
          <span class="points-history__amount ${cls}">${sign}${h.amount}</span>
        </article>`;
      })
      .join("");
  }

  function applyPoints({ docType, docNumber, amount, note, createIfMissing }) {
    const history = loadHistory();
    let users = loadUsers();
    const doc = normalizeDoc(docNumber, docType);
    let idx = users.findIndex((u) => u.docType === docType && normalizeDoc(u.docNumber, docType) === doc);

    if (idx < 0) {
      if (!createIfMissing) return { ok: false, reason: "not_found" };
      users.push({
        id: crypto.randomUUID(),
        name: `Cliente ${doc}`,
        docType,
        docNumber: doc,
        email: "",
        phone: "",
        emailVerified: true,
        points: 0,
        ledger: [],
        createdAt: new Date().toISOString(),
        createdByAdmin: true,
      });
      idx = users.length - 1;
    }

    users[idx] = reconcileUser(users[idx], history);

    const now = new Date().toISOString();
    const entryNote = note || (amount >= 0 ? "Puntos asignados" : "Puntos descontados");
    const histItem = {
      id: crypto.randomUUID(),
      userId: users[idx].id,
      name: users[idx].name,
      docType,
      docNumber: doc,
      amount,
      note: entryNote,
      at: now,
    };

    // Primero historial, luego reconciliar saldo
    history.unshift(histItem);
    saveHistory(history);

    users[idx] = reconcileUser(users[idx], history);
    histItem.balance = users[idx].points;
    saveHistory(history);
    saveUsers(users);

    return { ok: true, user: users[idx] };
  }

  document.getElementById("btn-lookup-client")?.addEventListener("click", () => {
    const docType = document.getElementById("admin-doc-type").value;
    const docNumber = normalizeDoc(document.getElementById("admin-doc-number").value, docType);
    const docError = validateDocNumber(docType, docNumber);
    if (docError) {
      window.AppShell?.toast(docError);
      return;
    }
    const user = findUser(docType, docNumber);
    if (!user) {
      lookupBox.hidden = false;
      document.getElementById("lookup-name").textContent = "Cliente no registrado";
      document.getElementById("lookup-meta").textContent =
        "Si aplicas puntos, se creará un registro vinculado a esta cédula.";
      document.getElementById("lookup-points").textContent = "0";
      window.AppShell?.toast("No hay cuenta con esa cédula.");
      return;
    }
    showLookup(user);
  });

  form?.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const docType = String(fd.get("docType") || "CC");
    const docNumber = normalizeDoc(String(fd.get("docNumber") || ""), docType);
    const amount = Number(fd.get("amount") || 0);
    const note = String(fd.get("note") || "").trim();

    const docError = validateDocNumber(docType, docNumber);
    if (docError) {
      window.AppShell?.toast(docError);
      return;
    }
    if (!amount || Number.isNaN(amount)) {
      window.AppShell?.toast("Indica cuántos puntos sumar o restar.");
      return;
    }

    const existing = findUser(docType, docNumber);
    const createIfMissing = !existing
      ? confirm("No existe un cliente con esa cédula. ¿Crear registro y asignar los puntos?")
      : false;

    if (!existing && !createIfMissing) return;

    const result = applyPoints({
      docType,
      docNumber,
      amount,
      note,
      createIfMissing: !!existing || createIfMissing,
    });

    if (!result.ok) {
      window.AppShell?.toast("No se pudo aplicar.");
      return;
    }

    showLookup(result.user);
    renderClients(searchInput?.value || "");
    renderHistory();
    window.AppShell?.toast(
      amount >= 0
        ? `+${amount} puntos · saldo ${result.user.points}`
        : `${amount} puntos · saldo ${result.user.points}`
    );
  });

  table?.addEventListener("click", (e) => {
    const raw = e.target.closest("[data-fill-doc]")?.getAttribute("data-fill-doc");
    if (!raw) return;
    const [docType, docNumber] = raw.split("|");
    document.getElementById("admin-doc-type").value = docType;
    document.getElementById("admin-doc-number").value = docNumber;
    showLookup(findUser(docType, docNumber));
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  searchInput?.addEventListener("input", () => {
    renderClients(searchInput.value);
  });

  productRedeemsEl?.addEventListener("click", (e) => {
    const id = e.target.closest("[data-deliver-redeem]")?.getAttribute("data-deliver-redeem");
    if (!id) return;
    const before = loadProductRedeems().find((r) => r.id === id);
    const ok = markProductRedeemDelivered(id);
    if (!ok) {
      window.AppShell?.toast("No se encontró ese canje.");
      return;
    }
    renderProductRedeems();
    window.AppShell?.toast(`Entregado: ${before?.productName || "producto"}`);
  });

  function start() {
    renderProductRedeems();
    renderClients();
    renderHistory();
    bindDocNumberInputs();
  }

  if (window.AppShell?.whenReady) window.AppShell.whenReady(start);
  else window.addEventListener("gestionweb:panel-ready", start, { once: true });
})();
