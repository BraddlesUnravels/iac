# Foundation: single-container-web

Subscription-scoped foundation for a single external Container App workload that
pulls from the shared platform ACR.

Used today by **qwik-website** (`rg-qwik-website-production`).

This foundation does **not** deploy the Container App image/revision. Routine
releases use `stacks/single-container-web` via `deploy-qwik-release.yml`.

`access-control-demo` is **not** deployed from this foundation. That brownfield
workload needs its own adopt-in-place foundation (next migration).

## Creates

| Resource | Purpose |
| --- | --- |
| Workload resource group | Isolation boundary for the app |
| Log Analytics workspace | Environment logging destination for this greenfield shape |
| Container Apps environment | Host for the app |
| Runtime UAMI | ACR repository pull (and future Key Vault refs if needed) |
| Publisher UAMI + OIDC federated credential | Image push from the app repo |
| Planner UAMI + OIDC federated credential | `what-if` / read path in IaC |
| Deployer UAMI + OIDC federated credential | Container App apply path in IaC |
| ACR ABAC repository roles | Publisher Writer + pull/planner/deployer Reader on one repository only |

Does **not** create: shared ACR (see `platform/`), Container App revision, Key Vault,
custom domain certificates (operator/certificate resources are catalogued and
bound by the release stack), or `access-control-demo` resources.

## Entry points

- `main.bicep` — subscription scope; creates the resource group and nested deployment
- `resources.bicep` — resource-group scope resources and role assignments

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
