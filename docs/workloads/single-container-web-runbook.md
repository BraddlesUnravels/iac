# Single-container-web release runbook

Last documentation pass: 2026-10-08.

## Purpose

One production release path for every workload on `stacks/single-container-web`
hosted in `rg-platform-production`.

| Layer | Location |
| --- | --- |
| Catalog | `environments/production.json` |
| Contract | `workloads/<application>/production.json` |
| Foundation | `foundations/single-container-web/` |
| Release stack | `stacks/single-container-web/` |
| IaC workflow | `.github/workflows/deploy-single-container-release.yml` |

Current consumers:

- `qwik-website`
- `access-control-demo`

## Source → IaC flow

1. Application repo builds and pushes
   `braddlesunravelsacr.azurecr.io/<containerRepository>:<40-sha>`.
2. Application repo dispatches IaC with a non-secret evidence payload.
3. IaC verifies payload + contract, plans with the workload planner UAMI, applies
   with the workload deployer UAMI, then verifies HTTP.

### Preferred dispatch type

```text
single-container-web-release-v1
```

`client_payload.application` is required and must match a catalog workload key.

Legacy aliases still accepted:

- `qwik-website-release-v1`
- `access-control-demo-release-v1`

### Source triggers (application repos)

| Trigger | When | `releaseTag` in payload |
| --- | --- | --- |
| Version tag / published release `vX.Y.Z` | Normal audited release | `vX.Y.Z` |
| `workflow_dispatch` on `main` | Operator hotfix / replay | `main` |

Do **not** auto-deploy on every push to `main`.

Manual main deploys must still publish an immutable 40-character commit SHA image
tag. IaC verifies `main` HEAD equals `sourceCommitSha`.

## GitHub variables (IaC)

Shared environments: `production-plan`, `production`.

| Application | Plan client id var | Deploy client id var | Tenant / subscription |
| --- | --- | --- | --- |
| `qwik-website` | `QWIK_PLAN_CLIENT_ID` | `QWIK_DEPLOY_CLIENT_ID` | `QWIK_AZURE_*` (fallback `AZURE_*`) |
| `access-control-demo` | `ACCESS_CONTROL_DEMO_PLAN_CLIENT_ID` | `ACCESS_CONTROL_DEMO_DEPLOY_CLIENT_ID` | `ACCESS_CONTROL_DEMO_AZURE_*` (fallback `AZURE_*`) |

Optional: `SOURCE_GITHUB_TOKEN` when the source repository is private.

## Contract rules

- Stack must be `single-container-web`.
- Policies are **application-aware** (required plain env, allowed secret env names).
- `secretRefs` map env var → Key Vault secret **name** only.
- Secret values never pass through GitHub Actions, dispatch payloads, or Bicep parameters.
- `AZURE_CUSTOM_DOMAIN` is infrastructure-owned and injected from the catalog.

## Operator foundation (privileged)

Apply once per workload with distinct names from the catalog:

```bash
az deployment sub what-if \
  --location australiaeast \
  --template-file foundations/single-container-web/main.bicep \
  --parameters \
    location=australiaeast \
    resourceGroupName=rg-platform-production \
    platformResourceGroupName=rg-platform-production \
    containerRegistryName=braddlesunravelsacr \
    application=<application> \
    logAnalyticsWorkspaceName=<from catalog> \
    containerAppsEnvironmentName=<from catalog> \
    runtimeIdentityName=<from catalog> \
    publisherIdentityName=<from catalog> \
    plannerIdentityName=<from catalog> \
    deployerIdentityName=<from catalog> \
    containerRepositoryName=<from catalog> \
    publisherOidcSubject='repo:Owner@ownerId/repo@repoId:environment:image-publish' \
    plannerOidcSubject='repo:BraddlesUnravels@103235805/iac@1323677104:environment:production-plan' \
    deployerOidcSubject='repo:BraddlesUnravels@103235805/iac@1323677104:environment:production'
```

Then:

1. Record new UAMI client IDs into GitHub variables.
2. Grant runtime identity secret-scoped `Key Vault Secrets User` on each allowed secret.
3. Issue managed certificates on the **new** ACA environment; update catalog cert IDs.
4. Publish a release (tag or manual main); approve IaC production if required.
5. Cut DNS only after default FQDN health and SNI bindings succeed.

## Safety rails

- Workload what-if must never Create/Modify/Delete ACR or Key Vault.
- Planner/deployer must not hold standing RG Contributor.
- Do not delete `rg-platform-production` or the shared vault during workload teardown.
- DNS (GoDaddy) stays manual; provide exact record diffs only.
