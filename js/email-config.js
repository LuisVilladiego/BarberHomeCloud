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

  fromName: "BarberHome",
  fromEmail: "barberhomeluisvilladiego20@gmail.com",

  /** Correo del administrador que recibe cada nueva reserva / canje */
  adminEmail: "barberhomeluisvilladiego20@gmail.com",
  notifyAdminOnBooking: true,
  /** Aviso cuando un cliente canjea puntos por un producto */
  notifyAdminOnRedeem: true,

  /* —— Google Apps Script —— */
  appsScriptUrl:
    "https://script.google.com/macros/s/AKfycbzdpNXtU4Bx9GWWKwVWGokVC49EDJMNe8xe0vwEEnUFl7zrC7h9JUtb-b0gQ2HioASY/exec",
  /** Debe coincidir con SECRET en gmail-apps-script.gs.
   *  Nota de seguridad: cualquier secreto en frontend es visible.
   *  Rótalo si lo filtraste y vuelve a desplegar el Apps Script. */
  appsScriptSecret: "barberhome-otp-2026",

  /* —— EmailJS (opcional) —— */
  publicKey: "",
  serviceId: "service_1s8491d",
  templateId: "",
};
