#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CATALOG_FILE="${1:-}"
APPLICATION="${2:-}"
SOURCE_COMMIT_SHA="${3:-}"

usage() {
  echo "Usage: $0 <environment-catalog.json> <application> <source-commit-sha>" >&2
}

if [[ -z "${CATALOG_FILE}" || -z "${APPLICATION}" || -z "${SOURCE_COMMIT_SHA}" ]]; then
  usage
  exit 1
fi

if [[ ! -f "${CATALOG_FILE}" ]]; then
  echo "Environment catalog not found: ${CATALOG_FILE}" >&2
  exit 1
fi

if [[ ! "${SOURCE_COMMIT_SHA}" =~ ^[0-9a-f]{40}$ ]]; then
  echo 'Source commit SHA must be 40 lowercase hexadecimal characters.' >&2
  exit 1
fi

require_command() {
  local command_name="$1"
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "Required command is unavailable: ${command_name}" >&2
    exit 1
  fi
}

require_command az
require_command jq
require_command node

node "${ROOT_DIR}/scripts/validate-environment.mjs" "${CATALOG_FILE}"

registry_name="$(jq -er '.azure.containerRegistryName' "${CATALOG_FILE}")"
login_server="$(jq -er '.azure.containerRegistryLoginServer' "${CATALOG_FILE}")"
container_repository="$(jq -er --arg app "${APPLICATION}" '.workloads[$app].containerRepository' "${CATALOG_FILE}")"

# ABAC registries require an ACR data-plane token. ARM OIDC alone is not enough
# for az acr repository show against repository content/metadata APIs.
token="$(az acr login \
  --name "${registry_name}" \
  --expose-token \
  --output tsv \
  --query accessToken)"

if [[ -z "${token}" ]]; then
  echo 'Unable to obtain an ACR access token for repository metadata.' >&2
  exit 1
fi

metadata_file="$(mktemp)"
cleanup_metadata() {
  rm -f "${metadata_file}"
}
trap cleanup_metadata EXIT

if ! az acr repository show \
  --name "${registry_name}" \
  --image "${container_repository}:${SOURCE_COMMIT_SHA}" \
  --username '00000000-0000-0000-0000-000000000000' \
  --password "${token}" \
  --output json \
  > "${metadata_file}"; then
  echo "Unable to read ACR image ${container_repository}:${SOURCE_COMMIT_SHA}." >&2
  exit 1
fi

digest="$(jq -er '.digest // .manifest.digest // empty' "${metadata_file}")"

if [[ -z "${digest}" ]]; then
  echo 'ACR metadata did not include a digest.' >&2
  exit 1
fi

if [[ ! "${digest}" =~ ^sha256:[0-9a-f]{64}$ ]]; then
  echo "Resolved digest is malformed: ${digest}" >&2
  exit 1
fi

image_tag="${login_server}/${container_repository}:${SOURCE_COMMIT_SHA}"

jq -n \
  --arg imageTag "${image_tag}" \
  --arg imageDigest "${digest}" \
  --arg registryName "${registry_name}" \
  --arg containerRepository "${container_repository}" \
  --arg sourceCommitSha "${SOURCE_COMMIT_SHA}" \
  '{
    imageTag: $imageTag,
    imageDigest: $imageDigest,
    registryName: $registryName,
    containerRepository: $containerRepository,
    sourceCommitSha: $sourceCommitSha
  }'
