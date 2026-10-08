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

## Cutover sequence

1. Merge IaC catalog/contract/workflow changes (this repo).
2. Foundation what-if + apply for access-control names into platform RG.
3. Set GitHub client id variables (`ACCESS_CONTROL_DEMO_*`).
4. Seed KV secrets + secret-scoped RBAC for new runtime identity.
5. Create managed cert on new env; replace catalog placeholder cert id; merge.
6. First release (tag or manual main); approve plan/apply; verify default FQDN `/api/health`.
7. Bind custom domain SNI; operator updates GoDaddy `aca` CNAME to new FQDN.
8. Verify `https://aca.braddlesunravels.online/api/health`.
9. Decommission `rg-access-control-demo` (delete certs/env explicitly if RG sticks).

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
