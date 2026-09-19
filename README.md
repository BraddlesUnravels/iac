# Azure IaC

Reusable Azure infrastructure and deployment validation built with Bicep.

The target architecture uses one shared Azure Container Registry and keeps each workload's Container Apps environment, observability, Key Vault, identities, and certificates within that workload's lifecycle boundary. The first migration adopts the existing `access-control-demo` resources in place.

The approved architecture is summarized in [docs/reusable-iac-design.md](docs/reusable-iac-design.md). The implementation sequence and stop gates are recorded in [agent-tmp-plans/iac-acr-reviewed-implementation-plan.md](agent-tmp-plans/iac-acr-reviewed-implementation-plan.md).

## Implementation status

Phase 1 provides the validation foundation:

- strict environment and workload JSON Schemas;
- semantic validation for approved targets, settings, secrets, and resource bounds;
- immutable image tag and digest validation;
- fixture coverage for unsafe contracts;
- Bicep builds that fail on warnings;
- seven separately visible GitHub Actions validation jobs.

Phase 1 does not deploy or modify Azure resources. The committed fixtures are test data, not a production environment catalog.

## Layout

```text
modules/                         # Composable Bicep modules
platform/                        # Existing shared foundation prototype
schemas/                         # Environment and workload contracts
stacks/
  next-supabase/                 # Next.js + hosted Supabase (one Container App)
  qwik-elysia-postgres/          # Qwik UI + Elysia API + PostgreSQL Flexible Server
scripts/                         # OIDC bootstrap and deploy helpers
tests/                           # Validator tests and safe fixtures
```

## App shapes

| Stack | Compute | Data |
| --- | --- | --- |
| `next-supabase` | Single external Container App (port 3000) | Hosted Supabase (external) |
| `qwik-elysia-postgres` | UI Container App (3000) + API Container App (4000) | Azure Database for PostgreSQL Flexible Server |

Images are built and tested once in application CI. The production design publishes a full Git commit SHA tag to ACR and deploys the resolved digest. This repository owns Azure definitions and deployment validation, not application builds or database migrations.

The existing stacks are prototypes. Neither is production-approved by the new contract yet; `access-control-demo` receives its own adoption-safe stack in a later phase, and `qwik-elysia-postgres` remains production-disabled pending a separate database and networking design.

## Prerequisites

- [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli)
- Bicep CLI (`az bicep install`)
- Node.js 22 and npm

## Validate locally

Install the exact validation dependencies from the lockfile:

```bash
npm ci --ignore-scripts
```

Run all Phase 1 checks:

```bash
npm run validate
```

Run focused checks:

```bash
npm test
npm run validate:environment
npm run validate:examples
npm run validate:bicep
```

The GitHub workflow presents these as separate jobs:

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

The security job compiles every Bicep file to temporary ARM JSON before scanning with Checkov 3.3.19. This avoids Checkov's incomplete parsing of several current Bicep constructs. Narrow exclusions cover the approved Basic/public ACR posture and legacy Key Vault behavior scheduled for removal or hardening in Phase 3; they are documented directly in the workflow and must not expand silently.

## Deployment status

The existing bootstrap and deployment scripts remain available as prototypes and rollback references. Do not use them as the new production workflow. Platform creation, identity bootstrap, workload adoption, and routine release automation are implemented only after their corresponding plan gates and reviewed Azure `what-if` results.

## Design notes

- Tags always include `application`, `environment`, and `managedBy: bicep`.
- Runtime secret values never pass through Bicep, repository files, GitHub Secrets, workflow inputs, artifacts, outputs, or logs.
- Application contracts declare approved Key Vault secret names only; Container Apps resolves runtime values directly.
- Non-secret Supabase runtime values are supplied later through approved GitHub environment variables and validated by name.
- Container Apps default to the Consumption workload profile.
- The PostgreSQL stack is experimental and cannot be selected for production.

## Non-goals (v1)

- Multi-cloud / Terraform
- Full VNet isolation
- Redis / messaging
- Application Dockerfiles (remain in app repos)
