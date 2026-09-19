# Shared ACR operations

Phase 2 manages only one platform resource group and one empty shared Azure Container Registry. It creates no role assignments and grants no image push or pull access.

Current live state:

```text
Subscription: eb1b0038-3a72-459d-884c-ba2820dc53cc
Resource group: rg-platform-production
Registry: braddlesunravelsacr
Creation deployment: platform-platform-production-20149e3a-20260919015509
Verification: passed
Repeat what-if: NoChange
Exact-scope role assignments: 0
```

## Supported tools

- Node.js 22
- Azure CLI 2.89 or later
- Bicep CLI 0.47.16
- ShellCheck 0.11.0
- Checkov 3.3.19

Run static validation without Azure authentication:

```bash
npm ci --ignore-scripts
npm run validate
bash -n scripts/*.sh
```

## Authentication

Authenticate deliberately to subscription `eb1b0038-3a72-459d-884c-ba2820dc53cc` in tenant `f1c96730-73a1-4159-81ab-0bb6731c8e75`. The scripts verify both values and never call `az account set`.

The GitHub workflow requires two user-assigned identities and federated credentials:

- `PLATFORM_PLAN_CLIENT_ID`: repository-level variable for read and subscription what-if only;
- `PLATFORM_DEPLOY_CLIENT_ID`: `platform-production` environment variable for approved control-plane deployment;
- `PLATFORM_AZURE_TENANT_ID`: non-secret tenant variable;
- `PLATFORM_AZURE_SUBSCRIPTION_ID`: non-secret subscription variable.

Neither identity receives ACR data-plane access or role-assignment permissions in Phase 2. Do not configure a client secret, publish profile, registry password, or Azure credential JSON.

## Required preflight

Before a preview from a new operator or automation identity:

1. Confirm `braddlesunravelsacr` resolves to the approved registry ID.
2. Confirm `Microsoft.ContainerRegistry` remains registered.
3. Confirm `Microsoft.Resources` is registered.
4. Confirm the planner/deployer identities and effective scopes.
5. Configure required reviewers and disable self-review on `platform-production`.
6. Ensure Bicep CLI 0.47.16 is installed.

## What-if

Run a non-mutating preview:

```bash
./scripts/deploy-platform.sh what-if environments/production.json
```

The validator permits only these targets:

```text
/subscriptions/eb1b0038-3a72-459d-884c-ba2820dc53cc/resourceGroups/rg-platform-production
/subscriptions/eb1b0038-3a72-459d-884c-ba2820dc53cc/resourceGroups/rg-platform-production/providers/Microsoft.ContainerRegistry/registries/braddlesunravelsacr
```

Creation and `NoChange` are safe. A `Modify` result requires explicit human review. Any deletion, unrelated target, unsupported change type, diagnostic, or incomplete expansion is a stop condition.

The registry template explicitly records Azure's existing Microsoft-managed encryption and task-bypass defaults so repeat what-if does not propose deleting service-populated values.

## Apply

Apply only after the exact what-if is reviewed:

```bash
export PLATFORM_APPLY_CONFIRMATION='deploy rg-platform-production/braddlesunravelsacr'
./scripts/deploy-platform.sh apply environments/production.json
unset PLATFORM_APPLY_CONFIRMATION
```

Apply reruns what-if, deploys incrementally, and immediately verifies live state. It never requests registry credentials.

## Verification and history

Verify independently:

```bash
./scripts/verify-platform.sh environments/production.json
```

Inspect subscription deployment history without retrieving credentials:

```bash
az deployment sub list --query "[?starts_with(name, 'platform-')].{name:name,state:properties.provisioningState,timestamp:properties.timestamp}" --output table
```

A second what-if should be materially empty. Record the source commit, deployment name, resource-group ID, registry ID, and verification result.

## Failure recovery

If creation fails, preserve deployment operations, correct Bicep or the catalog, rerun static validation, and obtain a new what-if. Do not repair the platform manually in the portal.

If the registry exists but verification fails, do not delete it automatically. Stop if remediation proposes replacement, deletion, a different name or region, or broader network/authentication access.

Deletion is not a Phase 2 operation. It requires a separate guarded teardown plan even while the registry is empty.