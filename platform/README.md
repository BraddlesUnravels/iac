# Shared platform

Phase 2 defines the smallest shared Azure platform:

```text
rg-platform-production
└── braddlesunravelsacr (Basic ACR)
```

The subscription-scoped template creates the resource group and deploys the registry through `modules/container-registry/main.bicep`. It creates no identities, role assignments, credentials, Key Vaults, logging resources, Container Apps resources, or image access.

Production coordinates come only from `environments/production.json`. `main.example.bicepparam` is documentation and compilation support; deployment scripts never consume it for production.

## Validate

```bash
npm run validate:bicep
az bicep build-params --file platform/main.example.bicepparam --stdout
```

## Preview

After completing the prerequisites in [../docs/operations.md](../docs/operations.md):

```bash
./scripts/deploy-platform.sh what-if environments/production.json
```

Review the normalized result before any apply. The workflow and script reject changes outside the approved resource group and registry.

## Outputs

| Output | Purpose |
| --- | --- |
| `platformResourceGroupId` / `platformResourceGroupName` | Approved platform boundary |
| `containerRegistryId` / `containerRegistryName` | Future Phase 3 role-assignment scope |
| `containerRegistryLoginServer` | Future image publication and pull configuration |
| `containerRegistryLocation` | Live-state verification |
| `containerRegistrySku` | Confirms Basic SKU |
| `containerRegistryRoleAssignmentMode` | Confirms ABAC repository mode |

Repository Reader/Writer assignments are deliberately deferred to Phase 3.
