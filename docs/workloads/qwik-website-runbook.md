# Qwik website production runbook

Last documentation review: 2026-10-12. The latest recorded live verification is
from the 2026-10-08 cutover; verify current Azure and GitHub configuration before
operational changes.

## Current production path

Qwik uses the shared `single-container-web` stack and release workflow, alongside
`access-control-demo`. The active IaC workflow is
`.github/workflows/deploy-single-container-release.yml`. The older
`.github/workflows/deploy-qwik-release.yml` is a manual notice-only redirect.

The latest recorded production configuration is in:

- Catalog: `environments/production.json`
- Workload contract: `workloads/qwik-website/production.json`
- Foundation: `foundations/single-container-web/`
- Release stack: `stacks/single-container-web/`

The recorded successful cutover moved the Qwik app, its Container Apps
environment, identities, and managed certificates into `rg-platform-production`.
The workload uses a separate environment from access-control.

## Release flow

1. The Qwik application repository tests, builds, and publishes an immutable
   40-character Git SHA image tag to
   `braddlesunravelsacr.azurecr.io/qwik-website`.
2. The source workflow dispatches release evidence to this repository. New
   releases should use `single-container-web-release-v1`; the legacy
   `qwik-website-release-v1` alias remains accepted.
3. The generic IaC workflow verifies source identity, release evidence, image
   digest, and workload contract.
4. The planner validates live permissions and runs the workload-scoped what-if.
5. The protected production job revalidates, applies the Container App release,
   and checks HTTP health.

Do not deploy `latest` or trigger production deployment for every push to
`main`. Full generic release and foundation instructions are in the
[single-container-web runbook](single-container-web-runbook.md).

## Identities and permissions

| Identity | Purpose | Permission boundary |
| --- | --- | --- |
| `id-qwik-website-publisher` | Source image publication | ACR Repository Writer on `qwik-website` only |
| `id-qwik-website-pull` | Container App image pull and Key Vault references | ACR Repository Reader on `qwik-website`; access only to approved secret names |
| `id-qwik-website-planner` | IaC preflight and what-if | Read and deployment validation/what-if only; no deployment write |
| `id-qwik-website-deployer` | Protected workload release | Custom Container App release role; no standing RG Contributor or shared ACR/Key Vault write |

The GitHub OIDC subjects and current client IDs are environment configuration,
not values to copy into contracts. If an identity is recreated, read its new
client ID from Azure and update the corresponding GitHub environment variables.
Do not create client secrets or grant broad Contributor access to fix a release.

## Runtime secret

The contract maps `ACA_GENERAL_ACCESS_CODE` to the Key Vault secret
`qwik-demo-general-access-code`. Non-secret `ACA_DEMO_DOMAIN` and
`ACA_DEMO_ACCESS_LINK` values are configured in the contract. The runtime
identity needs `Key Vault Secrets User` scoped to this secret.

To set or rotate the value, use a trusted workstation and a protected local file;
never place the value in the repository, dispatch payload, Bicep parameters, or
workflow logs. For example:

```bash
az keyvault secret set \
  --vault-name kv-acd-prod-braddles \
  --name qwik-demo-general-access-code \
  --file ./code.txt \
  --output none
```

Remove the local secret file securely after use. A new secret version may not
reach an already-running revision until it restarts or a new release is deployed.

## Custom domains

The catalog owns the hostname and environment-scoped managed certificate IDs.
The contract enables custom-domain bindings; the release stack binds them with
SNI. The primary hostname, `www.braddlesunravels.online`, is injected as
`AZURE_CUSTOM_DOMAIN`. The additional binding is `braddlesunravels.online`.

DNS is managed manually. Verify the current Container App FQDN, environment
static IP, certificate state, and DNS records before any change. Do not copy an
old IP address or certificate identifier from an archived cutover record.
Access-control's `aca.braddlesunravels.online` hostname is a separate binding
and must not be changed as part of Qwik operations.

## Planner authorization troubleshooting

If the planner reports `AuthorizationFailed` for
`Microsoft.Resources/deployments/whatIf/action`, Reader alone is insufficient.
The foundation defines the scoped custom deployment-planner role. Ask a
privileged foundation operator to review and apply the specific role-assignment
repair from
`modules/role-assignment/deployment-planner.bicep`, then allow RBAC propagation
and start a fresh release. A previous workflow run uses its original commit.

Do not grant Contributor to the planner. A release workflow must not repair IAM.
If preflight still fails, use the diagnostics and failure output from the
workflow rather than weakening the permission checks.

## Rollback

There is no automatic rollback. Select only a previously verified image digest,
rerun it through the guarded release path, and verify the health endpoint.
Never retag a release or deploy `latest`.

## Live smoke checks

After deploying, the shared release verifier checks the configured `/health`
probe, the homepage (`/`), and the Access Control Demo project page
(`/projects/access-control-demo`) against the selected production domain. Qwik
City uses `trailingSlash: false`, so the verifier requests the bare project
path; the slash-suffixed form redirects.

## Related documentation

- [Root README](../../README.md)
- [Shared platform operations](../operations.md)
- [Access-control runbook](access-control-demo-runbook.md)
- [Workload foundation](../../foundations/single-container-web/README.md)
- [Production stack](../../stacks/single-container-web/README.md)
- [Consolidation completion record](../archive/handoff-platform-rg-consolidation.md)
