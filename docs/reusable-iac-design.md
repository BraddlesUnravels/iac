# Reusable Azure IaC design

**Status:** Current production design. Shared ACR and Key Vault are in the
platform resource group; `qwik-website` and `access-control-demo` use the shared
single-container foundation and release stack.

Last reviewed: 2026-10-12. The live topology described here follows the latest
recorded operator verification (2026-10-08); it was not independently checked
against Azure as part of this documentation review.

Older implementation plans are retained in [plans/](plans/) as historical
records. They are not current deployment guidance.

## Goal and ownership

This repository owns Azure resource definitions, environment target resolution,
workload contract validation, and guarded infrastructure deployment. Application
repositories own source, tests, Dockerfiles, image publication, and application
database migrations.

| Concern | Application repository | IaC repository | Operator / Azure |
| --- | --- | --- | --- |
| Source, tests, Dockerfile | Owns | Does not own | N/A |
| Image build and immutable tag | Builds and publishes | Verifies evidence and consumes digest | ACR stores image |
| Database migrations | Owns and runs | Does not run | Target database applies them |
| Runtime settings | Proposes contract values | Validates against policy and deploys | Container App receives them |
| Runtime secret values | Does not commit or dispatch them | Declares approved secret references only | Operator manages values in Key Vault |
| Azure resources | Does not define production infrastructure | Owns Bicep modules, foundations, and stacks | Approves privileged foundation operations |
| Deployment target | Names the workload/application | Resolves targets from the trusted catalog | Maintains Azure and GitHub identity configuration |
| Production approval | Publishes a release dispatch | Uses protected IaC environments | Reviewer approves apply |

The contract does not accept arbitrary subscription, resource-group, Bicep path,
resource ID, certificate ID, or Key Vault URL input from an application
repository. These targets are resolved from the trusted catalog.

## Current implementation

| Capability | Implementation |
| --- | --- |
| Environment and workload schemas | `schemas/` |
| Semantic validation and release evidence checks | `scripts/validate-*.mjs`, `scripts/verify-*.mjs` |
| Unit tests and unsafe-input fixtures | `tests/` |
| Static CI, including compiled-template security scan | `.github/workflows/validate.yml` |
| Shared platform ACR | `platform/`, `modules/container-registry/` |
| Platform preview/apply/verification | `scripts/deploy-platform.sh`, `.github/workflows/deploy-platform.yml` |
| Workload identities, ACA environments, and repository-scoped ACR roles | `foundations/single-container-web/` |
| Guarded workload release and HTTP verification | `stacks/single-container-web/`, `.github/workflows/deploy-single-container-release.yml`, `scripts/deploy-workload-release.sh` |
| Trusted production targets and workload bounds | `environments/production.json` |
| Production contracts | `workloads/qwik-website/`, `workloads/access-control-demo/` |

The generic workflow accepts `single-container-web-release-v1` and the legacy
per-application dispatch aliases. The aliases remain supported for compatibility;
new dispatches should use the generic event type and include the application key.
The legacy `deploy-qwik-release.yml` workflow is a notice-only manual redirect,
not the active Qwik deploy workflow.

## Topology and release boundaries

```text
rg-platform-production
├── shared Azure Container Registry
├── shared Key Vault
├── qwik-website foundation and Container App
└── access-control-demo foundation and Container App
```

Each workload has a separate Container Apps environment and identities. The
foundation is applied by a privileged operator and creates the workload
environment, Log Analytics workspace, managed identities, federated credentials,
and narrowly scoped ACR roles. Routine releases update the Container App release
surface; they do not create or modify the shared ACR, Key Vault, foundation
identities, or environment.

Release sequence:

1. Application CI tests, builds, and publishes an immutable image to its
   repository in the shared ACR.
2. The application dispatches release evidence to the IaC repository.
3. IaC validates the payload, caller identity, contract, catalog, and image.
4. The planner runs preflight and a scoped what-if.
5. The protected deploy job revalidates and applies the approved workload
   release.
6. The workflow verifies the deployed revision and HTTP health endpoint.

DNS remains a manual operator action. Do not cut over a hostname until the
managed certificate and SNI binding are ready and the new endpoint is healthy.

## Security lanes

1. **Foundation operator:** creates or updates identities, federated credentials,
   and role assignments after reviewing the complete what-if.
2. **Publisher identity:** writes only its workload's ACR repository.
3. **Planner identity:** reads and runs validation/what-if; it cannot deploy.
4. **Deployer identity:** updates the workload Container App release surface;
   it is not granted standing resource-group Contributor.
5. **Runtime identity:** pulls only the workload's ACR repository and reads only
   approved Key Vault secret references.

Workload what-if is fail-closed: it rejects unrelated resource targets and
mutations to shared ACR or Key Vault, including when those resources are in the
same resource group as the workload.

## Workload contracts and secrets

The trusted catalog at `environments/production.json` resolves subscription,
resource group, ACR, Container Apps environment, identities, Key Vault, allowed
secrets, hostname/certificate IDs, and resource bounds. Each workload contract
contains only workload-level configuration, such as:

- an approved stack and environment;
- container port, health path, CPU/memory, and replica bounds;
- approved non-secret environment variables;
- Key Vault secret names mapped to approved environment variable names; and
- whether catalog-defined custom domains should be bound.

Secret values are written to Key Vault by an operator. They are never passed
through the application dispatch, GitHub Actions, rendered deployment
parameters, or Bicep.

## Prototypes and retained helpers

- `stacks/next-supabase/` and `stacks/qwik-elysia-postgres/` are prototypes.
  Production validation does not permit selecting them.
- `scripts/deploy-stack.sh` is a local prototype helper, not a production path.
- `scripts/bootstrap-oidc.sh` is not part of the production path. It grants
  resource-group Contributor and changes the active Azure subscription; do not
  use it to provision production identities or permissions.
- `modules/key-vault/main.bicep` is not referenced by a production entry point.
  Its legacy defaults disable purge protection and accept raw secret values as
  deployment parameters, so it must not be used for production secret management.
- `modules/role-assignment/main.bicep` has no current template callers. Confirm
  there is no external or manual consumer before removing it.

These files remain in the repository for experimentation, migration history, or
compile/security coverage. Their presence does not authorize production use.

## Validation and operations

Run static checks locally:

```bash
npm ci --ignore-scripts
npm run validate
bash -n scripts/*.sh
```

CI also runs ShellCheck and Checkov against compiled ARM templates. Bicep entry
points and the platform/workload operational procedures are listed in the root
[README](../README.md). For operational changes, follow
[operations.md](operations.md) and the relevant workload runbook; do not use the
historical phase plans as instructions.
