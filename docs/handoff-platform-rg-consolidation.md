# Handoff: platform RG consolidation (Qwik complete)

**Date:** 2026-10-08  
**Repos:** `/Users/radaskey/code/iac` on `main`  
**Prior plan ID:** `04fc63b9-4131-4070-a42a-c56b1c400741`  
**Prior PR:** https://github.com/BraddlesUnravels/iac/pull/19 (squash-merged)

Use a **new chat** for the next stage. This document is the intended context bootstrap.

---

## Goal of the completed phase

Collapse live Azure so Qwik production (and shared secrets) live in **`rg-platform-production`**, not a dedicated Qwik RG. Keep access-control compute where it was for now, but already consuming the platform-hosted Key Vault.

Target layout after this phase:

```text
rg-platform-production
├── braddlesunravelsacr
├── kv-acd-prod-braddles          ← moved here (final home)
├── Qwik: LA, ACA env, UAMIs, Container App, managed certs (www + apex)
└── (later) access-control resources

rg-access-control-demo           ← still exists (compute only for now)
rg-qwik-website-production       ← DELETED
```

---

## Completed

### IaC (merged to `main`)

| Item | Detail |
| --- | --- |
| Merge commit | `c72ff86` — `feat(iac): consolidate Qwik workload into rg-platform-production (#19)` |
| Also on main | `#18` planner RBAC preflight / what-if (`3d5bfef`) |
| Catalog | `workloads.qwik-website.resourceGroup` = `rg-platform-production` |
| Cert IDs | Qwik www + apex cert resource IDs under platform RG / `acae-qwik-website-production` |
| Validators | Workloads may share `platformResourceGroup`; non-platform RGs still unique |
| Foundation | `foundations/single-container-web` deploys into **existing** RG (does not create app RG) |
| RBAC model | Deployer is **not** standing RG Contributor; least-privilege container-app deployer + planner custom role |
| What-if gate | Rejects ACR / Key Vault mutations from a Qwik workload release in the shared RG |
| Docs | README, operations, reusable design, qwik runbook updated for single-platform-RG model |
| CI on #19 | All 7 validate jobs green before squash merge |

### Live Azure / operator cutover

| Step | Status |
| --- | --- |
| Move `kv-acd-prod-braddles` → `rg-platform-production` | Done |
| Restore access-control secret RBAC after move | Done (prior session) |
| Qwik pull identity secret-scoped KV access on moved vault | Done (prior session) |
| Foundation apply into platform RG (new UAMIs / env / app) | Done |
| GitHub OIDC client IDs updated (plan / deploy / publisher) | Done (prior session) |
| Managed certs on **new** env (`mc-qwik-www-…`, `mc-qwik-apex-…`) | Done (`Succeeded`) |
| SNI custom domain bindings on new Container App | Done |
| DNS (GoDaddy) www CNAME + apex A → new env | Done (operator-confirmed in UI; public resolvers matched new targets) |
| HTTP verify www + apex on new stack | Done (200) |
| Delete `rg-qwik-website-production` | **Done** (2026-10-08; brief stall on managed certs, then RG gone) |

### DNS (authoritative)

- Registrar / DNS: **GoDaddy** (`ns27` / `ns28.domaincontrol.com`)
- **www** CNAME → `aca-qwik-website-production.wonderfulsmoke-320e8626.australiaeast.azurecontainerapps.io`
- **apex A `@`** → new env static IP (`4.200.97.130` at cutover time; re-read from Azure if needed)
- **aca** CNAME → platform access-control: `aca-access-control-demo.greenwave-bd9d2bee.australiaeast.azurecontainerapps.io`
- **asuid** / **asuid.www** TXT → Qwik custom domain verification id (platform app)
- TTL was 12h on several records; prefer `@ns27.domaincontrol.com` or `8.8.8.8` when checking propagation (local caches can lag)

### Live resource groups (post-cutover)

