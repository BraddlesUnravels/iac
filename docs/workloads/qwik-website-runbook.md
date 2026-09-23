# Qwik website release-driven deployment runbook

**Code-only status:** foundation, stack, validators, and workflows are implemented
in this repository. Live Azure foundation apply, GitHub App installation,
environment protection, and the first stable source release require an operator.

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

## Role matrix (fill live assignment IDs after foundation apply)

| Principal | Trusted job | Capability | Must not have |
| --- | --- | --- | --- |
| Publisher UAMI | Qwik `image-publish` | ACR Repository Writer on `qwik-website` only (`2a1e307c-b015-4ebd-883e-5b7698a07328`) | App RG write, other repos |
| Pull UAMI | Attached to ACA | ACR Repository Reader on `qwik-website` only (`b93aa761-3e63-49ed-ac28-beffa264f7ac`) | Writer, RG write |
| Planner UAMI | IaC `production-plan` | RG Reader + what-if + ACR repo Reader | RG write, roleAssignment/write |
| Deployer UAMI | IaC `production` | RG Contributor + MIO on pull identity | Platform RG, roleAssignment/write |
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
11. Second release + same-release replay + confirm access-control-demo/ACR unchanged.

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
