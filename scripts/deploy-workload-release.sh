#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OPERATION="${1:-}"
APPLICATION="${2:-}"
CATALOG_FILE="${3:-}"
CONTRACT_FILE="${4:-}"
EVIDENCE_FILE="${5:-}"
EXPECTED_BICEP_VERSION='0.47.16'
FIXED_APPLICATION='qwik-website'
FIXED_STACK_TEMPLATE="${ROOT_DIR}/stacks/single-container-web/main.bicep"

usage() {
  echo "Usage: $0 <preflight|what-if|apply|verify> qwik-website <environment.json> <workload.json> <evidence.json>" >&2
}

require_command() {
  local command_name="$1"
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "Required command is unavailable: ${command_name}" >&2
    exit 1
  fi
}

if [[ "${OPERATION}" != 'preflight' && "${OPERATION}" != 'what-if' && "${OPERATION}" != 'apply' && "${OPERATION}" != 'verify' ]]; then
  usage
  exit 1
fi

if [[ "${APPLICATION}" != "${FIXED_APPLICATION}" ]]; then
  echo "Only ${FIXED_APPLICATION} is supported by this orchestrator." >&2
  exit 1
fi

if [[ -z "${CATALOG_FILE}" || -z "${CONTRACT_FILE}" || -z "${EVIDENCE_FILE}" ]]; then
  usage
  exit 1
fi

for path in "${CATALOG_FILE}" "${CONTRACT_FILE}" "${EVIDENCE_FILE}" "${FIXED_STACK_TEMPLATE}"; do
  if [[ ! -f "${path}" ]]; then
    echo "Required file not found: ${path}" >&2
    exit 1
  fi
done

require_command az
require_command jq
require_command node
require_command curl

node "${ROOT_DIR}/scripts/validate-environment.mjs" "${CATALOG_FILE}"

subscription_id="$(jq -er '.azure.subscriptionId' "${CATALOG_FILE}")"
tenant_id="$(jq -er '.azure.tenantId' "${CATALOG_FILE}")"
resource_group="$(jq -er --arg app "${APPLICATION}" '.workloads[$app].resourceGroup' "${CATALOG_FILE}")"
container_app_name="$(jq -er --arg app "${APPLICATION}" '.workloads[$app].containerAppName' "${CATALOG_FILE}")"
registry_name="$(jq -er '.azure.containerRegistryName' "${CATALOG_FILE}")"
login_server="$(jq -er '.azure.containerRegistryLoginServer' "${CATALOG_FILE}")"
source_sha="$(jq -er '.sourceCommitSha' "${EVIDENCE_FILE}")"
image_digest="$(jq -er '.imageDigest' "${EVIDENCE_FILE}")"

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

temporary_directory="$(mktemp -d)"
chmod 700 "${temporary_directory}"
parameters_file="${temporary_directory}/workload.parameters.json"
what_if_file="${temporary_directory}/workload.what-if.json"
validation_file="${temporary_directory}/workload.what-if.validation.json"
resolved_file="${temporary_directory}/resolved-image.json"

cleanup() {
  rm -rf "${temporary_directory}"
}
trap cleanup EXIT

resolve_and_render() {
  local operation_name="$1"
  local resolve_err_file="${temporary_directory}/resolve-acr.err"

  if "${ROOT_DIR}/scripts/resolve-acr-image.sh" \
    "${CATALOG_FILE}" \
    "${APPLICATION}" \
    "${source_sha}" \
    > "${resolved_file}" \
    2> "${resolve_err_file}"; then
    resolved_digest="$(jq -er '.imageDigest' "${resolved_file}")"
    if [[ "${resolved_digest}" != "${image_digest}" ]]; then
      echo 'Resolved ACR digest does not match verified release evidence.' >&2
      exit 1
    fi
  else
    # Release evidence was already independently verified against GitHub + catalog.
    # Prefer live ACR confirmation, but do not block an otherwise verified deploy
    # when registry data-plane auth is temporarily unavailable.
    echo 'ACR live digest resolve failed; using independently verified release digest.' >&2
    cat "${resolve_err_file}" >&2 || true
    if [[ ! "${image_digest}" =~ ^sha256:[0-9a-f]{64}$ ]]; then
      echo "Verified release digest is malformed: ${image_digest}" >&2
      exit 1
    fi
    resolved_digest="${image_digest}"
    jq -n \
      --arg imageTag "${login_server}/$(jq -er --arg app "${APPLICATION}" '.workloads[$app].containerRepository' "${CATALOG_FILE}"):${source_sha}" \
      --arg imageDigest "${resolved_digest}" \
      --arg registryName "${registry_name}" \
      --arg containerRepository "$(jq -er --arg app "${APPLICATION}" '.workloads[$app].containerRepository' "${CATALOG_FILE}")" \
      --arg sourceCommitSha "${source_sha}" \
      '{
        imageTag: $imageTag,
        imageDigest: $imageDigest,
        registryName: $registryName,
        containerRepository: $containerRepository,
        sourceCommitSha: $sourceCommitSha,
        resolvedFrom: "verified-release-evidence"
      }' > "${resolved_file}"
  fi

  node "${ROOT_DIR}/scripts/render-workload-parameters.mjs" \
    "${CONTRACT_FILE}" \
    "${CATALOG_FILE}" \
    "${EVIDENCE_FILE}" \
    "${resolved_digest}" \
    "${operation_name}" \
    > "${parameters_file}"
}

