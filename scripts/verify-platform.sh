#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CATALOG_FILE="${1:-}"

if [[ -z "${CATALOG_FILE}" || ! -f "${CATALOG_FILE}" ]]; then
  echo "Usage: $0 <environment-catalog.json>" >&2
  exit 1
fi

for command_name in az jq node; do
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "Required command is unavailable: ${command_name}" >&2
    exit 1
  fi
done

node "${ROOT_DIR}/scripts/validate-environment.mjs" "${CATALOG_FILE}"

subscription_id="$(jq -er '.azure.subscriptionId' "${CATALOG_FILE}")"
tenant_id="$(jq -er '.azure.tenantId' "${CATALOG_FILE}")"
location="$(jq -er '.azure.location' "${CATALOG_FILE}")"
resource_group="$(jq -er '.azure.platformResourceGroup' "${CATALOG_FILE}")"
registry_name="$(jq -er '.azure.containerRegistryName' "${CATALOG_FILE}")"
login_server="$(jq -er '.azure.containerRegistryLoginServer' "${CATALOG_FILE}")"
role_assignment_mode="$(jq -er '.azure.containerRegistryRoleAssignmentMode' "${CATALOG_FILE}")"
environment="$(jq -er '.name' "${CATALOG_FILE}")"
resource_group_id="/subscriptions/${subscription_id}/resourceGroups/${resource_group}"
registry_id="${resource_group_id}/providers/Microsoft.ContainerRegistry/registries/${registry_name}"

account_json="$(az account show --output json)"

jq -e \
  --arg subscription_id "${subscription_id}" \
  --arg tenant_id "${tenant_id}" \
  '.id == $subscription_id and .tenantId == $tenant_id' \
  <<< "${account_json}" \
  >/dev/null

resource_group_json="$(az group show --name "${resource_group}" --output json)"

jq -e \
  --arg id "${resource_group_id}" \
  --arg location "${location}" \
  --arg environment "${environment}" \
  '
    (.id | ascii_downcase) == ($id | ascii_downcase) and
    .location == $location and
    .tags.application == "platform" and
    .tags.environment == $environment and
    .tags.managedBy == "bicep"
  ' \
  <<< "${resource_group_json}" \
  >/dev/null

resources_json="$(az resource list --resource-group "${resource_group}" --output json)"

jq -e \
  --arg registry_id "${registry_id}" \
  '
    length == 1 and
    (.[0].id | ascii_downcase) == ($registry_id | ascii_downcase) and
    .[0].type == "Microsoft.ContainerRegistry/registries"
  ' \
  <<< "${resources_json}" \
  >/dev/null

registry_json="$(az acr show --name "${registry_name}" --resource-group "${resource_group}" --output json)"
authentication_as_arm_json="$(
  az acr config authentication-as-arm show \
    --registry "${registry_name}" \
    --resource-group "${resource_group}" \
    --only-show-errors \
    --output json
)"

jq -e \
  --arg id "${registry_id}" \
  --arg location "${location}" \
  --arg login_server "${login_server}" \
  --arg role_assignment_mode "${role_assignment_mode}" \
  --arg environment "${environment}" \
  '
    (.id | ascii_downcase) == ($id | ascii_downcase) and
    .location == $location and
    .loginServer == $login_server and
    .sku.name == "Basic" and
    .adminUserEnabled == false and
    .anonymousPullEnabled == false and
    .dataEndpointEnabled == false and
    .encryption.status == "disabled" and
    .networkRuleBypassAllowedForTasks == false and
    .publicNetworkAccess == "Enabled" and
    .roleAssignmentMode == $role_assignment_mode and
    .zoneRedundancy == "Disabled" and
    .tags.application == "platform" and
    .tags.environment == $environment and
    .tags.managedBy == "bicep"
  ' \
  <<< "${registry_json}" \
  >/dev/null

jq -e \
  '(.status | ascii_downcase) == "enabled"' \
  <<< "${authentication_as_arm_json}" \
  >/dev/null

registry_assignments="$(
  az role assignment list \
    --scope "${registry_id}" \
    --output json
)"

if ! jq -e \
  --arg registry_id "${registry_id}" \
  'all(.[]; (.scope | ascii_downcase) != ($registry_id | ascii_downcase))' \
  <<< "${registry_assignments}" \
  >/dev/null; then
  echo 'Unexpected role assignments exist at the Phase 2 registry scope.' >&2
  exit 1
fi

printf 'subscriptionId=%s\n' "${subscription_id}"
printf 'platformResourceGroup=%s\n' "${resource_group}"
printf 'containerRegistryId=%s\n' "${registry_id}"
printf 'containerRegistryLoginServer=%s\n' "${login_server}"
printf 'verification=passed\n'