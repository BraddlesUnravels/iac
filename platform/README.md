# Platform stack

Shared Azure foundation for application stacks in the same resource group (or a dedicated platform RG).

## Resources

- Log Analytics workspace
- Azure Container Registry
- Container Apps managed environment (Consumption), wired to Log Analytics
- Optional Key Vault

## Deploy

```bash
# from repo root
cp platform/main.bicepparam platform/main.local.bicepparam
# edit params
./scripts/deploy-platform.sh platform/main.local.bicepparam
```

Or:

```bash
az deployment group create \
  --resource-group rg-shared-production \
  --template-file platform/main.bicep \
  --parameters platform/main.local.bicepparam
```

## Outputs used by app stacks

| Output | Used for |
| --- | --- |
| `containerAppsEnvironmentId` | Parent environment for Container Apps |
| `containerRegistryName` / `containerRegistryLoginServer` | Image pull + AcrPull |
| `containerRegistryId` | Role assignment scope helpers |
| `keyVaultName` / `keyVaultUri` | Optional secret storage |
| `logAnalyticsWorkspaceId` | Diagnostics (already linked to ACA env) |

Copy deployment outputs into the app stack parameter files after platform deploy.
