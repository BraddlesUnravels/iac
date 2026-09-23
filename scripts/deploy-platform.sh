#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OPERATION="${1:-}"
CATALOG_FILE="${2:-}"
EXPECTED_BICEP_VERSION='0.47.16'

usage() {
  echo "Usage: $0 <what-if|apply> <environment-catalog.json>" >&2
}

require_command() {
  local command_name="$1"

  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "Required command is unavailable: ${command_name}" >&2
    exit 1
  fi
}

if [[ "${OPERATION}" != 'what-if' && "${OPERATION}" != 'apply' ]]; then
  usage
  exit 1
fi

if [[ -z "${CATALOG_FILE}" || ! -f "${CATALOG_FILE}" ]]; then
  echo "Environment catalog not found: ${CATALOG_FILE:-<missing>}" >&2
  usage
  exit 1
fi

require_command az
require_command jq
require_command node

node "${ROOT_DIR}/scripts/validate-environment.mjs" "${CATALOG_FILE}"

subscription_id="$(jq -er '.azure.subscriptionId' "${CATALOG_FILE}")"
tenant_id="$(jq -er '.azure.tenantId' "${CATALOG_FILE}")"
location="$(jq -er '.azure.location' "${CATALOG_FILE}")"
resource_group="$(jq -er '.azure.platformResourceGroup' "${CATALOG_FILE}")"
registry_name="$(jq -er '.azure.containerRegistryName' "${CATALOG_FILE}")"
registry_id="/subscriptions/${subscription_id}/resourceGroups/${resource_group}/providers/Microsoft.ContainerRegistry/registries/${registry_name}"

active_subscription_id="$(az account show --query id --output tsv)"
active_tenant_id="$(az account show --query tenantId --output tsv)"

if [[ "${active_subscription_id}" != "${subscription_id}" ]]; then
  echo 'Active Azure subscription does not match the catalog.' >&2
  exit 1
fi

if [[ "${active_tenant_id}" != "${tenant_id}" ]]; then
  echo 'Active Azure tenant does not match the catalog.' >&2
  exit 1
fi

bicep_version="$(az bicep version | sed -E 's/^Bicep CLI version ([0-9.]+).*/\1/')"

if [[ "${bicep_version}" != "${EXPECTED_BICEP_VERSION}" ]]; then
  echo "Bicep ${EXPECTED_BICEP_VERSION} is required; found ${bicep_version}." >&2
  exit 1
fi

for provider_namespace in Microsoft.ContainerRegistry Microsoft.Resources; do
  registration_state="$(
    az provider show \
      --namespace "${provider_namespace}" \
      --query registrationState \
      --output tsv
  )"

  if [[ "${registration_state}" != 'Registered' ]]; then
    echo "Azure provider is not registered: ${provider_namespace}" >&2
    exit 1
  fi
done

if ! az resource show --ids "${registry_id}" --output none 2>/dev/null; then
  name_available="$(
    az acr check-name \
      --name "${registry_name}" \
      --query nameAvailable \
      --output tsv
  )"

  if [[ "${name_available}" != 'true' ]]; then
    echo "ACR name is unavailable and the approved target does not exist: ${registry_name}" >&2
    exit 1
  fi
fi

temporary_directory="$(mktemp -d)"
parameters_file="${temporary_directory}/platform.parameters.json"
what_if_file="${temporary_directory}/platform.what-if.json"
validation_file="${temporary_directory}/platform.what-if.validation.json"

cleanup() {
  rm -rf "${temporary_directory}"
}

trap cleanup EXIT

node "${ROOT_DIR}/scripts/render-platform-parameters.mjs" \
  "${CATALOG_FILE}" \
  > "${parameters_file}"

deployment_suffix="${GITHUB_SHA:-$(git -C "${ROOT_DIR}" rev-parse HEAD)}"
deployment_name="platform-${resource_group#rg-}-${deployment_suffix:0:8}-$(date -u +%Y%m%d%H%M%S)"

run_what_if() {
  az deployment sub what-if \
    --name "${deployment_name}" \
    --location "${location}" \
    --template-file "${ROOT_DIR}/platform/main.bicep" \
    --parameters "@${parameters_file}" \
    --no-pretty-print \
    --only-show-errors \
    --result-format FullResourcePayloads \
    --output json \
    > "${what_if_file}"
}

validate_what_if() {
  local allow_modify="${1:-false}"
  local -a validation_arguments=(
    "${ROOT_DIR}/scripts/validate-platform-what-if.mjs"
    "${what_if_file}"
    "${CATALOG_FILE}"
  )

  if [[ "${allow_modify}" == 'true' ]]; then
    validation_arguments+=(--allow-modify)
  fi

  node "${validation_arguments[@]}" > "${validation_file}"
}

print_summary() {
  jq -r '
    if (.changes | length) == 0 then
      "No material platform changes."
    else
      .changes[] | "\(.changeType)\t\(.resourceType)\t\(.resourceId)"
    end
  ' "${validation_file}"
}

run_what_if

if [[ "${OPERATION}" == 'what-if' ]]; then
  validate_what_if false
  print_summary
  exit 0
fi

expected_confirmation="deploy ${resource_group}/${registry_name}"

if [[ "${PLATFORM_APPLY_CONFIRMATION:-}" != "${expected_confirmation}" ]]; then
  echo "Refusing apply. Set PLATFORM_APPLY_CONFIRMATION to: ${expected_confirmation}" >&2
  exit 1
fi

validate_what_if true
print_summary

az deployment sub create \
  --name "${deployment_name}" \
  --location "${location}" \
  --template-file "${ROOT_DIR}/platform/main.bicep" \
  --parameters "@${parameters_file}" \
  --output none

"${ROOT_DIR}/scripts/verify-platform.sh" "${CATALOG_FILE}"

printf 'deploymentName=%s\n' "${deployment_name}"
printf 'platformResourceGroup=%s\n' "${resource_group}"
printf 'containerRegistryId=%s\n' "${registry_id}"
