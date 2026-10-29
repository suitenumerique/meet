#!/bin/bash
# generate-secrets.sh - Generate cryptographic secrets and write them into env.d/ files
#
# Usage:
#   ./generate-secrets.sh                    # uses ./env.d/ in the current directory
#   ./generate-secrets.sh /path/to/env.d/    # explicit env.d/ path
#
# It also patches livekit-server.yaml, found beside env.d/ or given second:
#   ./generate-secrets.sh ./env.d/ ./livekit-server.yaml
#
# In the Keycloak stack, it also fills keycloak-realm.json, found beside env.d/,
# and needs the email of Meet's first user, meet-admin:
#   ADMIN_EMAIL=you@example.com ./generate-secrets.sh
# In the Meet stack, OIDC_RP_CLIENT_SECRET takes the realm's client secret from
# ../keycloak/keycloak-realm.json, or from KC_CLIENT_SECRET when set:
#   KC_CLIENT_SECRET=<value> ./generate-secrets.sh
#
# MEET_HOST, for the realm and LiveKit's webhook URL, comes from the environment
# or from the .env beside env.d/.
#
# What it does:
#   - Generates cryptographic secrets using openssl
#   - Writes each secret into the correct env.d/ file by replacing its placeholder
#   - Will not overwrite a value that has already been set (not a placeholder)
#   - Patches livekit-server.yaml, beside env.d/ or given as the second argument
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
STACK_DIR=$(dirname "$ENV_DIR")

# The Meet stack keeps livekit-server.yaml beside env.d/.
if [[ -z "$LIVEKIT_YAML" ]] && [[ -f "${STACK_DIR}/livekit-server.yaml" ]]; then
  LIVEKIT_YAML="${STACK_DIR}/livekit-server.yaml"
fi

# The stack's .env holds MEET_HOST, which the realm and the webhook URL need.
if [[ -f "${STACK_DIR}/.env" ]]; then
  set -a; . "${STACK_DIR}/.env"; set +a
fi

if [[ ! -d "$ENV_DIR" ]]; then
  echo "Error: $ENV_DIR directory not found."
  echo "Run this script from your project directory, or pass the env.d/ path as an argument."
  exit 1
fi

if [[ -n "$LIVEKIT_YAML" ]] && [[ ! -f "$LIVEKIT_YAML" ]]; then
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

  # A file of the other stack: nothing to fill here.
  [[ -f "$file" ]] || return 0

  if grep -qE "^${key}=(<[^>]*>|REPLACE_ME|)$" "$file"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$file"
    echo "set ${key} in ${file##*/}"
  elif grep -qE "^${key}=" "$file"; then
    echo "kept ${key} in ${file##*/}: already set"
  else
    echo "${key}=${value}" >> "$file"
    echo "added ${key} to ${file##*/}"
  fi

  # This file now holds a secret in plaintext. Restrict to the owner.
  chmod 600 "$file"
}

# ── generate ──────────────────────────────────────────────────────────────────
DJANGO_SECRET_KEY=$(openssl rand -hex 32)
LIVEKIT_API_SECRET=$(openssl rand -hex 32)
# The client secret of the Keycloak stack beside this one, once its realm is filled.
KC_REALM="${STACK_DIR}/../keycloak/keycloak-realm.json"
if [[ -z "${KC_CLIENT_SECRET:-}" ]] && [[ -f "$KC_REALM" ]] && ! grep -q "REPLACE_ME" "$KC_REALM"; then
  KC_CLIENT_SECRET=$(sed -n 's/.*"secret": *"\([^"]*\)".*/\1/p' "$KC_REALM")
fi
# The identity provider's client secret when known, so the two match.
OIDC_RP_CLIENT_SECRET=${KC_CLIENT_SECRET:-$(openssl rand -hex 16)}
DB_PASSWORD=$(openssl rand -hex 16)
KC_DB_PASSWORD=$(openssl rand -hex 16)
KC_ADMIN_PASSWORD=$(openssl rand -hex 16)

