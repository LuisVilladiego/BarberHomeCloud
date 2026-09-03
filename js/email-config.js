/**
 * Configuración de correo (OTP + avisos de reserva/canje al admin).
 *
 * IMPORTANTE: si actualizaste gmail-apps-script.gs, vuelve a implementar
 * en script.google.com (Nueva versión) para type=booking y type=redeem.
 */
window.EmailConfig = {
  enabled: true,

  /**
   * "appscript" → Google Apps Script + tu Gmail (recomendado)
   * "emailjs"   → EmailJS (opcional)
   */
  provider: "appscript",

  fromName: "BarberCloud",
  fromEmail: "barberhomeluisvilladiego20@gmail.com",

  /**
   * Remitente de Apps Script (Gmail de la plataforma). NUNCA es el destinatario
   * de reservas: eso va al correo de la membresía (dueño del negocio).
   */
  adminEmail: "",
  notifyAdminOnBooking: true,
  /** Aviso cuando un cliente canjea puntos por un producto */
  notifyAdminOnRedeem: true,

  /* —— Google Apps Script —— */
  appsScriptUrl:
    "https://script.google.com/macros/s/AKfycbySOcHmfyYq7Z30E9tiMgKs76FkdBkBxKKNc6S-oaur7QJ8HWCq3sfN_MJFw-mXQ8h7/exec",
  /** Debe coincidir con SECRET en gmail-apps-script.gs.
   *  En producción el envío va por /api/auth/otp (variables APPS_SCRIPT_* en Vercel).
   *  Este fallback en frontend solo se usa si la API no responde. */
  appsScriptSecret: "barberhome-otp-2026",

  /* —— EmailJS (opcional) —— */
  publicKey: "",
  serviceId: "service_1s8491d",
  templateId: "",
};
