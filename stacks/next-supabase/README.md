# Stack: next-supabase

Single Azure Container App for a Next.js frontend/BFF that uses hosted Supabase.

Matches the shape used by `access-control-demo`:

- External ingress on port 3000
- `NEXT_PUBLIC_SUPABASE_URL` + publishable key secret
- Health probes on `/api/health`
- Optional AcrPull for the app system-assigned identity

## Prerequisites

1. Platform stack deployed (ACA environment + ACR)
2. Application image pushed to ACR
3. Supabase project URL and publishable key

## Deploy

```bash
cp stacks/next-supabase/main.bicepparam stacks/next-supabase/main.local.bicepparam
# fill platform outputs, image, supabase values
./scripts/deploy-stack.sh next-supabase stacks/next-supabase/main.local.bicepparam
```

## Notes

- Supabase is external; this stack does not create Postgres.
- Prefer commit-SHA image tags for immutable releases.
