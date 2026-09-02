(function () {
  const STORAGE_KEY = "barbercloud.autoagenda";
  const BOOKINGS_KEY = "barbercloud.bookings";
  const form = document.getElementById("autoagenda-form");
  if (!form) return;

  const DAYS = [
    { key: "lun", label: "Lun" },
    { key: "mar", label: "Mar" },
    { key: "mie", label: "Mié" },
    { key: "jue", label: "Jue" },
    { key: "vie", label: "Vie" },
    { key: "sab", label: "Sáb" },
    { key: "dom", label: "Dom" },
  ];

  const slugInput = document.getElementById("slug");
  const titleInput = document.getElementById("title");
  const descriptionInput = document.getElementById("description");
  const avatarInput = document.getElementById("avatar-input");
  const avatarPreview = document.getElementById("avatar-preview");
  const dropzoneIdle = document.getElementById("dropzone-idle");
  const dropzone = document.getElementById("dropzone");
  const qrModal = document.getElementById("qr-modal");
  const qrBox = document.getElementById("qr-box");
  const qrUrl = document.getElementById("qr-url");
  const scheduleList = document.getElementById("schedule-list");
  const typeList = document.getElementById("type-list");
  const scheduleModal = document.getElementById("schedule-modal");
  const typeModal = document.getElementById("type-modal");
  const diagnosticModal = document.getElementById("diagnostic-modal");
  const scheduleForm = document.getElementById("schedule-form");
  const typeForm = document.getElementById("type-form");
  const dayGrid = document.getElementById("day-grid");
  const typeSchedule = document.getElementById("type-schedule");
  const reorderBtn = document.getElementById("btn-reorder-types");

  const defaultSchedule = {
    id: "sch-default",
    name: "Lunes - Domingo 8:00/8:00",
    days: {
      lun: { enabled: true, start: "07:00", end: "19:00" },
      mar: { enabled: true, start: "07:00", end: "19:00" },
      mie: { enabled: true, start: "07:00", end: "19:00" },
      jue: { enabled: true, start: "07:00", end: "19:00" },
      vie: { enabled: true, start: "06:00", end: "19:00" },
      sab: { enabled: true, start: "07:00", end: "19:00" },
      dom: { enabled: true, start: "07:00", end: "16:00" },
    },
  };

  function emptyState() {
    return {
      slug: "",
      title: "",
      description: "",
      avatarDataUrl: "",
      schedules: [],
      appointmentTypes: [],
    };
  }

  function normalizeLoaded(raw) {
    const next = { ...emptyState(), ...raw };
    if (!Array.isArray(next.schedules)) next.schedules = [];
    if (!Array.isArray(next.appointmentTypes)) next.appointmentTypes = [];
    next.appointmentTypes = next.appointmentTypes.map((t) => ({
      scheduleId: next.schedules[0]?.id || "sch-default",
      price: 0,
      ...t,
    }));
    if (window.Tenant?.isDemoSlug?.(next.slug)) {
      next.slug = "";
    }
    return next;
  }

  let state = load();
  let editingScheduleId = null;
  let editingTypeId = null;
  let pendingAvatar = "";
  let reorderMode = false;
  let isDirty = false;
  let savedFeedbackTimer = 0;

  function load() {
    const useEmpty = window.Tenant?.shouldUseEmptyForms?.() ?? true;
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      if (useEmpty) return emptyState();
      return normalizeLoaded(stored);
    } catch {
      return emptyState();
    }
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    renderPreview();
    scheduleNegocioSync();
  }

  let negocioSyncTimer = 0;
  function scheduleNegocioSync() {
    clearTimeout(negocioSyncTimer);
    negocioSyncTimer = setTimeout(persistNegocio, 800);
  }

  async function persistNegocio() {
    const v = window.Tenant?.validateSlug?.(state.slug);
    if (!v?.ok) return;
    if (!window.SupabaseData?.enabled?.()) return;
    let sub = {};
    try {
      sub = JSON.parse(localStorage.getItem("barbercloud.subscription") || "{}");
    } catch {
      sub = {};
    }
    const r = await window.SupabaseData.upsertNegocio({
      id: window.Tenant.currentId() || undefined,
      slug: v.slug,
      name: state.title || v.slug,
      owner_id: (await window.BarberAuth?.currentUser?.())?.id,
      subscription_status: sub.status || "active",
      plan_id: window.BusinessModel?.normalizePlanId?.(sub.planId) || sub.planId || "pro",
      autoagenda: { ...state, slug: v.slug },
    });
    if (!r.ok && r.message && /duplicate|unique|23505/i.test(r.message)) {
      setSlugHint("Ese slug ya está en uso por otro negocio.", "err");
    }
  }

  function publicUrl(slug) {
    if (window.Tenant?.publicUrl) return window.Tenant.publicUrl(slug);
    const clean = String(slug || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "");
    return new URL(`booking.html?s=${encodeURIComponent(clean || "negocio")}`, window.location.href).href;
  }

  function displayLink(slug) {
    if (window.Tenant?.displayLink) return window.Tenant.displayLink(slug);
    return `barber-home-cloud.vercel.app/${String(slug || "").trim()}`;
  }

  function formatTime(hhmm) {
    const [h, m] = hhmm.split(":").map(Number);
    const suffix = h >= 12 ? "PM" : "AM";
    const hour12 = ((h + 11) % 12) + 1;
    return `${hour12}:${String(m).padStart(2, "0")} ${suffix}`;
  }

  function summarizeSchedule(schedule) {
    const groups = [];
    let current = null;
    DAYS.forEach((day) => {
      const cfg = schedule.days[day.key];
      if (!cfg?.enabled) {
        current = null;
        return;
      }
      const key = `${cfg.start}-${cfg.end}`;
      if (current && current.key === key) current.days.push(day.label);
      else {
        current = { key, days: [day.label], start: cfg.start, end: cfg.end };
        groups.push(current);
      }
    });
    return groups.map((g) => {
      const label = g.days.length === 1 ? g.days[0] : `${g.days[0]} - ${g.days[g.days.length - 1]}`;
      return `${label}: ${formatTime(g.start)} - ${formatTime(g.end)}`;
    });
  }

  function scheduleById(id) {
    return state.schedules.find((s) => s.id === id) || state.schedules[0];
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function readBasicFields() {
    state.slug = slugInput.value.trim();
    state.title = titleInput.value.trim();
    state.description = descriptionInput.value;
  }

  function markDirty() {
    isDirty = true;
    updateSaveButton();
  }

  function updateSaveButton() {
    const btn = document.getElementById("btn-save-autoagenda");
    const label = document.getElementById("btn-save-autoagenda-label");
    if (!btn || !label || btn.classList.contains("is-saved")) return;
    btn.classList.toggle("is-dirty", isDirty);
    label.textContent = isDirty ? "Guardar cambios" : "Guardar";
  }

  function showSavedFeedback() {
    const btn = document.getElementById("btn-save-autoagenda");
    const label = document.getElementById("btn-save-autoagenda-label");
    if (!btn || !label) return;
    isDirty = false;
    btn.classList.remove("is-dirty");
    btn.classList.add("is-saved");
    label.textContent = "✅ Guardado";
    clearTimeout(savedFeedbackTimer);
    savedFeedbackTimer = setTimeout(() => {
      btn.classList.remove("is-saved");
      label.textContent = "Guardar";
    }, 2200);
  }

  async function saveAll() {
    readBasicFields();
    state.avatarDataUrl = pendingAvatar || state.avatarDataUrl;
    if (state.slug) {
      const v = window.Tenant?.validateSlug?.(state.slug);
      if (v && !v.ok) {
        if (v.reason === "empty") {
          setSlugHint(SLUG_HINT_DEFAULT);
        } else {
          setSlugHint(v.message, "err");
        }
        window.AppShell?.toast(v.message || "Revisa tu enlace público");
        slugInput?.focus();
        return;
      }
    }
    save();
    clearTimeout(negocioSyncTimer);
    await persistNegocio();
    showSavedFeedback();
    window.AppShell?.toast("Cambios guardados");
  }

  function syncBasicFields() {
    readBasicFields();
  }

  function applyBasic() {
    slugInput.value = state.slug || "";
    titleInput.value = state.title || "";
    descriptionInput.value = state.description || "";
    if (state.avatarDataUrl) {
      avatarPreview.src = state.avatarDataUrl;
      avatarPreview.hidden = false;
      dropzoneIdle.hidden = true;
      pendingAvatar = state.avatarDataUrl;
    } else {
      avatarPreview.hidden = true;
      dropzoneIdle.hidden = false;
      pendingAvatar = "";
    }
  }

  function renderSchedules() {
    scheduleList.innerHTML = state.schedules
      .map((schedule) => {
        const lines = summarizeSchedule(schedule)
          .map((line) => `<li>${line}</li>`)
          .join("");
        return `
          <article class="schedule-card" data-id="${schedule.id}">
            <div>
              <h3>${escapeHtml(schedule.name)}</h3>
              <ul>${lines}</ul>
            </div>
            <button class="icon-btn" type="button" data-edit-schedule="${schedule.id}" aria-label="Editar horario">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M4 17.5V20h2.5L17.2 9.3l-2.5-2.5L4 17.5Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>
                <path d="m13.8 5.8 2.5 2.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
              </svg>
            </button>
          </article>`;
      })
      .join("");
  }

  function renderTypes() {
    const head = `
      <div class="table__head" role="row">
        <div role="columnheader">${reorderMode ? "" : "Nombre"}</div>
        <div role="columnheader">${reorderMode ? "" : "Horario"}</div>
        <div role="columnheader" class="sr-only">Acciones</div>
      </div>`;

    const rows = state.appointmentTypes
      .map((type, index) => {
        const schedule = scheduleById(type.scheduleId);
        return `
        <div class="table__row types-table__row" role="row" data-id="${type.id}">
          <div class="calendar-cell" role="cell">
            ${
              reorderMode
                ? `<div class="reorder-controls">
                    <button type="button" class="icon-btn" data-move-up="${type.id}" ${index === 0 ? "disabled" : ""} aria-label="Subir">↑</button>
                    <button type="button" class="icon-btn" data-move-down="${type.id}" ${index === state.appointmentTypes.length - 1 ? "disabled" : ""} aria-label="Bajar">↓</button>
                  </div>`
                : ""
            }
            <span>${escapeHtml(type.name)} · ${type.duration} min</span>
          </div>
          <div role="cell" class="types-table__schedule">${escapeHtml(schedule?.name || "Sin horario")}</div>
          <div role="cell" class="row-actions">
            <button class="icon-btn" type="button" data-edit-type="${type.id}" aria-label="Editar tipo" title="Editar">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M4 17.5V20h2.5L17.2 9.3l-2.5-2.5L4 17.5Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>
                <path d="m13.8 5.8 2.5 2.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
              </svg>
            </button>
            <button class="icon-btn icon-btn--danger" type="button" data-delete-type="${type.id}" aria-label="Eliminar tipo" title="Eliminar">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M5 7h14M10 7V5h4v2m-5 3v7m4-7v7M7 7l1 12h8l1-12" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </div>
        </div>`;
      })
      .join("");

    typeList.innerHTML = head + (rows || `<p class="empty-hint" style="padding:16px 22px">Aún no hay tipos de cita.</p>`);
  }

  function renderPreview() {
    const title = document.getElementById("preview-title-text");
    const desc = document.getElementById("preview-description");
    const avatar = document.getElementById("preview-avatar");
    const services = document.getElementById("preview-services");
    if (!title) return;
    title.textContent = state.title || "Tu negocio";
    desc.textContent = state.description || "";
    if (state.avatarDataUrl) {
      avatar.src = state.avatarDataUrl;
      avatar.hidden = false;
    } else {
      avatar.removeAttribute("src");
      avatar.hidden = true;
    }
    const rewardsName = document.getElementById("preview-rewards-name");
    if (rewardsName) {
      rewardsName.textContent = state.title ? `${state.title} Rewards` : "Rewards";
    }
    services.innerHTML = state.appointmentTypes
      .map(
        (t) => `
        <button type="button" class="service-row" tabindex="-1">
          <span class="service-row__body">
            <span class="service-row__name">${escapeHtml(t.name)}</span>
            <span class="service-row__duration">${t.duration} min</span>
          </span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="m9 6 6 6-6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>`
      )
      .join("");
  }

  function fillTypeScheduleOptions(selectedId) {
    typeSchedule.innerHTML = state.schedules
      .map(
        (s) =>
          `<option value="${s.id}" ${s.id === selectedId ? "selected" : ""}>${escapeHtml(s.name)}</option>`
      )
      .join("");
  }

  function buildDayGrid(schedule) {
    dayGrid.innerHTML = DAYS.map((day) => {
      const cfg = schedule?.days?.[day.key] || { enabled: true, start: "09:00", end: "18:00" };
      return `
        <label class="day-row">
          <span class="day-row__check">
            <input type="checkbox" name="enabled_${day.key}" ${cfg.enabled ? "checked" : ""} />
            ${day.label}
          </span>
          <input type="time" name="start_${day.key}" value="${cfg.start}" />
          <span class="day-row__sep">–</span>
          <input type="time" name="end_${day.key}" value="${cfg.end}" />
        </label>`;
    }).join("");
  }

  function openScheduleModal(schedule) {
    editingScheduleId = schedule?.id || null;
    document.getElementById("schedule-modal-title").textContent = schedule ? "Editar Horario" : "Crear Horario";
    scheduleForm.name.value = schedule?.name || "";
    buildDayGrid(schedule || defaultSchedule);
    scheduleModal.hidden = false;
  }

  function closeScheduleModal() {
    scheduleModal.hidden = true;
    editingScheduleId = null;
  }

  function openTypeModal(type) {
    editingTypeId = type?.id || null;
    document.getElementById("type-modal-title").textContent = type ? "Editar tipo de cita" : "Crear tipo de cita";
    typeForm.name.value = type?.name || "";
    typeForm.duration.value = type?.duration || 60;
    typeForm.price.value = type?.price ?? 25000;
    fillTypeScheduleOptions(type?.scheduleId || state.schedules[0]?.id);
    const deleteBtn = document.getElementById("btn-delete-type");
    if (deleteBtn) deleteBtn.hidden = !type;
    typeModal.hidden = false;
  }

  function deleteType(id) {
    if (!id) return;
    const type = state.appointmentTypes.find((t) => t.id === id);
    if (!type) return;
    if (!confirm(`¿Eliminar “${type.name}”? Dejará de aparecer en tu autoagenda.`)) return;
    state.appointmentTypes = state.appointmentTypes.filter((t) => t.id !== id);
    save();
    renderTypes();
    renderPreview();
    closeTypeModal();
    window.AppShell?.toast("Tipo de cita eliminado");
  }

  function closeTypeModal() {
    typeModal.hidden = true;
    editingTypeId = null;
  }

  function loadBookings() {
    try {
      return JSON.parse(localStorage.getItem(BOOKINGS_KEY) || "[]");
    } catch {
      return [];
    }
  }

  function openDiagnostic() {
    const list = document.getElementById("diagnostic-list");
    const bookings = loadBookings();
    const schedule = state.schedules[0];
    const items = [];

    for (let i = 0; i < 7; i++) {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() + i);
      const iso = date.toISOString().slice(0, 10);
      const weekday = ["dom", "lun", "mar", "mie", "jue", "vie", "sab"][date.getDay()];
      const dayCfg = schedule?.days?.[weekday];
      const dayBookings = bookings.filter((b) => b.date === iso);
      const label = date.toLocaleDateString("es-CO", {
        weekday: "short",
        day: "numeric",
        month: "short",
      });

      if (!dayCfg?.enabled) {
        items.push(`<article class="diagnostic-item"><strong>${label}</strong><span class="status status--paused">Cerrado</span><p>Sin horario laboral</p></article>`);
        continue;
      }

      items.push(`
        <article class="diagnostic-item">
          <div class="diagnostic-item__top">
            <strong>${label}</strong>
            <span class="status status--ok">${dayBookings.length} ocupadas</span>
          </div>
          <p>Ventana ${formatTime(dayCfg.start)} – ${formatTime(dayCfg.end)}</p>
          <ul>
            ${
              dayBookings.length
                ? dayBookings
                    .map((b) => `<li>${b.time || "--:--"} · ${escapeHtml(b.serviceName || b.name || "Cita")}</li>`)
                    .join("")
                : "<li>Sin eventos. Huecos libres según tu horario.</li>"
            }
          </ul>
        </article>`);
    }

    list.innerHTML = items.join("");
    diagnosticModal.hidden = false;
  }

  function startAutoagenda() {
    applyBasic();
    renderSchedules();
    renderTypes();
    renderPreview();
    updateSaveButton();
  }

  if (window.AppShell?.whenReady) window.AppShell.whenReady(startAutoagenda);
  else window.addEventListener("barbercloud:panel-ready", startAutoagenda, { once: true });

  const urlPrefix = document.getElementById("url-prefix");
  if (urlPrefix) {
    const host = window.Tenant?.isLocalHost?.()
      ? "barber-home-cloud.vercel.app"
      : location.host.replace(/:\d+$/, "");
    urlPrefix.textContent = `${host}/`;
  }

  if (/[?&]setup=1/.test(location.search)) {
    document.querySelector(".page-header--stack")?.scrollIntoView({ behavior: "smooth", block: "start" });
    slugInput?.focus();
    window.AppShell?.toast?.("Personaliza tu enlace público de reservas");
  }

  const slugStatus = document.getElementById("slug-status");
  const SLUG_HINT_DEFAULT =
    "Este será el link que compartirás para que tus clientes agenden su cita.";
  function setSlugHint(msg, kind) {
    if (!slugStatus) return;
    slugStatus.textContent = msg;
    slugStatus.className = "field__hint" + (kind ? ` field__hint--${kind}` : "");
  }

  let availTimer = 0;
  async function checkSlugLive() {
    const v = window.Tenant?.validateSlug?.(slugInput.value);
    if (!v) return;
    if (!v.ok) {
      if (v.reason === "empty") {
        setSlugHint(SLUG_HINT_DEFAULT);
        return;
      }
      setSlugHint(v.message, "err");
      return;
    }
    if (!window.SupabaseData?.enabled?.()) {
      setSlugHint(`Tu link: ${window.Tenant.displayLink(v.slug)}`, "ok");
      return;
    }
    setSlugHint("Comprobando si está disponible…");
    const r = await window.SupabaseData.slugAvailability(v.slug, window.Tenant.currentId());
    if (r.skipped) {
      setSlugHint(`Tu link: ${window.Tenant.displayLink(v.slug)}`, "ok");
      return;
    }
    if (!r.ok) {
      setSlugHint("No se pudo comprobar el slug.", "err");
      return;
    }
    if (r.available) setSlugHint(`Disponible · ${window.Tenant.displayLink(v.slug)}`, "ok");
    else setSlugHint("Ese slug ya está ocupado. Elige otro.", "err");
  }

  slugInput?.addEventListener("input", () => {
    const next = String(slugInput.value || "")
      .toLowerCase()
      .replace(/[\s_]+/g, "-")
      .replace(/[^a-z0-9-]/g, "");
    slugInput.value = next;
    markDirty();
    clearTimeout(availTimer);
    availTimer = setTimeout(checkSlugLive, 400);
  });
  checkSlugLive();

  ["input", "change"].forEach((evt) => {
    form.addEventListener(evt, (e) => {
      if (e.target === slugInput) return;
      markDirty();
    });
  });

  document.getElementById("btn-save-autoagenda")?.addEventListener("click", () => {
    saveAll();
  });

  function setAvatar(file) {
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      window.AppShell?.toast("La imagen supera 4MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      pendingAvatar = String(reader.result);
      avatarPreview.src = pendingAvatar;
      avatarPreview.hidden = false;
      dropzoneIdle.hidden = true;
      markDirty();
    };
    reader.readAsDataURL(file);
  }

  avatarInput.addEventListener("change", () => setAvatar(avatarInput.files?.[0]));
  ["dragenter", "dragover"].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.add("is-dragging");
    });
  });
  ["dragleave", "drop"].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.remove("is-dragging");
    });
  });
  dropzone.addEventListener("drop", (e) => setAvatar(e.dataTransfer?.files?.[0]));

  document.getElementById("btn-copy")?.addEventListener("click", async () => {
    readBasicFields();
    try {
      await navigator.clipboard.writeText(displayLink(state.slug));
      const label = document.querySelector("[data-copy-label]");
      if (label) label.textContent = "¡Copiado!";
      window.AppShell?.toast("Link copiado");
      setTimeout(() => {
        if (label) label.textContent = "Copiar link";
      }, 1600);
    } catch {
      window.AppShell?.toast("No se pudo copiar");
    }
  });

  function openPublic() {
    readBasicFields();
    window.open(publicUrl(state.slug), "_blank", "noopener,noreferrer");
  }

  document.getElementById("btn-open")?.addEventListener("click", openPublic);
  document.getElementById("btn-open-preview")?.addEventListener("click", openPublic);

  function drawQr(text) {
    qrBox.innerHTML = "";
    const size = 11;
    const cell = 12;
    const canvas = document.createElement("canvas");
    canvas.width = size * cell;
    canvas.height = size * cell;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#111";
    let hash = 0;
    for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const corner = (x < 3 && y < 3) || (x > size - 4 && y < 3) || (x < 3 && y > size - 4);
        const bit = ((hash >> ((x * size + y) % 31)) ^ (x * 7 + y * 13)) & 1;
        if (corner || bit) ctx.fillRect(x * cell, y * cell, cell - 1, cell - 1);
      }
    }
    qrBox.appendChild(canvas);
  }

  document.getElementById("btn-qr")?.addEventListener("click", () => {
    readBasicFields();
    qrUrl.textContent = displayLink(state.slug);
    drawQr(publicUrl(state.slug));
    qrModal.hidden = false;
  });
  qrModal?.querySelectorAll("[data-close-modal]").forEach((el) =>
    el.addEventListener("click", () => {
      qrModal.hidden = true;
    })
  );

  document.getElementById("btn-create-schedule")?.addEventListener("click", () => openScheduleModal(null));
  document.getElementById("btn-create-type")?.addEventListener("click", () => openTypeModal(null));
  document.getElementById("btn-open-diagnostic")?.addEventListener("click", openDiagnostic);

  reorderBtn?.addEventListener("click", () => {
    reorderMode = !reorderMode;
    reorderBtn.textContent = reorderMode ? "Listo" : "Cambiar orden";
    reorderBtn.classList.toggle("btn--primary", reorderMode);
    reorderBtn.classList.toggle("btn--secondary", !reorderMode);
    renderTypes();
  });

  scheduleList.addEventListener("click", (e) => {
    const id = e.target.closest("[data-edit-schedule]")?.getAttribute("data-edit-schedule");
    if (!id) return;
    openScheduleModal(state.schedules.find((s) => s.id === id));
  });

  typeList.addEventListener("click", (e) => {
    const deleteId = e.target.closest("[data-delete-type]")?.getAttribute("data-delete-type");
    if (deleteId) {
      deleteType(deleteId);
      return;
    }
    const editId = e.target.closest("[data-edit-type]")?.getAttribute("data-edit-type");
    if (editId) {
      openTypeModal(state.appointmentTypes.find((t) => t.id === editId));
      return;
    }
    const upId = e.target.closest("[data-move-up]")?.getAttribute("data-move-up");
    const downId = e.target.closest("[data-move-down]")?.getAttribute("data-move-down");
    if (upId || downId) {
      const id = upId || downId;
      const idx = state.appointmentTypes.findIndex((t) => t.id === id);
      const swapWith = upId ? idx - 1 : idx + 1;
      if (idx < 0 || swapWith < 0 || swapWith >= state.appointmentTypes.length) return;
      const copy = [...state.appointmentTypes];
      [copy[idx], copy[swapWith]] = [copy[swapWith], copy[idx]];
      state.appointmentTypes = copy;
      save();
      renderTypes();
      renderPreview();
    }
  });

  scheduleModal?.querySelectorAll("[data-close-schedule]").forEach((el) =>
    el.addEventListener("click", closeScheduleModal)
  );
  typeModal?.querySelectorAll("[data-close-type]").forEach((el) =>
    el.addEventListener("click", closeTypeModal)
  );
  diagnosticModal?.querySelectorAll("[data-close-diagnostic]").forEach((el) =>
    el.addEventListener("click", () => {
      diagnosticModal.hidden = true;
    })
  );

  scheduleForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(scheduleForm);
    const days = {};
    DAYS.forEach((day) => {
      days[day.key] = {
        enabled: fd.get(`enabled_${day.key}`) === "on",
        start: String(fd.get(`start_${day.key}`) || "09:00"),
        end: String(fd.get(`end_${day.key}`) || "18:00"),
      };
    });
    const item = {
      id: editingScheduleId || crypto.randomUUID(),
      name: String(fd.get("name") || "Horario").trim(),
      days,
    };
    if (editingScheduleId) {
      state.schedules = state.schedules.map((s) => (s.id === editingScheduleId ? item : s));
    } else {
      state.schedules.push(item);
    }
    save();
    renderSchedules();
    renderTypes();
    closeScheduleModal();
    window.AppShell?.toast("Horario guardado");
  });

  typeForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(typeForm);
    const item = {
      id: editingTypeId || crypto.randomUUID(),
      name: String(fd.get("name") || "").trim(),
      duration: Number(fd.get("duration") || 60),
      price: Number(fd.get("price") || 0),
      scheduleId: String(fd.get("scheduleId") || state.schedules[0]?.id),
    };
    if (editingTypeId) {
      state.appointmentTypes = state.appointmentTypes.map((t) => (t.id === editingTypeId ? item : t));
    } else {
      state.appointmentTypes.push(item);
    }
    save();
    renderTypes();
    renderPreview();
    closeTypeModal();
    window.AppShell?.toast("Tipo de cita guardado");
  });

  document.getElementById("btn-delete-type")?.addEventListener("click", () => {
    if (editingTypeId) deleteType(editingTypeId);
  });
})();
