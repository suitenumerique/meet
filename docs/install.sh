#!/bin/bash
# install.sh - LaSuite Meet automated setup
#
# Sets up three Docker Compose stacks in ~/docker/:
#   nginx-proxy/   - reverse proxy + automatic TLS (nginx-proxy + acme-companion)
#   keycloak/      - identity provider
#   meet/          - Meet core: backend, frontend, livekit, postgresql, redis
#
# What this script does NOT set up (advanced features):
#   - Recording (MinIO + LiveKit Egress) - see the Recording guide after setup
#   - AI transcription - see the AI Transcription guide
#
# Using Traefik or an existing IdP? Use the step-by-step Deployment Guide instead:
#   https://github.com/suitenumerique/meet/blob/main/docs/self-hosting/compose/deployment-guide.md
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/suitenumerique/meet/main/docs/docs/install.sh -o install.sh
#   cat install.sh        # review before running
#   bash install.sh

set -euo pipefail

RAW_BASE_URL="${RAW_BASE_URL:-https://raw.githubusercontent.com/suitenumerique/meet/main}"
RAW_ENVD_URL="${RAW_ENVD_URL:-https://raw.githubusercontent.com/suitenumerique/meet/main/env.d/production.dist}"

DOCKER_ROOT="${HOME}/docker"

# ── Helpers ───────────────────────────────────────────────────────────────────

info()    { echo "  $*"; }
section() { echo ""; echo "▶ $*"; }
success() { echo "  ✓ $*"; }
die()     { echo ""; echo "Error: $*" >&2; exit 1; }

check_dep() {
  command -v "$1" >/dev/null 2>&1 || die "$1 is not installed. Install it and re-run."
}

set_env() {
  local key="$1" value="$2" file="$3"
  sed -i "s|^${key}=.*|${key}=${value}|" "$file"
}

replace_in() {
  local old="$1" new="$2" file="$3"
  sed -i "s|${old}|${new}|g" "$file"
}

# ── Dependency checks ─────────────────────────────────────────────────────────

check_dep docker
docker compose version >/dev/null 2>&1 || die "Docker Compose v2 is not available."
check_dep openssl
check_dep curl

# ── Prompts ───────────────────────────────────────────────────────────────────

echo ""
echo "╔══════════════════════════════════════╗"
echo "║     LaSuite Meet - Quick Setup       ║"
echo "╚══════════════════════════════════════╝"
echo ""

section "Domains"
read -rp "  Meet domain       (e.g. meet.example.com):    " MEET_HOST
read -rp "  Keycloak domain   (e.g. auth.example.com):    " IDP_HOST
read -rp "  LiveKit domain    (e.g. livekit.example.com): " LIVEKIT_HOST
read -rp "  Email for Let's Encrypt notifications:        " LETSENCRYPT_EMAIL
read -rp "  Admin user email  (e.g. you@example.com):     " ADMIN_EMAIL

# Export all domain variables so that docker compose picks them up
# when it interpolates ${VAR} in compose override files.
export MEET_HOST IDP_HOST LIVEKIT_HOST LETSENCRYPT_EMAIL

# ── Docker network ────────────────────────────────────────────────────────────

section "Docker network"
docker network create proxy 2>/dev/null && success "Created 'proxy' network." \
  || info "'proxy' network already exists."

# ── Write shared hosts file ───────────────────────────────────────────────────

mkdir -p "$DOCKER_ROOT"
curl -fsSL -o "${DOCKER_ROOT}/hosts" "${RAW_ENVD_URL}/hosts"

# The upstream hosts template uses KEYCLOAK_HOST (not IDP_HOST).
# Patch all three domain vars using the correct key names from the template.
sed -i "s|^MEET_HOST=.*|MEET_HOST=${MEET_HOST}|"           "${DOCKER_ROOT}/hosts"
sed -i "s|^KEYCLOAK_HOST=.*|KEYCLOAK_HOST=${IDP_HOST}|"    "${DOCKER_ROOT}/hosts"
sed -i "s|^LIVEKIT_HOST=.*|LIVEKIT_HOST=${LIVEKIT_HOST}|"  "${DOCKER_ROOT}/hosts"

# ── Stack 1: nginx-proxy ──────────────────────────────────────────────────────

section "Setting up nginx-proxy"

PROXY_DIR="${DOCKER_ROOT}/nginx-proxy"
mkdir -p "$PROXY_DIR"

curl -fsSL -o "${PROXY_DIR}/compose.yml" "${RAW_BASE_URL}/docs/examples/nginx-proxy/compose.yml"

# nginx-proxy only needs the email; write it directly into a .env file
# so it is available as a compose variable even in subshells.
cat > "${PROXY_DIR}/.env" << EOF
LETSENCRYPT_EMAIL=${LETSENCRYPT_EMAIL}
EOF

(cd "$PROXY_DIR" && docker compose up -d)
success "nginx-proxy started."

# ── Stack 2: Keycloak ─────────────────────────────────────────────────────────

section "Setting up Keycloak"

KC_DIR="${DOCKER_ROOT}/keycloak"
mkdir -p "${KC_DIR}/env.d"

curl -fsSL -o "${KC_DIR}/compose.yml"         "${RAW_BASE_URL}/docs/examples/keycloak/compose.yml"
curl -fsSL -o "${KC_DIR}/keycloak-realm.json" "${RAW_BASE_URL}/docs/examples/keycloak/keycloak-realm.json"
curl -fsSL -o "${KC_DIR}/docker-compose.override.yml" \
  "${RAW_BASE_URL}/docs/examples/keycloak/docker-compose.override.yml.nginx"

