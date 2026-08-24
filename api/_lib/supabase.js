/**
 * Acceso a Supabase desde las funciones serverless usando la service role key.
 * Se usa REST directo con fetch para no añadir dependencias al proyecto.
 * La service role key salta RLS: nunca la expongas al navegador.
 */
/**
 * Deja solo el origen del proyecto. Es fácil pegar en SUPABASE_URL el endpoint
 * REST en vez de la Project URL, y entonces Supabase responde
 * {"error":"requested path is invalid"} porque la ruta queda duplicada.
 */
function projectOrigin(raw) {
  const trimmed = String(raw).trim().replace(/\/+$/, "");
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return new URL(withScheme).origin;
}

const DEFAULT_SUPABASE_URL = "https://tyxcqogdrwlzglgntluc.supabase.co";

function config() {
  const rawUrl = process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!rawUrl || !serviceKey) {
    throw new Error("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
  }

  let url;
  try {
    url = projectOrigin(rawUrl);
  } catch {
    throw new Error(`SUPABASE_URL no es una URL válida: ${rawUrl}`);
  }
  return { url, serviceKey };
}

async function rest(path, { method = "GET", body, headers = {}, query } = {}) {
  const { url, serviceKey } = config();
  const target = new URL(`${url}/rest/v1/${path}`);
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null) target.searchParams.set(key, String(value));
  });

  const res = await fetch(target.toString(), {
    method,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Supabase respondió de forma inesperada (${res.status})`);
  }
  if (!res.ok) {
    const message = data?.message || data?.error || data?.hint || `Supabase ${res.status}`;
    throw new Error(message);
  }
  return data;
}

/** Listado admin: prueba columnas opcionales y cae a un select mínimo si hace falta. */
async function listNegocios() {
  const attempts = [
    "id,slug,name,plan_id,subscription_status,cancel_at_period_end,current_period_start,current_period_end,last_payment_at,owner_id,onboarding_completed,created_at,updated_at",
    "id,slug,name,plan_id,subscription_status,current_period_start,current_period_end,last_payment_at,owner_id,onboarding_completed,created_at,updated_at",
    "id,slug,name,plan_id,subscription_status,owner_id,created_at,updated_at",
    "*",
  ];
  let lastErr;
  for (const select of attempts) {
    try {
      const rows = await rest("negocios", {
        query: { select, order: "updated_at.desc" },
      });
      return Array.isArray(rows) ? rows : [];
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error("No se pudo leer negocios");
}

/** Valida el access token del barbero y devuelve su usuario. */
async function userFromToken(accessToken) {
  if (!accessToken) return null;
  const { url, serviceKey } = config();
  const res = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const user = await res.json();
  return user?.id ? user : null;
}

async function negocioOfOwner(ownerId) {
  const rows = await rest("negocios", {
    query: {
      select: "*",
      owner_id: `eq.${ownerId}`,
      order: "updated_at.desc",
      limit: 1,
    },
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function negocioById(id) {
  const rows = await rest("negocios", { query: { select: "*", id: `eq.${id}`, limit: 1 } });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function updateNegocio(id, patch) {
  const rows = await rest("negocios", {
    method: "PATCH",
    query: { id: `eq.${id}` },
    headers: { Prefer: "return=representation" },
    body: { ...patch, updated_at: new Date().toISOString() },
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function insertNegocio(row) {
  const rows = await rest("negocios", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: row,
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function insertPago(row) {
  const rows = await rest("pagos", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: row,
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

function normalizeSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

/** Slug único provisional hasta que el barbero elija uno en Autoagenda. */
function provisionalSlug(user) {
  const name = user?.user_metadata?.name || user?.email?.split("@")[0] || "barberia";
  const base = normalizeSlug(name) || "barberia";
  const suffix = String(user?.id || "").replace(/-/g, "").slice(0, 8);
  const slug = `${base}-${suffix}`.replace(/-+/g, "-").replace(/^-|-$/g, "");
  return slug.length >= 3 ? slug.slice(0, 50) : `barberia-${suffix}`.slice(0, 50);
}

async function pagoByReference(reference) {
  const rows = await rest("pagos", {
    query: { select: "*", reference: `eq.${reference}`, limit: 1 },
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function updatePago(reference, patch) {
  const rows = await rest("pagos", {
    method: "PATCH",
    query: { reference: `eq.${reference}` },
    headers: { Prefer: "return=representation" },
    body: { ...patch, updated_at: new Date().toISOString() },
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

module.exports = {
  config,
  insertNegocio,
  insertPago,
  listNegocios,
  negocioById,
  negocioOfOwner,
  normalizeSlug,
  pagoByReference,
  provisionalSlug,
  rest,
  updateNegocio,
  updatePago,
  userFromToken,
};
