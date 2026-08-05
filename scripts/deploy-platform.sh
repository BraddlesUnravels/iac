#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PARAM_FILE="${1:-}"
RESOURCE_GROUP="${AZURE_RESOURCE_GROUP:-}"
DEPLOYMENT_NAME="${DEPLOYMENT_NAME:-platform}"

if [[ -z "${PARAM_FILE}" ]]; then
  echo "Usage: $0 <parameters.bicepparam>" >&2
  exit 1
fi

if [[ -z "${RESOURCE_GROUP}" ]]; then
  echo "Missing required environment variable: AZURE_RESOURCE_GROUP" >&2
  exit 1
fi

if [[ ! -f "${PARAM_FILE}" ]]; then
  echo "Parameter file not found: ${PARAM_FILE}" >&2
  exit 1
fi

if [[ -n "${AZURE_SUBSCRIPTION_ID:-}" ]]; then
  az account set --subscription "${AZURE_SUBSCRIPTION_ID}"
fi

az deployment group create \
  --resource-group "${RESOURCE_GROUP}" \
  --name "${DEPLOYMENT_NAME}" \
  --template-file "${ROOT_DIR}/platform/main.bicep" \
  --parameters "${PARAM_FILE}" \
  --output table
