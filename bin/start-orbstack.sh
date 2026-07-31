#!/usr/bin/env bash
#
# Bootstrap the local dev environment on OrbStack's built-in Kubernetes
# cluster (macOS) instead of kind.
#
# This replicates what bin/start-kind.sh (numerique-gouv/tools
# kind/create_cluster.sh) provides, minus what OrbStack makes unnecessary:
#   - no kind cluster: OrbStack ships a lightweight single-node cluster
#   - no local registry (kind-registry): OrbStack's cluster shares the
#     Docker image store, so images built by Tilt are directly visible
#     to pods. Tilt detects the "orbstack" context as a local cluster
#     and skips pushing images entirely.
#
# Requirements: OrbStack (with Kubernetes enabled), kubectl, mkcert, curl.
set -o errexit

APPLICATION=${1:-meet}
CONTEXT="orbstack"

echo "0. Check OrbStack Kubernetes is available"
if ! command -v mkcert >/dev/null 2>&1; then
  echo "❌ mkcert is not installed. Install it first: brew install mkcert"
  exit 1
fi
if ! kubectl config get-contexts -o name | grep -qx "${CONTEXT}"; then
  echo "Context '${CONTEXT}' not found. Trying to start OrbStack Kubernetes..."
  if command -v orb >/dev/null 2>&1; then
    orb start k8s
  else
    echo "❌ Enable Kubernetes in OrbStack (Settings > Kubernetes) and retry."
    exit 1
  fi
fi
kubectl config use-context "${CONTEXT}"

echo "0b. Check ports 80/443 are free on localhost"
# OrbStack forwards LoadBalancer service ports to 127.0.0.1. If the kind
# cluster is still running, its docker proxy already holds 80/443.
# Skip the check if ingress-nginx is already installed here: in that case
# the listener on 80/443 is our own LoadBalancer.
if ! kubectl -n ingress-nginx get deployment ingress-nginx-controller >/dev/null 2>&1; then
  for port in 80 443; do
    if lsof -nP -iTCP:"${port}" -sTCP:LISTEN >/dev/null 2>&1; then
      echo "❌ Port ${port} is already in use on the host."
      echo "   If the kind cluster is running, delete it first:"
      echo "     kind delete cluster --name suite"
      exit 1
    fi
  done
fi

echo "1. Create ca"
CURRENT_DIR=$(pwd)
mkcert -install
cd /tmp
mkcert "127.0.0.1.nip.io" "*.127.0.0.1.nip.io"
cd "${CURRENT_DIR}"

echo "2. Install ingress-nginx (cloud provider: LoadBalancer service)"
# OrbStack exposes LoadBalancer services on 127.0.0.1, so the cloud
# manifest replaces kind's hostPort-based deploy. Every sub-step below is
# guarded individually so the script is safe to re-run after a partial
# failure (unlike the upstream kind script, which guards the whole block
# on namespace existence).

# Make sure no stale registry configmap tells Tilt to push to localhost:5001
# (there is no registry on OrbStack).
kubectl -n kube-public delete configmap local-registry-hosting --ignore-not-found

if ! kubectl -n ingress-nginx get deployment ingress-nginx-controller >/dev/null 2>&1; then
  kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/cloud/deploy.yaml
fi
if ! kubectl -n ingress-nginx get deployment nginx-errors >/dev/null 2>&1; then
  kubectl apply -n ingress-nginx -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/refs/heads/main/docs/examples/customization/custom-errors/custom-default-backend.yaml
fi
kubectl -n ingress-nginx create secret tls mkcert --key /tmp/127.0.0.1.nip.io+1-key.pem --cert /tmp/127.0.0.1.nip.io+1.pem || echo ok

# The meet charts render Ingresses without ingressClassName. The kind
# provider manifest handles this via --watch-ingress-without-class=true;
# the cloud manifest does not, so add it here (otherwise: 404 everywhere).
if ! kubectl -n ingress-nginx get deployment ingress-nginx-controller -o jsonpath='{.spec.template.spec.containers[0].args}' | grep -q 'watch-ingress-without-class'; then
  kubectl -n ingress-nginx patch deployments.apps ingress-nginx-controller --type 'json' -p '[{"op": "add", "path": "/spec/template/spec/containers/0/args/-", "value":"--watch-ingress-without-class=true"},{"op": "add", "path": "/spec/template/spec/containers/0/args/-", "value":"--default-ssl-certificate=ingress-nginx/mkcert"},{"op": "add", "path": "/spec/template/spec/containers/0/args/-", "value":"--default-backend-service=ingress-nginx/nginx-errors"}
]'
fi
if ! kubectl -n ingress-nginx get deployment nginx-errors -o jsonpath='{.spec.template.spec.containers[0].image}' | grep -q 'error-pages'; then
  kubectl -n ingress-nginx patch deployment nginx-errors --type=json -p='[
  {"op": "replace", "path": "/spec/template/spec/containers/0/image", "value": "ghcr.io/tarampampam/error-pages:3.3.0"},
  {"op": "add", "path": "/spec/template/spec/containers/0/env", "value": [{"name": "TEMPLATE_NAME", "value": "ghost"}, {"name": "SHOW_DETAILS", "value": "false"}, {"name": "SEND_SAME_HTTP_CODE", "value": "true"}]}
]'
fi
cat <<EOF | kubectl apply -n ingress-nginx -f -
  apiVersion: v1
  data:
    allow-snippet-annotations: "true"
    annotations-risk-level: Critical
    custom-http-errors: 500,501,502,503,504
  kind: ConfigMap
  metadata:
    name: ingress-nginx-controller
    namespace: ingress-nginx
