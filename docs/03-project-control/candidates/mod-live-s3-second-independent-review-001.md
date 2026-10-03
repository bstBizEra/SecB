# MOD-LIVE Slice S3 — Replay-Package Assembler + Ordering Reconciliation — SECOND Independent Review 001

**Record ID:** mod-live-s3-second-independent-review-001
**Status:** DRAFT / ADVISORY — NOT EFFECTIVE
**Reviewer identity:** `claude-rev-live-s3-second-01` (BST-SA REV, genuinely independent — no relationship to the producer of `49e3634` or to the first reviewer of `4e40bd6`)
**Review target:** `bst/mod-live-s3-staged` merged to `main` via PR #47 @ `2c3e7b0`; the candidate content itself is `49e36345ac4347314195b503145af6767d3c58c0` ("[MOD-LIVE-S3] Replay-package assembler + ordering reconciliation (PURE, UNWIRED)").
**Prior review under re-examination:** `4e40bd675e3ed6aaa94a50f491c97bb2086963b7` ("[MOD-LIVE-S3-REV] Independent immune review: replay-assembler S3 — APPROVE_WITH_NOTES").
**Target file blobs:** `src/live/replay-assembler.mjs`, `tests/replay-assembler.test.mjs` — read at `49e3634` and re-verified unchanged on current `main`.
**Worktree:** isolated worktree at `C:/Users/ounkh/SecB-worktrees/mod-live-s3-second-review-001`, new branch `bst/mod-live-s3-second-review-001`, cut from `main` @ `3f74683` (post PR #48). No push, no merge, no modification of `main` or any existing branch.
**Authoritative spec:** `docs/03-project-control/candidates/mod-live-gap-assessment-001.md` — G3 (closed) / G4 (advanced), slice S3, boundaries B1/B2/B3/B7, non-goals §5.
**Governance frame:** advisory-only, worker role (BST-SA REV). This record authorizes nothing; it recommends only. No execution/merge authority is claimed or implied.

---

## Verdict: REQUEST_CHANGES

This is a genuine second, independent opinion, not a rubber stamp of the first review. The module's cross-record/cross-field TOCTOU discipline — the single most important thing to check given this exact codebase's history with MOD-LIVE S1's N1/N2 — **holds up under my own independent adversarial re-derivation.** I could not find a bypass of the atomic-snapshot discipline, and I consider that question closed.

However, I found a **real, reproducible defect** that neither the assessment nor the first review's 17 probes exercised: **`assembleReplayPackage` can hang for multiple seconds or throw an uncaught `RangeError`, given ordinary well-typed (not adversarial-shaped) caller-supplied `sequence` values.** This directly contradicts the module's own explicitly documented and partially-tested invariant — "the assembler never throws" — and it does so via realistic-looking data, not via Proxy/getter trickery. Because the defect is (a) reproducible with two lines of plain data, (b) violates a documented design guarantee the first review explicitly certified as holding ("contained to the structured malformed denial... never throws"), and (c) has a narrow, well-understood fix, I am recommending **REQUEST_CHANGES** rather than folding it in as a third non-blocking note. The fix is small and does not touch any of the already-verified TOCTOU/boundary/purity properties.

---

## What the first reviewer actually found (re-read in full, verbatim from `4e40bd6`)

The first review (`docs/03-project-control/candidates/mod-live-s3-replay-rev-001.md`) is `APPROVE_WITH_NOTES` with **zero BLOCKING findings** and exactly two **ADVISORY (non-blocking)** notes:

- **N1** — the delivered filename is `src/live/replay-assembler.mjs`, while the gap-assessment's §4 slice-S3 sketch named it `src/live/replay-package.mjs`. The exported symbol (`assembleReplayPackage`) matches the spec exactly; the reviewer judged this cosmetic, "arguably the more accurate noun," and recorded it "so the divergence... is not mistaken for a missing file." No action required.
- **N2** — the review brief anticipated a MANIFEST-tail merge conflict against `main @ c52db71` that did not materialize, because the branch was cut directly from `c52db71` and main had not advanced. Reported as a factual correction, not a defect.

Both notes are administrative/provenance bookkeeping, not functional. Per this task's brief that "a note left by a first reviewer is often exactly where a second reviewer should dig deeper" — I dug into both. N1 (naming) has no functional consequence I could find: `git grep` confirms the module/test/MANIFEST triplet is internally consistent under the delivered name, and no other file references the sketch name `replay-package.mjs`. N2 is simply a fact about merge-base timing that remains true on current `main`. Neither note pointed toward the defect below; I found it by independently hunting the ordering/gap-reconciliation logic per this task's own priority order (cross-record TOCTOU, then ordering edge cases), not by following the first reviewer's notes.

The first reviewer's 17 adversarial probes (throwing getters, Proxy `get`/`ownKeys`/`getOwnPropertyDescriptor` traps, poisoned iterators, invocation-count checks, cross-record and cross-field TOCTOU) are real and I rebuilt equivalents of all of them independently — see below. None of the 17 exercised numeric magnitude or record-count scale; all used small (1-4 record) fixtures with ordinary integer sequence values (1-5). That blind spot is exactly where my finding lives.

---

## Independent re-verification of the highest-priority question: cross-record TOCTOU

Given this codebase's own history (MOD-LIVE S1's N1: a getter on one record influencing the ordering/conformance decision for another), I re-derived this from the source myself rather than trusting the first review's characterization.

