#!/usr/bin/env bash
set -euo pipefail

# Configura Google OAuth en Supabase (Management API).
# Uso:
#   SUPABASE_ACCESS_TOKEN=sbp_xxx GOOGLE_CLIENT_SECRET=GOCSPX-xxx ./scripts/setup-supabase-google.sh
#
# Token: https://supabase.com/dashboard/account/tokens
# Secret: Google Cloud → APIs y servicios → Credenciales → OAuth client

PROJECT_REF="${SUPABASE_PROJECT_REF:-tyxcqogdrwlzglgntluc}"
GOOGLE_CLIENT_ID="${GOOGLE_CLIENT_ID:-631735890663-1utcsuhhd1ku9u5t6h4ucflpanhp7djh.apps.googleusercontent.com}"
SITE_URL="${SITE_URL:-https://barber-home-cloud.vercel.app}"
REDIRECT_URL="${REDIRECT_URL:-https://barber-home-cloud.vercel.app/login.html}"

if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  echo "Falta SUPABASE_ACCESS_TOKEN (Personal Access Token de Supabase)." >&2
  exit 1
fi

if [[ -z "${GOOGLE_CLIENT_SECRET:-}" ]]; then
  echo "Falta GOOGLE_CLIENT_SECRET (Google Cloud OAuth client secret)." >&2
  exit 1
fi

payload=$(cat <<EOF
{
  "site_url": "${SITE_URL}",
  "uri_allow_list": "${REDIRECT_URL},http://localhost:5500/login.html,http://127.0.0.1:5500/login.html",
  "external_google_enabled": true,
  "external_google_client_id": "${GOOGLE_CLIENT_ID}",
  "external_google_secret": "${GOOGLE_CLIENT_SECRET}",
  "external_google_skip_nonce_check": false
}
EOF
)

echo "→ Autoconfirm de correo (evita bloqueo tras registro)..."
curl -sS -o /tmp/supabase-auth-autoconfirm.json -w "HTTP %{http_code}\n" \
  -X PATCH "https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"mailer_autoconfirm":true}' || true

echo "→ Configurando Google Auth en Supabase (${PROJECT_REF})..."
http_code=$(curl -sS -o /tmp/supabase-auth-patch.json -w "%{http_code}" \
  -X PATCH "https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "${payload}")

echo "HTTP ${http_code}"
cat /tmp/supabase-auth-patch.json
echo

if [[ "${http_code}" != "200" ]]; then
  echo "Error al actualizar auth." >&2
  exit 1
fi

echo "→ Verificando provider Google..."
curl -sS "https://${PROJECT_REF}.supabase.co/auth/v1/settings" \
  -H "apikey: ${SUPABASE_ANON_KEY:-sb_publishable_1ga8w_2j0jkdB-mIMonTJA_5LT6fY8S}" \
  | python3 -c 'import json,sys; d=json.load(sys.stdin); print("google enabled:", d.get("external",{}).get("google"))'

echo "Listo. Prueba login con Gmail en ${REDIRECT_URL}"
