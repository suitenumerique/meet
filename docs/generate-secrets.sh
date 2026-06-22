#!/bin/bash
# generate-secrets.sh - Generate cryptographic secrets and write them into env.d/ files
#
# Usage:
#   ./generate-secrets.sh                    # uses ./env.d/ in the current directory
#   ./generate-secrets.sh /path/to/env.d/    # explicit env.d/ path
#
# Optionally patch livekit-server.yaml automatically:
#   ./generate-secrets.sh ./env.d/ ./livekit-server.yaml
#
# What it does:
#   - Generates cryptographic secrets using openssl
#   - Writes each secret into the correct env.d/ file by replacing its placeholder
#   - Will not overwrite a value that has already been set (not a placeholder)
#   - If livekit-server.yaml path is provided, patches it automatically
#
# Secrets and their files:
#   env.d/common       - DJANGO_SECRET_KEY, LIVEKIT_API_SECRET, OIDC_RP_CLIENT_SECRET
#   env.d/postgresql   - DB_PASSWORD
#   env.d/kc_postgresql - KC_DB_PASSWORD (POSTGRES_PASSWORD)
#   env.d/keycloak     - KC_BOOTSTRAP_ADMIN_PASSWORD

set -euo pipefail

ENV_DIR="${1:-./env.d}"
LIVEKIT_YAML="${2:-}"

# Normalise: strip trailing slash
ENV_DIR="${ENV_DIR%/}"

if [ ! -d "$ENV_DIR" ]; then
  echo "Error: $ENV_DIR directory not found."
  echo "Run this script from your project directory, or pass the env.d/ path as an argument."
  exit 1
fi

if [ -n "$LIVEKIT_YAML" ] && [ ! -f "$LIVEKIT_YAML" ]; then
  echo "Error: $LIVEKIT_YAML not found."
  exit 1
fi

command -v openssl >/dev/null 2>&1 || { echo "Error: openssl is not installed."; exit 1; }

# ── helper ────────────────────────────────────────────────────────────────────
# set_secret FILE KEY VALUE
# Replaces KEY=<placeholder> with KEY=VALUE in FILE.
# Placeholders: anything matching <...> or REPLACE_ME or an empty value.
# Skips if the key already has a real value.
set_secret() {
  local file="$1" key="$2" value="$3"

  if [ ! -f "$file" ]; then
    echo "  skip $key ($file not found)"
    return
  fi

  if grep -qE "^${key}=(<[^>]*>|REPLACE_ME|)$" "$file"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$file"
    echo "  set  ${key}  →  ${file##*/}"
  elif grep -qE "^${key}=" "$file"; then
    echo "  skip ${key} (already set in ${file##*/})"
  else
    echo "${key}=${value}" >> "$file"
    echo "  add  ${key}  →  ${file##*/}"
  fi
}

# ── generate ──────────────────────────────────────────────────────────────────
DJANGO_SECRET_KEY=$(openssl rand -hex 32)
LIVEKIT_API_SECRET=$(openssl rand -hex 32)
OIDC_RP_CLIENT_SECRET=$(openssl rand -hex 16)
DB_PASSWORD=$(openssl rand -hex 16)
KC_DB_PASSWORD=$(openssl rand -hex 16)
KC_ADMIN_PASSWORD=$(openssl rand -hex 16)

# ── write ─────────────────────────────────────────────────────────────────────
echo ""
echo "Writing secrets into ${ENV_DIR}/ ..."
echo ""

set_secret "${ENV_DIR}/common"       "DJANGO_SECRET_KEY"            "$DJANGO_SECRET_KEY"
set_secret "${ENV_DIR}/common"       "LIVEKIT_API_SECRET"           "$LIVEKIT_API_SECRET"
set_secret "${ENV_DIR}/common"       "OIDC_RP_CLIENT_SECRET"        "$OIDC_RP_CLIENT_SECRET"
set_secret "${ENV_DIR}/postgresql"   "DB_PASSWORD"                  "$DB_PASSWORD"
set_secret "${ENV_DIR}/kc_postgresql" "POSTGRES_PASSWORD"           "$KC_DB_PASSWORD"
set_secret "${ENV_DIR}/keycloak"     "KC_BOOTSTRAP_ADMIN_PASSWORD"  "$KC_ADMIN_PASSWORD"

echo ""
echo "Done."

# ── patch livekit-server.yaml ─────────────────────────────────────────────────
if [ -n "$LIVEKIT_YAML" ]; then
  sed -i "s|^  meet:.*|  meet: ${LIVEKIT_API_SECRET}|" "$LIVEKIT_YAML"
  echo "  set  LIVEKIT_API_SECRET  →  ${LIVEKIT_YAML##*/}"
  echo ""
else
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo " ACTION REQUIRED - copy this value into livekit-server.yaml"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "  LIVEKIT_API_SECRET = $LIVEKIT_API_SECRET"
  echo ""
  echo "  In livekit-server.yaml, under 'keys:', set:"
  echo "    keys:"
  echo "      meet: $LIVEKIT_API_SECRET"
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
fi