# ── write ─────────────────────────────────────────────────────────────────────

set_secret "${ENV_DIR}/common"       "DJANGO_SECRET_KEY"            "$DJANGO_SECRET_KEY"
set_secret "${ENV_DIR}/common"       "LIVEKIT_API_SECRET"           "$LIVEKIT_API_SECRET"
set_secret "${ENV_DIR}/common"       "OIDC_RP_CLIENT_SECRET"        "$OIDC_RP_CLIENT_SECRET"
set_secret "${ENV_DIR}/postgresql"   "DB_PASSWORD"                  "$DB_PASSWORD"
set_secret "${ENV_DIR}/kc_postgresql" "POSTGRES_PASSWORD"           "$KC_DB_PASSWORD"
set_secret "${ENV_DIR}/keycloak"     "KC_BOOTSTRAP_ADMIN_PASSWORD"  "$KC_ADMIN_PASSWORD"

# ── keycloak-realm.json, in the Keycloak stack ───────────────────────────────
REALM="${STACK_DIR}/keycloak-realm.json"
if [[ -f "$REALM" ]] && grep -q "REPLACE_ME" "$REALM"; then
  : "${MEET_HOST:?set MEET_HOST, or put it in ${STACK_DIR}/.env}"
  : "${ADMIN_EMAIL:?set ADMIN_EMAIL, the email of meet-admin, the first Meet user}"
  KC_CLIENT_SECRET=${KC_CLIENT_SECRET:-$(openssl rand -hex 16)}
  # Typed by hand at the first login, before Keycloak asks for a new one.
  MEET_ADMIN_PASSWORD=$(openssl rand -base64 12)
  sed -i "s|REPLACE_ME|${KC_CLIENT_SECRET}|" "$REALM"
  sed -i "s|meet\.example\.com|${MEET_HOST}|g" "$REALM"
  sed -i "s|admin@example\.com|${ADMIN_EMAIL}|" "$REALM"
  sed -i "s|MEET_ADMIN_PASSWORD_PLACEHOLDER|${MEET_ADMIN_PASSWORD}|" "$REALM"
  # Keycloak reads the realm as another user inside its container.
  chmod 644 "$REALM"
  echo "set the client secret, domain and meet-admin in ${REALM##*/}"
  echo ""
  echo "meet-admin's first password: ${MEET_ADMIN_PASSWORD}"
fi


# The LiveKit secret lives in common, which the Keycloak stack does not have.
[[ -f "${ENV_DIR}/common" ]] || exit 0

# Keep livekit-server.yaml in sync with whatever secret common actually has.
LIVEKIT_API_SECRET=$(grep -E "^LIVEKIT_API_SECRET=" "${ENV_DIR}/common" | cut -d= -f2-)

# ── patch livekit-server.yaml ─────────────────────────────────────────────────
# Your domain in the webhook URL, which LiveKit calls Meet back on.
if [[ -n "$LIVEKIT_YAML" ]] && [[ -n "${MEET_HOST:-}" ]] && grep -q "meet\.example\.com" "$LIVEKIT_YAML"; then
  sed -i "s|meet\.example\.com|${MEET_HOST}|" "$LIVEKIT_YAML"
  echo "set the webhook domain in ${LIVEKIT_YAML##*/}"
fi
if [[ -n "$LIVEKIT_YAML" ]]; then
  if grep -q "<your livekit secret key>" "$LIVEKIT_YAML"; then
    sed -i "s|<your livekit secret key>|${LIVEKIT_API_SECRET}|" "$LIVEKIT_YAML"
    chmod 600 "$LIVEKIT_YAML"
    echo "set LIVEKIT_API_SECRET in ${LIVEKIT_YAML##*/}"
  else
    echo "kept LIVEKIT_API_SECRET in ${LIVEKIT_YAML##*/}: no placeholder left"
  fi
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
