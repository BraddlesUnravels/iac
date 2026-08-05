# Stack: qwik-elysia-postgres

Azure resources for a Qwik UI + Elysia API + PostgreSQL application, matching `fullstack-architecture-demo`.

## Resources

- Azure Database for PostgreSQL Flexible Server + application database
- Container App for Elysia API (external ingress, port 4000)
- Container App for Qwik UI (external ingress, port 3000)
- AcrPull role assignments for both app identities when ACR name is provided

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

The UI URL is only known after the UI app is created. For a first deploy you can leave `corsOriginOverride` empty, then set it to the `uiUrl` output and redeploy so the API receives `CORS_ORIGIN`.

## Prerequisites

1. Platform stack deployed (ACA environment + ACR)
2. API and UI images pushed to ACR
3. Strong PostgreSQL admin password and JWT secret

## Deploy

```bash
cp stacks/qwik-elysia-postgres/main.bicepparam stacks/qwik-elysia-postgres/main.local.bicepparam
# fill platform outputs, images, secrets
./scripts/deploy-stack.sh qwik-elysia-postgres stacks/qwik-elysia-postgres/main.local.bicepparam
```

## Notes

- Public PostgreSQL access with the Azure services firewall rule is intentional for demo simplicity.
- Prefer commit-SHA image tags for immutable releases.
- Redis is out of scope for v1.
