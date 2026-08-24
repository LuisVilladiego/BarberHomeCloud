#!/usr/bin/env bash
set -euo pipefail

# Crea o actualiza la cuenta de administrador de plataforma en Supabase Auth.
#
# Uso (desde la raíz del repo):
#   SUPABASE_SERVICE_ROLE_KEY=eyJ... ./scripts/ensure-platform-admin.sh
#
# La service_role key está en:
#   Supabase → Project Settings → API → service_role (secret)

PROJECT_URL="${SUPABASE_URL:-https://tyxcqogdrwlzglgntluc.supabase.co}"
ADMIN_EMAIL="${PLATFORM_ADMIN_EMAIL:-adminbarbercloud@gmail.com}"
ADMIN_PASSWORD="${PLATFORM_ADMIN_PASSWORD:-}"

if [[ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
  echo "Falta SUPABASE_SERVICE_ROLE_KEY." >&2
  echo "Supabase → Settings → API → service_role (secret)" >&2
  exit 1
fi

if [[ -z "${ADMIN_PASSWORD}" ]]; then
  read -r -s -p "Contraseña para ${ADMIN_EMAIL}: " ADMIN_PASSWORD
  echo
fi

if [[ ${#ADMIN_PASSWORD} -lt 6 ]]; then
  echo "La contraseña debe tener al menos 6 caracteres." >&2
  exit 1
fi

auth_header=(-H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}")

echo "→ Buscando usuario ${ADMIN_EMAIL}..."
list_json=$(curl -sS -G "${PROJECT_URL}/auth/v1/admin/users" \
  "${auth_header[@]}" \
  --data-urlencode "email=${ADMIN_EMAIL}")

user_id=$(python3 - <<'PY' "${list_json}"
import json, sys
data = json.loads(sys.argv[1])
users = data.get("users") or []
print(users[0]["id"] if users else "")
PY
)

payload=$(python3 - <<'PY' "${ADMIN_EMAIL}" "${ADMIN_PASSWORD}"
import json, sys
print(json.dumps({
  "email": sys.argv[1],
  "password": sys.argv[2],
  "email_confirm": True,
}))
PY
)

if [[ -n "${user_id}" ]]; then
  echo "→ Usuario encontrado (${user_id}). Actualizando contraseña..."
  http_code=$(curl -sS -o /tmp/supabase-admin-user.json -w "%{http_code}" \
    -X PUT "${PROJECT_URL}/auth/v1/admin/users/${user_id}" \
    "${auth_header[@]}" \
    -H "Content-Type: application/json" \
    -d "${payload}")
else
  echo "→ Usuario no existe. Creando cuenta admin..."
  http_code=$(curl -sS -o /tmp/supabase-admin-user.json -w "%{http_code}" \
    -X POST "${PROJECT_URL}/auth/v1/admin/users" \
    "${auth_header[@]}" \
    -H "Content-Type: application/json" \
    -d "${payload}")
fi

echo "HTTP ${http_code}"
cat /tmp/supabase-admin-user.json
echo

if [[ "${http_code}" != "200" && "${http_code}" != "201" ]]; then
  echo "No se pudo crear/actualizar el admin." >&2
  exit 1
fi

echo "Listo. Entra en https://barber-home-cloud.vercel.app/admin-login con ${ADMIN_EMAIL}"