| Resource group | State | Role |
| --- | --- | --- |
| `rg-platform-production` | Succeeded | ACR, KV, full Qwik stack |
| `rg-access-control-demo` | **Gone** | — |
| `rg-qwik-website-production` | **Gone** | — |

### Platform RG contents (Qwik + shared)

- `braddlesunravelsacr`
- `kv-acd-prod-braddles`
- `id-qwik-website-{deployer,pull,publisher,planner}`
- `log-qwik-website-production`
- `acae-qwik-website-production`
- `aca-qwik-website-production`
- managed certs: `mc-qwik-www-braddlesunravels-online`, `mc-qwik-apex-braddlesunravels-online`

### Key identities / hosts

| Name | Value |
| --- | --- |
| Subscription | `eb1b0038-3a72-459d-884c-ba2820dc53cc` |
| Tenant | `f1c96730-73a1-4159-81ab-0bb6731c8e75` |
| Location | `australiaeast` |
| Qwik default FQDN suffix | `wonderfulsmoke-320e8626.australiaeast.azurecontainerapps.io` |
| Qwik primary host | `www.braddlesunravels.online` |
| Qwik apex | `braddlesunravels.online` |
| access-control host | `aca.braddlesunravels.online` (platform RG) |
| Shared vault | `kv-acd-prod-braddles` in **platform** RG |

Immutable OIDC subjects (unchanged pattern; client IDs were rotated when UAMIs were recreated — trust GitHub env vars as source of truth):

- Publisher: `repo:BraddlesUnravels@103235805/qwik-website@1367173842:environment:image-publish`
- Planner: `repo:BraddlesUnravels@103235805/iac@1323677104:environment:production-plan`
- Deployer: `repo:BraddlesUnravels@103235805/iac@1323677104:environment:production`

---

## Explicitly out of scope going forward

- Further platform RG RBAC narrowing / subscription policy cleanup
- Auto-deploy on every push to main
- Moving Supabase migration execution into IaC

---

## Next stages (recommended order)

### Stage A — Stabilize Qwik on platform RG (small / hygiene)

1. **Smoke a full release path on `main`**  
   Publish or re-dispatch a Qwik release through IaC `deploy-qwik-release.yml` so plan → approve → apply runs against the shared RG with the merged validators/RBAC.
2. **Confirm GitHub env vars** still match live UAMI client IDs on platform RG (`az identity show`).
3. **Docs fix:** `docs/workloads/qwik-website-runbook.md` bootstrap step still has a stale teardown line that says delete resources in `rg-platform-production` after cutover — should refer to the **old** Qwik RG (already deleted). Correct that on a tiny docs PR.
4. Optional: record live role assignment IDs in the runbook role matrix table (currently placeholders).

### Stage B — access-control → platform RG (main follow-on)

Brownfield migration; do **not** move the Key Vault again (already final).

Rough sequence:

1. **Inventory** live `rg-access-control-demo` (env, app, identities, cert, LA, any remaining role assignments, GHCR vs ACR image source).
2. **IaC model** for access-control on the same patterns as Qwik:
   - catalog `resourceGroup: rg-platform-production`
   - foundation into existing platform RG (separate ACA env / UAMIs / app names)
   - least-privilege planner/deployer (no platform RG Contributor)
   - what-if allowlist must keep protecting ACR + KV from workload releases
3. **Image path:** stop GHCR; publish to `braddlesunravelsacr` + IaC repository_dispatch (or agreed equivalent).
4. **Recreate** access-control compute in platform RG (prefer greenfield ACA env like Qwik; avoid resource-move of managed env/certs).
5. **DNS:** cut over `aca.braddlesunravels.online` only after new certs + SNI bindings verified.
6. **Delete** `rg-access-control-demo` after verification.
7. Keep secrets name-stable in `kv-acd-prod-braddles` where possible.

Design constraints to preserve:

- One platform RG; **separate** Container Apps environments per workload
- Shared ACR with ABAC repo-scoped roles
- Shared KV; secret-scoped assignments; deployer must not set secrets
- Workload what-if must never Create/Modify/Delete ACR or KV

