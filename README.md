# Azure IaC

Reusable Azure infrastructure and deployment validation built with Bicep.

This repository owns Azure resource definitions, environment catalogs, contract
validation, and guarded deployment workflows. Application repositories own
application code, tests, Dockerfiles, image builds, and database migrations.

Coordinates such as subscription, tenant, and resource names in this repository
are for a personal lab subscription used as a public portfolio. Treat them as
examples of the contract model, not as shared production credentials.

## Current status (2026-10-08)

| Area | Status |
| --- | --- |
| Static validation (schemas, contracts, images, Bicep, ShellCheck, Checkov) | Implemented and enforced in CI |
| Shared platform RG (`rg-platform-production`) | Hosts ACR, shared Key Vault, and Qwik workload resources |
| Shared platform ACR (`braddlesunravelsacr`) | Deployed, verified, idempotent `what-if` |
| Qwik website foundation + release path | Implemented; foundation deploys into existing platform RG; release via generic single-container workflow |
| Sticky custom domains for Qwik (`www` + apex) | Implemented in catalog, stack, and module |
| `access-control-demo` | **Catalog + contract + generic release path in IaC; compute still live in legacy RG until foundation/cutover** |
| Generic single-container release workflow | Implemented (`deploy-single-container-release.yml`; per-app dispatch aliases retained) |
| Prototype stacks (`next-supabase`, `qwik-elysia-postgres`) | Present for shape experiments; not production paths |

**Consolidation:** Qwik and shared secrets target `rg-platform-production` only.
Move `kv-acd-prod-braddles` into the platform RG before Qwik cutover so secrets
are never left in a throwaway group. Delete `rg-qwik-website-production` only
after verified DNS cutover.

**Next operator steps for access-control:** apply foundation UAMIs/env into
`rg-platform-production`, seed KV secrets (`next-supabase-url`,
`next-supabase-publishable-key`, access-gate names), wire GitHub client IDs,
cut app-repo release to ACR + dispatch, issue certs, DNS cutover, delete legacy RG.

## Architecture

```text
Application repo                This repo (iac)                 Azure
─────────────────               ─────────────────               ─────
build / test / image  ──push──► shared ACR
release dispatch      ───────►  validate contract
                                plan (what-if)
                                protected apply
                                health verify          ───────► workload RG
```

Security lanes (enforced for the Qwik path; same model planned for
`access-control-demo`):

1. **Foundation operator** — creates RGs, identities, OIDC trusts, role assignments (manual / privileged).
2. **Publisher** — writes only the workload ACR repository.
3. **Planner** — read + `what-if` only.
4. **Deployer** — updates the Container App release surface only.
5. **Runtime pull identity** — pulls only the workload ACR repository (and later Key Vault refs where required).

Platform vs workload boundary:

```text
rg-platform-production
├── braddlesunravelsacr                 # shared Basic ACR
├── kv-acd-prod-braddles                # shared Key Vault (final home)
├── Qwik foundation + app (this repo)
│   ├── Log Analytics, ACA env, UAMIs, ABAC repo roles
│   └── Container App + sticky custom domains
└── access-control foundation + app (in progress cutover)
    ├── Log Analytics, ACA env, UAMIs, ABAC repo roles
    └── Container App + custom domain (after cert + DNS)

rg-access-control-demo                 # legacy compute until cutover complete
```

Deployer identities use a least-privilege custom role (Container App release
surface only), not RG Contributor, because the platform RG also hosts ACR and
Key Vault.

Design detail: [docs/reusable-iac-design.md](docs/reusable-iac-design.md).  
Platform ops: [docs/operations.md](docs/operations.md).  
Qwik release ops: [docs/workloads/qwik-website-runbook.md](docs/workloads/qwik-website-runbook.md).  
Historical plans (not live status): [docs/plans/](docs/plans/).

## Layout

```text
.github/workflows/
  validate.yml                 # seven static validation jobs on every PR/push
  deploy-platform.yml          # guarded shared-ACR platform deploy
  deploy-single-container-release.yml  # generic single-container release path
  deploy-qwik-release.yml      # legacy notice alias (dispatch handled generically)
docs/
  operations.md                # shared ACR operations
  reusable-iac-design.md       # durable architecture
  workloads/                   # per-workload runbooks
  plans/                       # historical implementation plans
environments/
  production.json              # trusted catalog (targets, bounds, identities)
foundations/
  single-container-web/        # RG, ACA env, identities, ACR ABAC roles
modules/                       # composable Bicep modules
platform/                      # subscription entry point for shared ACR
schemas/                       # environment + workload JSON Schemas
scripts/                       # validate, render, deploy, verify helpers
stacks/
  single-container-web/        # production release stack (Qwik + access-control)
  next-supabase/               # prototype only
  qwik-elysia-postgres/        # prototype only (production-disabled)
tests/                         # validators + safe/unsafe fixtures
workloads/
  qwik-website/production.json
  access-control-demo/production.json
```

