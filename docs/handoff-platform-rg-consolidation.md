# Archived completion record: platform resource-group consolidation

- **Completed:** 2026-10-08
- **Scope:** Move Qwik and access-control production compute into
  `rg-platform-production`, using the shared ACR and IaC release workflow.

This document records the completed migration; it is not a pending handoff or
runbook. Its original “next stages” and “suggested first prompt” are obsolete and
have been removed. Use the current [repository README](../README.md), [design
overview](reusable-iac-design.md), and workload runbooks for present-day guidance.

## Recorded outcome

- Shared ACR and Key Vault are in `rg-platform-production`.
- `qwik-website` and `access-control-demo` each have a separate Container Apps
  environment, Container App, identities, and scoped ACR permissions in the
  platform resource group.
- Both workloads use the catalogued `single-container-web` contract and the
  generic `.github/workflows/deploy-single-container-release.yml` release path.
- Qwik serves its `www` and apex custom domains; access-control serves
  `aca.braddlesunravels.online`.
- The old `rg-qwik-website-production` and `rg-access-control-demo` resource
  groups were recorded as deleted after cutover.
- DNS and health checks were recorded as successful at cutover. Azure and public
  DNS state can change; consult the workload runbooks and verify live state
  before operational changes.

## Safety constraints retained

- Do not delete the shared platform resource group or Key Vault during workload
  teardown.
- Do not give planner or deployer identities standing platform-RG Contributor.
- Recreating a user-assigned managed identity requires updating its client ID in
  the relevant GitHub variables.
- Keep DNS changes manual and review exact record changes before applying.

For the detailed workload configuration and release procedures, see
[qwik-website-runbook.md](workloads/qwik-website-runbook.md),
[access-control-demo-runbook.md](workloads/access-control-demo-runbook.md), and
[single-container-web-runbook.md](workloads/single-container-web-runbook.md).
