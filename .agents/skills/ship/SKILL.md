---
name: ship
description: Safely commit, push, review, and merge a bounded SynthArena change without absorbing unrelated work.
---

# Ship SynthArena

1. Read `PROJECT_STATUS.json`, `AGENTS.md`, `CLAUDE.md`, and the project-quality and PR-lifecycle skills.
2. Inspect status, diffs, branch, upstream, remote, worktrees, and open pull requests. Preserve unrelated work.
3. Run the status verifier and focused changed-boundary gates. Do not broaden into speculative runtime work to manufacture green status.
4. Stage only task-owned files; inspect the full staged diff, `git diff --cached --check`, and staged statistics.
5. Create conventional, verified commits without AI trailers. Never amend, rebase, force-push, or rewrite a shared or reviewed candidate.
6. Push once at the authorized boundary and use one draft pull request for the coherent slice.
7. Material changes require blocker-free independent review of the exact base, head, and merge candidate.
8. Merge only the exact reviewed merge object using the PR-lifecycle procedure. Never squash, rebase, or delete branches during merge.
9. Report exact commit, tree, PR, merge, verification, review, rollback, cleanup, and preserved-work state.

Stop if ownership is ambiguous, the portfolio contract fails, or required in-scope evidence remains unresolved.