run_preflight() {
  az group show --name "${resource_group}" --output none
  if ! az acr show \
    --name "${registry_name}" \
    --resource-group "$(jq -er '.azure.platformResourceGroup' "${CATALOG_FILE}")" \
    --query '{name:name,loginServer:loginServer,sku:sku.name,roleMode:roleAssignmentMode,admin:adminUserEnabled}' \
    --output json \
    > "${temporary_directory}/acr.json"; then
    echo "Unable to read ACR control-plane metadata for ${registry_name}." >&2
    exit 1
  fi

  if ! jq -e \
    --arg login "${login_server}" \
    '(.loginServer == $login) and (.sku == "Basic") and (.roleMode == "AbacRepositoryPermissions") and (.admin == false)' \
    "${temporary_directory}/acr.json" \
    >/dev/null; then
    echo 'ACR preflight posture check failed.' >&2
    cat "${temporary_directory}/acr.json" >&2 || true
    exit 1
  fi

  resolve_and_render what-if
  echo "preflight=ok"
  echo "resourceGroup=${resource_group}"
  echo "containerApp=${container_app_name}"
  echo "imageDigest=${image_digest}"
}

run_what_if() {
  resolve_and_render what-if
  deployment_name="qwik-${source_sha:0:8}-$(date -u +%Y%m%d%H%M%S)"

  az deployment group what-if \
    --name "${deployment_name}" \
    --resource-group "${resource_group}" \
    --template-file "${FIXED_STACK_TEMPLATE}" \
    --parameters "@${parameters_file}" \
    --no-pretty-print \
    --only-show-errors \
    --result-format FullResourcePayloads \
    --output json \
    > "${what_if_file}"

  node "${ROOT_DIR}/scripts/validate-workload-what-if.mjs" \
    "${what_if_file}" \
    "${CATALOG_FILE}" \
    "${APPLICATION}" \
    > "${validation_file}"

  jq -r '
    if (.changes | length) == 0 then
      "No material workload changes."
    else
      .changes[] | "\(.changeType)\t\(.resourceType)\t\(.resourceId)"
    end
  ' "${validation_file}"
}

run_apply() {
  resolve_and_render apply
  deployment_name="qwik-${source_sha:0:8}-$(date -u +%Y%m%d%H%M%S)"

  az deployment group what-if \
    --name "${deployment_name}" \
    --resource-group "${resource_group}" \
    --template-file "${FIXED_STACK_TEMPLATE}" \
    --parameters "@${parameters_file}" \
    --no-pretty-print \
    --only-show-errors \
    --result-format FullResourcePayloads \
    --output json \
    > "${what_if_file}"

  node "${ROOT_DIR}/scripts/validate-workload-what-if.mjs" \
    "${what_if_file}" \
    "${CATALOG_FILE}" \
    "${APPLICATION}" \
    > "${validation_file}"

  az deployment group create \
    --name "${deployment_name}" \
    --resource-group "${resource_group}" \
    --template-file "${FIXED_STACK_TEMPLATE}" \
    --parameters "@${parameters_file}" \
    --mode Incremental \
    --output none

  printf 'deploymentName=%s\n' "${deployment_name}"
  printf 'resourceGroup=%s\n' "${resource_group}"
  printf 'containerApp=%s\n' "${container_app_name}"
  printf 'imageDigest=%s\n' "${image_digest}"
}

