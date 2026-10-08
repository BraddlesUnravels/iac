# Foundation: single-container-web

Subscription-scoped foundation for a single external Container App workload that
pulls from the shared platform ACR.

Used today by **qwik-website** inside **`rg-platform-production`**.

This foundation does **not** deploy the Container App image/revision. Routine
releases use `stacks/single-container-web` via `deploy-qwik-release.yml`.

`access-control-demo` is **not** deployed from this foundation. That brownfield
workload needs its own adopt-in-place foundation (next migration).

## Creates

| Resource | Purpose |
| --- | --- |
| Log Analytics workspace | Environment logging destination for this greenfield shape |
| Container Apps environment | Host for the app |
| Runtime UAMI | ACR repository pull + approved Key Vault secret refs |
| Publisher UAMI + OIDC federated credential | Image push from the app repo |
| Planner UAMI + OIDC federated credential | `what-if` / read path in IaC |
| Deployer UAMI + OIDC federated credential | Container App apply path in IaC |
| Least-privilege deployer custom role | Container App release only (not RG Contributor) |
| Planner custom what-if role | validate/what-if without deploy write |
| ACR ABAC repository roles | Publisher Writer + pull/planner/deployer Reader on one repository only |

Does **not** create: the platform resource group, shared ACR (see `platform/`),
shared Key Vault, Container App revision, custom domain certificates
(operator/certificate resources are catalogued and bound by the release stack),
or `access-control-demo` resources.

## Entry points

- `main.bicep` — subscription scope; deploys into an **existing** platform RG
- `resources.bicep` — resource-group scope resources and identities
- `../../modules/role-assignment/deployment-planner.bicep` — RG-scoped planner-only
  RBAC repair; shared with the full foundation and preserves existing role IDs

## Operator usage

Privileged what-if/apply is manual. Parameter values and OIDC subjects for Qwik
are documented in
[../../docs/workloads/qwik-website-runbook.md](../../docs/workloads/qwik-website-runbook.md).

```bash
az deployment sub what-if \
  --location australiaeast \
  --template-file foundations/single-container-web/main.bicep \
  --parameters <reviewed parameters>
```

Always review the full what-if before apply. Stop on deletions, replacements, or
changes outside the intended workload resource group and approved ACR repository
role assignments.

## Validate

```bash
npm run validate:bicep
```

`scripts/validate-bicep.mjs` includes this foundation entry point.

## Related

- [../../platform/README.md](../../platform/README.md) — shared ACR
- [../../stacks/single-container-web/README.md](../../stacks/single-container-web/README.md) — release stack
- [../../docs/workloads/qwik-website-runbook.md](../../docs/workloads/qwik-website-runbook.md)
