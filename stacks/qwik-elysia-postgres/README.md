# Stack: qwik-elysia-postgres (prototype)

**Status: prototype only — production selection is rejected by validators.**

Azure resources for a Qwik UI + Elysia API + PostgreSQL application shape,
roughly matching `fullstack-architecture-demo` experiments.

This is **not** the production Qwik path. Production Qwik uses
`stacks/single-container-web` with no Azure database.

`access-control-demo` is also **not** deployed by this stack and is not migrated
into this repository yet.

## Intended shape

- Azure Database for PostgreSQL Flexible Server + application database
- Container App for Elysia API (external ingress, port 4000)
- Container App for Qwik UI (external ingress, port 3000)
- Optional classic `AcrPull` role assignments when an ACR name is provided

## Environment wiring

| App | Variables |
| --- | --- |
| API | `PORT`, `API_HOST`, `DATABASE_URL` (secret), `JWT_SECRET` (secret), optional `CORS_ORIGIN` |
| UI | `PORT`, `API_URL`, `PUBLIC_API_URL` (set to deployed API HTTPS URL) |

`DATABASE_URL` is assembled as:

```text
postgresql://{login}:{password}@{fqdn}:5432/{database}?sslmode=require
```

## CORS note

The UI URL is only known after the UI app is created. For a first lab deploy you
can leave `corsOriginOverride` empty, then set it to the `uiUrl` output and
redeploy so the API receives `CORS_ORIGIN`.

## Prerequisites (local prototype deploys)

1. Shared platform ACR exists (`platform/` → ACR only; **not** an ACA environment).
2. A Container Apps environment ID you already control.
3. API and UI images available to that environment.
4. Strong PostgreSQL admin password and JWT secret for lab use only — never commit them.

## Local helper deploy

```bash
cp stacks/qwik-elysia-postgres/main.bicepparam stacks/qwik-elysia-postgres/main.local.bicepparam
# fill environment ID, images, secrets — never commit secrets
./scripts/deploy-stack.sh qwik-elysia-postgres stacks/qwik-elysia-postgres/main.local.bicepparam
```

## Notes

- Public PostgreSQL access with the Azure services firewall rule is intentional for demo simplicity only.
- Prefer commit-SHA image tags.
- Redis remains out of scope.
- Do not enable this stack for the production environment catalog.