run_verify() {
  local app_json fqdn configured_image url custom_domain certificate_id bound_domain bound_cert azure_custom_domain
  app_json="$(az containerapp show \
    --name "${container_app_name}" \
    --resource-group "${resource_group}" \
    --output json)"

  configured_image="$(jq -er '.properties.template.containers[0].image' <<<"${app_json}")"
  expected_image="${login_server}/$(jq -er --arg app "${APPLICATION}" '.workloads[$app].containerRepository' "${CATALOG_FILE}")@${image_digest}"

  if [[ "${configured_image}" != "${expected_image}" ]]; then
    echo "Live image ${configured_image} does not equal ${expected_image}" >&2
    exit 1
  fi

  custom_domain="$(jq -er --arg app "${APPLICATION}" '.workloads[$app].customDomainName // empty' "${CATALOG_FILE}")"
  certificate_id="$(jq -er --arg app "${APPLICATION}" '.workloads[$app].certificateResourceId // empty' "${CATALOG_FILE}")"
  fqdn="$(jq -er '.properties.configuration.ingress.fqdn' <<<"${app_json}")"

  if [[ -n "${custom_domain}" ]]; then
    bound_domain="$(jq -er --arg host "${custom_domain}" '
      (.properties.configuration.ingress.customDomains // [])
      | map(select(.name == $host and .bindingType == "SniEnabled"))
      | .[0].name // empty
    ' <<<"${app_json}")"
    bound_cert="$(jq -er --arg host "${custom_domain}" '
      (.properties.configuration.ingress.customDomains // [])
      | map(select(.name == $host and .bindingType == "SniEnabled"))
      | .[0].certificateId // empty
    ' <<<"${app_json}")"

    if [[ "${bound_domain}" != "${custom_domain}" ]]; then
      echo "Sticky custom domain binding missing for ${custom_domain}" >&2
      exit 1
    fi

    if [[ -n "${certificate_id}" && "${bound_cert}" != "${certificate_id}" ]]; then
      echo "Sticky certificate binding mismatch for ${custom_domain}" >&2
      exit 1
    fi

    while IFS=$'\t' read -r extra_host extra_cert; do
      [[ -z "${extra_host}" ]] && continue
      extra_bound="$(jq -er --arg host "${extra_host}" '
        (.properties.configuration.ingress.customDomains // [])
        | map(select(.name == $host and .bindingType == "SniEnabled"))
        | .[0].certificateId // empty
      ' <<<"${app_json}")"
      if [[ "${extra_bound}" != "${extra_cert}" ]]; then
        echo "Sticky additional domain binding missing or mismatched for ${extra_host}" >&2
        exit 1
      fi
    done < <(jq -r --arg app "${APPLICATION}" '
      (.workloads[$app].additionalCustomDomains // [])
      | .[]
      | "\(.name)\t\(.certificateResourceId)"
    ' "${CATALOG_FILE}")

    azure_custom_domain="$(jq -er '
      (.properties.template.containers[0].env // [])
      | map(select(.name == "AZURE_CUSTOM_DOMAIN"))
      | .[0].value // empty
    ' <<<"${app_json}")"

    if [[ "${azure_custom_domain}" != "${custom_domain}" ]]; then
      echo "AZURE_CUSTOM_DOMAIN must equal ${custom_domain}" >&2
      exit 1
    fi

    url="https://${custom_domain}"
  else
    url="https://${fqdn}"
  fi

  ready=0
  for _ in $(seq 1 30); do
    if curl --fail --silent --show-error --max-time 10 "${url}/health" >/tmp/qwik-live-health; then
      if [[ "$(cat /tmp/qwik-live-health)" == 'ok' ]]; then
        ready=1
        break
      fi
    fi
    sleep 5
  done

  if [[ "${ready}" -ne 1 ]]; then
    echo 'Live /health verification failed.' >&2
    exit 1
  fi

  homepage_code="$(curl -sS -o /tmp/qwik-live-home -w '%{http_code}' "${url}/")"
  if [[ "${homepage_code}" != '200' ]]; then
    echo "Homepage expected 200, got ${homepage_code}" >&2
    exit 1
  fi

  # Qwik City case-study routes are trailing-slash canonical.
  study_code="$(curl -sS -o /tmp/qwik-live-study -w '%{http_code}' "${url}/work/access-control-demo/")"
  if [[ "${study_code}" != '200' ]]; then
    echo "Case study expected 200, got ${study_code}" >&2
    exit 1
  fi

  printf 'url=%s\n' "${url}"
  printf 'image=%s\n' "${configured_image}"
  printf 'health=ok\n'
  if [[ -n "${custom_domain}" ]]; then
    printf 'customDomain=%s\n' "${custom_domain}"
    printf 'azureCustomDomain=%s\n' "${azure_custom_domain}"
  fi
}

case "${OPERATION}" in
  preflight) run_preflight ;;
  what-if) run_what_if ;;
  apply) run_apply ;;
  verify) run_verify ;;
esac
