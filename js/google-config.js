/**
 * Credenciales OAuth de Google Cloud (proyecto BarberHomeCloud).
 * Solo Client ID en frontend — nunca pegues el client_secret aquí.
 */
window.GoogleConfig = {
  clientId:
    "631735890663-1utcsuhhd1ku9u5t6h4ucflpanhp7djh.apps.googleusercontent.com",
  scopes: [
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/userinfo.email",
    "openid",
  ].join(" "),
};
