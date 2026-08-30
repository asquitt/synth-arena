---
name: project-quality
description: Enforce SynthArena's internal-tooling boundary, evidence standard, and focused verification.
---

# SynthArena Project Quality

1. Read `PROJECT_STATUS.json`, `AGENTS.md`, `CLAUDE.md`, and the closest instructions.
2. Inspect repository state and preserve unrelated work.
3. For extraction, name the active consumer, accountable owner, repository, versioned contract, and outcome. Without them, limit work to preservation, archive security, or read-only research.
4. Reproduce a defect with the narrowest useful regression and implement the smallest complete fix.
5. Run `node scripts/verify-portfolio-status.mjs` plus affected tests, typecheck, lint, build, and bounded runtime probes in proportion to risk.
6. Treat mocks and fixtures as development evidence only. Prove producer, consumer, provenance, isolation, replay, cost, rollback, and cleanup for any broader claim.
7. Require independent exact-candidate review for material security, isolation, persistence, migration, provider, deployment-control, or public-UI changes.
8. Report exact identities, evidence, unavailable gates, rollback, cleanup, and preserved work. Never fabricate adoption, deployment, or customer proof.
