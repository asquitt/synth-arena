---
name: independent-review
description: Run read-only exact-candidate senior review for material SynthArena changes.
---

# SynthArena Independent Review

1. Commit the candidate and record full base, head, and head-tree SHAs.
2. When a pull request exists, record `baseRefOid`, `headRefOid`, `potentialMergeCommit.oid`, its two parents, and merge tree. Missing merge identity blocks review.
3. Give one separate xhigh reviewer the requirements, affected architecture, tests, runtime context, all immutable identities, and `.github/ai-review/senior-review.md`.
4. The reviewer stays read-only and inspects `BASE..HEAD`, the named merge candidate, and directly affected consumers and contracts.
5. HIGH or MEDIUM requires a current trigger, concrete impact, reproducible evidence, changed file and line, and smallest fix.
6. Freeze on an admitted blocker. Fix narrowly in a new commit, rerun affected gates, push once, and request one bounded re-review from the same reviewer.
7. Do not merge until the exact current candidate is blocker-free. Hosted checks never replace independent review.

Preserve the review JSON matching `.github/ai-review/review.schema.json` and all exact identities in the handoff.
