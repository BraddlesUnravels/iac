# access-control-demo platform cutover runbook

Last documentation pass: 2026-10-08.

Generic release mechanics:
[single-container-web-runbook.md](single-container-web-runbook.md).

## Target

| Item | Value |
| --- | --- |
| Resource group | `rg-platform-production` |
| Stack | `single-container-web` |
| ACA environment | `acae-access-control-demo-production` |
| Container app | `aca-access-control-demo` |
| Custom domain | `aca.braddlesunravels.online` |
| Runtime identity | `id-access-control-demo-secrets` |
| Publisher / planner / deployer | `id-access-control-production-{publisher,planner,deployer}` |
| ACR repository | `access-control-demo` |
| Key Vault | `kv-acd-prod-braddles` (already final; do not move) |

## Runtime secrets (Key Vault)

| Env var | Secret name |
| --- | --- |
| `ACCESS_GATE_CODE_SECRET` | `access-gate-code-secret` |
| `ACCESS_GATE_COOKIE_SECRET` | `access-gate-cookie-secret` |
| `NEXT_SUPABASE_URL` | `next-supabase-url` |
| `NEXT_SUPABASE_PUBLISHABLE_KEY` | `next-supabase-publishable-key` |

Architecture rule: Supabase project URL is a **secret**, not plain contract env.

Create/rotate from a trusted workstation only (example pattern):

```bash
# Values via files so they never enter shell history.
az keyvault secret set --vault-name kv-acd-prod-braddles \
  --name next-supabase-url --file ./supabase-url.txt --output none
az keyvault secret set --vault-name kv-acd-prod-braddles \
  --name next-supabase-publishable-key --file ./supabase-publishable.txt --output none
rm ./supabase-url.txt ./supabase-publishable.txt
```

Grant the **new** runtime identity secret-scoped `Key Vault Secrets User` on each
of the four secrets after foundation apply.

## Source repo release shape

Application repository should:

1. Trigger on published `v*` release **and** `workflow_dispatch` from `main`.
2. Test → build → push ACR with publisher OIDC.
3. Run hosted Supabase migrations with GH migration secrets (not runtime secrets).
4. Dispatch IaC:
   - preferred type `single-container-web-release-v1`
   - or alias `access-control-demo-release-v1`
5. Stop GHCR production publish and stop app-repo Azure Bicep apply.

## Cutover status (complete 2026-10-08)

All cutover steps are done:

1. IaC catalog/contract/generic single-container release on `main`.
2. Foundation applied into `rg-platform-production` (separate ACA env + UAMIs).
3. GitHub `ACCESS_CONTROL_DEMO_*` plan/deploy client ids + ACD `image-publish` publisher vars set.
4. KV secrets + secret-scoped RBAC for `id-access-control-demo-secrets`.
5. Managed cert `mc-acae-access-co-aca-braddlesunra-6866` issued; catalog/contract sticky domain enabled.
6. Production releases via ACD `release.yml` → ACR → `single-container-web-release-v1`.
7. GoDaddy `aca` CNAME → platform default FQDN; SNI binding active.
8. Public health: `https://aca.braddlesunravels.online/api/health` → 200.
9. `rg-access-control-demo` deleted. Legacy ACD GitHub `production` env secrets/vars removed.

Default FQDN:
`aca-access-control-demo.greenwave-bd9d2bee.australiaeast.azurecontainerapps.io`

## OIDC subjects

- Publisher:
  `repo:BraddlesUnravels@103235805/access-control-demo@1298659298:environment:image-publish`
- Planner:
  `repo:BraddlesUnravels@103235805/iac@1323677104:environment:production-plan`
- Deployer:
  `repo:BraddlesUnravels@103235805/iac@1323677104:environment:production`

## Out of scope here

- Moving the shared Key Vault again
- Running Supabase migrations inside IaC
- Auto-deploy on every push to main
