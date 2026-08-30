# SynthArena Internal Tooling Boundary

## Authority

`PROJECT_STATUS.json` is binding. SynthArena is private internal evaluation tooling on release HOLD, not a standalone product. Historical plans and implementation code cannot broaden that authority.

## Permitted Consumption

A single active product may receive a bounded copy or adapter only when the change records:

- consuming product and accountable owner
- repository and exact revision
- versioned contract path
- input, output, error, provenance, security, and rollback semantics
- focused conformance evidence
- concrete product outcome being improved

The consuming product owns its adapter and customer outcome. SynthArena does not become a service merely because one product imports an asset.

## Shared Infrastructure Gate

Do not develop a shared runtime, hosted service, registry, dashboard, marketplace, or generic platform until two independent active products adopt the same versioned contract and demonstrate that separate implementations create material customer, reliability, security, or operating cost.

Even after that threshold, adoption is not production proof. The exact shared candidate still needs real producer-to-consumer evidence, failure and rollback testing, cost evidence, and independent exact-commit review.

## Evidence Rules

- A mock, fixture, unit test, status row, HTTP 200, or healthy container is development evidence only.
- Sandboxing claims require declared policy, exact image identity, enforced network and resource limits, adversarial escape probes, and residue cleanup.
- Evaluation claims require immutable scenario provenance, real agent behavior, scorer lineage, replayability, cost lineage, and a consumer-visible result.
- No live customer data, provider spend, deployment, pilot, compliance, or customer-value claim is authorized by this repository status.

## Reopening Work

Change `PROJECT_STATUS.json` only in a reviewed governance PR that supplies the missing consumer contracts and evidence. Never weaken the verifier merely to make a proposed expansion pass.
