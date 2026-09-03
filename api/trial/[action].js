const {
  insertNegocio,
  listTrialNegocios,
  negocioOfOwner,
  provisionalSlug,
  updateNegocio,
  userFromToken,
  fetchOwnerEmail,
} = require("../_lib/supabase");
const { hasSubscriptionAccess, normalizePlanId } = require("../_lib/business-model");
const { isConfigured, sendTrialEmail } = require("../_lib/mail");
const {
  TRIAL_DAYS,
  alreadyUsedTrial,
  hasOpenTrialWindow,
  daysLeft,
  pickReminder,
  trialCopy,
  trialPeriod,
} = require("../_lib/trial");

function bearer(req) {
  const raw = req.headers.authorization || req.headers.Authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(String(raw));
  return match ? match[1].trim() : "";
}

function isCron(req) {
  if (String(req.headers["x-vercel-cron"] || "") === "1") return true;
  const secret = String(process.env.CRON_SECRET || "").trim();
  if (!secret) return false;
  return bearer(req) === secret;
}

function subscriptionActive(negocio) {
  return hasSubscriptionAccess(negocio?.subscription_status, negocio?.current_period_end);
}

function reminderState(negocio) {
  const settings = negocio?.settings && typeof negocio.settings === "object" ? negocio.settings : {};
  const sent = settings.trial_reminders && typeof settings.trial_reminders === "object"
    ? settings.trial_reminders
    : {};
  return { settings, sent };
}

async function persistReminder(negocio, key) {
  const { settings, sent } = reminderState(negocio);
  const next = {
    ...settings,
    trial_reminders: { ...sent, [key]: new Date().toISOString() },
  };
  try {
    return await updateNegocio(negocio.id, { settings: next });
  } catch (err) {
    console.warn("[trial] no se pudo guardar recordatorio", err?.message);
    return negocio;
  }
}

async function deliverTrialMail(negocio, days, key) {
  const email = await fetchOwnerEmail(negocio.owner_id);
  if (!email) return { sent: false, reason: "sin_correo" };
  const copy = trialCopy(key === "start" ? Math.max(days, TRIAL_DAYS) : days, negocio.current_period_end);
  if (!isConfigured()) return { sent: false, reason: "correo_no_configurado" };
  await sendTrialEmail({
    toEmail: email,
    toName: negocio.name || email.split("@")[0],
    daysLeft: days,
    periodEnd: negocio.current_period_end,
    copy,
  });
  await persistReminder(negocio, key);
  return { sent: true, key, days, email };
}

async function startTrial(user) {
  let negocio = await negocioOfOwner(user.id);
  const period = trialPeriod();

  if (!negocio) {
    const slug = provisionalSlug(user);
    const name =
      String(user.user_metadata?.name || "").trim() ||
      String(user.email || "").split("@")[0] ||
      "Mi barbería";
    negocio = await insertNegocio({
      slug,
      name,
      owner_id: user.id,
      autoagenda: {},
      onboarding_completed: false,
      subscription_status: "trial",
      plan_id: "pro",
      current_period_start: period.start,
      current_period_end: period.end,
    });
  } else if (subscriptionActive(negocio)) {
    return {
      ok: true,
      negocio,
      alreadyActive: true,
      status: negocio.subscription_status,
      periodEnd: negocio.current_period_end,
    };
  } else if (alreadyUsedTrial(negocio)) {
    return {
      ok: false,
      statusCode: 409,
      error: "Tu prueba de 7 días ya terminó. Elige un plan para seguir usando BarberCloud.",
    };
  } else if (hasOpenTrialWindow(negocio)) {
    negocio = await updateNegocio(negocio.id, {
      subscription_status: "trial",
      plan_id: normalizePlanId(negocio.plan_id || "pro"),
    });
  } else {
    negocio = await updateNegocio(negocio.id, {
      subscription_status: "trial",
      plan_id: normalizePlanId(negocio.plan_id || "pro"),
      current_period_start: period.start,
      current_period_end: period.end,
    });
  }

  if (!negocio?.id) {
    return { ok: false, statusCode: 500, error: "No se pudo crear la barbería" };
  }

  const days = daysLeft(negocio.current_period_end);
  const { sent } = reminderState(negocio);
  const key = pickReminder(days, sent, { justStarted: true });
  let mail = null;
  if (key) {
    try {
      mail = await deliverTrialMail(negocio, days, key);
    } catch (err) {
      console.error("[trial/start] mail", err);
      mail = { sent: false, reason: err?.message || "mail_error" };
    }
  }

  return {
    ok: true,
    negocio,
    status: "trial",
    periodEnd: negocio.current_period_end,
    trialDays: TRIAL_DAYS,
    mail,
  };
}

async function remindOne(negocio) {
  if (!subscriptionActive(negocio)) return { skipped: true, reason: "sin_acceso" };
  const status = String(negocio.subscription_status || "").toLowerCase();
  if (status !== "trial" && status !== "trialing") return { skipped: true, reason: "no_es_prueba" };
  const days = daysLeft(negocio.current_period_end);
  const { sent } = reminderState(negocio);
  const key = pickReminder(days, sent, { justStarted: false });
  if (!key) return { skipped: true, reason: "sin_aviso_hoy", days };
  try {
    const mail = await deliverTrialMail(negocio, days, key);
    return { skipped: false, ...mail };
  } catch (err) {
    console.error("[trial/remind] mail", err);
    return { skipped: true, reason: err?.message || "mail_error", days };
  }
}

async function handleRemind(req) {
  if (isCron(req)) {
    const rows = await listTrialNegocios();
    const trials = (rows || []).filter((n) => {
      const status = String(n.subscription_status || "").toLowerCase();
      return (status === "trial" || status === "trialing") && subscriptionActive(n);
    });
    const results = [];
    for (const negocio of trials) {
      results.push({ id: negocio.id, ...(await remindOne(negocio)) });
    }
    return { ok: true, scanned: trials.length, results };
  }

  const user = await userFromToken(bearer(req));
  if (!user) return { ok: false, statusCode: 401, error: "Sesión no válida" };
  const negocio = await negocioOfOwner(user.id);
  if (!negocio) return { ok: true, skipped: true, reason: "sin_negocio" };
  return { ok: true, ...(await remindOne(negocio)) };
}

module.exports = async function handler(req, res) {
  const action = String(req.query?.action || "").toLowerCase();
  const allowGet = action === "remind" && req.method === "GET";
  if (req.method !== "POST" && !allowGet) {
    res.setHeader("Allow", "POST, GET");
    return res.status(405).json({ error: "Método no permitido" });
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: "Supabase no configurado en el servidor" });
  }

  try {
    if (action === "remind") {
      const out = await handleRemind(req);
      return res.status(out.statusCode || 200).json(out);
    }

    if (action !== "start") {
      return res.status(404).json({ error: "Acción no encontrada" });
    }

    const user = await userFromToken(bearer(req));
    if (!user) return res.status(401).json({ error: "Sesión no válida" });
    const out = await startTrial(user);
    return res.status(out.statusCode || 200).json(out);
  } catch (err) {
    console.error("[trial]", err);
    return res.status(500).json({ error: "No se pudo procesar la prueba", detail: err?.message });
  }
};
