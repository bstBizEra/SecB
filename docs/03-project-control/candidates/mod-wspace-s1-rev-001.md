# Independent Review: MOD-WSPACE S1 Write-Set Policy

| Field | Value |
|---|---|
| Review ID | `MOD-WSPACE-S1-REV-001` |
| Reviewed commit | `3225c13a40fd3d4b35cad2714d229611caffcf72` |
| Reviewed tree | `3b0e5caaa6acbaddb096f8bef8170f0c3ae636ce` |
| Producer | `claude-motor-wspace-s1-01` |
| Reviewer | `codex-root` (`REV`) |
| Timestamp | `2026-07-21T12:05:00+07:00` |
| Truth status | `INDEPENDENTLY_REPRODUCED` |
| Authority status | `ADVISORY_ONLY / NOT EFFECTIVE` |
| Verdict | `REQUEST_CHANGES / DENY_FAIL_CLOSED` |

## Scope and independence

The review ran from a detached exact-commit worktree and did not modify the producer branch. The reviewed delta is additive and limited to `src/control/write-set-policy.mjs`, `tests/write-set-policy.test.mjs`, and two `MANIFEST.json` entries. No merge, push, integration, activation, evidence acceptance, QA acceptance, SEC acceptance, or Human GOV authority is claimed.

## Verified checks

- `git diff --check 71b9d41..3225c13`: pass.
- `node --test tests/write-set-policy.test.mjs`: `17 total, 17 pass, 0 fail`.
- `node tools/validate-foundation.mjs`: `PASS`, exit `0`.
- First `npm test`: `NO_VERDICT` because the detached worktree lacked `ajv`; no product disposition was inferred.
- `npm ci --offline --ignore-scripts`: installed 6 cached packages; audit reported 0 vulnerabilities.
- Fresh `npm test`: `720 total, 715 pass, 0 fail, 5 skipped`, exit `0`.

Passing producer tests establish regression health only. The adversarial probes below independently demonstrate a mutation-containment bypass.

## Findings

### `WSPACE-S1-REV-001` — BLOCKING — non-canonical path aliases bypass prohibited prefixes

`evaluateWriteSet` compares raw strings after stripping only trailing forward slashes from bounds. It does not reject or normalize repeated separators or `.` segments. Filesystems resolve those aliases to the same target, but the prohibited-prefix comparison treats them as different strings.

Reproduced at exact commit `3225c13`:

| Candidate / bounds | Observed | Required |
|---|---|---|
| candidate `src//gateway/secret.mjs`; allowed `src`; prohibited `src/gateway` | `{ "ok": true }` | deny |
| candidate `src/./gateway/secret.mjs`; allowed `src`; prohibited `src/gateway` | `{ "ok": true }` | deny |
| candidate `src/gateway/secret.mjs`; allowed `src`; prohibited `src//gateway` | `{ "ok": true }` | deny or reject malformed bound |

This violates the slice objective: a concrete write set can be reported inside the allowed prefix while evading a semantically equivalent prohibited prefix. Because the evaluator is intended as a future mutation-plane control, acceptance fails closed even though the slice is currently unwired.

Required rework:

1. Define and enforce one repository-relative lexical path grammar for candidates and bounds before comparison.
2. Either normalize or deny `.` segments and repeated/empty internal segments; preserve explicit denial of `..`, absolute, drive-letter, UNC, and null-byte forms.
3. Apply the same canonical representation to allowed and prohibited bounds, then retain prohibited-before-allowed precedence.
4. Add the three reproduced probes plus mixed-separator and trailing-separator cases to the permanent suite.
5. Keep the slice pure and unwired; filesystem/symlink resolution and live-service adoption remain separately governed.

### `WSPACE-S1-REV-002` — MEDIUM — hostile property access escapes the structured-denial boundary

An input object whose `candidatePaths` accessor throws causes `evaluateWriteSet` to throw `getter boom` instead of returning `DENY_WRITE_SET_MALFORMED`. This contradicts the stated invariant that every malformed input returns a frozen structured denial.

Required rework: contain property extraction failures (including Proxy/accessor throws) and return a frozen malformed-input denial without invoking an accessor more than once.

## Disposition

`REQUEST_CHANGES / DENY_FAIL_CLOSED` for `3225c13`. Do not stage, merge, ratify, wire, or treat MOD-WSPACE S1 as accepted. A successor must be independently reviewed at its new exact commit; this verdict does not transfer.
