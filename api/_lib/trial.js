const TRIAL_DAYS = 7;
const APP_URL = String(process.env.PUBLIC_APP_URL || "https://barber-home-cloud.vercel.app").replace(
  /\/+$/,
  ""
);

function daysLeft(periodEnd) {
  if (!periodEnd) return 0;
  const diff = new Date(periodEnd).getTime() - Date.now();
  if (diff <= 0) return 0;
  return Math.ceil(diff / 86400000);
}

function formatEnd(periodEnd) {
  try {
    return new Date(periodEnd).toLocaleDateString("es-CO", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

function alreadyUsedTrial(negocio) {
  if (!negocio) return false;
  if (negocio.last_payment_at) return true;
  const end = negocio.current_period_end;
  return !!(end && new Date(end).getTime() <= Date.now());
}

function hasOpenTrialWindow(negocio) {
  const end = negocio?.current_period_end;
  if (!end) return false;
  return new Date(end).getTime() > Date.now();
}

function pickReminder(days, sent = {}, { justStarted } = {}) {
  if (!sent.start && (justStarted || days >= 4)) return "start";
  if (days === 3 && !sent.d3) return "d3";
  if (days === 2 && !sent.d2) return "d2";
  if (days === 1 && !sent.d1) return "d1";
  if (days === 0 && !sent.d0) return "d0";
  return null;
}

function trialCopy(days, periodEnd) {
  const endLabel = formatEnd(periodEnd);
  const planUrl = `${APP_URL}/suscripcion.html?need=1`;
  if (days >= 7 || days === 6) {
    return {
      subject: "Tu prueba de 7 días en BarberCloud ya empezó",
      preview: `Tienes ${days} días de acceso completo.`,
      headline: "Tu prueba gratis ya está activa",
      body: `Tienes ${days} días de acceso normal al panel: reservas, WhatsApp, agenda y tienda. La prueba termina el ${endLabel}.`,
      cta: "Abrir mi panel",
      href: `${APP_URL}/index.html`,
    };
  }
  if (days >= 3) {
    return {
      subject: `Te quedan ${days} días de prueba en BarberCloud`,
      preview: `Tu prueba termina el ${endLabel}.`,
      headline: `Te quedan ${days} días de prueba`,
      body: `Sigue usando BarberCloud con normalidad. El ${endLabel} se acaba la prueba gratis. Elige un plan para no pausar tu link de reservas.`,
      cta: "Elegir un plan",
      href: planUrl,
    };
  }
  if (days === 2) {
    return {
      subject: "Te quedan 2 días de prueba en BarberCloud",
      preview: `Tu prueba termina el ${endLabel}.`,
      headline: "Quedan 2 días de prueba",
      body: `El ${endLabel} termina tu acceso de prueba. Si no eliges un plan, el panel pasa a solo lectura y se pausa el enlace público.`,
      cta: "Elegir un plan",
      href: planUrl,
    };
  }
  if (days === 1) {
    return {
      subject: "Mañana termina tu prueba gratis de BarberCloud",
      preview: `Último día mañana · ${endLabel}.`,
      headline: "Mañana se acaba tu prueba",
      body: `Hoy todavía tienes acceso normal. Mañana (${endLabel}) termina la prueba. Activa un plan para seguir recibiendo reservas.`,
      cta: "Activar plan",
      href: planUrl,
    };
  }
  return {
    subject: "Hoy termina tu prueba de BarberCloud",
    preview: "Elige un plan para no perder el acceso.",
    headline: "Hoy termina tu prueba gratis",
    body: "Cuando se acabe el plazo, el panel queda en pausa hasta que elijas un plan. Tus datos no se borran.",
    cta: "Elegir un plan ahora",
    href: planUrl,
  };
}

function trialPeriod(from = new Date()) {
  const start = new Date(from);
  const end = new Date(start.getTime() + TRIAL_DAYS * 86400000);
  return { start: start.toISOString(), end: end.toISOString() };
}

module.exports = {
  APP_URL,
  TRIAL_DAYS,
  alreadyUsedTrial,
  hasOpenTrialWindow,
  daysLeft,
  formatEnd,
  pickReminder,
  trialCopy,
  trialPeriod,
};
