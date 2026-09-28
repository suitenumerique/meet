#!/usr/bin/env bash

set -e

HELMFILE=src/helm/helmfile.yaml

environments=$(awk '/environments:/ {flag=1; next} flag && NF {print} !NF {flag=0}' "$HELMFILE" | grep -E '^[[:space:]]{2}[a-zA-Z]+' | sed 's/^[[:space:]]*//;s/:.*//')

for env in $environments; do
	echo "################### $env lint ###################"
	helmfile -e "$env" -f src/helm/helmfile.yaml lint || exit 1
	echo -e "\n"
done
