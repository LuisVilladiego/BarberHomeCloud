/**
 * Acceso a Supabase desde las funciones serverless usando la service role key.
 * Se usa REST directo con fetch para no añadir dependencias al proyecto.
 * La service role key salta RLS: nunca la expongas al navegador.
 */
function config() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
  }
  return { url: url.replace(/\/+$/, ""), serviceKey };
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
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const message = data?.message || data?.error || `Supabase ${res.status}`;
    throw new Error(message);
  }
  return data;
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

async function insertPago(row) {
  const rows = await rest("pagos", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: row,
  });
  return Array.isArray(rows) ? rows[0] || null : null;
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
  insertPago,
  negocioById,
  negocioOfOwner,
  pagoByReference,
  rest,
  updateNegocio,
  updatePago,
  userFromToken,
};
