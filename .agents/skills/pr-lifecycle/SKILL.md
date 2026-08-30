---
name: pr-lifecycle
description: Carry one bounded SynthArena change through an exact reviewed merge commit.
---

# Pull Request Lifecycle

## Resolve and push

1. Read project instructions and inspect status, worktrees, branch ownership, remotes, and open pull requests.
2. Discover and fetch the default branch. Record exact base, head, and head tree.
3. Use one `codex/<short-slug>` branch and one draft PR for one coherent slice.
4. Run focused gates, commit without rewriting history, and push once at the authorized boundary.

```bash
PR_DEFAULT_BRANCH="$(gh repo view --json defaultBranchRef --jq '.defaultBranchRef.name')"
PR_BRANCH="$(git branch --show-current)"
git fetch origin "$PR_DEFAULT_BRANCH"
PR_BASE_SHA="$(git merge-base HEAD "origin/$PR_DEFAULT_BRANCH")"
PR_HEAD_SHA="$(git rev-parse HEAD)"
PR_HEAD_TREE="$(git rev-parse 'HEAD^{tree}')"
git push -u origin HEAD
```

Reuse an existing open PR for the branch. Otherwise open one draft PR using `.github/pull_request_template.md`.

## Freeze and review

Capture the GitHub merge candidate immediately before review:

```bash
PR_IDENTITY="$(gh pr view "$PR_NUMBER" --json baseRefOid,headRefOid,potentialMergeCommit)"
REVIEWED_BASE_SHA="$(jq -r '.baseRefOid' <<<"$PR_IDENTITY")"
REVIEWED_HEAD_SHA="$(jq -r '.headRefOid' <<<"$PR_IDENTITY")"
REVIEWED_MERGE_COMMIT_SHA="$(jq -r '.potentialMergeCommit.oid // empty' <<<"$PR_IDENTITY")"
test "$REVIEWED_BASE_SHA" = "$PR_BASE_SHA"
test "$REVIEWED_HEAD_SHA" = "$PR_HEAD_SHA"
test -n "$REVIEWED_MERGE_COMMIT_SHA"
git fetch origin "pull/$PR_NUMBER/merge"
test "$(git rev-parse FETCH_HEAD)" = "$REVIEWED_MERGE_COMMIT_SHA"
test "$(git rev-parse "$REVIEWED_MERGE_COMMIT_SHA^1")" = "$REVIEWED_BASE_SHA"
test "$(git rev-parse "$REVIEWED_MERGE_COMMIT_SHA^2")" = "$REVIEWED_HEAD_SHA"
REVIEWED_MERGE_TREE="$(git rev-parse "$REVIEWED_MERGE_COMMIT_SHA^{tree}")"
```

Give base, head, merge commit, and merge tree to one read-only xhigh reviewer. Any HIGH or MEDIUM blocks merge. A changed base, head, or merge candidate requires new review.

## Merge exact object

Immediately before merge, refresh GitHub identity, default branch, and `pull/$PR_NUMBER/merge`. Verify all reviewed SHAs, parents, and tree remain identical. Then push the exact reviewed merge object without force:

```bash
git push origin "${REVIEWED_MERGE_COMMIT_SHA}:refs/heads/${PR_DEFAULT_BRANCH}"
```

The braced refspec is required for zsh safety. Never squash, rebase, force, or delete the branch during this operation. Verify GitHub closed the PR as merged and default branch points to the reviewed merge commit.

## Closeout

Record PR number and state, head/tree, merge SHA/tree, local and remote verification, rollback target, cleanup, unavailable evidence, and preserved work. Manually close only abandoned, duplicate, or superseded PRs with a reason and recovery SHA.