EOF

echo "2b. Wait for the ingress controller to be ready"
kubectl -n ingress-nginx rollout status deployment/ingress-nginx-controller --timeout=180s

echo "3. Patch CoreDNS so in-cluster pods resolve *.127.0.0.1.nip.io to the ingress"
# nip.io resolves to 127.0.0.1, which inside a pod is the pod itself.
# Rewrite these names to the ingress-nginx service, like the kind setup does.
# Unlike kind, we amend OrbStack's existing Corefile instead of replacing it.
if ! kubectl -n kube-system get configmap coredns -o jsonpath='{.data.Corefile}' | grep -q '127\.0\.0\.1\.nip\.io'; then
  kubectl -n kube-system get configmap coredns -o jsonpath='{.data.Corefile}' \
    | awk '/forward \./ && !done { print "    rewrite stop {"; print "      name regex (.*).127.0.0.1.nip.io ingress-nginx-controller.ingress-nginx.svc.cluster.local answer auto"; print "    }"; done=1 } { print }' \
    >/tmp/Corefile.orbstack
  kubectl -n kube-system create configmap coredns --from-file=Corefile=/tmp/Corefile.orbstack --dry-run=client -o yaml | kubectl apply -f -
  kubectl -n kube-system rollout restart deployments/coredns
fi

if ! kubectl get ns "${APPLICATION}" >/dev/null 2>&1; then
  echo "4. Setup namespace"
  kubectl create ns "${APPLICATION}"
fi
kubectl config set-context --current --namespace="${APPLICATION}"
kubectl -n "${APPLICATION}" create secret generic mkcert --from-file=rootCA.pem="$(mkcert -CAROOT)/rootCA.pem" || echo ok

if ! kubectl get configmap certifi -n "${APPLICATION}" >/dev/null 2>&1; then
  echo "5. Inject our custom CA in a configmap for certifi"
  curl https://raw.githubusercontent.com/certifi/python-certifi/refs/heads/master/certifi/cacert.pem -o /tmp/cacert.pem
  cat "$(mkcert -CAROOT)/rootCA.pem" >>/tmp/cacert.pem
  kubectl -n "${APPLICATION}" create configmap certifi --from-file=cacert.pem=/tmp/cacert.pem
  kubectl -n "${APPLICATION}" create secret generic certifi --from-file=/tmp/cacert.pem || echo ok
fi

echo "5b. Smoke test: the ingress chain answers on https://127.0.0.1"
# Before Tilt deploys the app this returns the styled 404 from the default
# backend — that still proves LB -> controller works. 000 means the
# LoadBalancer is not bound to localhost.
HTTP_CODE=$(curl -sk -o /dev/null -w '%{http_code}' --max-time 10 https://127.0.0.1/ || true)
if [ "${HTTP_CODE}" = "000" ]; then
  echo "⚠️  Nothing answered on https://127.0.0.1 — check the LoadBalancer:"
  echo "    kubectl -n ingress-nginx get svc ingress-nginx-controller"
else
  echo "✅ Ingress reachable (HTTP ${HTTP_CODE})"
fi

echo "6. Check pod readiness across all namespaces..."

sleep_interval=10

echo "Initial wait time: $((sleep_interval * 2)) seconds…"
sleep $((sleep_interval * 2))

check_pods_ready() {
    local max_attempts=60  # Maximum number of attempts (10 minutes with 10s intervals)
    local attempt=1

    while [ $attempt -le $max_attempts ]; do
        echo "Attempt $attempt/$max_attempts - Checking pod status..."

        not_ready_count=$( kubectl get po -A --no-headers | grep -v -E "Running|Completed"| wc -l | tr -d ' ')

        if [ "$not_ready_count" -eq 0 ]; then
            echo "✅ All pods are ready!"
            return 0
        else
            echo "⏳ $not_ready_count pod(s) still not ready. Waiting $sleep_interval seconds…"
            sleep $sleep_interval
            ((attempt++))
        fi
    done

    echo "❌ Timeout: Some pods are still not ready after 10 minutes"
    echo "Final pod status:"
    kubectl get po -A
    return 1
}

if check_pods_ready; then
    echo "🎉 Cluster is fully ready!"
else
    echo "⚠️  Some pods may need manual intervention"
    exit 1
fi