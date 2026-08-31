(() => {
  const lookupStep = document.getElementById("lookup-step");
  if (!lookupStep) return;

  const btnOpen = document.getElementById("btn-lookup-reservas");
  const btnBack = document.getElementById("btn-back-lookup");
  const phonePanel = document.getElementById("lookup-phone-panel");
  const verifyPanel = document.getElementById("lookup-verify-panel");
  const resultsPanel = document.getElementById("lookup-results-panel");
  const lookupCc = document.getElementById("lookup-cc");
  const lookupPhone = document.getElementById("lookup-phone-local");
  const lookupError = document.getElementById("lookup-error");
  const lookupDemo = document.getElementById("lookup-demo");
  const lookupDemoCode = document.getElementById("lookup-demo-code");
  const btnSend = document.getElementById("btn-lookup-send");
  const lookupCode = document.getElementById("lookup-code");
  const lookupVerifyError = document.getElementById("lookup-verify-error");
  const lookupVerifyDemo = document.getElementById("lookup-verify-demo");
  const lookupVerifyDemoCode = document.getElementById("lookup-verify-demo-code");
  const lookupVerifyHint = document.getElementById("lookup-verify-hint");
  const btnVerify = document.getElementById("btn-lookup-verify");
  const btnResend = document.getElementById("btn-lookup-resend");
  const btnAgain = document.getElementById("btn-lookup-again");
  const resultsList = document.getElementById("lookup-results-list");

  const params = new URLSearchParams(location.search);
  const slug =
    window.Tenant?.slugFromLocation?.() ||
    window.Tenant?.normalizeSlug?.(params.get("s") || "") ||
    "";

  let pending = {
    countryCode: "+57",
    phone: "",
    otpToken: "",
    demoCode: "",
  };
  let busy = false;

  function sanitizePhone(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function tenantPayload() {
    return {
      slug,
      negocioId: window.Tenant?.currentId?.() || "",
    };
  }

  function showError(el, message) {
    if (!el) return;
    if (message) {
      el.textContent = message;
      el.hidden = false;
    } else {
      el.textContent = "";
      el.hidden = true;
    }
  }

  function setBusy(next) {
    busy = next;
    if (btnSend) btnSend.disabled = next;
    if (btnVerify) btnVerify.disabled = next;
    if (btnResend) btnResend.disabled = next;
  }

  function maskPhone(cc, local) {
    const digits = sanitizePhone(local);
    if (digits.length <= 4) return `${cc} ****`;
    return `${cc} ***${digits.slice(-4)}`;
  }

  function formatDate(dateStr) {
    if (!dateStr) return "";
    const [y, m, d] = String(dateStr).split("-").map(Number);
    if (!y || !m || !d) return dateStr;
    const dt = new Date(y, m - 1, d);
    try {
      return dt.toLocaleDateString("es-CO", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    } catch {
      return dateStr;
    }
  }

  function formatTime(timeStr) {
    const t = String(timeStr || "").trim();
    if (!t) return "";
    const [h, min] = t.split(":");
    const hour = Number(h);
    if (Number.isNaN(hour)) return t;
    const suffix = hour >= 12 ? "p. m." : "a. m.";
    const h12 = hour % 12 || 12;
    return `${h12}:${min || "00"} ${suffix}`;
  }

  function showPanel(name) {
    if (phonePanel) phonePanel.hidden = name !== "phone";
    if (verifyPanel) verifyPanel.hidden = name !== "verify";
    if (resultsPanel) resultsPanel.hidden = name !== "results";
  }

  function resetLookupState() {
    pending = { countryCode: "+57", phone: "", otpToken: "", demoCode: "" };
    if (lookupPhone) lookupPhone.value = "";
    if (lookupCode) lookupCode.value = "";
    if (lookupCc) lookupCc.value = "+57";
    showError(lookupError, "");
    showError(lookupVerifyError, "");
    if (lookupDemo) lookupDemo.hidden = true;
    if (lookupVerifyDemo) lookupVerifyDemo.hidden = true;
    showPanel("phone");
    if (resultsList) resultsList.innerHTML = "";
  }

  function openLookup() {
    resetLookupState();
    document.getElementById("service-step").hidden = true;
    lookupStep.hidden = false;
  }

  function closeLookup() {
    lookupStep.hidden = true;
    window.dispatchEvent(new CustomEvent("booking:show-services"));
  }

  async function postJson(url, body) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok && !data?.message) {
      throw new Error("No se pudo completar la solicitud.");
    }
    return data;
  }

  function validatePhoneLocal(local) {
    const digits = sanitizePhone(local);
    if (!digits) return "El WhatsApp es obligatorio.";
    if (digits.length < 7) return "Escribe un número válido (mín. 7 dígitos).";
    if (digits.length > 15) return "El número es demasiado largo.";
    return "";
  }

  async function sendCode() {
    if (busy) return;
    showError(lookupError, "");
    if (lookupDemo) lookupDemo.hidden = true;

    const countryCode = lookupCc?.value || "+57";
    const phone = sanitizePhone(lookupPhone?.value || "");
    if (lookupPhone) lookupPhone.value = phone;

    const phoneErr = validatePhoneLocal(phone);
    if (phoneErr) {
      showError(lookupError, phoneErr);
      return;
    }
    if (!slug && !window.Tenant?.currentId?.()) {
      showError(lookupError, "No se pudo identificar el negocio.");
      return;
    }

    setBusy(true);
    try {
      const data = await postJson("/api/booking/lookup-send-code", {
        ...tenantPayload(),
        countryCode,
        phone,
      });

      if (!data.ok) {
        showError(lookupError, data.message || "No se pudo enviar el código.");
        return;
      }

      pending = {
        countryCode,
        phone,
        otpToken: data.otpToken || "",
        demoCode: data.code || "",
      };

      if (data.demo && data.code) {
        if (lookupDemo) {
          lookupDemo.hidden = false;
          if (lookupDemoCode) lookupDemoCode.textContent = data.code;
        }
      }

      if (lookupVerifyHint) {
        lookupVerifyHint.textContent = `Te enviamos un código de 6 dígitos por WhatsApp a ${maskPhone(countryCode, phone)}. Escríbelo abajo para ver tus reservas.`;
      }
      if (lookupVerifyDemo) {
        lookupVerifyDemo.hidden = !(data.demo && data.code);
        if (lookupVerifyDemoCode) lookupVerifyDemoCode.textContent = data.code || "";
      }
      if (lookupCode) lookupCode.value = "";
      showError(lookupVerifyError, "");
      showPanel("verify");
      lookupCode?.focus();
    } catch (err) {
      showError(lookupError, err?.message || "Error de conexión. Intenta de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode() {
    if (busy) return;
    showError(lookupVerifyError, "");

    const code = sanitizePhone(lookupCode?.value || "");
    if (lookupCode) lookupCode.value = code;
    if (code.length !== 6) {
      showError(lookupVerifyError, "Escribe el código de 6 dígitos.");
      return;
    }
    if (!pending.otpToken) {
      showError(lookupVerifyError, "Solicita un código nuevo.");
      showPanel("phone");
      return;
    }

    setBusy(true);
    try {
      const data = await postJson("/api/booking/lookup-verify", {
        ...tenantPayload(),
        countryCode: pending.countryCode,
        phone: pending.phone,
        code,
        otpToken: pending.otpToken,
      });

      if (!data.ok) {
        showError(lookupVerifyError, data.message || "Código incorrecto.");
        return;
      }

      renderResults(Array.isArray(data.bookings) ? data.bookings : []);
      showPanel("results");
    } catch (err) {
      showError(lookupVerifyError, err?.message || "Error de conexión. Intenta de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  function renderResults(bookings) {
    if (!resultsList) return;
    if (!bookings.length) {
      resultsList.innerHTML =
        '<p class="public-desc lookup-empty">No tienes reservas desde hoy con ese número.</p>';
      return;
    }

    resultsList.innerHTML = bookings
      .map(
        (b) => `
      <article class="booking-summary lookup-result-card">
        <div class="booking-summary__row">
          <strong>${escapeHtml(b.serviceName || "Cita")}</strong>
          <span class="service-row__duration">${Number(b.duration) || 60} min</span>
        </div>
        <p class="booking-summary__when">${escapeHtml(formatDate(b.date))} · ${escapeHtml(formatTime(b.time))}</p>
        <p class="booking-summary__note"><strong>Estado:</strong> ${escapeHtml(b.statusLabel || b.status || "Agendada")}</p>
      </article>`
      )
      .join("");
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  btnOpen?.addEventListener("click", openLookup);
  btnBack?.addEventListener("click", closeLookup);
  btnSend?.addEventListener("click", sendCode);
  btnVerify?.addEventListener("click", verifyCode);
  btnResend?.addEventListener("click", sendCode);
  btnAgain?.addEventListener("click", resetLookupState);

  lookupPhone?.addEventListener("input", () => {
    const next = sanitizePhone(lookupPhone.value);
    if (lookupPhone.value !== next) lookupPhone.value = next;
  });

  lookupCode?.addEventListener("input", () => {
    const next = sanitizePhone(lookupCode.value).slice(0, 6);
    if (lookupCode.value !== next) lookupCode.value = next;
  });

  lookupCode?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      verifyCode();
    }
  });

  window.addEventListener("booking:show-services", () => {
    lookupStep.hidden = true;
  });
})();
