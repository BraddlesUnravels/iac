# Stack: single-container-web

Production release stack for one external Azure Container App.

**Current consumer:** `qwik-website`  
**Contract:** `workloads/qwik-website/production.json`  
**Deploy workflow:** `.github/workflows/deploy-qwik-release.yml`

This stack is the supported production path. Prototype stacks under
`next-supabase` and `qwik-elysia-postgres` are not production paths.

This repository does **not** deploy `access-control-demo` with this stack. That
app remains on its existing pipeline until a dedicated brownfield stack and
foundation are added (next migration).

## Prerequisites

1. Shared platform ACR deployed (`platform/`, see [../../docs/operations.md](../../docs/operations.md)).
2. Workload foundation applied (`foundations/single-container-web/`) so the
   Container Apps environment, runtime pull identity, and ACR repository roles exist.
3. Image published to the approved ACR repository as a full 40-character Git SHA tag.
4. If custom domains are enabled, catalog hostnames + managed certificate resource
   IDs must already exist; the stack re-binds them and does not invent DNS.

## Resources

- One Container App (external ingress)
- Optional primary + additional sticky custom domain bindings (`SniEnabled`)
- User-assigned runtime identity for registry pull
- Non-secret env from the workload contract
- `AZURE_CUSTOM_DOMAIN` injected for the catalog primary hostname when domains are enabled

No database, Key Vault, or ACR control-plane resources are created here.

## Inputs (high level)

Rendered by `scripts/render-workload-parameters.mjs` from:

- trusted environment catalog (`environments/production.json`)
- workload contract
- immutable image tag + digest evidence

Application repositories never supply subscription IDs, resource group IDs,
certificate IDs, or secret values through this stack.

## Deploy path

Production deploys go through the guarded release script/workflow (plan →
protected apply → HTTP verify), not ad-hoc `az deployment` from a laptop.

Local validation only:

```bash
npm run validate
npm run validate:bicep
```

Operator runbook:
[../../docs/workloads/qwik-website-runbook.md](../../docs/workloads/qwik-website-runbook.md).

## Notes

- Prefer digest deployment after registry resolution; never deploy `latest`.
- Custom domain hostnames live in the catalog; the contract only sets
  `customDomain.enabled`.
- Secret references are supported by the broader design for future workloads;
  Qwik currently uses an empty `secretRefs` map.
