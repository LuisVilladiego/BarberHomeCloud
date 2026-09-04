(function () {
  function cfg() {
    return window.EmailConfig || {};
  }

  function isConfigured() {
    const c = cfg();
    if (!c.enabled) return false;
    if (c.provider === "appscript") {
      return !!(c.appsScriptUrl && c.appsScriptSecret);
    }
    if (c.provider === "emailjs") {
      return !!(c.publicKey && c.serviceId && c.templateId && window.emailjs);
    }
    return false;
  }

  async function readJsonSafe(res) {
    const text = await res.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      if (/acceso denegado|access denied|sign in/i.test(text)) {
        return {
          ok: false,
          message:
            "Apps Script bloqueado (403). Vuelve a implementar la app web con acceso «Cualquier persona» y actualiza appsScriptUrl.",
        };
      }
      return null;
    }
  }

  function isMailSent(data) {
    if (!data || data.ok !== true) return false;
    const message = String(data.message || "");
    return /enviad/i.test(message) || /sent/i.test(message);
  }

  async function sendViaServer({ toEmail, toName, type, productLabel, code }) {
    const res = await fetch("/api/auth/otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "send",
        email: toEmail,
        name: toName,
        type: type || "verify",
        productLabel,
        code: code ? String(code).replace(/\D/g, "") : "",
      }),
    });
    const data = await res.json().catch(() => ({}));
    return {
      ok: !!data.ok,
      demo: !!data.demo,
      message:
        data.message || (data.ok ? "Código enviado al correo." : "No se pudo enviar el correo."),
      otpToken: data.otpToken || "",
      code: data.code || "",
    };
  }

  function mailBody(payload) {
    const c = cfg();
    return {
      secret: c.appsScriptSecret,
      from_name: payload.from_name || c.fromName || "Gestiónweb.app",
      ...payload,
    };
  }

  async function getAppsScript(url, bodyObj) {
    const params = new URLSearchParams();
    Object.entries(bodyObj).forEach(([key, value]) => {
      if (value == null || value === "") return;
      if (typeof value === "object") return;
      params.set(key, String(value));
    });
    params.set("_", String(Date.now()));
    const res = await fetch(`${url}?${params.toString()}`, {
      method: "GET",
      redirect: "follow",
    });
    return readJsonSafe(res);
  }

  async function postAppsScript(payload) {
    const c = cfg();
    const url = String(c.appsScriptUrl || "").trim();
    if (!/^https:\/\/script\.google\.com\//i.test(url)) {
      throw new Error("URL de Apps Script inválida");
    }
    const bodyObj = mailBody(payload);
    const type = String(bodyObj.type || "verify").toLowerCase();

    if (type === "verify" || type === "recover") {
      const getData = await getAppsScript(url, bodyObj);
      if (isMailSent(getData)) return { ok: true, demo: false, data: getData };
      if (getData && getData.ok === false) {
        throw new Error(getData.message || "No se pudo enviar el correo");
      }
    }

    const res = await fetch(url, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(bodyObj),
    });
    const data = await readJsonSafe(res);

    if (isMailSent(data)) return { ok: true, demo: false, data };

    if (res.status === 401 || res.status === 403) {
      throw new Error(
        data?.message ||
          "Apps Script sin permiso. Implementa de nuevo con acceso «Cualquier persona»."
      );
    }
    if (data && data.ok === false) {
      throw new Error(data.message || "No se pudo enviar el correo");
    }
    throw new Error(data?.message || "No se pudo enviar el correo. Revisa spam o pulsa Reenviar.");
  }

  async function sendViaAppsScript({ toEmail, toName, code, type = "verify", productLabel, fromName }) {
    await postAppsScript({
      type: type || "verify",
      to_email: toEmail,
      to_name: toName || "cliente",
      code: String(code),
      product_label: productLabel || "",
      from_name: fromName || cfg().fromName || "Gestiónweb.app",
    });
    return { ok: true, demo: false, message: "Código enviado al correo." };
  }

  async function sendViaEmailJs({ toEmail, toName, code }) {
    const c = cfg();
    emailjs.init({ publicKey: c.publicKey });
    await emailjs.send(c.serviceId, c.templateId, {
      to_email: toEmail,
      to_name: toName || "cliente",
      code: String(code),
      from_name: c.fromName || "Mi negocio",
      from_email: c.fromEmail || "",
      reply_to: c.fromEmail || toEmail,
    });
    return { ok: true, demo: false, message: "Código enviado al correo." };
  }

  async function sendVerificationCode({ toEmail, toName, code, productLabel }) {
    try {
      const server = await sendViaServer({
        toEmail,
        toName,
        type: "verify",
        productLabel: productLabel || "Gestiónweb.app",
        code,
      });
      if (server.otpToken || server.ok || server.demo) return server;
    } catch (err) {
      console.warn("[EmailService] server verify fallback", err);
    }

    const c = cfg();
    if (!isConfigured()) {
      return {
        ok: false,
        demo: true,
        message: "No se pudo enviar el correo. Usa el código que aparece en pantalla.",
        code,
      };
    }

    try {
      if (c.provider === "appscript") {
        const sent = await sendViaAppsScript({
          toEmail,
          toName,
          code,
          type: "verify",
          productLabel: productLabel || "Gestiónweb.app",
          fromName: "Gestiónweb.app",
        });
        return { ...sent, code };
      }
      const sent = await sendViaEmailJs({ toEmail, toName, code });
      return { ...sent, code };
    } catch (err) {
      console.error("Email send error", err);
      return {
        ok: false,
        demo: true,
        message: err?.message || "No se pudo enviar el correo. Usa el código que aparece en pantalla.",
        code,
        error: err,
      };
    }
  }

  async function sendRecoveryCode({ toEmail, toName, code }) {
    try {
      const server = await sendViaServer({ toEmail, toName, type: "recover", code });
      if (server.otpToken || server.ok || server.demo) return server;
    } catch (err) {
      console.warn("[EmailService] server recover fallback", err);
    }

    const c = cfg();
    if (!isConfigured()) {
      return {
        ok: false,
        demo: true,
        message: "No se pudo enviar el correo. Usa el código que aparece en pantalla.",
        code,
      };
    }

    try {
      if (c.provider === "appscript") {
        const sent = await sendViaAppsScript({
          toEmail,
          toName,
          code,
          type: "recover",
          fromName: "Gestiónweb.app",
        });
        return { ...sent, code };
      }
      const sent = await sendViaEmailJs({ toEmail, toName, code });
      return { ...sent, code };
    } catch (err) {
      console.error("Recovery email send error", err);
      return {
        ok: false,
        demo: true,
        message: err?.message || "No se pudo enviar el correo. Usa el código que aparece en pantalla.",
        code,
        error: err,
      };
    }
  }

  function tenantNotifyEmail(negocio) {
    if (!negocio) return "";
    const settings = negocio.settings && typeof negocio.settings === "object" ? negocio.settings : {};
    const auto = negocio.autoagenda && typeof negocio.autoagenda === "object" ? negocio.autoagenda : {};
    return String(
      negocio.owner_email ||
        settings.notify_email ||
        settings.owner_email ||
        auto.notify_email ||
        auto.googleCalendar?.email ||
        ""
    ).trim();
  }

  async function resolveNotifyEmail(context = {}) {
    const explicit = String(context.ownerEmail || "").trim();
    if (explicit) return explicit;

    const fromTenant = tenantNotifyEmail(window.Tenant?.cached?.());
    if (fromTenant) return fromTenant;

    return "";
  }

  async function notifyOwnerViaServer(kind, payload) {
    const biz = window.Tenant?.cached?.();
    const res = await fetch("/api/booking/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind,
        slug: payload?.slug || biz?.slug || "",
        negocioId: payload?.negocioId || biz?.id || window.Tenant?.currentId?.() || "",
        booking: kind === "booking" ? payload : undefined,
        redeem: kind === "redeem" ? payload : undefined,
      }),
    });
    return res.json().catch(() => ({}));
  }

  async function sendBookingAdminAlert(booking) {
    const c = cfg();
    if (!c.enabled || !c.notifyAdminOnBooking) {
      return { ok: false, skipped: true, message: "Aviso admin desactivado" };
    }
    if (!booking) {
      return { ok: false, message: "No hay datos de reserva para avisar" };
    }

    try {
      const server = await notifyOwnerViaServer("booking", booking);
      if (server?.ok) {
        return { ok: true, message: "Aviso enviado al correo de la membresía", to: server.to };
      }
      if (server?.to) booking.ownerEmail = booking.ownerEmail || server.to;
    } catch (err) {
      console.warn("[EmailService] notify server booking", err);
    }

    if (!isConfigured()) {
      return { ok: false, message: "Correo no configurado" };
    }

    const admin = await resolveNotifyEmail(booking);
    if (!admin) {
      return { ok: false, message: "No hay correo del dueño de este negocio." };
    }

    try {
      if (c.provider !== "appscript") {
        return { ok: false, message: "Aviso de reserva solo con provider appscript" };
      }
      const payloadBooking = {
        id: booking?.id || "",
        name: booking?.name || "Cliente",
        phone: booking?.phone || "",
        serviceName: booking?.serviceName || "Cita",
        date: booking?.date || "",
        time: booking?.time || "",
        duration: booking?.duration || 60,
        price: booking?.price ?? 0,
        notes: booking?.notes || "",
        status: booking?.status || "pending_confirmation",
        source: booking?.source || "public",
        business: booking?.business || c.fromName || "Gestiónweb.app",
        clientFingerprint:
          booking?.clientFingerprint ||
          (typeof window !== "undefined" && window.Security?.getDeviceId?.()) ||
          "",
      };
      console.info("[EmailService] Aviso reserva →", admin, payloadBooking);
      await postAppsScript({
        type: "booking",
        to_email: admin,
        admin_email: admin,
        client_name: payloadBooking.name,
        client_phone: payloadBooking.phone,
        client_fingerprint: payloadBooking.clientFingerprint,
        service: payloadBooking.serviceName,
        date: payloadBooking.date,
        time: payloadBooking.time,
        duration: payloadBooking.duration,
        price: payloadBooking.price,
        notes: payloadBooking.notes,
        booking: payloadBooking,
      });
      return { ok: true, message: "Aviso enviado al correo de la membresía", to: admin };
    } catch (err) {
      console.error("Admin booking email error", err);
      return {
        ok: false,
        message: err?.message || "No se pudo avisar al dueño del negocio",
        error: err,
      };
    }
  }

  async function sendRedeemAdminAlert(redeem) {
    const c = cfg();
    if (!c.enabled || c.notifyAdminOnRedeem === false) {
      return { ok: false, skipped: true, message: "Aviso de canje desactivado" };
    }
    if (!redeem) {
      return { ok: false, message: "No hay datos de canje para avisar" };
    }

    try {
      const server = await notifyOwnerViaServer("redeem", redeem);
      if (server?.ok) {
        return { ok: true, message: "Aviso de canje enviado al correo de la membresía", to: server.to };
      }
      if (server?.to) redeem.ownerEmail = redeem.ownerEmail || server.to;
    } catch (err) {
      console.warn("[EmailService] notify server redeem", err);
    }

    if (!isConfigured()) {
      return { ok: false, message: "Correo no configurado" };
    }

    const admin = await resolveNotifyEmail(redeem);
    if (!admin) {
      return { ok: false, message: "No hay correo del dueño de este negocio." };
    }

    try {
      if (c.provider !== "appscript") {
        return { ok: false, message: "Aviso de canje solo con provider appscript" };
      }
      const customer = redeem.customer || {};
      const payload = {
        id: redeem.id || "",
        productName: redeem.productName || "Producto",
        pointsCost: redeem.pointsCost ?? 0,
        valueCop: redeem.valueCop ?? 0,
        createdAt: redeem.createdAt || new Date().toISOString(),
        customer: {
          name: customer.name || "Cliente",
          phone: customer.phone || "",
          email: customer.email || "",
          docType: customer.docType || "CC",
          docNumber: customer.docNumber || "",
        },
      };
      console.info("[EmailService] Enviando aviso de canje a", admin, payload);
      await postAppsScript({
        type: "redeem",
        to_email: admin,
        admin_email: admin,
        product_name: payload.productName,
        points_cost: payload.pointsCost,
        value_cop: payload.valueCop,
        client_name: payload.customer.name,
        client_phone: payload.customer.phone,
        client_email: payload.customer.email,
        client_doc: `${payload.customer.docType} ${payload.customer.docNumber}`.trim(),
        redeem: payload,
      });
      return { ok: true, message: "Aviso de canje enviado al correo de la membresía", to: admin };
    } catch (err) {
      console.error("Admin redeem email error", err);
      return {
        ok: false,
        message: err?.message || "No se pudo avisar al administrador del canje",
        error: err,
      };
    }
  }

  window.EmailService = {
    isConfigured,
    sendVerificationCode,
    sendRecoveryCode,
    sendBookingAdminAlert,
    sendRedeemAdminAlert,
  };
})();
