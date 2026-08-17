/**
 * Credenciales Supabase (Project Settings → API).
 * - url: Project URL
 * - anonKey: anon / public key (NUNCA la service_role en el frontend)
 *
 * 1) Crea el proyecto en https://supabase.com
 * 2) SQL Editor → pega supabase/schema.sql → Run
 * 3) Completa url y anonKey abajo
 * 4) Redeploy en Vercel (o recarga local)
 */
window.SupabaseConfig = {
  enabled: true,
  url: "https://tyxcqogdrwlzglgntluc.supabase.co",
  anonKey: "sb_publishable_1ga8w_2j0jkdB-mIMonTJA_5LT6fY8S",
};
