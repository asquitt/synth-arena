# SynthArena

**Status: private internal evaluation tooling. It is not a standalone company, customer SaaS, marketplace, billing product, or deployable production service.**

[`PROJECT_STATUS.json`](PROJECT_STATUS.json) is the machine-readable portfolio authority. If this README, historical plans, code, or automation conflicts with that file, the status file wins.

## Purpose

SynthArena preserves reusable agent-evaluation assets for bounded use by active portfolio products:

- deterministic scenario and scorer primitives
- replay, cost-modeling, and trace-analysis experiments
- local sandbox research and adversarial fixtures
- evaluation contract prototypes that can be extracted into a named product

The repository is a private lab and source archive. Code presence, a passing test, a fixture result, or a healthy local process does not establish production readiness, customer value, sandbox isolation, deployment, or adoption.

## Portfolio Boundary

Allowed work is limited to preservation, security fixes required to keep the archive safe, read-only research, and bounded extraction for a named consumer with a versioned contract.

The following are not authorized:

- standalone feature development or customer acquisition
- public product, pilot, compliance, or production-readiness claims
- marketplace, billing, or packaging work
- deployments, provider spend, or live customer data
- automatic hosted workflows
- shared-platform expansion without two independent active products adopting the same contract

See [`docs/INTERNAL_TOOLING_BOUNDARY.md`](docs/INTERNAL_TOOLING_BOUNDARY.md) for the adoption gate and [`docs/research-hold/2026-08-30-truth-lockdown-audit.md`](docs/research-hold/2026-08-30-truth-lockdown-audit.md) for the blocked unpublished research-stack audit.

## Local Verification

The disposition contract is intentionally cheap and non-Docker:

```bash
node scripts/verify-portfolio-status.mjs
```

Package tests may be run when maintaining or extracting a specific asset, but their result applies only to the named code path and revision. No deployment or real-agent behavior is implied.

## Historical Material

The previous standalone-product plan, progress claims, GitHub Action, and automatic workflows are preserved under [`docs/historical/`](docs/historical/README.md) as non-authoritative history. They must not be used as current roadmap, release, or product evidence.
