# Stack: next-supabase (prototype)

**Status: prototype only — not a production deploy path.**

Single Azure Container App shape for a Next.js frontend/BFF that uses hosted
Supabase. Kept for experimentation and Bicep compile coverage.

Production work uses `stacks/single-container-web` for both `qwik-website` and
`access-control-demo`. This prototype is not the production stack or a migration
target.

Do not treat this prototype as the access-control production implementation.
Production access-control uses `NEXT_SUPABASE_*` environment names backed by Key
Vault references; this prototype still demonstrates an older parameter style.

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
- Do not introduce this prototype's raw secret parameter pattern into production.
  Production deployments use the catalogued contract and Key Vault references.
