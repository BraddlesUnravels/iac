# Azure IaC

Reusable Azure infrastructure and deployment validation built with Bicep.

This repository owns Azure resource definitions, environment catalogs, contract
validation, and guarded deployment workflows. Application repositories own
application code, tests, Dockerfiles, image builds, and database migrations.

Coordinates such as subscription, tenant, and resource names in this repository
are for a personal lab subscription used as a public portfolio. Treat them as
examples of the contract model, not as shared production credentials.

## Current status (2026-09-24)

| Area | Status |
| --- | --- |
| Static validation (schemas, contracts, images, Bicep, ShellCheck, Checkov) | Implemented and enforced in CI |
| Shared platform ACR (`rg-platform-production` / `braddlesunravelsacr`) | Deployed, verified, idempotent `what-if` |
| Qwik website foundation + release path | Implemented; release-driven deploy via `deploy-qwik-release.yml` |
| Sticky custom domains for Qwik (`www` + apex) | Implemented in catalog, stack, and module |
| `access-control-demo` | **Catalogued only — not deployed or migrated by this repository yet** |
| Generic reusable `workflow_call` deploy/teardown | Not implemented (Qwik uses IaC-owned `repository_dispatch`) |
| Prototype stacks (`next-supabase`, `qwik-elysia-postgres`) | Present for shape experiments; not production paths |

**Next migration:** adopt and deploy `access-control-demo` through this
repository (brownfield foundation + Key Vault secret references + hosted
Supabase migration job + parity checks). Until that work lands, the live
access-control app continues to run on its existing application-repo workflow
and is intentionally outside this IaC deploy surface.

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
└── braddlesunravelsacr          # shared Basic ACR only

rg-qwik-website-production       # Qwik foundation + app (this repo)
├── Log Analytics, ACA env, UAMIs, ABAC repo roles
└── Container App + sticky custom domains

rg-access-control-demo           # existing live app (not yet managed here)
└── still owned by the application deployment path until migration
```

Design detail: [docs/reusable-iac-design.md](docs/reusable-iac-design.md).  
Platform ops: [docs/operations.md](docs/operations.md).  
Qwik release ops: [docs/workloads/qwik-website-runbook.md](docs/workloads/qwik-website-runbook.md).  
Historical plans (not live status): [docs/plans/](docs/plans/).

## Layout

```text
.github/workflows/
  validate.yml                 # seven static validation jobs on every PR/push
  deploy-platform.yml          # guarded shared-ACR platform deploy
  deploy-qwik-release.yml      # release-driven Qwik Container App deploy
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
  single-container-web/        # production release stack (Qwik)
  next-supabase/               # prototype only
  qwik-elysia-postgres/        # prototype only (production-disabled)
tests/                         # validators + safe/unsafe fixtures
workloads/
  qwik-website/production.json # committed non-secret workload contract
```

## App shapes

| Stack | Role | Compute | Data |
| --- | --- | --- | --- |
| `single-container-web` | **Production path** (Qwik today) | One external Container App | None in Azure (static/SSR app) |
| `next-supabase` | Prototype | One external Container App (port 3000) | Hosted Supabase (external) |
| `qwik-elysia-postgres` | Prototype | UI + API Container Apps | Azure PostgreSQL Flexible Server |
| `access-control-demo` | **Next migration** | Catalogued; stack/foundation not in repo yet | Hosted Supabase + Key Vault secrets |

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
| `deploy-qwik-release.yml` / `scripts/deploy-workload-release.sh` | Qwik Container App only | Triggered by source release dispatch; plan then protected apply |
| `scripts/deploy-stack.sh` | Local prototype stack helper | Not a production path |
| `access-control-demo` | — | **Not deployed from this repository yet** |

See [docs/operations.md](docs/operations.md) before any platform preview or apply.
See [docs/workloads/qwik-website-runbook.md](docs/workloads/qwik-website-runbook.md) for Qwik bootstrap and release.

## Design notes

- Tags always include `application`, `environment`, and `managedBy: bicep`.
- Runtime secret values never pass through Bicep, repository files, GitHub Secrets, workflow inputs, artifacts, outputs, or logs.
- Application contracts declare approved Key Vault secret **names** only (when secrets exist). Qwik currently has an empty secret set.
- Non-secret external settings (for example future Supabase URL/key names) come from allow-listed GitHub environment variables resolved through the catalog.
- Container Apps default to the Consumption workload profile.
- Custom domain hostnames and certificate resource IDs live in the environment catalog; the workload contract only toggles `customDomain.enabled`.
- The PostgreSQL prototype stack cannot be selected for production.

## Non-goals (current generation)

- Multi-cloud / Terraform
- Full VNet isolation
- Redis / messaging
- Application Dockerfiles (remain in app repos)
- Automatic teardown of platform or brownfield workload resources
- Deploying `access-control-demo` before its dedicated migration (next)

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
