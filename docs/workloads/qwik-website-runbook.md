# Qwik website release-driven deployment runbook

Last documentation pass: 2026-09-24.

## Status

| Layer | State |
| --- | --- |
| Foundation Bicep (`foundations/single-container-web`) | Implemented |
| Release stack (`stacks/single-container-web`) | Implemented |
| Contract + catalog | `workloads/qwik-website/production.json`, `environments/production.json` |
| IaC workflow | `.github/workflows/deploy-qwik-release.yml` |
| Sticky custom domains (`www` + apex) | Implemented |
| Live Azure foundation / GitHub App / env protection | Operator-owned; follow bootstrap below |

This is the **production path** currently managed by this repository.

`access-control-demo` is **not** deployed or migrated here yet. Keep its DNS
(`aca.braddlesunravels.online`) and Azure resources untouched by Qwik operations.
That brownfield migration is next; see the root README and
[../reusable-iac-design.md](../reusable-iac-design.md).

## Verified GitHub identities

| Repository | full_name | id | owner id | visibility |
| --- | --- | --- | --- | --- |
| Source | `BraddlesUnravels/qwik-website` | `1367173842` | `103235805` | public |
| IaC | `BraddlesUnravels/iac` | `1323677104` | `103235805` | public |

Source is public, so IaC can read releases/tags without a source-read App token.
`SOURCE_GITHUB_TOKEN` remains optional for private-source future use.

## Normal path

1. Operator publishes stable `vX.Y.Z` release in qwik-website.
2. Source `release.yml` verifies, tests, builds one image, pushes
   `braddlesunravelsacr.azurecr.io/qwik-website:<40-sha>`, dispatches
   `qwik-website-release-v1`.
3. IaC `deploy-qwik-release.yml` on default branch verifies payload independently,
   plans with planner UAMI, waits on protected `production` if configured,
   re-verifies, applies only the Qwik Container App, verifies HTTP.

Shared ACR platform prerequisites: [../operations.md](../operations.md).

## Role matrix (fill live assignment IDs after foundation apply)

| Principal | Trusted job | Capability | Must not have |
| --- | --- | --- | --- |
| Publisher UAMI | Qwik `image-publish` | ACR Repository Writer on `qwik-website` only (`2a1e307c-b015-4ebd-883e-5b7698a07328`) | App RG write, other repos |
| Pull UAMI | Attached to ACA | ACR Repository Reader on `qwik-website` only (`b93aa761-3e63-49ed-ac28-beffa264f7ac`) | Writer, RG write |
| Planner UAMI | IaC `production-plan` | RG Reader + custom deployment planner role (read, validate, what-if) + ACR control-plane Reader + ACR repo Reader | RG write, roleAssignment/write |
| Deployer UAMI | IaC `production` | RG Contributor + MIO on pull identity + ACR control-plane Reader + ACR repo Reader | Platform RG write, roleAssignment/write |
| Foundation operator | Manual bootstrap | RG create + IAM at intended scopes | Standing release runtime |
| Dispatch GitHub App | Qwik dispatch step | `repository_dispatch` to IaC only | Long-lived PAT / Azure |

## Operator bootstrap (privileged — do not run from release workflow)

1. Confirm subscription `eb1b0038-3a72-459d-884c-ba2820dc53cc`, tenant
   `f1c96730-73a1-4159-81ab-0bb6731c8e75`, ACR `braddlesunravelsacr` Basic + ABAC +
   ARM-audience auth, admin off.
2. Protect IaC `main`, source `v*` tags, configure GitHub environments:
   - Source: `image-publish`
   - IaC: `production-plan`, `production` (required reviewers)
3. Install GitHub App on IaC repo; store in source:
   - var `IAC_DISPATCH_APP_ID`
   - secret `IAC_DISPATCH_APP_PRIVATE_KEY`
4. OIDC subjects must match the **actual** GitHub token `sub` claim.
   These repositories use **immutable** subjects (verified live on release):
   - Publisher: `repo:BraddlesUnravels@103235805/qwik-website@1367173842:environment:image-publish`
   - Planner: `repo:BraddlesUnravels@103235805/iac@1323677104:environment:production-plan`
   - Deployer: `repo:BraddlesUnravels@103235805/iac@1323677104:environment:production`
   Do not use legacy `repo:Owner/Name:environment:...` subjects for these repos.
5. Validate locally: `npm ci --ignore-scripts && npm run validate`
6. Subscription-scope foundation what-if then apply (operator identity):

```bash
# After reviewing rendered parameters; subjects must match live OIDC claims.
az deployment sub what-if \
  --location australiaeast \
  --template-file foundations/single-container-web/main.bicep \
  --parameters \
    location=australiaeast \
    resourceGroupName=rg-qwik-website-production \
    platformResourceGroupName=rg-platform-production \
    containerRegistryName=braddlesunravelsacr \
    logAnalyticsWorkspaceName=log-qwik-website-production \
    containerAppsEnvironmentName=acae-qwik-website-production \
    runtimeIdentityName=id-qwik-website-pull \
    publisherIdentityName=id-qwik-website-publisher \
    plannerIdentityName=id-qwik-website-planner \
    deployerIdentityName=id-qwik-website-deployer \
    publisherOidcSubject='repo:BraddlesUnravels@103235805/qwik-website@1367173842:environment:image-publish' \
    plannerOidcSubject='repo:BraddlesUnravels@103235805/iac@1323677104:environment:production-plan' \
    deployerOidcSubject='repo:BraddlesUnravels@103235805/iac@1323677104:environment:production'
```