### Stage C — platform hardening / multi-app genericity (later)

- Generic `workflow_call` deploy workflow for multiple apps
- Further RBAC narrowing if platform RG grows
- Any subscription-level policy / naming cleanup

---

## Success criteria checklist

### This phase (Qwik) — met

- [x] Qwik custom-domain traffic served from resources in `rg-platform-production`
- [x] `kv-acd-prod-braddles` in `rg-platform-production`
- [x] IaC release path is the Qwik Azure apply path (code on `main`)
- [x] `rg-qwik-website-production` deleted
- [x] Validators/docs describe single-platform-RG sharing for workloads
- [x] access-control still up in legacy compute RG; vault already final

### Access-control phase — met (2026-10-08)

- [x] access-control compute in `rg-platform-production`
- [x] access-control image/release via shared ACR + IaC dispatch
- [x] `aca.braddlesunravels.online` on platform-hosted app
- [x] `rg-access-control-demo` deleted
- [x] Catalog/runbook describe platform RG + generic single-container path for both apps

---

## Working agreements / pitfalls for the next agent

1. **Do not thrash DNS automation.** GoDaddy is manual operator UI; give exact record diffs only.
2. **Do not delete `rg-platform-production` or the shared KV** when tearing anything down.
3. **Do not grant standing Contributor** on the platform RG to planner/deployer.
4. **UAMI recreate ⇒ new client IDs** ⇒ update GitHub environment variables.
5. **Managed cert / ACA env deletes can stall** RG deletion; delete certs/env explicitly if a RG sticks in `Deleting`.
6. Prefer verifying DNS with authoritative/public resolvers, not only the local cache.
7. Repository merge policy: **squash only** (merge commits rejected).
8. Local validate: `npm ci --ignore-scripts && npm run validate` (Node 22).
9. User coding doctrine skills apply when writing TypeScript outside this IaC repo; this repo is largely mjs/bicep/docs.

---

## Quick verify commands

```bash
# RGs
az group list --query "[?contains(name,'platform') || contains(name,'access-control') || contains(name,'qwik')].name" -o tsv

# Qwik on platform
az containerapp show -g rg-platform-production -n aca-qwik-website-production \
  --query "{fqdn:properties.configuration.ingress.fqdn,domains:properties.configuration.ingress.customDomains}" -o json

# DNS (public)
dig @8.8.8.8 +short www.braddlesunravels.online CNAME
dig @8.8.8.8 +short braddlesunravels.online A
dig @8.8.8.8 +short aca.braddlesunravels.online CNAME

# HTTP
curl -sS -o /dev/null -w '%{http_code}\n' https://www.braddlesunravels.online/
curl -sS -o /dev/null -w '%{http_code}\n' https://braddlesunravels.online/
curl -sS -o /dev/null -w '%{http_code}\n' https://aca.braddlesunravels.online/

# IaC tip
git -C /Users/radaskey/code/iac fetch origin main && git -C /Users/radaskey/code/iac log -1 --oneline origin/main
```

---

## Suggested first prompt for the next chat

> Read `docs/handoff-platform-rg-consolidation.md` in `/Users/radaskey/code/iac`. Qwik consolidation into `rg-platform-production` is complete (PR #19 merged, old Qwik RG deleted). Next stage is migrating **access-control-demo** onto the same platform RG + shared ACR/IaC release path without moving Key Vault again. Inventory live state, propose a plan, and wait for approval before applying.

---

## Related paths

- Catalog: `environments/production.json`
- Qwik contract: `workloads/qwik-website/production.json`
- Qwik runbook: `docs/workloads/qwik-website-runbook.md`
- Foundation: `foundations/single-container-web/`
- Release workflow: `.github/workflows/deploy-qwik-release.yml`
- access-control app repo (still owns legacy deploy): `/Users/radaskey/code/access-control-demo`
