(function () {
  const STORAGE_KEY = "barbercloud.calendar_configs";
  const CLIENT_VAR = "{{nombreCliente}}";
  const DEFAULT_LOGO = "assets/barberhome-logo-full.png";

  const DEFAULT_BODY =
    "Hola! {{nombreCliente}} recuerda: Tienes una cita en BarberHome con Luis Villadiego.\n\nNos vemos 👍🏻💇‍♂️💈✅";

  const sharedExtras = {
    sendSameTime: false,
    msgTitle: "Recordatorio de Cita BarberHome",
    msgBody: DEFAULT_BODY,
    showDateTime: "both",
    msgLogoName: "barberhome-logo-full.png",
    msgLogoData: DEFAULT_LOGO,
    secondReminder: false,
    secondHoursBefore: "12",
    secondMsgTitle: "Recordatorio de cita de Barberia con Luis Villadiego",
    secondMsgBody: "Tienes una cita con Barber Home",
    secondIncludeTime: true,
    secondExtraInfo: false,
    createMsgEnabled: true,
    createMsgDelay: "5",
    createMsgTitle: "Confirmación de cita BarberHome",
    createMsgBody:
      "Hola {{nombreCliente}}, se ha confirmado tu cita con BarberHome. Información de tu cita:",
    createShowDateTime: "both",
    createExtraInfo: false,
    afterMsgEnabled: true,
    afterMsgDelay: "0.5",
    afterMsgTitle: "BarberHome",
    afterMsgBody: `Gracias por confiar en BarberHome 💈

Siempre es un gusto atenderte.

🔥 Recomendación: agenda tu próxima cita desde ya para asegurar tu horario

📅 Agenda tu próxima cita aquí:
https://barbercloud.com/barberhomeluisvilladiego

Te espero para el próximo corte 👊`,
    addTimezone: false,
    multiWhatsapp: false,
  };

  const DEFAULTS = {
    barberhome: {
      businessName: "Barber Home",
      whatsappCc: "+57",
      whatsappPhone: "311 6962326",
      timeFormat: "12",
      language: "es",
      timezone: "America/Bogota",
      paused: false,
      messageType: "reminder",
      sendHoursBefore: "24",
      ...sharedExtras,
    },
    gmail: {
      businessName: "BarberHome Gmail",
      whatsappCc: "+57",
      whatsappPhone: "311 6962326",
      timeFormat: "12",
      language: "es",
      timezone: "America/Bogota",
      paused: false,
      messageType: "reminder",
      sendHoursBefore: "24",
      ...sharedExtras,
    },
    barbercloud: {
      businessName: "Calendario en BarberCloud",
      whatsappCc: "+57",
      whatsappPhone: "311 6962326",
      timeFormat: "12",
      language: "es",
      timezone: "America/Bogota",
      paused: true,
      messageType: "reminder",
      sendHoursBefore: "24",
      ...sharedExtras,
    },
  };

  const params = new URLSearchParams(location.search);
  const calendarId = params.get("id") || "barberhome";
  const calendarName = params.get("name") || DEFAULTS[calendarId]?.businessName || "Calendario";

  const titleEl = document.getElementById("cal-config-title");
  const form = document.getElementById("calendar-config-form");
  const toggleBtn = document.getElementById("btn-toggle-messages");
  const statusLabel = document.getElementById("msg-status-label");
  const statusHint = document.getElementById("msg-status-hint");
  const pickLogoBtn = document.getElementById("btn-pick-logo");
  const fields = {
    businessName: document.getElementById("cfg-business-name"),
    whatsappCc: document.getElementById("cfg-wa-cc"),
    whatsappPhone: document.getElementById("cfg-wa-phone"),
    timeFormat: document.getElementById("cfg-time-format"),
    language: document.getElementById("cfg-language"),
    timezone: document.getElementById("cfg-timezone"),
    sendHoursBefore: document.getElementById("cfg-send-hours"),
    sendSameTime: document.getElementById("cfg-same-time"),
    msgTitle: document.getElementById("cfg-msg-title"),
    msgBody: document.getElementById("cfg-msg-body"),
    showDateTime: document.getElementById("cfg-show-datetime"),
    secondReminder: document.getElementById("cfg-second-reminder"),
    secondHoursBefore: document.getElementById("cfg-second-hours"),
    secondMsgTitle: document.getElementById("cfg-second-title"),
    secondMsgBody: document.getElementById("cfg-second-body"),
    secondIncludeTime: document.getElementById("cfg-second-include-time"),
    secondExtraInfo: document.getElementById("cfg-second-extra"),
    createMsgEnabled: document.getElementById("cfg-create-msg"),
    createMsgDelay: document.getElementById("cfg-create-delay"),
    createMsgTitle: document.getElementById("cfg-create-title"),
    createMsgBody: document.getElementById("cfg-create-body"),
    createShowDateTime: document.getElementById("cfg-create-datetime"),
    createExtraInfo: document.getElementById("cfg-create-extra"),
    afterMsgEnabled: document.getElementById("cfg-after-msg"),
    afterMsgDelay: document.getElementById("cfg-after-delay"),
    afterMsgTitle: document.getElementById("cfg-after-title"),
    afterMsgBody: document.getElementById("cfg-after-body"),
    addTimezone: document.getElementById("cfg-add-timezone"),
    multiWhatsapp: document.getElementById("cfg-multi-whatsapp"),
    testCc: document.getElementById("cfg-test-cc"),
    testPhone: document.getElementById("cfg-test-phone"),
    afterTestCc: document.getElementById("cfg-after-test-cc"),
    afterTestPhone: document.getElementById("cfg-after-test-phone"),
  };
  const titleCount = document.getElementById("cfg-msg-title-count");
  const bodyCount = document.getElementById("cfg-msg-body-count");
  const secondTitleCount = document.getElementById("cfg-second-title-count");
  const secondBodyCount = document.getElementById("cfg-second-body-count");
  const createTitleCount = document.getElementById("cfg-create-title-count");
  const createBodyCount = document.getElementById("cfg-create-body-count");
  const afterTitleCount = document.getElementById("cfg-after-title-count");
  const afterBodyCount = document.getElementById("cfg-after-body-count");
  const secondReminderFields = document.getElementById("second-reminder-fields");
  const createMsgFields = document.getElementById("create-msg-fields");
  const afterMsgFields = document.getElementById("after-msg-fields");
  const createPreview = {
    title: document.getElementById("create-preview-title"),
    body: document.getElementById("create-preview-body"),
    meta: document.getElementById("create-preview-meta"),
    extra: document.getElementById("create-preview-extra"),
  };
  const secondPreview = {
    title: document.getElementById("second-preview-title"),
    body: document.getElementById("second-preview-body"),
    time: document.getElementById("second-preview-time"),
    extra: document.getElementById("second-preview-extra"),
  };
  const logoInput = document.getElementById("cfg-msg-logo");
  const logoNameEl = document.getElementById("cfg-msg-logo-name");
  const clearLogoBtn = document.getElementById("btn-clear-logo");
  const sendTestBtn = document.getElementById("btn-send-test");
  const sendAfterTestBtn = document.getElementById("btn-send-after-test");
  const preview = {
    logo: document.getElementById("preview-logo"),
    title: document.getElementById("preview-title"),
    body: document.getElementById("preview-body"),
    datetime: document.getElementById("preview-datetime"),
    hint: document.getElementById("preview-datetime-hint"),
  };
  const afterPreview = {
    title: document.getElementById("after-preview-title"),
    body: document.getElementById("after-preview-body"),
  };

  let paused = false;
  let msgLogoName = "";
  let msgLogoData = "";

  function loadAll() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function saveAll(all) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  }

  function syncTimeFormatToPublic(timeFormat) {
    try {
      const auto = JSON.parse(localStorage.getItem("barbercloud.autoagenda") || "{}");
      auto.timeFormat = timeFormat === "24" ? "24" : "12";
      localStorage.setItem("barbercloud.autoagenda", JSON.stringify(auto));
    } catch {
      /* ignore */
    }
  }

  function persistPartial(patch) {
    const all = loadAll();
    all[calendarId] = { ...getConfig(), ...patch };
    saveAll(all);
    if (patch.timeFormat) syncTimeFormatToPublic(patch.timeFormat);
  }

  function baseDefaults() {
    return (
      DEFAULTS[calendarId] || {
        businessName: calendarName,
        whatsappCc: "+57",
        whatsappPhone: "",
        timeFormat: "12",
        language: "es",
        timezone: "America/Bogota",
        paused: false,
        messageType: "reminder",
        sendHoursBefore: "24",
        ...sharedExtras,
      }
    );
  }

  function getConfig() {
    return { ...baseDefaults(), ...(loadAll()[calendarId] || {}) };
  }

  function exampleDateText(mode, timeFormat) {
    const d = new Date(2026, 6, 24, 12, 55);
    const datePart = d.toLocaleDateString("es-CO", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    const timePart = d.toLocaleTimeString("es-CO", {
      hour: "numeric",
      minute: "2-digit",
      hour12: timeFormat !== "24",
    });
    if (mode === "none") return "";
    if (mode === "date") return `El ${datePart}`;
    if (mode === "time") return `A las ${timePart}`;
    return `El ${datePart} a las ${timePart}`;
  }

  function updateCounters() {
    if (titleCount && fields.msgTitle) {
      titleCount.textContent = `${fields.msgTitle.value.length}/60`;
    }
    if (bodyCount && fields.msgBody) {
      bodyCount.textContent = `${fields.msgBody.value.length}/900`;
    }
    if (secondTitleCount && fields.secondMsgTitle) {
      secondTitleCount.textContent = `${fields.secondMsgTitle.value.length}/60`;
    }
    if (secondBodyCount && fields.secondMsgBody) {
      secondBodyCount.textContent = `${fields.secondMsgBody.value.length}/200`;
    }
    if (createTitleCount && fields.createMsgTitle) {
      createTitleCount.textContent = `${fields.createMsgTitle.value.length}/60`;
    }
    if (createBodyCount && fields.createMsgBody) {
      createBodyCount.textContent = `${fields.createMsgBody.value.length}/200`;
    }
    if (afterTitleCount && fields.afterMsgTitle) {
      afterTitleCount.textContent = `${fields.afterMsgTitle.value.length}/60`;
    }
    if (afterBodyCount && fields.afterMsgBody) {
      afterBodyCount.textContent = `${fields.afterMsgBody.value.length}/900`;
    }
  }

  function syncSecondReminderFields() {
    const on = !!fields.secondReminder?.checked;
    if (secondReminderFields) secondReminderFields.hidden = !on;
  }

  function syncCreateMsgFields() {
    const on = !!fields.createMsgEnabled?.checked;
    if (createMsgFields) createMsgFields.hidden = !on;
  }

  function syncAfterMsgFields() {
    const on = !!fields.afterMsgEnabled?.checked;
    if (afterMsgFields) afterMsgFields.hidden = !on;
  }

  function updateSecondPreview() {
    if (secondPreview.title) {
      secondPreview.title.textContent = fields.secondMsgTitle?.value || "";
    }
    if (secondPreview.body) {
      secondPreview.body.textContent = fields.secondMsgBody?.value || "";
    }
    if (secondPreview.time) {
      const show = !!fields.secondIncludeTime?.checked;
      secondPreview.time.hidden = !show;
      if (show) {
        secondPreview.time.textContent = "⏰ Hoy a las [aquí saldrá la hora de la cita]";
      }
    }
    if (secondPreview.extra) {
      secondPreview.extra.hidden = !fields.secondExtraInfo?.checked;
    }
  }

  function updateCreatePreview() {
    if (createPreview.title) {
      createPreview.title.textContent = fields.createMsgTitle?.value || "";
    }
    if (createPreview.body) {
      createPreview.body.textContent = fields.createMsgBody?.value || "";
    }
    const mode = fields.createShowDateTime?.value || "both";
    if (createPreview.meta) {
      const showDate = mode === "both" || mode === "date";
      const showTime = mode === "both" || mode === "time";
      createPreview.meta.hidden = mode === "none";
      const lines = createPreview.meta.querySelectorAll("p");
      if (lines[0]) lines[0].hidden = !showDate;
      if (lines[1]) lines[1].hidden = !showTime;
    }
    if (createPreview.extra) {
      createPreview.extra.hidden = !fields.createExtraInfo?.checked;
    }
  }

  function updateTestButton() {
    const phone = String(fields.testPhone?.value || "").replace(/\D/g, "");
    if (sendTestBtn) sendTestBtn.disabled = phone.length < 7;
    const afterPhone = String(fields.afterTestPhone?.value || "").replace(/\D/g, "");
    if (sendAfterTestBtn) sendAfterTestBtn.disabled = afterPhone.length < 7;
  }

  function linkify(text) {
    const escaped = String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    return escaped.replace(
      /(https?:\/\/[^\s<]+)/g,
      '<a href="$1" target="_blank" rel="noreferrer">$1</a>'
    );
  }

  function updateAfterPreview() {
    if (afterPreview.title) {
      afterPreview.title.textContent = fields.afterMsgTitle?.value || "";
    }
    if (afterPreview.body) {
      afterPreview.body.innerHTML = linkify(fields.afterMsgBody?.value || "").replace(
        /\n/g,
        "<br>"
      );
    }
  }

  function updatePreview() {
    if (preview.title) preview.title.textContent = fields.msgTitle?.value || "";
    if (preview.body) {
      preview.body.textContent = fields.msgBody?.value || "";
    }
    if (preview.logo) {
      if (msgLogoData) {
        preview.logo.src = msgLogoData;
        preview.logo.hidden = false;
      } else {
        preview.logo.hidden = true;
      }
    }
    const mode = fields.showDateTime?.value || "both";
    const text = exampleDateText(mode, fields.timeFormat?.value || "12");
    if (preview.datetime) {
      preview.datetime.textContent = text;
      preview.datetime.hidden = !text;
    }
    if (preview.hint) preview.hint.hidden = !text;
  }

  function setLogoUI(name, data) {
    msgLogoName = name || "";
    msgLogoData = data || "";
    if (logoNameEl) logoNameEl.textContent = msgLogoName;
    if (clearLogoBtn) clearLogoBtn.hidden = !msgLogoData;
    if (pickLogoBtn) {
      pickLogoBtn.textContent = msgLogoData ? "Cambiar imagen" : "Subir imagen";
    }
    updatePreview();
  }

  function setPausedUI(isPaused) {
    paused = !!isPaused;
    if (!toggleBtn) return;
    toggleBtn.classList.toggle("is-sending", !paused);
    toggleBtn.classList.toggle("is-paused", paused);
    toggleBtn.setAttribute("aria-pressed", paused ? "true" : "false");
    const play = toggleBtn.querySelector(".msg-status-btn__icon--play");
    const pause = toggleBtn.querySelector(".msg-status-btn__icon--pause");
    if (play) play.hidden = paused;
    if (pause) pause.hidden = !paused;
    if (statusLabel) {
      statusLabel.textContent = paused ? "Mensajes pausados" : "Enviando mensajes";
    }
    if (statusHint) {
      statusHint.textContent = paused
        ? "Los mensajes están pausados para este calendario. Haz clic para reanudar el envío."
        : "Se están enviando los mensajes para las citas de este calendario. Haz clic para pausar.";
    }
  }

  function fillForm(cfg) {
    fields.businessName.value = cfg.businessName || "";
    fields.whatsappCc.value = cfg.whatsappCc || "+57";
    fields.whatsappPhone.value = cfg.whatsappPhone || "";
    fields.timeFormat.value = cfg.timeFormat || "12";
    fields.language.value = cfg.language || "es";
    fields.timezone.value = cfg.timezone || "America/Bogota";
    fields.sendHoursBefore.value = String(cfg.sendHoursBefore || "24");
    fields.sendSameTime.checked = !!cfg.sendSameTime;
    fields.msgTitle.value = cfg.msgTitle || "";
    fields.msgBody.value = cfg.msgBody || "";
    fields.showDateTime.value = cfg.showDateTime || "both";
    if (fields.secondReminder) fields.secondReminder.checked = !!cfg.secondReminder;
    if (fields.secondHoursBefore) {
      fields.secondHoursBefore.value = String(cfg.secondHoursBefore || "12");
    }
    if (fields.secondMsgTitle) {
      fields.secondMsgTitle.value =
        cfg.secondMsgTitle || "Recordatorio de cita de Barberia con Luis Villadiego";
    }
    if (fields.secondMsgBody) {
      fields.secondMsgBody.value = cfg.secondMsgBody || "Tienes una cita con Barber Home";
    }
    if (fields.secondIncludeTime) {
      fields.secondIncludeTime.checked = cfg.secondIncludeTime !== false;
    }
    if (fields.secondExtraInfo) fields.secondExtraInfo.checked = !!cfg.secondExtraInfo;
    if (fields.createMsgEnabled) fields.createMsgEnabled.checked = cfg.createMsgEnabled !== false;
    if (fields.createMsgDelay) fields.createMsgDelay.value = String(cfg.createMsgDelay ?? "5");
    if (fields.createMsgTitle) fields.createMsgTitle.value = cfg.createMsgTitle || "";
    if (fields.createMsgBody) fields.createMsgBody.value = cfg.createMsgBody || "";
    if (fields.createShowDateTime) {
      fields.createShowDateTime.value = cfg.createShowDateTime || "both";
    }
    if (fields.createExtraInfo) fields.createExtraInfo.checked = !!cfg.createExtraInfo;
    if (fields.afterMsgEnabled) fields.afterMsgEnabled.checked = cfg.afterMsgEnabled !== false;
    if (fields.afterMsgDelay) fields.afterMsgDelay.value = String(cfg.afterMsgDelay ?? "0.5");
    if (fields.afterMsgTitle) fields.afterMsgTitle.value = cfg.afterMsgTitle || "";
    if (fields.afterMsgBody) fields.afterMsgBody.value = cfg.afterMsgBody || "";
    if (fields.addTimezone) fields.addTimezone.checked = !!cfg.addTimezone;
    if (fields.multiWhatsapp) fields.multiWhatsapp.checked = !!cfg.multiWhatsapp;
    if (fields.testCc) fields.testCc.value = cfg.whatsappCc || "+57";
    if (fields.testPhone) fields.testPhone.value = cfg.whatsappPhone || "";
    if (fields.afterTestCc) fields.afterTestCc.value = cfg.whatsappCc || "+57";
    if (fields.afterTestPhone) fields.afterTestPhone.value = cfg.whatsappPhone || "";
    const type = cfg.messageType || "reminder";
    const radio = form?.querySelector(`input[name="messageType"][value="${type}"]`);
    if (radio) radio.checked = true;
    setPausedUI(!!cfg.paused);
    setLogoUI(cfg.msgLogoName, cfg.msgLogoData || "");
    syncSecondReminderFields();
    syncCreateMsgFields();
    syncAfterMsgFields();
    updateCounters();
    updateTestButton();
    updatePreview();
    updateSecondPreview();
    updateCreatePreview();
    updateAfterPreview();
  }

  function readForm() {
    const messageType =
      form?.querySelector('input[name="messageType"]:checked')?.value || "reminder";
    return {
      businessName: fields.businessName.value.trim(),
      whatsappCc: fields.whatsappCc.value,
      whatsappPhone: fields.whatsappPhone.value.trim(),
      timeFormat: fields.timeFormat.value,
      language: fields.language.value,
      timezone: fields.timezone.value,
      paused,
      messageType,
      sendHoursBefore: fields.sendHoursBefore.value,
      sendSameTime: !!fields.sendSameTime.checked,
      msgTitle: fields.msgTitle.value.slice(0, 60),
      msgBody: fields.msgBody.value.slice(0, 900),
      showDateTime: fields.showDateTime.value,
      msgLogoName,
      msgLogoData,
      secondReminder: !!fields.secondReminder?.checked,
      secondHoursBefore: fields.secondHoursBefore?.value || "12",
      secondMsgTitle: (fields.secondMsgTitle?.value || "").slice(0, 60),
      secondMsgBody: (fields.secondMsgBody?.value || "").slice(0, 200),
      secondIncludeTime: !!fields.secondIncludeTime?.checked,
      secondExtraInfo: !!fields.secondExtraInfo?.checked,
      createMsgEnabled: !!fields.createMsgEnabled?.checked,
      createMsgDelay: fields.createMsgDelay?.value || "5",
      createMsgTitle: (fields.createMsgTitle?.value || "").slice(0, 60),
      createMsgBody: (fields.createMsgBody?.value || "").slice(0, 200),
      createShowDateTime: fields.createShowDateTime?.value || "both",
      createExtraInfo: !!fields.createExtraInfo?.checked,
      afterMsgEnabled: !!fields.afterMsgEnabled?.checked,
      afterMsgDelay: fields.afterMsgDelay?.value || "0.5",
      afterMsgTitle: (fields.afterMsgTitle?.value || "").slice(0, 60),
      afterMsgBody: (fields.afterMsgBody?.value || "").slice(0, 900),
      addTimezone: !!fields.addTimezone?.checked,
      multiWhatsapp: !!fields.multiWhatsapp?.checked,
    };
  }

  function insertAtCursor(textarea, text) {
    if (!textarea) return;
    const max = Number(textarea.getAttribute("maxlength")) || 900;
    const start = textarea.selectionStart ?? textarea.value.length;
    const end = textarea.selectionEnd ?? start;
    const before = textarea.value.slice(0, start);
    const after = textarea.value.slice(end);
    const next = `${before}${text}${after}`.slice(0, max);
    textarea.value = next;
    const pos = Math.min(start + text.length, next.length);
    textarea.focus();
    textarea.setSelectionRange(pos, pos);
    updateCounters();
    updatePreview();
  }

  if (titleEl) {
    titleEl.textContent = `Configuración para ${calendarName}`;
  }
  document.title = `Configuración · ${calendarName} · BarberCloud`;
  fillForm(getConfig());
  syncTimeFormatToPublic(fields.timeFormat?.value || getConfig().timeFormat || "12");

  fields.msgTitle?.addEventListener("input", () => {
    updateCounters();
    updatePreview();
  });
  fields.msgBody?.addEventListener("input", () => {
    updateCounters();
    updatePreview();
  });
  fields.createMsgTitle?.addEventListener("input", () => {
    updateCounters();
    updateCreatePreview();
  });
  fields.createMsgBody?.addEventListener("input", () => {
    updateCounters();
    updateCreatePreview();
  });
  fields.secondReminder?.addEventListener("change", () => {
    syncSecondReminderFields();
    updateSecondPreview();
  });
  fields.secondMsgTitle?.addEventListener("input", () => {
    updateCounters();
    updateSecondPreview();
  });
  fields.secondMsgBody?.addEventListener("input", () => {
    updateCounters();
    updateSecondPreview();
  });
  fields.secondIncludeTime?.addEventListener("change", updateSecondPreview);
  fields.secondExtraInfo?.addEventListener("change", updateSecondPreview);
  fields.createMsgEnabled?.addEventListener("change", syncCreateMsgFields);
  fields.createShowDateTime?.addEventListener("change", updateCreatePreview);
  fields.createExtraInfo?.addEventListener("change", updateCreatePreview);
  fields.afterMsgEnabled?.addEventListener("change", syncAfterMsgFields);
  fields.afterMsgTitle?.addEventListener("input", () => {
    updateCounters();
    updateAfterPreview();
  });
  fields.afterMsgBody?.addEventListener("input", () => {
    updateCounters();
    updateAfterPreview();
  });
  fields.showDateTime?.addEventListener("change", updatePreview);
  fields.timeFormat?.addEventListener("change", () => {
    updatePreview();
    const value = fields.timeFormat.value === "24" ? "24" : "12";
    persistPartial({ timeFormat: value });
    window.AppShell?.toast(
      value === "24"
        ? "Horario 24h aplicado a la agenda pública"
        : "Horario 12h aplicado a la agenda pública"
    );
  });
  fields.testPhone?.addEventListener("input", updateTestButton);
  fields.afterTestPhone?.addEventListener("input", updateTestButton);

  toggleBtn?.addEventListener("click", () => {
    setPausedUI(!paused);
    persistPartial({ paused });
    window.AppShell?.toast(
      paused ? `Mensajes pausados · ${calendarName}` : `Mensajes reanudados · ${calendarName}`
    );
  });

  document.getElementById("btn-insert-client-name")?.addEventListener("click", () => {
    if (fields.msgBody?.value.includes(CLIENT_VAR)) {
      window.AppShell?.toast("El nombre del cliente ya está en el mensaje.");
      return;
    }
    insertAtCursor(fields.msgBody, CLIENT_VAR);
  });

  document.getElementById("btn-insert-create-client")?.addEventListener("click", () => {
    if (fields.createMsgBody?.value.includes(CLIENT_VAR)) {
      window.AppShell?.toast("El nombre del cliente ya está en el mensaje.");
      return;
    }
    insertAtCursor(fields.createMsgBody, CLIENT_VAR);
    updateCreatePreview();
  });

  document.getElementById("btn-insert-after-client")?.addEventListener("click", () => {
    if (fields.afterMsgBody?.value.includes(CLIENT_VAR)) {
      window.AppShell?.toast("El nombre del cliente ya está en el mensaje.");
      return;
    }
    insertAtCursor(fields.afterMsgBody, CLIENT_VAR);
    updateAfterPreview();
  });

  document.getElementById("btn-customize-msg")?.addEventListener("click", () => {
    fields.msgBody?.focus();
    window.AppShell?.toast("Edita el cuerpo del mensaje. Usa {{nombreCliente}} como variable.");
  });

  pickLogoBtn?.addEventListener("click", () => {
    logoInput?.click();
  });

  logoInput?.addEventListener("change", () => {
    const file = logoInput.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      window.AppShell?.toast("Solo se permiten imágenes.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setLogoUI(file.name, String(reader.result || ""));
      window.AppShell?.toast("Imagen agregada.");
    };
    reader.readAsDataURL(file);
  });

  clearLogoBtn?.addEventListener("click", () => {
    if (logoInput) logoInput.value = "";
    setLogoUI("", "");
  });

  sendTestBtn?.addEventListener("click", () => {
    const cc = fields.testCc?.value || "+57";
    const phone = String(fields.testPhone?.value || "").replace(/\D/g, "");
    if (phone.length < 7) return;
    window.AppShell?.toast(`Mensaje de prueba enviado a ${cc}${phone} (demo)`);
  });

  sendAfterTestBtn?.addEventListener("click", () => {
    const cc = fields.afterTestCc?.value || "+57";
    const phone = String(fields.afterTestPhone?.value || "").replace(/\D/g, "");
    if (phone.length < 7) return;
    window.AppShell?.toast(`Mensaje post-cita de prueba enviado a ${cc}${phone} (demo)`);
  });

  form?.addEventListener("submit", (e) => {
    e.preventDefault();
    const cfg = readForm();
    if (!cfg.businessName) {
      window.AppShell?.toast("El nombre del negocio es obligatorio.");
      fields.businessName.focus();
      return;
    }
    const all = loadAll();
    all[calendarId] = cfg;
    saveAll(all);
    syncTimeFormatToPublic(cfg.timeFormat);
    if (titleEl) titleEl.textContent = `Configuración para ${cfg.businessName}`;
    window.AppShell?.toast("Configuración guardada.");
  });

  document.getElementById("btn-view-scheduled")?.addEventListener("click", () => {
    window.AppShell?.toast(`Mensajes programados · ${calendarName}`);
  });

  document.getElementById("btn-delete-calendar")?.addEventListener("click", () => {
    if (!confirm(`¿Eliminar el calendario "${calendarName}"?`)) return;
    const all = loadAll();
    delete all[calendarId];
    saveAll(all);
    window.AppShell?.toast(`Calendario eliminado · ${calendarName}`);
    location.href = "index.html";
  });
})();