## App shapes

| Stack | Role | Compute | Data |
| --- | --- | --- | --- |
| `single-container-web` | **Production path** (Qwik + access-control-demo) | One external Container App | App-specific; ACD uses hosted Supabase via KV secret refs |
| `next-supabase` | Prototype | One external Container App (port 3000) | Hosted Supabase (external; not production) |
| `qwik-elysia-postgres` | Prototype | UI + API Container Apps | Azure PostgreSQL Flexible Server |

Images are built and tested in application CI, published to ACR as a full
40-character Git SHA tag, and deployed by digest. This repository does not own
application Dockerfiles or database migrations.

## Prerequisites

- [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli)
- Bicep CLI 0.47.16 (`az bicep install --version v0.47.16`)
- Node.js 22 and npm

## Validate locally

```bash
npm ci --ignore-scripts
npm run validate
```

Focused checks:

```bash
npm test
npm run validate:environment
npm run validate:examples
npm run validate:bicep
bash -n scripts/*.sh
```

CI presents the same surface as separate jobs:

```text
01 / Schema tests
02 / Contract and image tests
03 / Bicep build
04 / Shell validation
05 / Security scan
06 / Validation examples
07 / Validation summary
```

Ordinary validation never signs in to Azure.

The security job compiles every Bicep file to temporary ARM JSON, then scans
with Checkov 3.3.19. Narrow exclusions cover the approved Basic/public ACR
posture and the legacy Key Vault module still present for future brownfield
work; they are documented in the workflow and must not expand silently.

## Deployment surfaces

| Workflow / script | Scope | Notes |
| --- | --- | --- |
| `deploy-platform.yml` / `scripts/deploy-platform.sh` | Shared ACR only | Manual, protected, confirmation phrase required |
| `deploy-single-container-release.yml` / `scripts/deploy-workload-release.sh` | Any catalogued `single-container-web` app | Source dispatch; plan then protected apply; per-app client IDs |
| `scripts/deploy-stack.sh` | Local prototype stack helper | Not a production path |

See [docs/operations.md](docs/operations.md) before any platform preview or apply.
See [docs/workloads/qwik-website-runbook.md](docs/workloads/qwik-website-runbook.md) for Qwik bootstrap and release.

## Design notes

- Tags always include `application`, `environment`, and `managedBy: bicep`.
- Runtime secret values never pass through Bicep, repository files, GitHub Secrets, workflow inputs, artifacts, outputs, or logs.
- Application contracts declare approved Key Vault secret **names** only (when secrets exist). Values never enter GitHub or Bicep parameters.
- access-control runtime Supabase URL and publishable key are **Key Vault secrets**, not plain contract env or GH-injected Container App secrets.
- Container Apps default to the Consumption workload profile.
- Custom domain hostnames and certificate resource IDs live in the environment catalog; the workload contract only toggles `customDomain.enabled`.
- The PostgreSQL prototype stack cannot be selected for production.

## Non-goals (current generation)

- Multi-cloud / Terraform
- Full VNet isolation
- Redis / messaging
- Application Dockerfiles (remain in app repos)
- Automatic teardown of platform or brownfield workload resources
- Auto-deploy on every push to main (tag or manual main dispatch only)

## Documentation map

| Document | Purpose |
| --- | --- |
| [docs/reusable-iac-design.md](docs/reusable-iac-design.md) | Approved architecture and remaining work |
| [docs/operations.md](docs/operations.md) | Shared ACR what-if / apply / verify |
| [docs/workloads/qwik-website-runbook.md](docs/workloads/qwik-website-runbook.md) | Qwik foundation + release operations |
| [platform/README.md](platform/README.md) | Platform entry point |
| [foundations/single-container-web/README.md](foundations/single-container-web/README.md) | Workload foundation template |
| [stacks/single-container-web/README.md](stacks/single-container-web/README.md) | Production release stack |
| [docs/plans/](docs/plans/) | Archived phase plans (historical) |