# Copy the shared hosts file and download Keycloak-specific env files
cp "${DOCKER_ROOT}/hosts"                              "${KC_DIR}/env.d/hosts"
curl -fsSL -o "${KC_DIR}/env.d/keycloak"              "${RAW_ENVD_URL}/keycloak"
curl -fsSL -o "${KC_DIR}/env.d/kc_postgresql"         "${RAW_ENVD_URL}/kc_postgresql"

# Patch KC_HOSTNAME - replace the entire line to avoid leaving the comment in the value
sed -i "s|^KC_HOSTNAME=.*|KC_HOSTNAME=https://${IDP_HOST}|" "${KC_DIR}/env.d/keycloak"

# Generate Keycloak secrets
KC_ADMIN_PASSWORD=$(openssl rand -hex 16)
KC_DB_PASSWORD=$(openssl rand -hex 16)
KC_CLIENT_SECRET=$(openssl rand -hex 16)

set_env "KC_BOOTSTRAP_ADMIN_PASSWORD" "$KC_ADMIN_PASSWORD"  "${KC_DIR}/env.d/keycloak"
set_env "POSTGRES_PASSWORD"           "$KC_DB_PASSWORD"     "${KC_DIR}/env.d/kc_postgresql"

# Also write KC_DB_PASSWORD into KC_DB_PASSWORD field if present
sed -i "s|^KC_DB_PASSWORD=.*|KC_DB_PASSWORD=${KC_DB_PASSWORD}|" "${KC_DIR}/env.d/kc_postgresql" 2>/dev/null || true

# Patch realm.json with the client secret and Meet domain
replace_in "REPLACE_ME"       "$KC_CLIENT_SECRET" "${KC_DIR}/keycloak-realm.json"
replace_in "meet.example.com" "$MEET_HOST"         "${KC_DIR}/keycloak-realm.json"
replace_in "admin@example.com" "$ADMIN_EMAIL" "${KC_DIR}/keycloak-realm.json"

# Write a .env file for Keycloak stack so compose override variables are available
# as fallback even if the shell export is lost (e.g. when cd changes scope).
cat > "${KC_DIR}/.env" << EOF
IDP_HOST=${IDP_HOST}
LETSENCRYPT_EMAIL=${LETSENCRYPT_EMAIL}
EOF

(cd "$KC_DIR" && docker compose up -d)
success "Keycloak started."

# ── Stack 3: Meet ─────────────────────────────────────────────────────────────

section "Setting up Meet"

MEET_DIR="${DOCKER_ROOT}/meet"
mkdir -p "${MEET_DIR}/env.d"

curl -fsSL -o "${MEET_DIR}/compose.yml"         "${RAW_BASE_URL}/docs/examples/meet/compose.yml"
curl -fsSL -o "${MEET_DIR}/livekit-server.yaml" "${RAW_BASE_URL}/docs/examples/meet/livekit-server.yaml"
curl -fsSL -o "${MEET_DIR}/nginx-routing.conf"  "${RAW_BASE_URL}/docs/examples/meet/nginx-routing.conf"
curl -fsSL -o "${MEET_DIR}/docker-compose.override.yml" \
  "${RAW_BASE_URL}/docs/examples/meet/docker-compose.override.yml.nginx"

# Download Meet env.d files (Meet stack only - no KC files here)
cp "${DOCKER_ROOT}/hosts"                              "${MEET_DIR}/env.d/hosts"
curl -fsSL -o "${MEET_DIR}/env.d/common"              "${RAW_ENVD_URL}/common"
curl -fsSL -o "${MEET_DIR}/env.d/postgresql"          "${RAW_ENVD_URL}/postgresql"

# Patch OIDC client secret (must match what was patched into keycloak-realm.json)
set_env "OIDC_RP_CLIENT_SECRET" "$KC_CLIENT_SECRET" "${MEET_DIR}/env.d/common"

# Generate Meet secrets and patch livekit-server.yaml in one call.
# Only pass the Meet env.d/ - the keycloak files live in a separate stack.
curl -fsSL -o "${MEET_DIR}/generate-secrets.sh" "${RAW_BASE_URL}/docs/generate-secrets.sh"
chmod +x "${MEET_DIR}/generate-secrets.sh"
"${MEET_DIR}/generate-secrets.sh" "${MEET_DIR}/env.d" "${MEET_DIR}/livekit-server.yaml"

# Write a .env file for Meet stack so compose override variables are available.
cat > "${MEET_DIR}/.env" << EOF
MEET_HOST=${MEET_HOST}
LIVEKIT_HOST=${LIVEKIT_HOST}
LETSENCRYPT_EMAIL=${LETSENCRYPT_EMAIL}
EOF

(cd "$MEET_DIR" && docker compose up -d)
success "Meet started."

# ── Migrations ────────────────────────────────────────────────────────────────

section "Running database migrations"

info "Waiting for backend to become healthy..."
for i in $(seq 1 60); do
  status=$(docker inspect --format='{{.State.Health.Status}}' meet-backend-1 2>/dev/null || true)
  if [ "$status" = "healthy" ]; then break; fi
  printf "."
  sleep 3
done
echo ""

docker exec meet-backend-1 python manage.py migrate
success "Migrations complete."

# ── Done ──────────────────────────────────────────────────────────────────────

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  Setup complete!                                             ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "  Meet:     https://${MEET_HOST}"
echo "  Keycloak: https://${IDP_HOST}"
echo ""
echo "  Default login:  meet-admin / ChangeMe!"
echo "  Change this password on first login."
echo ""
echo "  Stacks:"
echo "    ${DOCKER_ROOT}/nginx-proxy/"
echo "    ${DOCKER_ROOT}/keycloak/"
echo "    ${DOCKER_ROOT}/meet/"
echo ""
echo "  Next steps: check the documentation for recording, customization, ..."
echo ""