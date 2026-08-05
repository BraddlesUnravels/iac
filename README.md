# Azure IaC

Reusable Azure-only infrastructure as Bicep.

Platform foundation (shared logging, registry, Container Apps environment, optional Key Vault) is separate from application stacks.

## Layout

```text
modules/                         # Composable Bicep modules
platform/                        # Shared foundation stack
stacks/
  next-supabase/                 # Next.js + hosted Supabase (one Container App)
  qwik-elysia-postgres/          # Qwik UI + Elysia API + PostgreSQL Flexible Server
scripts/                         # OIDC bootstrap and deploy helpers
```

## App shapes

| Stack | Compute | Data |
| --- | --- | --- |
| `next-supabase` | Single external Container App (port 3000) | Hosted Supabase (external) |
| `qwik-elysia-postgres` | UI Container App (3000) + API Container App (4000) | Azure Database for PostgreSQL Flexible Server |

Images are built in application CI and pushed to ACR. This repo deploys infrastructure and Container App definitions only.

## Prerequisites

- [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli)
- Bicep CLI (`az bicep install`)
- An Azure subscription and resource group
- GitHub environment secrets/vars when using OIDC deploy from Actions

## Quick start

### 1. Bootstrap GitHub OIDC (once per environment)

```bash
export AZURE_SUBSCRIPTION_ID="<subscription-id>"
export AZURE_RESOURCE_GROUP="rg-demo-platform"
export REPOSITORY_SLUG="owner/repo"
export DEPLOYMENT_ENVIRONMENT="production"

./scripts/bootstrap-oidc.sh
```

Add the printed `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, and related values to the GitHub environment.

### 2. Deploy platform

Copy and edit params:

```bash
cp platform/main.bicepparam platform/main.local.bicepparam
# edit namePrefix, location, etc.
./scripts/deploy-platform.sh platform/main.local.bicepparam
```

### 3. Deploy an app stack

```bash
cp stacks/next-supabase/main.bicepparam stacks/next-supabase/main.local.bicepparam
# set image, supabase values, platform outputs
./scripts/deploy-stack.sh next-supabase stacks/next-supabase/main.local.bicepparam
```

Or for the Qwik / Elysia / Postgres shape:

```bash
cp stacks/qwik-elysia-postgres/main.bicepparam stacks/qwik-elysia-postgres/main.local.bicepparam
./scripts/deploy-stack.sh qwik-elysia-postgres stacks/qwik-elysia-postgres/main.local.bicepparam
```

## Validate locally

```bash
az bicep build --file platform/main.bicep
az bicep build --file stacks/next-supabase/main.bicep
az bicep build --file stacks/qwik-elysia-postgres/main.bicep
```

## Design notes

- Tags always include `application`, `environment`, and `managedBy: bicep`.
- Secrets use `@secure()` parameters or Key Vault; never commit real `.bicepparam` secrets.
- Container Apps default to the Consumption workload profile.
- PostgreSQL Flexible Server defaults to public access with optional firewall rules suitable for demos. Private networking can be added later without changing app stack contracts much.

## Non-goals (v1)

- Multi-cloud / Terraform
- Full VNet isolation
- Redis / messaging
- Application Dockerfiles (remain in app repos)