**Structural finding, read first-hand from `src/live/replay-assembler.mjs`:** reconciliation (`orderingDisorderFindings`, `correlationFindings`, `sequenceGaps`, all in "Phase B") operates **exclusively** on `eventDescriptors` — plain, freshly-constructed descriptor objects (`{ stream, index, sourceClass, sequence?, idempotencyKey?, contentHash?, source? }`) built entirely from primitives captured during "Phase A." Phase B never dereferences a caller object again. Each record is fully captured — one `Reflect.ownKeys` snapshot, then at most five single `[[Get]]` reads — inside `snapshotRecord`, and record `i+1` is not touched until record `i`'s descriptor is finished and pushed. There is no code path by which a getter on record `i` can be invoked *during* the read of record `i+1`, and no code path by which reconciliation re-reads a live property after Phase A completes.

I reproduced the first reviewer's own probes independently (own test file, not reused) and additionally tried variants they did not write:

- A hostile `sourceClass` getter on record 0 that overwrites record 1's `sequence` **accessor property itself** (via `Object.defineProperty` inside the getter, not just adding a sibling data property as the shipped test does) — still inert, because record 1's own single read of `sequence` happens later in program order and reads whatever is live *at that time*; there is no double-read of record 1 to compare against, so there is nothing for the reassignment to corrupt.
- A `Proxy` on the **whole `input` object** (not just one stream array) whose `get` trap for `evidenceRecords` has a side effect that mutates a value it later hands back for `eventRecords` — still safe, because `snapshotStreams` reads each stream via one `input[name]` access and immediately snapshots it into a fresh array before the next stream name is read; nothing is re-read.
- Confirmed (matching the shipped suite) that `getOwnPropertyDescriptor` is never invoked and `Reflect.ownKeys` fires exactly once per record, per stream-array read.

**Conclusion on this question: the cross-record TOCTOU class from S1 is genuinely closed here.** I found no bypass. This part of the first review's certification is correct, and I am not raising it as a finding.

---

## NEW finding (not in the first review, not in the shipped suite)

### F1 — `sequenceGaps` computes an unbounded `[min..max]` fill from caller-supplied `sequence` magnitudes: soft-DoS (multi-second synchronous stall) escalating to an **uncaught `RangeError`** on realistic-looking inputs — violates the module's own "never throws" invariant

**Location:** `src/live/replay-assembler.mjs`, function `sequenceGaps` (loop `for (let s = min; s <= max; s += 1) if (!present.has(s)) missing.push(s);`), and its use of `Math.min(...present)` / `Math.max(...present)` where `present` is a `Set` of every declared `sequence` value across the event stream.

**Reproduction (run first-hand in the isolated worktree, `node --version` v24.12.0):**

```js
import { assembleReplayPackage } from "./src/live/replay-assembler.mjs";
const now = () => "2026-07-21T00:00:00Z";

// (a) two ordinary, well-typed records — no Proxies, no getters, no adversarial shape
assembleReplayPackage(
  { eventRecords: [{ sourceClass: "observed_fact", sequence: 0 },
                   { sourceClass: "observed_fact", sequence: 1e8 }] },
  { now }
);
// -> ok:true after ~3.6s wall-clock, allocates a 99,999,999-element `missing` array

assembleReplayPackage(
  { eventRecords: [{ sourceClass: "observed_fact", sequence: 0 },
                   { sourceClass: "observed_fact", sequence: 1e9 }] },
  { now }
);
// -> THROWS: RangeError: Invalid array length
//      at Array.push (<anonymous>)
//      at sequenceGaps (.../src/live/replay-assembler.mjs:378:34)
//      at assembleReplayPackage (.../src/live/replay-assembler.mjs:452:16)
```

