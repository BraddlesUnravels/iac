# Stack: next-supabase (prototype)

**Status: prototype only — not a production deploy path.**

Single Azure Container App shape for a Next.js frontend/BFF that uses hosted
Supabase. Kept for experimentation and Bicep compile coverage.

Production work uses:

- `stacks/single-container-web` for greenfield single-app releases (Qwik today)
- a future dedicated brownfield stack for `access-control-demo` (next migration;
  **not deployed from this repository yet**)

Do not treat this prototype as the access-control migration target. In
particular, production access-control uses `NEXT_SUPABASE_*` names and Key Vault
references; this prototype still demonstrates an older parameter style.

## Intended shape

- External ingress on port 3000
- Health probes on `/api/health`
- Optional system-assigned identity + classic `AcrPull` when an ACR name is provided
- Supabase URL + publishable key wired as container env/secret parameters
  (prototype only; not acceptable for the production secret model)

## Prerequisites (local prototype deploys)

1. Shared platform ACR exists (`platform/` → ACR only; **not** an ACA environment).
2. A Container Apps environment ID you already control (foundation or lab).
3. Application image available to the target registry/environment.
4. Supabase project URL and publishable key for lab use only.

## Local helper deploy

```bash
cp stacks/next-supabase/main.bicepparam stacks/next-supabase/main.local.bicepparam
# fill environment ID, image, lab supabase values — never commit secrets
./scripts/deploy-stack.sh next-supabase stacks/next-supabase/main.local.bicepparam
```

`scripts/deploy-stack.sh` is a convenience helper, not the guarded production
release path.

## Notes

- Supabase is external; this stack does not create Postgres.
- Prefer commit-SHA image tags even in lab deploys.
- Production migration must replace raw secret parameters with Key Vault refs and
  catalog-driven non-secret settings.
