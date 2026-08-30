## Consumer and system impact

Name the active consuming product, accountable owner, versioned contract, and concrete outcome. For preservation or governance-only work, state that no consumer or runtime behavior changes.

## Scope and exclusions

- In scope:
- Explicitly excluded:
- Unrelated work preserved:

## Exact candidate

- Default branch and base SHA:
- Candidate branch and head SHA:
- Candidate tree SHA:
- Pull-request merge commit and tree:
- Merge strategy: exact reviewed merge commit

## Verification evidence

| Property | Command or probe | Result | Evidence identity |
|---|---|---|---|
| Portfolio boundary |  |  |  |
| Focused behavior |  |  |  |
| Invalid or failure case |  |  |  |
| Changed-file gates |  |  |  |
| Runtime or consumer result, if claimed |  |  |  |

## Independent review

- Required: yes / no, with reason
- Exact reviewed base, head, merge commit, and merge tree:
- Verdict:
- Remaining HIGH findings:
- Remaining MEDIUM findings:

## Safety

- Data, security, isolation, migration, provider, or persistence impact:
- Rollback target and procedure:
- Runtime, fixture, provider, and external-state cleanup:
- Explicitly unavailable evidence:

## Readiness checklist

- [ ] `PROJECT_STATUS.json` remains authoritative and `node scripts/verify-portfolio-status.mjs` passes.
- [ ] No standalone product, marketplace, billing, deployment, customer, or adoption claim was introduced.
- [ ] A bounded extraction names its consumer and versioned contract; shared expansion has two independent adopters.
- [ ] The remote PR head and merge candidate match the immutable identities above.
- [ ] Focused tests cover the changed property and a relevant failure case.
- [ ] Material changes have blocker-free independent review of the exact base, head, and merge candidate.
- [ ] Rollback and cleanup are concrete; unavailable evidence is labeled unavailable, not green.
- [ ] No unrelated dirty work or secrets are included.
- [ ] The PR remains draft while any required item is unresolved.
