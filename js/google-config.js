/**
 * Credenciales OAuth de Google Cloud (proyecto Gestiónweb.app).
 * Solo Client ID en frontend — nunca pegues el client_secret aquí.
 *
 * En Google Cloud Console → APIs y servicios → Credenciales → tu cliente OAuth:
 * - Orígenes JavaScript autorizados (Calendar y Rewards; el login de barbero ya no los usa):
 *   https://barber-home-cloud.vercel.app
 *   http://localhost:5500
 *   http://127.0.0.1:5500
 *   http://localhost:3000
 *   http://127.0.0.1:3000
 * - URIs de redirección autorizadas:
 *   https://tyxcqogdrwlzglgntluc.supabase.co/auth/v1/callback
 *   https://barber-home-cloud.vercel.app/login.html
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
