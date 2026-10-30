#!/bin/bash
# check-install.sh - Check a LaSuite Meet install on Docker Compose
#
# Prints the setup it finds, then one line per check: ✓ when it passes, ✗ and
# the cause when it fails. Exits 0 only when every check passed.
#
# Run it on the server, in the Meet stack's directory, as the user who runs
# docker compose:
#   cd ~/docker/meet && curl -fsSL https://raw.githubusercontent.com/suitenumerique/meet/main/docs/check-install.sh | bash
#
# It reads the domains from the .env there, and checks the Keycloak stack too
# when ../keycloak exists. It needs bash, docker and curl.

set -euo pipefail

KC_DIR="$(dirname "$PWD")/keycloak"

die() { echo "Error: $*" >&2; exit 1; }

command -v docker >/dev/null 2>&1 || die "docker is not installed."
command -v curl >/dev/null 2>&1 || die "curl is not installed."
[[ -f .env ]] || die "No .env in $PWD. Run this in the Meet stack's directory, ~/docker/meet."

# env_value KEY: the value of KEY in the stack's .env, empty when it has none.
env_value() { grep -E "^$1=" .env | tail -1 | cut -d= -f2- | tr -d "\"'" || true; }

MEET_HOST=$(env_value MEET_HOST)
LIVEKIT_HOST=$(env_value LIVEKIT_HOST)
IDP_HOST=$(env_value IDP_HOST)
REALM_NAME=$(env_value REALM_NAME)
COMPOSE_PROFILES=$(env_value COMPOSE_PROFILES)
[[ -n "$MEET_HOST" && -n "$LIVEKIT_HOST" ]] \
  || die "MEET_HOST or LIVEKIT_HOST is missing from $PWD/.env."

if [[ -t 1 ]]; then OK=$'\e[32m✓\e[0m'; KO=$'\e[31m✗\e[0m'; else OK='✓'; KO='✗'; fi

tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT

passed=0
failed=0
pass() { echo "  $OK $*"; passed=$((passed + 1)); }
fail() { echo "  $KO $*"; failed=$((failed + 1)); }
skip() { echo "  - $*"; }

