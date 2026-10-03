# MOD-WSPACE S1 — Write-Set Containment Evaluator — Independent Review 001

**Record ID:** mod-wspace-s1-write-set-rev-001
**Status:** ADVISORY — NOT EFFECTIVE
**Reviewer:** claude-immune-rev-wspace-s1-01 (BST-SA immune, independent review gate)
**Date:** 2026-07-21
**Review target:** branch `bst/mod-wspace-s1-write-set` @ `3225c13a40fd3d4b35cad2714d229611caffcf72`
**Base:** unified `main` @ `71b9d4139e00ce1e8ec3ea856e41982e73dfc4d3`
**Authoritative spec:** `bst/mod-wspace-assessment:docs/03-project-control/candidates/mod-wspace-gap-assessment-001.md` — Slice S1; boundary rulings B1–B6.
**Producer:** a different Claude agent (`[MOD-WSPACE-S1] Write-set containment evaluator (pure, unwired)`). Held to spec without deference.
**Method:** every claim below read/executed first-hand in an isolated worktree. Blob hashes, oracle freshness, adversarial probes, full suite, and validator all re-derived by the reviewer, not trusted from the producer's guard tests.

---

## Verdict: **APPROVE_WITH_NOTES**

The slice conforms **exactly** to the S1 spec: pure, unwired, all six deny codes present with deny-by-default, prohibited-beats-allowed precedence, `pathSubset` parity holds against a **verified-fresh** oracle, byte-identity of all read files confirmed, full suite green (720/715/0/5), validator exit 0, merge clean. No spec violation found. The single substantive note (N1) is a defense-in-depth / caller-precondition observation about OS-specific path normalization that lies **outside** S1's stated deny scope and is **moot while unwired** — it is a condition to resolve before this evaluator is ever wired into a live write path, not a blocker to landing the candidate.

---

## 1. Scope conformance — PASS

| Check | Result |
|---|---|
| Only the 3 declared files touched | **PASS** — `git diff --name-status 71b9d41 3225c13` = `M MANIFEST.json`, `A src/control/write-set-policy.mjs`, `A tests/write-set-policy.test.mjs`. Nothing else. |
| No wiring (nothing imports the evaluator) | **PASS** — `grep -rn write-set-policy src/ tools/` (excluding the module itself) returns zero. Pure + unwired confirmed. |
| MANIFEST delta | **PASS** — +2 lines, both new files, inserted after `tests/risk-registry.test.mjs`. |
| Byte-identity of read/adjacent files vs main @ 71b9d41 (reviewer-derived blob hashes, not the producer guard) | **PASS** — `context-federation-service.mjs` `7eb57a2…`, `risk-registry.mjs` `b8ee7f9…`, `validate-foundation.mjs` `082638c…`, `package.json` `6f91499…`, `contract-validator.mjs` `32e9ada…` — all **identical** between `71b9d41:` and `3225c13:`. |

## 2. Semantic conformance vs spec — PASS

- **All six deny codes present** (`WRITE_SET_DENY_CODES`, frozen): `DENY_WRITE_SET_EMPTY`, `DENY_WRITE_SET_MALFORMED`, `DENY_WRITE_SET_TRAVERSAL`, `DENY_WRITE_SET_ABSOLUTE`, `DENY_WRITE_SET_PROHIBITED`, `DENY_WRITE_SET_OUTSIDE_ALLOWED`. Matches spec S1 exactly.
- **Deny-by-default:** non-object input, non-array fields, omitted `prohibitedPaths` (undefined), non-string/blank/null-byte/array-like entries all resolve to `DENY_WRITE_SET_MALFORMED` — never a permissive default. Verified by probe and suite.
- **Prohibited-beats-allowed precedence:** `src/gateway/x` under `allowedPaths:["src"]` + `prohibitedPaths:["src/gateway"]` → `DENY_WRITE_SET_PROHIBITED` (prohibited loop runs before the allowed loop). Confirmed.
- **`pathSubset` parity — reused, not reinvented (B3):** the module's `hasParentSegment` / `stripTrailingSlashes` / `withinBound` helpers are the exact three clauses of `context-federation-service.mjs:43-48 pathSubset`, factored so distinct deny codes can name the failing clause.
- **Oracle-freshness check — PASS (the load-bearing one).** The test's `referencePathSubset` and the module helpers were compared **byte-for-byte** against the *current* source of `pathSubset` in `3225c13:src/services/context-federation-service.mjs:43-48`. They are identical modulo the function name:
  ```js
  const hasParent = (v) => v.split(/[\\/]/).includes("..");
  if (candidate.some(hasParent)) return false;
  const bounds = bound.map((p) => p.replace(/\/+$/, ""));
  return candidate.every((p) => bounds.some((e) => p === e || p.startsWith(`${e}/`)));
  ```
  The parity oracle is **not stale** — it mirrors live source, so the parity test genuinely constrains the evaluator. The byte-identity guard test additionally pins the source blob so the copy cannot silently drift.

