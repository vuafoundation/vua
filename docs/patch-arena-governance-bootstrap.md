# Patch Arena Governance Bootstrap

## Purpose

This migration moves the Patch Arena trust policy from schema v1 to schema v3 without allowing the candidate patch to become the authority that validates its own governance change.

## Trust boundary

The `pull_request_target` workflow checks out `github.event.pull_request.base.sha` into the evaluator worktree. The evaluator is therefore the policy that already exists on the protected base, not the candidate revision.

The candidate is used only as the untrusted `HEAD_SHA` subject of comparison.

## v3 classification

Classification is derived from the trusted evaluator using the exact `git diff --name-only BASE HEAD` result.

- `governance`: every changed path is explicitly allowlisted as Patch Arena governance.
- `security`: security paths only.
- `performance`: performance paths only.
- `correctness`: ordinary non-governance/non-security/non-performance changes.
- `mixed`: any cross-class or governance-plus-product change.

`mixed` is fail-closed and cannot receive a passing verdict.

## Governance policy

Governance changes must pass the same absolute quality gates and bounded no-regression comparison as security/correctness changes. `PASS_GOVERNANCE` is evidence that the migration is technically bounded; it is **not** permission to bypass protected-branch review.

The performance gate remains strict: performance changes require at least 5% measured throughput gain, with the existing latency, memory, and stability limits.

## Bootstrap rule

The first migration from v1 to v3 is itself a governance change. It must enter `main` through the repository's protected governance/review mechanism. It must not be merged merely because the candidate's new evaluator reports `PASS_GOVERNANCE`, because that would make the candidate authoritative over the trust boundary being changed.

After v3 is present on `main`, subsequent governance PRs are evaluated by the v3 evaluator from the base revision. This removes the bootstrap deadlock for future governance changes while preserving the root-of-trust.

## Prohibited shortcuts

- Do not run candidate workflow code under `pull_request_target`.
- Do not lower the performance threshold to make a patch pass.
- Do not synthesize benchmark evidence.
- Do not convert `REJECT` into a passing result administratively.
- Do not allow governance files to piggyback unrelated product changes.
- Do not treat a local benchmark as CI execution evidence.

## Acceptance evidence

The migration is complete only when:

1. the protected migration review is approved;
2. v3 is actually present on `main`;
3. a fresh trusted run evaluates subsequent PRs from the v3 base;
4. the resulting artifact reports `schema: vortex.patch-arena.v3`;
5. classification and verdict are independently visible in the CI artifact;
6. the protected merge rule still rejects `mixed` and failed verdicts.
