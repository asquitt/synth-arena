# Unpublished Truth-Lockdown Research Audit

## Decision

HOLD. Do not push, merge, deploy, or present the unpublished `codex/truth-lockdown` stack as internal-tooling adoption or production evidence.

## Immutable Snapshot

- Live base at audit: `c45ecb4d57915bbf9687256a463ca35e2d6f7480`
- Committed local head: `6fcf1cb72cd104f838c41dfa3dcf80f99a74cbe4`
- Committed local tree: `3228db186f03683aaf8849496d424007d019cee6`
- Scope relative to live base: 22 commits, 339 files
- Remote branch and pull request: absent at audit time
- Docker and provider execution: not run

The worktree also contained uncommitted research. It remains preserved locally and is not represented by the committed head above.

## Blocking Findings

1. Migration `017` updates rows protected by an immutable-update trigger and would fail on an existing scenario-set row.
2. The same migration labels unreviewed legacy datasets approved without running the new sensitive-data and quality checks.
3. Browser-session routes and authentication are not mounted in the real API, while the web client calls them.
4. Live evaluation resolves agent and scenario-set versions by owner but not by the selected project.
5. Web-scraping execution acquires network authority through scenario input while signed manifests still attest the network-none policy.
6. Partial Docker create failures can leave named networks, sites, or agent containers because cleanup tracks success instead of attempted creation.
7. Production readiness can report healthy while the web-scraping capability is unavailable.
8. The runtime proof bypasses the signed controller path and does not distinguish several host-isolation failure modes.

These are present-day correctness, provenance, and isolation blockers. Passing focused tests or typechecks does not override them.

## Reuse Rule

Salvage only the smallest asset required by a named consumer. Start from that consumer's versioned contract, reproduce the relevant blocker, and carry the fix through focused tests and independent review. Do not revive the ten-service production stack or standalone roadmap as a prerequisite.
