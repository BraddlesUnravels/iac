# Azure IaC

Reusable Azure infrastructure and guarded deployment workflows built with Bicep.
This repository owns Azure resource definitions, trusted environment catalogs,
workload contract validation, and infrastructure release mechanics. Application
repositories own application code, tests, Dockerfiles, image builds, and database
migrations.

Coordinates in the production catalog identify a personal lab subscription used
as a public portfolio. They are not credentials.

## Current status

**Documentation last reviewed: 12-10-2026.**

| Area | Repository status |
| --- | --- |
| Static validation | Schemas, contract/image checks, Bicep builds, shell checks, and Checkov are enforced by CI |
| Shared platform | `platform/main.bicep` creates the platform resource group and shared Basic ACR |
| Workload foundation | `foundations/single-container-web/` defines workload ACA environments, identities, and scoped ACR roles |
| Production release | `stacks/single-container-web/` is used by both `qwik-website` and `access-control-demo` |
| Release workflow | `deploy-single-container-release.yml` handles the preferred shared dispatch and both legacy aliases |
| Recorded production topology | Both workloads and the shared ACR/Key Vault are documented in `rg-platform-production`; the old workload resource groups are recorded as deleted |
| Prototypes | `next-supabase` and `qwik-elysia-postgres` are retained for experiments and compile coverage, not production deployment |

The release path validates source release evidence and the workload contract,
plans with a workload planner identity, applies with a workload deployer identity,
and verifies the resulting HTTP endpoint. Runtime secret values stay in Key
Vault; contracts contain approved secret names only.

## Architecture

```text
Application repository        This repository                  Azure
build / test / publish ──────► verify evidence + contract
                               planner what-if
                               protected apply ────────────────► Container App
                               HTTP verification

Trusted environment catalog ─► target and workload bounds
Operator foundation apply ───► identities, ACA environment, scoped roles
```

The production boundary separates the shared platform (ACR and Key Vault) from
workload release templates. Workload what-if validation rejects changes to
shared ACR and Key Vault resources. DNS changes remain manual.

## Repository layout

```text
.github/workflows/       validation, platform deploy, workload releases
docs/                    architecture, operations, workload runbooks, archives
environments/            trusted environment catalog
foundations/             operator-applied workload infrastructure
modules/                 reusable Bicep resource and role modules
platform/                subscription-scoped shared ACR entry point
schemas/                 environment and workload JSON Schemas
scripts/                 validation, parameter rendering, deploy and verification
stacks/                  production release stack and prototypes
tests/                   unit tests and safe/unsafe fixtures
workloads/               per-application production contracts
```

## Workloads and stacks

| Stack | Use | Shape |
| --- | --- | --- |
| `single-container-web` | Production: `qwik-website`, `access-control-demo` | One external Container App per workload; catalog-driven settings and Key Vault references |
| `next-supabase` | Prototype only | Single Container App with prototype Supabase parameter wiring |
| `qwik-elysia-postgres` | Prototype only; production selection is rejected | Qwik UI, Elysia API, and PostgreSQL Flexible Server |

Application CI publishes immutable 40-character Git SHA tags. The IaC release
path resolves and deploys the verified image digest. This repository does not
own application images or database migrations.

## Prerequisites

- Node.js 22 and npm
- Azure CLI and Bicep CLI 0.47.16 for Bicep validation or Azure operations
- ShellCheck 0.11.0 and Checkov 3.3.19 to reproduce the corresponding CI checks

## Validate locally

```bash
npm ci --ignore-scripts
npm run validate
bash -n scripts/*.sh
```

`npm run validate` runs the test suite, environment and workload validation,
and Bicep entry-point builds. CI also runs ShellCheck and scans compiled ARM
templates with Checkov. Static validation does not sign in to Azure.

## Deployment surfaces

| Entry point | Scope | Guidance |
| --- | --- | --- |
| `scripts/deploy-platform.sh` / `deploy-platform.yml` | Shared resource group and ACR only | See [docs/operations.md](docs/operations.md) |
| `scripts/deploy-workload-release.sh` / `deploy-single-container-release.yml` | Catalogued single-container workload release | See [docs/workloads/single-container-web-runbook.md](docs/workloads/single-container-web-runbook.md) |
| `scripts/deploy-stack.sh` | Local prototype helper | Not a production release path |
| Foundation Bicep | Workload infrastructure and identities | Privileged operator operation; review what-if before apply |

## Security invariants

- OIDC and managed identities are used for Azure automation; no client secrets
  or registry passwords are part of the deployment flow.
- Runtime secret values do not pass through GitHub Actions, Bicep parameters,
  artifacts, outputs, or logs.
- Contracts specify Key Vault secret names, not secret values or Azure target
  resource IDs.
- Workload deployment identities do not receive standing resource-group
  Contributor access.
- Workload release what-if must not create, modify, or delete the shared ACR or
  Key Vault.
- Production does not auto-deploy on every push to `main`; the workload runbook
  documents accepted release triggers.

## Documentation

| Document | Purpose |
| --- | --- |
| [docs/operations.md](docs/operations.md) | Shared ACR operations |
| [docs/reusable-iac-design.md](docs/reusable-iac-design.md) | Current architecture and ownership boundaries |
| [docs/workloads/single-container-web-runbook.md](docs/workloads/single-container-web-runbook.md) | Shared production release procedure |
| [docs/workloads/qwik-website-runbook.md](docs/workloads/qwik-website-runbook.md) | Qwik-specific production details |
| [docs/workloads/access-control-demo-runbook.md](docs/workloads/access-control-demo-runbook.md) | Access-control production details and cutover record |
| [platform/README.md](platform/README.md) | Shared platform template |
| [foundations/single-container-web/README.md](foundations/single-container-web/README.md) | Workload foundation template |
| [stacks/single-container-web/README.md](stacks/single-container-web/README.md) | Production release stack |
| [docs/archive/README.md](docs/archive/README.md) | Historical planning records, not current status |
| [docs/archive/handoff-platform-rg-consolidation.md](docs/archive/handoff-platform-rg-consolidation.md) | Archived completion record for the 2026-10-08 consolidation |
