/**
 * Credenciales OAuth de Google Cloud (proyecto BarberHomeCloud).
 * Solo Client ID en frontend — nunca pegues el client_secret aquí.
 *
 * En Google Cloud Console → APIs y servicios → Credenciales → tu cliente OAuth:
 * - Orígenes JavaScript autorizados:
 *   https://barber-home-cloud.vercel.app
 *   http://localhost:5500 (o tu puerto local)
 * - URIs de redirección (solo si usas OAuth redirect de Supabase):
 *   https://tyxcqogdrwlzglgntluc.supabase.co/auth/v1/callback
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
