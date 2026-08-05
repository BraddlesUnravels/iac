#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STACK_NAME="${1:-}"
PARAM_FILE="${2:-}"
RESOURCE_GROUP="${AZURE_RESOURCE_GROUP:-}"
DEPLOYMENT_NAME="${DEPLOYMENT_NAME:-stack-${STACK_NAME}}"

if [[ -z "${STACK_NAME}" || -z "${PARAM_FILE}" ]]; then
  echo "Usage: $0 <stack-name> <parameters.bicepparam>" >&2
  echo "Available stacks:" >&2
  find "${ROOT_DIR}/stacks" -mindepth 1 -maxdepth 1 -type d -exec basename {} \; | sort >&2
  exit 1
fi

if [[ -z "${RESOURCE_GROUP}" ]]; then
  echo "Missing required environment variable: AZURE_RESOURCE_GROUP" >&2
  exit 1
fi

TEMPLATE_FILE="${ROOT_DIR}/stacks/${STACK_NAME}/main.bicep"

if [[ ! -f "${TEMPLATE_FILE}" ]]; then
  echo "Unknown stack or missing template: ${STACK_NAME}" >&2
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
  --template-file "${TEMPLATE_FILE}" \
  --parameters "${PARAM_FILE}" \
  --output table
