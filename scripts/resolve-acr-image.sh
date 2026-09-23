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
require_command curl

node "${ROOT_DIR}/scripts/validate-environment.mjs" "${CATALOG_FILE}"

registry_name="$(jq -er '.azure.containerRegistryName' "${CATALOG_FILE}")"
login_server="$(jq -er '.azure.containerRegistryLoginServer' "${CATALOG_FILE}")"
container_repository="$(jq -er --arg app "${APPLICATION}" '.workloads[$app].containerRepository' "${CATALOG_FILE}")"

temporary_directory="$(mktemp -d)"
chmod 700 "${temporary_directory}"
cleanup() {
  rm -rf "${temporary_directory}"
}
trap cleanup EXIT

# az acr login --expose-token returns an ACR refresh token (despite the field name).
# Exchange it for a repository-scoped access token, then read the immutable digest
# from the registry manifest API. Suppress the CLI warning on stderr so it cannot
# contaminate captured JSON.
login_json_file="${temporary_directory}/acr-login.json"
login_err_file="${temporary_directory}/acr-login.err"

if ! az acr login \
  --name "${registry_name}" \
  --expose-token \
  --output json \
  > "${login_json_file}" \
  2> "${login_err_file}"; then
  echo 'Unable to obtain an ACR refresh token for repository metadata.' >&2
  cat "${login_err_file}" >&2 || true
  exit 1
fi

if ! jq -e 'type == "object" and (.accessToken | type == "string" and length > 0)' \
  "${login_json_file}" >/dev/null; then
  echo 'ACR login did not return a JSON refresh token payload.' >&2
  cat "${login_json_file}" >&2 || true
  cat "${login_err_file}" >&2 || true
  exit 1
fi

refresh_token="$(jq -er '.accessToken' "${login_json_file}")"

exchange_access_token() {
  local scope="$1"

  curl --silent --show-error --fail \
    --request POST \
    --header 'Content-Type: application/x-www-form-urlencoded' \
    --data-urlencode 'grant_type=refresh_token' \
    --data-urlencode "service=${login_server}" \
    --data-urlencode "scope=${scope}" \
    --data-urlencode "refresh_token=${refresh_token}" \
    "https://${login_server}/oauth2/token" \
    | jq -er '.access_token'
}

fetch_manifest() {
  local access_token="$1"
  local headers_file="$2"
  local body_file="$3"

  curl --silent --show-error \
    --dump-header "${headers_file}" \
    --output "${body_file}" \
    --write-out '%{http_code}' \
    --header "Authorization: Bearer ${access_token}" \
    --header 'Accept: application/vnd.docker.distribution.manifest.v2+json,application/vnd.oci.image.manifest.v1+json,application/vnd.oci.image.index.v1+json' \
    "https://${login_server}/v2/${container_repository}/manifests/${SOURCE_COMMIT_SHA}"
}

headers_file="${temporary_directory}/manifest.headers"
body_file="${temporary_directory}/manifest.body"

access_token="$(exchange_access_token "repository:${container_repository}:metadata_read")"
http_code="$(fetch_manifest "${access_token}" "${headers_file}" "${body_file}")"

if [[ "${http_code}" != '200' ]]; then
  # metadata_read alone can be insufficient; retry with pull scope.
  access_token="$(exchange_access_token "repository:${container_repository}:pull")"
  http_code="$(fetch_manifest "${access_token}" "${headers_file}" "${body_file}")"
fi

if [[ "${http_code}" != '200' ]]; then
  echo "Unable to read ACR manifest for ${container_repository}:${SOURCE_COMMIT_SHA} (HTTP ${http_code})." >&2
  cat "${body_file}" >&2 || true
  exit 1
fi

digest="$(
  awk 'BEGIN{IGNORECASE=1} tolower($1)=="docker-content-digest:" {print $2}' "${headers_file}" \
    | tr -d '\r' \
    | tail -n 1
)"

if [[ -z "${digest}" ]]; then
  echo 'ACR manifest response did not include Docker-Content-Digest.' >&2
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
