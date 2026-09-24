# Historical implementation plans

These documents are **archived planning records**. They explain why decisions were
made and what gates were required at the time.

They are **not** the source of truth for repository or Azure status.

| Document | When | Outcome relative to today |
| --- | --- | --- |
| [iac-acr-reviewed-implementation-plan.md](iac-acr-reviewed-implementation-plan.md) | 2026-09-18 | Baseline architecture review. Shared ACR and validation landed; Qwik greenfield path landed afterward; `access-control-demo` migration still outstanding. |
| [phase-2-shared-acr-implementation-plan.md](phase-2-shared-acr-implementation-plan.md) | 2026-09-19 | Phase 2 handoff. Fail-closed validation + shared ACR completed on `main`. |

For current status use:

- [../../README.md](../../README.md)
- [../reusable-iac-design.md](../reusable-iac-design.md)
- [../operations.md](../operations.md)
- [../workloads/qwik-website-runbook.md](../workloads/qwik-website-runbook.md)

**Note:** this repository catalogs `access-control-demo` but does **not** deploy
it yet. That brownfield migration is next.