## 3. Adversarial probes (throwaway, uncommitted)

Run directly against `evaluateWriteSet` (module extracted to scratchpad; working tree unaffected).

| Probe | Input | Outcome | Assessment |
|---|---|---|---|
| encoded dots `%2e%2e` | `src/%2e%2e/secret` vs `["src"]` | **ALLOW** | Safe. Literal dir named `%2e%2e`; no URL-decode in contract; stays under `src/`. INFO only. |
| unicode dot-leader U+2024 `․․` | `src/․․/x` vs `["src"]` | **ALLOW** | Safe. Literal non-ASCII segment; not `..`; contained. INFO only. |
| `....//` | `src/....//x` vs `["src"]` | **ALLOW** | Safe. `....` ≠ `..` under segment-split (not substring-replace); contained. INFO only. |
| **`.. ` trailing-space segment** | `src/.. /x` vs `["src"]` | **ALLOW** | **N1 — see below.** On Windows the OS strips trailing space/dot from a component, collapsing `.. ` → `..` (parent traversal). Literal segment `.. ` ≠ `..`, so not flagged; path is under `src/`, so allowed. |
| `src/../../x` mixed | vs `["src"]` | **DENY_WRITE_SET_TRAVERSAL** | Correct. |
| bare drive `C:` | vs `["src"]` | **DENY_WRITE_SET_ABSOLUTE** | Correct. |
| extended-length `\\?\C:\x` | vs `["src"]` | **DENY_WRITE_SET_ABSOLUTE** | Correct (leading `\`). |
| `file:///etc/passwd` | vs `["src"]` | **DENY_WRITE_SET_OUTSIDE_ALLOWED** | Fail-closed (denied via a different code than ABSOLUTE, but denied). INFO only. |
| prefix-collision | `src/foobar/x` vs `["src/foo"]` | **DENY_WRITE_SET_OUTSIDE_ALLOWED** | Correct — boundary-separator containment, no false prefix match. |
| empty-string entry | `[""]` vs `["src"]` | **DENY_WRITE_SET_MALFORMED** | Correct. |
| dot-segment `./x` | vs `["src"]` | **DENY_WRITE_SET_OUTSIDE_ALLOWED** | Fail-closed. |
| dot-segment `./x` | vs `["."]` | **ALLOW** | Correct — explicitly allowing `.` contains `./x`. |
| bare `.` | vs `["src"]` | **DENY_WRITE_SET_OUTSIDE_ALLOWED** | Fail-closed. |
| frozen-output mutation | reassign `res.ok` | no effect; `Object.isFrozen` true | Correct — deep-frozen. |
| huge-array | 200k paths | ALLOW in ~78ms; 1-outside → DENY in ~54ms | Linear, short-circuits, no pathological behavior. |
| proto-pollution | `__proto__` own key via `JSON.parse` | ALLOW (key ignored); `({}).x === undefined` | No prototype pollution. |

### N1 (LOW / advisory — condition for future wiring, not a merge blocker)

The evaluator treats `candidatePaths` as **literal, already-OS-canonicalized, repo-relative strings**. It denies only the exact-segment `..`. On **Windows**, a path component with trailing spaces or trailing dots (e.g. `.. `, `..`+space, `...`) is normalized by the filesystem to the stripped form, so a caller-supplied `src/.. /x` that the evaluator ALLOWs (segment `.. ` ≠ `..`, and the string sits under `src/`) would resolve on disk to `src/../x` — a parent escape.

- **Why this is NOT a spec violation:** S1's `DENY_WRITE_SET_TRAVERSAL` is specified as "any `..` segment," which the producer implemented precisely. Windows trailing-space/dot normalization is not in S1's deny scope, and the module documents the literal-path contract.
- **Why it is NOT exploitable today:** the slice is pure and **unwired** — no live write path consumes it; `candidatePaths` has no producer yet.
- **Recommended before adoption (R2 follow-up or the wiring slice's scope, not this candidate):** (a) document the caller precondition that paths must be OS-canonicalized before evaluation; and/or (b) normalize each segment (trim trailing `.`/whitespace) prior to the `..` check, then re-run the parity oracle. This keeps the evaluator fail-closed against Windows component-normalization tricks once something actually feeds it real intended writes.

The remaining ALLOW outcomes (encoded/unicode/`....//`) are correct for a literal-path evaluator and require no change; they are recorded as INFO for the adoption note only.

## 4. Regression — PASS

- `npm test`: **tests 720 · pass 715 · fail 0 · skipped 5** — exact match to the expected 720/715/0/5. The new suite's 17 cases all green (deny-code coverage, prototype-key, traversal both separators, absolute/UNC/drive, prohibited precedence, prefix-collision, trailing-separator, unicode, frozen-output, closed-set, config-equivalence parity, byte-identity guard).
- `node tools/validate-foundation.mjs`: `status: PASS`, **exit 0** (341 unique manifest paths, schema set-equality intact).
- `npm run validate`: **exit 0**.

## 5. Merge-cleanliness — PASS (with reported PR interplay)

- `git merge-tree --write-tree 71b9d41 3225c13` → exit 0, **no conflict markers**. `merge-base(71b9d41, 3225c13) = 71b9d41` (main tip), so the candidate is a clean, fast-forwardable merge over current main.
- **MANIFEST-union interplay with pending PRs #30 / #31 (report, not resolve):**
  - This candidate's MANIFEST hunk is at `@@ -172 @@` (after `tests/risk-registry.test.mjs`).
  - PR **#30** (`bst/mod-reg-f-ver-f-idnorm-fix-001`) and PR **#31** (`bst/mod-a2a-s2-non-escalation-gate`) both edit MANIFEST.json at the tail region `@@ -340 @@`.
  - The regions do **not** overlap → this candidate is **textually union-clean** with both #30 and #31; the new `write-set-policy` paths are unique, so no duplicate-path validator break after any merge order.
  - Note (out of this review's scope): **#30 and #31 conflict with each other** at the `@@ -340 @@` tail (both mutate the `mod-reg-gov-disposition.yaml` line region). That is their interplay to resolve, independent of MOD-WSPACE S1.

## 6. Findings by severity

| Sev | ID | Finding |
|---|---|---|
| — | — | No CRITICAL / HIGH / MEDIUM findings. |
| LOW | N1 | Windows trailing-space/dot component normalization (`.. `) can turn an ALLOWed literal path into a parent traversal. Outside S1's deny scope, moot while unwired; must be addressed before wiring. |
| INFO | N2 | Encoded/unicode/`....//` dot lookalikes ALLOW as literal directory names (correct for a literal-path evaluator; contained under allowed prefix). |
| INFO | N3 | `file:`-scheme string denied via `DENY_WRITE_SET_OUTSIDE_ALLOWED` rather than `…_ABSOLUTE` — still fail-closed; code choice only. |

## 7. Advisory status fields

```yaml
truth_status: verified_true            # scope, semantics, oracle-freshness, byte-identity, probes, suite, validator, merge all re-derived first-hand
authority_status: advisory_only
implementation_status: candidate       # this review approves-with-notes a candidate; it authorizes no merge or wiring
risk_class: low                        # pure, unwired, spec-conformant additive evaluator; only a LOW defense-in-depth note (N1)
verdict: APPROVE_WITH_NOTES
self_certification:
  agent_id: claude-immune-rev-wspace-s1-01
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

> Recommend improvements only. Do not execute them. This record certifies advisory review completeness for MOD-WSPACE S1; it does not authorize merge, wiring, or production. Merge remains an operator action; N1 is a condition for any future wiring/adoption slice, not for landing this unwired candidate.
