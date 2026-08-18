const crypto = require("node:crypto");

const CHECKOUT_URL = "https://checkout.wompi.co/p/";

function sha256Hex(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function readPath(root, path) {
  return String(path)
    .split(".")
    .reduce((acc, key) => (acc == null ? acc : acc[key]), root);
}

/** SHA256(reference + montoEnCentavos + moneda [+ expiración] + secreto de integridad) */
function integritySignature({ reference, amountInCents, currency, expirationTime, secret }) {
  const parts = [reference, String(amountInCents), currency];
  if (expirationTime) parts.push(expirationTime);
  parts.push(secret);
  return sha256Hex(parts.join(""));
}

/**
 * Checksum de eventos: concatena los valores que signature.properties apunta
 * dentro de data, luego el timestamp del evento y al final el secreto.
 * Se usa la lista que trae cada evento porque Wompi puede cambiarla.
 */
function eventChecksum(event, secret) {
  const properties = event?.signature?.properties;
  if (!Array.isArray(properties) || !properties.length) return null;
  const values = properties.map((path) => readPath(event.data, path));
  if (values.some((value) => value === undefined || value === null)) return null;
  return sha256Hex(`${values.join("")}${event.timestamp}${secret}`);
}

/** Compara hex en minúsculas: Wompi envía el checksum en mayúsculas. */
function safeEqualHex(a, b) {
  const bufA = Buffer.from(String(a || "").toLowerCase(), "utf8");
  const bufB = Buffer.from(String(b || "").toLowerCase(), "utf8");
  if (bufA.length !== bufB.length || !bufA.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function verifyEvent(event, headerChecksum, secret) {
  const expected = eventChecksum(event, secret);
  if (!expected) return false;
  const received = headerChecksum || event?.signature?.checksum;
  return safeEqualHex(expected, received);
}

function buildCheckoutUrl(params) {
  const url = new URL(CHECKOUT_URL);
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    url.searchParams.set(key, String(value));
  });
  return url.toString();
}

function newReference(negocioId, planId) {
  const short = String(negocioId || "").replace(/-/g, "").slice(0, 12);
  const random = crypto.randomBytes(6).toString("hex").toUpperCase();
  return `BC-${short}-${planId}-${Date.now()}-${random}`;
}

module.exports = {
  CHECKOUT_URL,
  buildCheckoutUrl,
  eventChecksum,
  integritySignature,
  newReference,
  safeEqualHex,
  sha256Hex,
  verifyEvent,
};
