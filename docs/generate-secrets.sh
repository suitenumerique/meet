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
# With the Recording guide's Garage in ../garage/, it fills Garage's .env and
# gives Meet its key pair as AWS_S3_ACCESS_KEY_ID and AWS_S3_SECRET_ACCESS_KEY.
#
# MEET_HOST, for the realm and LiveKit's webhook URL, comes from the .env beside
# env.d/, or from the environment when that file has none.
#
# It replaces placeholders only, so a value already set is kept, and a rerun is safe.
#
# Secrets and their files:
#   env.d/common          DJANGO_SECRET_KEY, LIVEKIT_API_SECRET, OIDC_RP_CLIENT_SECRET,
#                         and AWS_S3_ACCESS_KEY_ID, AWS_S3_SECRET_ACCESS_KEY with Garage
#   env.d/postgresql      DB_PASSWORD
#   env.d/kc_postgresql   POSTGRES_PASSWORD
#   env.d/keycloak        KC_BOOTSTRAP_ADMIN_PASSWORD
#   keycloak-realm.json   the client secret, the domain and meet-admin
#   livekit-server.yaml   the webhook domain and LIVEKIT_API_SECRET
#   livekit-egress.yaml, livekit-sip.yaml: their <your LiveKit API secret>
#   ../garage/.env        GARAGE_RPC_SECRET, GARAGE_ACCESS_KEY, GARAGE_SECRET_KEY
#   env.d/summary, env.d/metadata-collector, env.d/multi-user-transcriber:
#                         their <...> AWS_S3_* and LIVEKIT_API_SECRET lines
#   env.d/summary         the tenant's two secrets and webhook domain, the secrets
#                         also added to env.d/common as SUMMARY_SERVICE_*_TOKEN

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
  echo "Error: $ENV_DIR directory not found." >&2
  echo "Run this script from your project directory, or pass the env.d/ path as an argument." >&2
  exit 1
fi

if [[ -n "$LIVEKIT_YAML" ]] && [[ ! -f "$LIVEKIT_YAML" ]]; then
  echo "Error: $LIVEKIT_YAML not found." >&2
  exit 1
fi

command -v openssl >/dev/null 2>&1 || { echo "Error: openssl is not installed." >&2; exit 1; }

# ── helpers ───────────────────────────────────────────────────────────────────
# env_value FILE KEY: the value of KEY in FILE, empty when it has none.
env_value() {
  local file="$1" key="$2"
  grep -E "^${key}=" "$file" | cut -d= -f2- || true
}

# set_secret FILE KEY VALUE [placeholder-only]
# Replaces KEY=<placeholder> with KEY=VALUE in FILE, a placeholder being <...>,
# REPLACE_ME or an empty value, and keeps a real value. A missing KEY is added,
# unless the fourth argument is set.
set_secret() {
  local file="$1" key="$2" value="$3" only_placeholder="${4:-}"

  # A file of the other stack: nothing to fill here.
  [[ -f "$file" ]] || return 0

  if grep -qE "^${key}=(<[^>]*>|REPLACE_ME|)$" "$file"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$file"
    echo "set ${key} in ${file##*/}"
  elif grep -qE "^${key}=" "$file"; then
    [[ -n "$only_placeholder" ]] || echo "kept ${key} in ${file##*/}: already set"
  elif [[ -z "$only_placeholder" ]]; then
    echo "${key}=${value}" >> "$file"
    echo "added ${key} to ${file##*/}"
  fi

  # This file now holds a secret in plaintext. Restrict to the owner.
  chmod 600 "$file"
}

# ── generate ──────────────────────────────────────────────────────────────────
DJANGO_SECRET_KEY=$(openssl rand -hex 32)
LIVEKIT_API_SECRET=$(openssl rand -hex 32)
# One client secret for Meet and its identity provider: the one given, or the
# one the Keycloak stack beside this stack already put in its realm.
KC_REALM="${STACK_DIR}/../keycloak/keycloak-realm.json"
if [[ -z "${KC_CLIENT_SECRET:-}" ]] && [[ -f "$KC_REALM" ]] && [[ -f "${ENV_DIR}/common" ]]; then
  if grep -q "REPLACE_ME" "$KC_REALM"; then
    echo "Error: run generate-secrets.sh in the Keycloak stack first, so both stacks share its client secret." >&2
    exit 1
  fi
  KC_CLIENT_SECRET=$(sed -n 's/.*"secret": *"\([^"]*\)".*/\1/p' "$KC_REALM")
fi
CLIENT_SECRET=${KC_CLIENT_SECRET:-$(openssl rand -hex 16)}
DB_PASSWORD=$(openssl rand -hex 16)
KC_DB_PASSWORD=$(openssl rand -hex 16)
KC_ADMIN_PASSWORD=$(openssl rand -hex 16)

# ── write ─────────────────────────────────────────────────────────────────────
set_secret "${ENV_DIR}/common"       "DJANGO_SECRET_KEY"            "$DJANGO_SECRET_KEY"
set_secret "${ENV_DIR}/common"       "LIVEKIT_API_SECRET"           "$LIVEKIT_API_SECRET"
set_secret "${ENV_DIR}/common"       "OIDC_RP_CLIENT_SECRET"        "$CLIENT_SECRET"
set_secret "${ENV_DIR}/postgresql"   "DB_PASSWORD"                  "$DB_PASSWORD"
set_secret "${ENV_DIR}/kc_postgresql" "POSTGRES_PASSWORD"           "$KC_DB_PASSWORD"
set_secret "${ENV_DIR}/keycloak"     "KC_BOOTSTRAP_ADMIN_PASSWORD"  "$KC_ADMIN_PASSWORD"

