# MOD-OPS S3 — Cadence Policy — Independent Immune Review 001

**Record ID:** mod-ops-s3-cadence-rev-001
**Status:** ADVISORY — independent review verdict; authorizes nothing (operator-only merge)
**Reviewer:** claude-immune-rev-ops-s3-01 (BST-SA immune, independent review gate)
**Date:** 2026-07-21
**Review target:** branch `bst/mod-ops-s3-cadence` @ `756789cf95a38ae8007432070a0a379f5b8f3615`
**Base main:** `c52db71776e57aaf624002e53382d4857816773f`
**Authoritative spec:** `bst/mod-ops-assessment:docs/03-project-control/candidates/mod-ops-gap-assessment-001.md` — gap **G3**, slice **S3**, boundary **B4** (decision-not-scheduler).
**Files under review:** `src/ops/cadence-policy.mjs` (506 LOC incl. header/comments), `tests/cadence-policy.test.mjs` (40 tests), `MANIFEST.json` (+2 entries).
**Method:** target commit checked out in an isolated worktree; `npm ci` clean; every claim below verified first-hand — source read line-by-line, boundary greps run, an **independent** probe harness rebuilt from scratch (not the bundled suite) cross-checking all civil-date math against a `Date`-based oracle over 7,433 sampled instants, full `npm test` + validator run, byte-identity and merge-ancestry checked directly.

---

## Verdict: APPROVE_WITH_NOTES

The slice is **correct, secure, doc-parity-honest, and boundary-clean**. It closes G3 exactly as scoped: a pure, frozen, deny-by-default decision function over the 7-trigger cadence table, 8-row operating rhythm, and 6 checkpoint conditions, with no timers, no `Date`, no I/O, no imports. All mandatory immune checks pass. The two notes below are **low-severity, non-blocking** deviations from *illustrative* spec identifiers (the assessment wrote them as "e.g." examples); neither affects correctness, security, or scope. No finding rises to REWORK.

---

## Findings by severity

### Critical / High
None.

### Medium
None.

### Low (advisory, non-blocking)

- **L1 — Public function renamed from the illustrative spec surface.** Assessment §4 S3 illustrates the due evaluator as `dueActivities(input)`; the implementation ships it as `evaluateDueActions(input)`. `requiredActionsForTrigger` and `listRhythm` match the spec verbatim. The rename is documented in the module header and covered by tests. Recommend a one-line note wherever the S3 primitive is later referenced so downstream consumers bind the shipped name. **No functional impact.**
- **L2 — Deny-code vocabulary consolidated vs the illustrative spec codes.** Assessment §4 illustrates `DENY_TRIGGER_MALFORMED` / `DENY_TRIGGER_UNKNOWN` / `DENY_NOW_MALFORMED`; the module ships a closed, frozen, exported two-code set `DENY_CADENCE_MALFORMED` / `DENY_CADENCE_UNKNOWN` (plus a non-blocking `SCHEDULE_UNDERSPECIFIED` finding). The set is exported (`CADENCE_DENY_CODES`), frozen, and exhaustively tested. This is a defensible consolidation, not a gap — every malformed/unknown path denies. Flagged only for spec-traceability. **No functional impact.**
- **L3 — `now` as epoch-ms number rather than the illustrative ISO string.** Assessment §4 illustrates `now` as an ISO string; the implementation injects `now` as a UTC epoch-millisecond number and performs all-integer civil-date math. This is the **stronger** choice: it removes any `Date`/`Intl` parse, keeping the B4 no-`Date` boundary airtight. Aligns with this review's own mandate ("all-integer civil-date math with injected now"). Flagged only for spec-traceability. **No functional impact — improves boundary safety.**

---

## Verification detail

### 1. Doc-parity honesty — PASS
`docs/12-execution/02-schedule-and-cadence.md` read directly (CRLF file). Codified catalogs match the doc **1:1, verbatim, in order**: 7 event-driven triggers, 8 operating-rhythm rows, 6 checkpoint conditions. The bundled parity test parses the **live doc at runtime** (`readFileSync` + independent slug/split re-derivation) and asserts counts, names, required-action cells, action-splits, ids, and schedule fields (hour/minute/weekday) against the doc — drift on any of these fails CI. Confirmed the parity harness re-derives ids and clause-splits independently of the module literals, so both the literals and the derivation scheme are drift-guarded.

### 2. B4 boundary (decision-not-scheduler) — PASS
Source grep: **zero** `new Date`, `Date.now`, `Date(`, `setTimeout`, `setInterval`, `setImmediate`, `performance.now`, `process.hrtime`, `sleep`, `await new Promise`. The only token "Date" in the file is the phrase "no Date object" inside a comment. **Zero imports / zero `require`.** All calendar math is pure integer arithmetic (Howard Hinnant civil-from-days / days-from-civil + positive-modulo weekday). The module fires nothing and schedules nothing — it returns the due set as frozen data. Confirmed by construction and by the bundled purity guard test.

