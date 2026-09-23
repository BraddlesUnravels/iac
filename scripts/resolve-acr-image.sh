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

metadata="$(az acr repository show \
  --name "${registry_name}" \
  --image "${container_repository}:${SOURCE_COMMIT_SHA}" \
  --output json)"

digest="$(jq -er '.digest // .manifest.digest // empty' <<<"${metadata}")"

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