# ── keycloak-realm.json, in the Keycloak stack ───────────────────────────────
REALM="${STACK_DIR}/keycloak-realm.json"
if [[ -f "$REALM" ]] && grep -q "REPLACE_ME" "$REALM"; then
  : "${MEET_HOST:?set MEET_HOST, or put it in ${STACK_DIR}/.env}"
  : "${ADMIN_EMAIL:?set ADMIN_EMAIL, the email of meet-admin, the first Meet user}"
  # Typed by hand at the first login, before Keycloak asks for a new one.
  MEET_ADMIN_PASSWORD=$(openssl rand -base64 12)
  # sed reads & and | in a replacement as its own syntax.
  email=$(printf '%s' "$ADMIN_EMAIL" | sed 's/[&|\\]/\\&/g')
  sed -i -e "s|REPLACE_ME|${CLIENT_SECRET}|" \
    -e "s|meet\.example\.com|${MEET_HOST}|g" \
    -e "s|admin@example\.com|${email}|" \
    -e "s|MEET_ADMIN_PASSWORD_PLACEHOLDER|${MEET_ADMIN_PASSWORD}|" "$REALM"
  # Keycloak reads the realm as another user inside its container.
  chmod 644 "$REALM"
  echo "set the client secret, domain and meet-admin in ${REALM##*/}"
  echo ""
  echo "meet-admin's first password: ${MEET_ADMIN_PASSWORD}"
fi

# The LiveKit secret lives in common, which the Keycloak stack does not have.
[[ -f "${ENV_DIR}/common" ]] || exit 0

# ── Garage, the recording storage, in the stack beside this one ─────────────
GARAGE_ENV="${STACK_DIR}/../garage/.env"
if [[ -f "$GARAGE_ENV" ]]; then
  set_secret "$GARAGE_ENV" "GARAGE_RPC_SECRET" "$(openssl rand -hex 32)"
  set_secret "$GARAGE_ENV" "GARAGE_ACCESS_KEY" "$(openssl rand -hex 12)"
  set_secret "$GARAGE_ENV" "GARAGE_SECRET_KEY" "$(openssl rand -hex 32)"
  # Meet signs its storage requests with Garage's key pair.
  set_secret "${ENV_DIR}/common" "AWS_S3_ACCESS_KEY_ID" "$(env_value "$GARAGE_ENV" GARAGE_ACCESS_KEY)"
  set_secret "${ENV_DIR}/common" "AWS_S3_SECRET_ACCESS_KEY" "$(env_value "$GARAGE_ENV" GARAGE_SECRET_KEY)"
fi

# ── the optional services' env files, where the guides left a placeholder ────
for key in AWS_S3_ACCESS_KEY_ID AWS_S3_SECRET_ACCESS_KEY LIVEKIT_API_SECRET; do
  value=$(env_value "${ENV_DIR}/common" "$key")
  [[ -n "$value" ]] || continue
  for file in "${ENV_DIR}"/{summary,metadata-collector,multi-user-transcriber}; do
    set_secret "$file" "$key" "$value" placeholder-only
  done
done

# ── the summary service's tenant, which shares two secrets with the backend ──
SUMMARY_ENV="${ENV_DIR}/summary"
if [[ -f "$SUMMARY_ENV" ]]; then
  for key in SUMMARY_SERVICE_API_TOKEN SUMMARY_SERVICE_WEBHOOK_API_TOKEN; do
    set_secret "${ENV_DIR}/common" "$key" "$(openssl rand -hex 32)"
    if grep -q "<${key}>" "$SUMMARY_ENV"; then
      sed -i "s|<${key}>|$(env_value "${ENV_DIR}/common" "$key")|" "$SUMMARY_ENV"
      echo "set ${key} in summary"
    fi
  done
  # Your domain in the webhook URL the summary service calls Meet back on.
  if [[ -n "${MEET_HOST:-}" ]] && grep -q "meet\.example\.com" "$SUMMARY_ENV"; then
    sed -i "s|meet\.example\.com|${MEET_HOST}|" "$SUMMARY_ENV"
    echo "set the webhook domain in summary"
  fi
  chmod 600 "$SUMMARY_ENV"
fi

# Keep the LiveKit configs in sync with whatever secret common actually has.
LIVEKIT_API_SECRET=$(env_value "${ENV_DIR}/common" LIVEKIT_API_SECRET)

# ── the Egress and SIP configs the Recording and Telephony guides add ────────
# Left readable: their containers may run as another user than yours.
for yaml in "${STACK_DIR}/livekit-egress.yaml" "${STACK_DIR}/livekit-sip.yaml"; do
  if [[ -f "$yaml" ]] && grep -q "<your LiveKit API secret>" "$yaml"; then
    sed -i "s|<your LiveKit API secret>|${LIVEKIT_API_SECRET}|" "$yaml"
    echo "set LIVEKIT_API_SECRET in ${yaml##*/}"
  fi
done

# ── patch livekit-server.yaml ─────────────────────────────────────────────────
if [[ -n "$LIVEKIT_YAML" ]]; then
  # Your domain in the webhook URL, which LiveKit calls Meet back on.
  if [[ -n "${MEET_HOST:-}" ]] && grep -q "meet\.example\.com" "$LIVEKIT_YAML"; then
    sed -i "s|meet\.example\.com|${MEET_HOST}|" "$LIVEKIT_YAML"
    echo "set the webhook domain in ${LIVEKIT_YAML##*/}"
  fi
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