### 3. Due-decision correctness — PASS (independently re-derived)
An independent probe (`Date`-oracle, not the bundled fixtures) cross-checked the module across a wide instant sweep:
- **Monthly first-Tuesday:** 1,817 instants Dec-2025 → Feb-2027 (6-hour stride), **0 mismatches** vs oracle, including month rollover and the **Jan→Dec year-boundary** rollover. Oracle-confirmed facts: first Tuesday Jul-2026 = 7th, Jun-2026 = 2nd, Jan-2026 = 6th, Dec-2025 = 2nd; 2026-07-24 = Friday.
- **Daily/weekly most-recent-occurrence:** 5,616 occurrence checks across Q1-2026 with an odd (137-min) stride to exercise all intraday phases — **0 mismatches** vs oracle (today-vs-yesterday for daily; most-recent-weekday incl. today-15:00-vs-last-week for weekly).
- **Quarterly:** never appears in `due` and always surfaces as a `SCHEDULE_UNDERSPECIFIED` finding across a full-year sweep — **0 violations**. Never auto-due; the underspecification is surfaced honestly, not guessed.
- **lastRun suppression:** `lastRun == occurrence` suppresses (correct `>=` boundary); `lastRun < occurrence` stays due; `lastRun > occurrence` suppresses. Confirmed independently.
- UTC+7 fixed-offset (no DST) is the correct model for `Asia/Ho_Chi_Minh`; the monthly "day resolution" (00:00 local anchor) is the minimal no-invented-time reading and is labelled `resolution: "day"`.

### 4. Deny discipline — PASS
`DENY_CADENCE_MALFORMED`: `now` as string / NaN / Infinity / -Infinity / negative / bigint / boolean / null / object / missing → deny; malformed lastRun container and non-finite lastRun values → deny; throwing getter / Proxy trap contained → deny (never propagates). `DENY_CADENCE_UNKNOWN`: unknown triggerId and unknown lastRun own-key → deny, never coerced to a default. Prototype keys (`toString`, `__proto__`, `constructor`, `hasOwnProperty`) handled correctly — a literal `__proto__` is not an own enumerable key and never reaches the gate; a genuine own-key `toString` denies as UNKNOWN. `now === 0` (epoch) accepted as valid. All independently reproduced.

### 5. ATOMIC-SNAPSHOT / TOCTOU — PASS (mandatory; independently rebuilt)
- Single-read invocation counts: `now`, `triggerId`, and each `lastRun` own-key value are each read **exactly once** (probe-confirmed counts === 1).
- Shifty `now` getter (valid then NaN): only one read occurs; decision binds to the first snapshot; `evaluatedAt` echoes the first value.
- Shifty `lastRun` value getter (stale then suppressing): one read; row correctly stays due on the first (stale) value.
- `lastRun` captured structurally via `Reflect.ownKeys` into a `Map` (own keys only; symbol keys skipped; values read once) — prototype keys never participate.
- Throwing `now` getter, throwing `lastRun` value getter, and whole-input Proxy with a throwing `get` trap are all **contained → MALFORMED**, never thrown. A Proxy `lastRun` with fabricated `ownKeys`/descriptor traps is contained/handled (no crash, structured result).
- Outputs deep-frozen (result, `due`, `findings`, each entry, nested `actions`); mutation attempts throw in strict mode; caller `lastRun` never mutated.

### 6. Regression / hygiene — PASS
- Full `npm test`: **1001 tests / 996 pass / 0 fail / 5 skipped** — exact expected totals; suite exit 0.
- Target file alone: 40 / 40 pass.
- `node tools/validate-foundation.mjs` and `npm run validate`: **exit 0**.
- **Byte-identity:** the bundled guard asserts every pre-existing file read-but-not-modified (`docs/12-execution/02-schedule-and-cadence.md`, `src/control/retry-policy.mjs`, `src/ops/kpi-registry.mjs`, `src/ops/scorecard-assembler.mjs`, `tools/validate-foundation.mjs`, `package.json`) is blob-identical to base main @ c52db71 — passes. Diff vs base touches only the three declared files (`src/ops/cadence-policy.mjs` new, `tests/cadence-policy.test.mjs` new, `MANIFEST.json` +2 tail entries).
- **Merge-cleanliness:** 756789c is a direct single-commit descendant of base main c52db71 (`git merge-base --is-ancestor` = yes; 1 commit ahead). It fast-forward merges into main @ c52db71 **cleanly — no conflict at this base**. The MANIFEST tail-append conflict anticipated by the review brief materializes only when this branch is integrated **alongside sibling branches** (mod-ops-s1/s2, atomic-snapshot, etc.) that append to the same `MANIFEST.json` tail array; against c52db71 exactly there is no divergence. Report: expected-tail-conflict is a cross-sibling integration concern, mechanical, not a defect in this branch.

---

## Advisory status fields

```yaml
truth_status: verified_true            # every claim read/executed first-hand; date math independently re-derived over 7,433 instants vs a Date oracle
authority_status: advisory_only        # independent review verdict; operator-only merge, no push
implementation_status: existing        # the S3 code exists on the branch and is correct as reviewed
risk_class: low                        # pure additive primitive; no timers, no I/O, no wiring, no schema, no authority surface
self_certification:
  agent_id: claude-immune-rev-ops-s3-01
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

> Recommend for merge with notes. This record certifies review completeness only; it authorizes nothing. Merge is an operator decision. The L1–L3 notes are traceability advisories, not merge blockers; the cross-sibling MANIFEST tail-append is a mechanical integration step, not a defect.
