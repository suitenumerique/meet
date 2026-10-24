#!/usr/bin/env bash
set -o errexit

NAMESPACE=${1:-meet}
SECRET_NAME=${2:-bitwarden-cli-meet}
TEMP_SECRET_FILE=$(mktemp)


cleanup() {
    rm -f "${TEMP_SECRET_FILE}"
}
trap cleanup EXIT


# Check if kubectl is available
check_prerequisites() {
    if ! command -v kubectl &> /dev/null; then
        echo "Error: kubectl is not installed or not in PATH"
        exit 1
    fi
}

# Check if secret already exists
check_secret_exists() {
    kubectl -n "${NAMESPACE}" get secrets "${SECRET_NAME}" &> /dev/null
}


# Collect user input securely
get_user_input() {
    echo "Please provide the following information:"
    read -r -p "Enter your Vaultwarden email login: " LOGIN
    read -r -s -p "Enter your Vaultwarden password: " PASSWORD
    echo
    read -r -p "Enter your Vaultwarden server url: " URL
}

# Create and apply the secret
create_secret() {
    cat > "${TEMP_SECRET_FILE}" << EOF
apiVersion: v1
kind: Secret
metadata:
  name: ${SECRET_NAME}
  namespace: ${NAMESPACE}
type: Opaque
stringData:
  BW_HOST: ${URL}
  BW_PASSWORD: ${PASSWORD}
  BW_USERNAME: ${LOGIN}
EOF

    kubectl -n "${NAMESPACE}" apply -f "${TEMP_SECRET_FILE}"
}

# Install external-secrets using Helm
install_external_secrets() {
    if ! kubectl get ns external-secrets &>/dev/null; then
        echo "Installing external-secrets…"
        helm repo add external-secrets https://charts.external-secrets.io
        helm upgrade --install external-secrets \
            external-secrets/external-secrets \
            -n external-secrets \
            --create-namespace \
            --set installCRDs=true
    else
        echo "External secrets already deployed"
    fi
}

main() {
    check_prerequisites

    if check_secret_exists; then
        echo "Secret '${SECRET_NAME}' already present in namespace '${NAMESPACE}'"
        exit 0
    fi

    echo -e "${TEMP_SECRET_FILE}"

    get_user_input
    echo -e "\nCreating Vaultwarden secret…"
    create_secret
    install_external_secrets

    echo "Secret installation completed successfully"
}

main "$@"