Timing scales linearly and is reproducible well before the crash point:

| gap magnitude | result |
|---|---|
| 1e5 | ok:true, ~7ms |
| 1e6 | ok:true, ~31ms |
| 1e7 | ok:true, ~242ms |
| 1e8 | ok:true, ~3.6s (multi-second synchronous stall, ~100M-element array) |
| 1e9 | **throws `RangeError: Invalid array length`**, uncaught |

A second, independent crash mode in the same function, triggered by **record count** rather than **gap size** — no gap at all, just many sequential events:

```js
// N ordinary sequential records, sequence 0..N-1, NO gap
for (const n of [50000, 200000, 500000]) {
  const events = Array.from({ length: n }, (_, i) => ({ sourceClass: "observed_fact", sequence: i }));
  assembleReplayPackage({ eventRecords: events }, { now });
}
// n=50000  -> ok:true, 36ms
// n=200000 -> THROWS: RangeError: Maximum call stack size exceeded
// n=500000 -> THROWS: RangeError: Maximum call stack size exceeded
```

This second crash is `Math.min(...present)` / `Math.max(...present)` spreading a `Set` of ~131k+ distinct integers into function-call arguments, which exceeds V8's argument-count limit for spread calls. The threshold sits somewhere between 50,000 and 200,000 distinct declared `sequence` values on the event stream — a scale that is entirely plausible for a long-running session's event history, not a contrived edge case.

**Why this matters, and why I am not filing it as a third cosmetic note:**

1. **It contradicts a design invariant this module explicitly claims and the first review explicitly certified.** The module's own header states: *"A throw anywhere in extraction is contained to the structured malformed denial — the assembler never throws."* The first review's scope-verification table asserts "Pure / no I/O / no ambient clock: ... PASS" and its accessor-attack section frames the whole module as "contained to the structured malformed denial" under every probe it tried. I confirmed that guarantee holds for every *shape*-based attack (wrong type, hostile getter, Proxy trap, poisoned iterator) — but it does **not** hold for ordinary, well-typed numeric input. `assembleReplayPackage` is documented and tested as a total function that never throws; it is not one.
2. **It requires no adversarial cleverness to trigger** — unlike every one of the 17 probes in the first review (which all rely on Proxies, throwing getters, or tampered iterators), this defect fires on plain object literals with plain integers. A caller does not need to be hostile; a long-lived session, a corrupted upstream sequence value, or simply an evidence/event record whose `sequence` was populated from an unrelated large counter would do it.
3. **The module's own docstring labels its output `data_untrusted: true` and repeatedly frames the caller-supplied streams as untrusted** ("The supplied records are DATA_UNTRUSTED input... never trusted to be well-ordered"). The existing validation (`isSafeNonNegativeInteger`) faithfully rejects malformed *shapes* (negative, non-integer, unsafe) but places no bound on *magnitude* or on the *number of distinct present values*, leaving exactly the untrusted-input class this module says it defends against unguarded on this one axis.
4. **The fix is narrow and does not touch anything already verified as correct.** It does not require re-touching Phase A snapshot discipline, the TOCTOU closure, the boundary rulings (B1/B2/B3/B7), the source-class segregation, or the deny-code contract shape. Plausible fixes, in order of how closely they preserve current behavior: (a) compute `min`/`max` with a manual reduce/loop instead of spread (fixes the record-count crash immediately, no behavior change for any existing test); (b) cap the enumerable gap span (e.g., deny or truncate-with-a-distinct-finding-code when `max - min` exceeds a stated bound) so a single outlier `sequence` cannot force an unbounded synchronous fill (fixes both the timing blowup and the `Invalid array length` crash). Given the doctrine's own "fail-closed" framing used throughout this module, a `DENY_REPLAY_MALFORMED`-class denial (or a new, narrowly-scoped deny code) on an ungapfillable range is more consistent with house style than silently doing slow, unbounded work.

**Scope check:** this finding does not implicate B1/B2/B3/B7, does not implicate the "PURE"/"UNWIRED" claims (the function still performs no I/O and is still wired to nothing — it just isn't *total* the way it's documented to be), and does not implicate the source-class segregation or the doc-parity fixtures. It is narrowly confined to `sequenceGaps`'s two numeric-scale blind spots.

---

## Other bug classes checked (per this task's brief) — none found

