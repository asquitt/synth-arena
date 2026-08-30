# SynthArena Project Instructions

## Portfolio Authority

`PROJECT_STATUS.json` is binding. SynthArena is private internal evaluation tooling on release HOLD, not a standalone company, customer SaaS, marketplace, billing product, or authorized deployment.

- Preserve the repository and fix archive-security defects.
- Extract an asset only for a named active product with an accountable owner and versioned contract.
- Do not expand shared infrastructure until two independent active products adopt the same contract.
- Do not use historical plans, code presence, fixtures, tests, HTTP responses, or healthy containers as customer, production, isolation, or adoption proof.
- Do not restore automatic workflows, marketplace packaging, billing, deployment, provider spend, or standalone product work without a reviewed status change and the evidence required by `docs/INTERNAL_TOOLING_BOUNDARY.md`.

## Delivery Standard

### Scope and preservation

- Inspect `git status -sb`, worktrees, branch ownership, remotes, and open pull requests before mutation.
- Preserve unrelated tracked, untracked, staged, generated, and dirty work.
- State assumptions, scope, measurable success criteria, and `step -> verification` pairs for multi-step work.
- Prefer the smallest bounded extraction or fix. Do not revive a platform stack for a hypothetical consumer.

### Outcome truth

- Verify the real producer, persistence boundary, consumer, and visible result.
- Scenario and evaluation claims require provenance, immutable lineage, scorer identity, replayability, cost lineage, and real agent behavior.
- Sandbox claims require declared policy, exact artifact identity, enforced isolation, adversarial probes, timeout handling, and residue cleanup.
- Mocks and deterministic fixtures are development evidence only. Label unavailable runtime, provider, deployment, and customer evidence explicitly.

### Verification and review

- Reproduce a defect with the narrowest focused regression, implement the smallest fix, and rerun the regression.
- Run affected typecheck, lint, build, integration, security, and runtime gates in proportion to risk. Avoid broad Docker stacks unless the named contract requires them.
- Material security, isolation, persistence, migration, provider, deployment-control, or public-UI changes require one separate read-only xhigh review of the immutable base, head, and pull-request merge candidate.
- HIGH or MEDIUM findings block merge. Fix narrowly in a new commit and request one bounded re-review from the same reviewer.

### Git and release safety

- Use one `codex/<short-slug>` branch and one pull request for one coherent slice from the latest verified default branch.
- Commit focused verified checkpoints. Never amend, rebase, force-push, rewrite a reviewed candidate, or absorb unrelated work.
- Push once at the authorized boundary. Use a merge commit and the exact reviewed merge object; never squash or rebase.
- Never print or commit secrets. Never claim deployment, rollback, cleanup, or public behavior that was not directly observed.
- Keep the pull request draft until required local gates, rollback, cleanup, and exact-candidate review are complete.

### Handoff

Report exact branch, base, head, tree, merge identity, files changed, tests and probes, runtime evidence, independent-review result, rollback, cleanup, preserved work, and remaining unverified claims.

## Essential Commands

```bash
node scripts/verify-portfolio-status.mjs
pnpm test:core
pnpm test:scenarios
pnpm lint
pnpm typecheck
pnpm build
```

Run only the gates relevant to the approved bounded asset or control change.