# fetch URL: sets code and location, and why to curl's error when it got no answer.
fetch() {
  local out
  out=$(curl -sS --max-time 10 -o /dev/null -w '%{http_code} %{redirect_url}' "$1" 2>"$tmp") || true
  code=${out%% *}
  location=${out#* }
  why=$(sed -n '1s/^curl: ([0-9]*) //p' "$tmp")
}

# check_stack NAME DIR: every service of the stack runs, and passes its health check.
check_stack() {
  local name="$1" dir="$2" services states svc state health problems="" count=0
  if ! services=$(cd "$dir" && docker compose config --services 2>"$tmp"); then
    fail "$name stack: $(tail -1 "$tmp")"
    return
  fi
  states=$(cd "$dir" && docker compose ps --all --format '{{.Service}} {{.State}} {{.Health}}' 2>/dev/null)
  for svc in $services; do
    count=$((count + 1))
    read -r _ state health <<<"$(grep "^$svc " <<<"$states" || true)"
    if [[ -z "${state:-}" ]]; then
      problems+=", $svc not created"
    elif [[ "$state" != running ]]; then
      problems+=", $svc $state"
    elif [[ -n "${health:-}" && "$health" != healthy ]]; then
      problems+=", $svc $health"
    fi
  done
  if [[ -z "$problems" ]]; then
    pass "$name stack: $count services running, health checks passing"
  else
    fail "$name stack: ${problems#, }"
  fi
}

# ── Your setup ────────────────────────────────────────────────────────────────

version="unknown, the backend is not running"
backend_id=$(docker compose ps -q backend 2>/dev/null || true)
if [[ -n "$backend_id" ]]; then
  read -r image version <<<"$(docker inspect --format \
    '{{.Config.Image}} {{index .Config.Labels "org.opencontainers.image.version"}}' "$backend_id")"
  version="${version/<no value>/unknown} (image ${image})"
fi

config=$(curl -sS --max-time 10 --fail "https://${MEET_HOST}/api/v1.0/config/" 2>"$tmp") || true
config_why=$(sed -n '1s/^curl: ([0-9]*) //p' "$tmp")
if [[ -n "$config" && "$config" != *'"livekit"'* ]]; then
  config=""
  config_why="the answer is not Meet's configuration"
fi
features=""
grep -qE '"recording": *\{ *"is_enabled": *true' <<<"$config" && features+=", recording"
grep -qE '"subtitle": *\{ *"enabled": *true' <<<"$config" && features+=", subtitles"
grep -qE '"telephony": *\{ *"enabled": *true' <<<"$config" && features+=", telephony"
grep -qE '"connection_test_enabled": *true' <<<"$config" && features+=", connection test"
if [[ -z "$config" ]]; then
  features="unknown, the configuration did not load"
else
  features=${features#, }
fi

echo "Your setup"
echo "  Version    ${version}"
echo "  Meet       ${MEET_HOST}"
echo "  LiveKit    ${LIVEKIT_HOST}"
echo "  Sign-in    ${IDP_HOST:-not set}"
echo "  Profiles   ${COMPOSE_PROFILES:-none}"
echo "  Features   ${features:-none turned on}"
echo ""
echo "Checks"

# ── 1. Services ───────────────────────────────────────────────────────────────

check_stack Meet "$PWD"
[[ -d "$KC_DIR" ]] && check_stack Keycloak "$KC_DIR"

# ── 2. The backend's own production checks ────────────────────────────────────

# Piped into bash, this script is stdin: docker must not read it.
if out=$(docker compose exec -T backend python manage.py check --deploy </dev/null 2>&1); then
  pass "Backend: manage.py check --deploy passes"
else
  issue=$(grep -m1 -E '\.E[0-9]+\)' <<<"$out" || grep -v '^\s*$' <<<"$out" | tail -1)
  fail "Backend: ${issue}"
fi

# ── 3. Each domain answers over HTTPS ─────────────────────────────────────────

urls=("https://${MEET_HOST}/" "https://${LIVEKIT_HOST}/")
[[ -d "$KC_DIR" ]] && urls+=("https://${IDP_HOST}/realms/${REALM_NAME:-meet}")
for url in "${urls[@]}"; do
  fetch "$url"
  if [[ "$code" == 200 ]]; then
    pass "$url answers 200, certificate valid"
  elif [[ "$code" == 000 ]]; then
    fail "$url: $why"
  else
    fail "$url answers $code, not 200"
  fi
done

# ── 4. Browsers get LiveKit's public address ──────────────────────────────────

livekit_url=$(grep -oE '"livekit": *\{ *"url": *"[^"]*"' <<<"$config" | cut -d'"' -f6 || true)
if [[ -z "$config" ]]; then
  fail "https://${MEET_HOST}/api/v1.0/config/: $config_why"
elif [[ "${livekit_url%/}" == "https://${LIVEKIT_HOST}" ]]; then
  pass "Meet sends browsers to LiveKit at ${livekit_url}"
else
  fail "Meet sends browsers to LiveKit at ${livekit_url:-no address}, not https://${LIVEKIT_HOST}: set LIVEKIT_API_URL"
fi

# ── 5. Sign-in leaves for the identity provider ───────────────────────────────

fetch "https://${MEET_HOST}/api/v1.0/authenticate/"
idp=$(sed -E 's|^[a-z]+://([^/:?]*).*|\1|' <<<"$location")
if [[ "$code" == 302 && -n "$location" && "$idp" != "$MEET_HOST" ]]; then
  pass "Sign-in sends browsers to ${idp}"
elif [[ "$code" == 000 ]]; then
  fail "Sign-in: $why"
elif [[ "$code" == 302 ]]; then
  fail "Sign-in sends browsers to ${location%%\?*}, not to the identity provider"
else
  fail "Sign-in: /api/v1.0/authenticate/ answers $code, not 302"
fi

# ── 6. LiveKit announces the address its domain resolves to ───────────────────

node_ip=$(docker compose logs livekit 2>/dev/null | grep -o '"nodeIP": "[^"]*"' | tail -1 | cut -d'"' -f4 || true)
addresses=$(getent ahosts "$LIVEKIT_HOST" | cut -d' ' -f1 | sort -u || true)
if [[ -z "$addresses" ]]; then
  fail "${LIVEKIT_HOST} does not resolve from this server"
elif [[ -z "$node_ip" ]]; then
  fail "LiveKit's log has no nodeIP line"
elif grep -qxF "$node_ip" <<<"$addresses"; then
  pass "LiveKit announces ${node_ip}, the address of ${LIVEKIT_HOST}"
else
  fail "LiveKit announces ${node_ip}, but ${LIVEKIT_HOST} resolves to ${addresses//$'\n'/ }"
fi

# Prefer the address LiveKit announces, which browsers send media to.
target=$(grep -xF "${node_ip:-none}" <<<"$addresses" || head -1 <<<"$addresses")
if [[ -z "$target" ]]; then
  fail "${LIVEKIT_HOST}:7881 untested, the domain does not resolve"
elif timeout 5 bash -c "exec 3<>/dev/tcp/${target}/7881" 2>/dev/null; then
  pass "${LIVEKIT_HOST}:7881 accepts TCP from this server; a test from outside is stronger"
else
  fail "${LIVEKIT_HOST}:7881 does not accept TCP from this server: open the port in the firewall"
fi

# ── 7. LiveKit reports calls to the backend ───────────────────────────────────

codes=$(docker compose logs backend 2>/dev/null \
  | grep -oE 'webhooks-livekit/[^"]*" [0-9]{3}' | grep -oE '[0-9]{3}$' || true)
if [[ -z "$codes" ]]; then
  skip "LiveKit webhooks: no call yet"
else
  total=$(wc -l <<<"$codes")
  bad=$(grep -cvx 200 <<<"$codes" || true)
  if [[ "$bad" == 0 ]]; then
    pass "LiveKit webhooks: all ${total} answered 200"
  else
    fail "LiveKit webhooks: ${bad} of ${total} answered $(grep -vx 200 <<<"$codes" | sort -u | paste -sd,)"
  fi
fi

# ── Verdict ───────────────────────────────────────────────────────────────────

echo ""
if [[ "$failed" == 0 ]]; then
  echo "All $((passed + failed)) checks passed. Now join a meeting from two devices on different networks."
else
  echo "${failed} of $((passed + failed)) checks failed."
  exit 1
fi