- **Hardcoded test-ID / environment branching:** none. `git grep -n "test\|TEST\|debug\|DEBUG"` inside the module turns up only comments and the doc-parity test infrastructure; no runtime branch keys off any literal ID.
- **Schema no-op conditionals:** N/A — the module touches no schema (confirmed: zero `import`, no `contract-validator`/`validate-foundation` reference; re-ran `node tools/validate-foundation.mjs` myself — **PASS**, matching the first review).
- **SoD / identity gaps:** N/A — the module has no actor/authority concept; it is a pure data assembler over caller-supplied record shapes.
- **Case-sensitivity / normalization gaps:** `sourceClass` membership is checked via exact `Set.has` against the six lower-snake-case doctrine strings; a caller supplying e.g. `"Observed_Fact"` is correctly denied rather than silently normalized. This is fail-closed as intended, not a bug.
- **Injective-encoding / composite-key gaps:** the module tags segregated records with a `{ stream, index }` **object** descriptor (not a concatenated string key), so there is no `stream + ":" + index`-style ambiguity to exploit. No finding here.
- **Silent-skip-instead-of-fail-closed:** records lacking a `sequence` are (by design, matching doctrine) excluded from ordering checks rather than treated as a violation — this is documented, tested, and matches "declared sequence" semantics; not a bug. Duplicate/contradiction detection only groups records that declare an `idempotencyKey`; also matches spec. I looked for a case where a malformed-but-plausible value would be silently accepted rather than denied and found none beyond F1 above (which is the opposite failure mode: not a silent skip, but an unbounded computation / crash).

---

## Independent regression run (first-hand, this worktree)

- **Isolated worktree:** `C:/Users/ounkh/SecB-worktrees/mod-live-s3-second-review-001`, branch `bst/mod-live-s3-second-review-001`, cut from `main @ 3f74683` (current main at review time, well past `c52db71`/`2c3e7b0`). `npm install` (no lockfile drift; 6 packages).
- **Full suite:** `npm test` → **tests 1062 / pass 1057 / fail 0 / skipped 5**, exit 0. (Main has grown from 994 at the time of the first S3 review to 1062 now, entirely from unrelated later modules — replay-assembler's own 33 tests are unchanged and still green.)
- **Module-only:** `node --test tests/replay-assembler.test.mjs` → **33 / 33 pass**, confirming the count the first review and the producer's own commit message both cite.
- **Validator:** `node tools/validate-foundation.mjs` → `"status": "PASS"`.
- **No modification to `main` or any existing branch.** All exploration was read-only (`git show`) plus execution against a disposable worktree; the two throwaway probe scripts used to reproduce F1 were deleted from the worktree before writing this record and are not part of any commit.

---

## Advisory status fields

```yaml
truth_status: verified_true           # F1 reproduced first-hand with exact stack traces in this worktree; TOCTOU closure independently re-derived from source, not assumed from the first review
authority_status: advisory_only
implementation_status: existing       # module delivered, pure, unwired; one reproducible defect (F1) recommended for a fix commit before further reliance
risk_class: medium                    # unwired today (no live blast radius yet), but violates a documented fail-closed/never-throws invariant on non-adversarial input; would become a real availability risk the moment any report/UI/live path adopts this assembler per assessment §5 non-goal #5
```

```yaml
self_certification:
  agent_id: claude-rev-live-s3-second-01
  peer_agent_id: claude-immune-rev-live-s3-01
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

## Recommendation

**REQUEST_CHANGES.** Close F1 with a small, targeted fix in `sequenceGaps` (replace the `Math.min(...present)`/`Math.max(...present)` spread with a manual reduce, and bound or fail-closed on an excessively large `[min..max]` span) plus new regression tests: (1) many-thousands of distinct sequence values with no gap (record-count crash mode), and (2) a two-record stream with a very large declared gap (magnitude crash/stall mode). No other change is needed — the TOCTOU discipline, boundary rulings (B1/B2/B3/B7), source-class segregation, deny-code contract, purity, and doc-parity fixtures all independently re-verify as correct and should be preserved as-is. Advisory only; this record authorizes nothing and the fix/re-review remains an operator-scheduled, separately-governed step, consistent with how MOD-LIVE S1's N1 TOCTOU finding was handled (fix commit `4445cc3` following its own second-review finding).

> Recommend improvements only. Do not execute them. This review neither merges nor authorizes merge; it certifies advisory completeness only. Integration and any fix-commit scheduling remain operator decisions.