7. Read back role assignments: principal, role ID, condition version 2.0, scope=ACR.
8. Set GitHub environment variables:
   - Source `image-publish`: `AZURE_PUBLISHER_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`
   - IaC plan/deploy: `QWIK_PLAN_CLIENT_ID`, `QWIK_DEPLOY_CLIENT_ID`,
     `QWIK_AZURE_TENANT_ID`, `QWIK_AZURE_SUBSCRIPTION_ID`
9. Merge IaC dispatch workflow to default branch **before** enabling source releases.
10. Publish first stable Qwik release; approve IaC `production` if required.
11. Second release + same-release replay + confirm `access-control-demo` and unrelated
    ACR repositories remain unchanged.

### Planner what-if authorization repair

If the planner passes preflight but fails with `AuthorizationFailed` for
`Microsoft.Resources/deployments/whatIf/action`, Reader alone is insufficient.
The foundation now defines and assigns a custom deployment planner role, with
read, validate and what-if actions only, scoped to the workload resource group.
Planning uses `ProviderNoRbac` to retain full provider validation while checking
read permissions rather than deployment write permissions. The protected apply
path retains the default `Provider` validation.

A privileged foundation operator must review the foundation what-if and re-apply
using the bootstrap parameters above (`az deployment sub create` with the same
location, template and parameters). Confirm the planner has Reader and the custom
deployment planner role on `rg-qwik-website-production`, allow RBAC propagation,
then trigger a fresh release dispatch after the fix is merged. Re-running an old
workflow uses its original commit. Do not grant Contributor to the planner or
attempt IAM changes from the release workflow.

## Runtime secrets (demo access link)

The qwik app's "Try the live demo" action reads these env vars:

- `ACA_DEMO_DOMAIN` and `ACA_DEMO_ACCESS_LINK`: non-secret values set in the contract `env`.
- `ACA_GENERAL_ACCESS_CODE`: a Key Vault reference to `qwik-demo-general-access-code` in
  `kv-acd-prod-braddles`.

Operator prerequisites (privileged; run these once before the first deploy that includes the secret):

```bash
# Store the value from a file so it never appears in shell history or logs.
az keyvault secret set --vault-name kv-acd-prod-braddles \
  --name qwik-demo-general-access-code --file ./code.txt --output none
rm ./code.txt

PRINCIPAL_ID=$(az identity show -g rg-qwik-website-production -n id-qwik-website-pull --query principalId -o tsv)
VAULT_ID=$(az keyvault show -n kv-acd-prod-braddles --query id -o tsv)
az role assignment create --role "Key Vault Secrets User" \
  --assignee-object-id "$PRINCIPAL_ID" --assignee-principal-type ServicePrincipal \
  --scope "$VAULT_ID/secrets/qwik-demo-general-access-code"
```

To rotate the code, set a new secret version. Running revisions keep the old value until
they restart; restart the active revision or deploy a new release to pick it up.

## Custom domain and sticky managed certificate

Live production hostnames:

```text
www.braddlesunravels.online   (primary / AZURE_CUSTOM_DOMAIN)
braddlesunravels.online        (additional sticky binding)
```

Managed certificates (environment-scoped, create once):

```text
.../managedCertificates/mc-qwik-www-braddlesunravels-online
.../managedCertificates/mc-qwik-apex-braddlesunravels-online
```

Ownership:

- Primary hostname + cert ID and `additionalCustomDomains[]` live in the IaC catalog.
- Workload contract only sets `customDomain.enabled`.
- Every routine deploy re-asserts all `ingress.customDomains` with `bindingType: SniEnabled`.
- Runtime env always receives `AZURE_CUSTOM_DOMAIN` for the primary hostname only (same name across apps).

Operator DNS prerequisites:

1. `CNAME www` → Container App default FQDN + `TXT asuid.www`
2. Apex `A @` → qwik env static IP + `TXT asuid`
3. Keep `aca.braddlesunravels.online` on its own CNAME (`access-control-demo`); unrelated to apex A

## Rollback

No automatic rollback. Keep last known good digest in GitHub Deployments metadata.
Incident recovery reuses IaC guards with an operator-approved previously verified
digest; do not retag GitHub releases or deploy `latest`.

## Local validation

```bash
npm ci --ignore-scripts
npm test
npm run validate:environment
npm run validate:examples
npm run validate:bicep
npm run validate
bash -n scripts/*.sh
```

## Related documentation

- [../../README.md](../../README.md)
- [../operations.md](../operations.md) — shared ACR platform
- [../../foundations/single-container-web/README.md](../../foundations/single-container-web/README.md)
- [../../stacks/single-container-web/README.md](../../stacks/single-container-web/README.md)
