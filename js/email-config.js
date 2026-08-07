/**
 * Configuración de correo (OTP + aviso de reservas al admin).
 *
 * IMPORTANTE: si actualizaste gmail-apps-script.gs, vuelve a implementar
 * en script.google.com (Nueva versión) para que type=booking funcione.
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

  /** Correo del administrador que recibe cada nueva reserva */
  adminEmail: "barberhomeluisvilladiego20@gmail.com",
  notifyAdminOnBooking: true,

  /* —— Google Apps Script —— */
  appsScriptUrl:
    "https://script.google.com/macros/s/AKfycbxba-kYtY2NgCt5s-80-RK9mcVrP9NFPVaByFDMK6J82wouKvvTox-V3jrex4KUtjzq/exec",
  /** Debe coincidir con SECRET en gmail-apps-script.gs */
  appsScriptSecret: "barberhome-otp-2026",

  /* —— EmailJS (opcional) —— */
  publicKey: "",
  serviceId: "service_1s8491d",
  templateId: "",
};
