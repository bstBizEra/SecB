# P0-18 V-016 DRIFT Comparator — Immune Cross-Review 001

**Document ID:** SECB-P0-18-V016-DRIFT-CROSSREV-001
**Status:** CROSS-REVIEW / ADVISORY — NOT SIGN-OFF, NOT THE P0-20 VERDICT
**Reviewer:** `claude-immune-crossrev-v016-01` (BST-SA Immune, advisory)
**Review target:** branch `bst/p0-18-v016-drift` @ `c1a97d3`
(`c1a97d31a616b6f4a0abdaf80d905950d499eec0`)
**Base:** main @ `ec5aa76` (`ec5aa76cdc404ffbecfb5ca9de07a0c943da29b1`)
**Producer under review:** `claude-motor-p0-18-v016-drift-01`
**Governance mode:** AMD-002 advise-and-proceed (cross-review packet on a branch)
**Truth status:** verified_true · **Authority status:** advisory_only · **Implementation status:** candidate · **Risk class:** low

---

## Verdict

**APPROVE_FOR_MERGE**

The candidate delivers the deferred half of verification-matrix V-016 as a pure,
frozen, deny-by-default checkpoint drift comparator
(`src/control/checkpoint-drift-comparator.mjs`) plus 10 live conformance cases.
The load-bearing safety property — **a resume is permitted only on affirmative,
fully-verifiable, byte-equal evidence of the recorded triple; every ambiguity,
missing/unusable field, unresolvable checkpoint, and integrity fault fails
closed** — was rebuilt first-hand and holds under an independent adversarial
probe of ~25 hostile inputs beyond the shipped suite. No `src/` primitive is
modified (byte-identity confirmed against git blobs, not just the in-test pin).
Full suite is green at the expected totals; validator exits 0; merges clean
(fast-forward) against main.

No blocking findings. The comparator is unwired (zero consumers in `src/`);
wiring into any restore/self-pilot/replay path remains separately governed and
OUT OF SCOPE — correctly disclaimed by the candidate. This packet is advisory
and is neither P0-18 sign-off nor the P0-20 governance verdict.

---

## Explicit rulings (task-mandated)

### R1 — FAIL-CLOSED ON AMBIGUITY — **PASS** (hard condition satisfied; no silent resume found)

This is the strict bar: any silent resume on unverifiable/incomparable state is
a critical recovery-safety defect. Rebuilt from source and re-probed independently.

Decision precedence in `evaluateResumeInternal` (comparator lines 119–168) is
structural-first and deny-by-default:
1. non-plain-object container → `DENY_DRIFT_MALFORMED`;
2. hostile/unreadable extraction → `DENY_DRIFT_MALFORMED` (contained, never thrown);
3. **verifiability of ALL three fields on BOTH sides** (missing/unusable) →
   `DENY_DRIFT_UNVERIFIABLE`;
4. only then equality → any divergence `DENY_CHECKPOINT_DRIFT`;
5. else `{ ok:true, verified:true }`.

The ordering of (3) before (4) is the crux: verifiability is judged for every
field *before* any equality, so an un-performable comparison is reported honestly
as `UNVERIFIABLE` and is never downgraded to a soft "no drift". Field validity is
gated by `isCleanString` (non-empty, no NUL byte) and `isSequence`
(`Number.isSafeInteger` ≥ 0) *before* equality is considered, and absent own-keys
resolve to a private `MISSING` sentinel that can only DENY.

Independent probe outcomes (all DENY; `result.ok !== true` in every case):

| Ambiguous / incomplete input | Result |
|---|---|
| content_hash missing on observed / recorded / **both** sides | `DENY_DRIFT_UNVERIFIABLE` |
| **partial match** — hash+sequence equal, `state_snapshot_ref` MISSING (obs *and* recorded) | `DENY_DRIFT_UNVERIFIABLE` |
| sequence `-1`, `7.5`, `NaN`, `Infinity`, `2**53` (unsafe), `"7"` (string) | `DENY_DRIFT_UNVERIFIABLE` |
| content_hash `""` (blank), 63-char + NUL byte | `DENY_DRIFT_UNVERIFIABLE` |
| state_snapshot_ref `null` / number / boolean | `DENY_DRIFT_UNVERIFIABLE` |
| observed field explicit `undefined` own-key | `DENY_DRIFT_UNVERIFIABLE` |
| checkpoint carries wrong key (`sequence` not `sequence_at_checkpoint`) | `DENY_DRIFT_UNVERIFIABLE` |
| prototype-only content_hash (reachable via chain, not own) | `DENY_DRIFT_UNVERIFIABLE` |
| null / undefined / array / string container | `DENY_DRIFT_MALFORMED` |

**No path yields `verified:true` on ambiguous/incomparable state.** The single
"silent resume" my harness auto-flagged was a *harness mislabel*: that probe used
a toggling getter engineered to return a genuine match on its first read; the
comparator read it exactly once (`reads === 1`) and honestly verified the one
authoritative value it observed. That is the atomic-single-read guarantee working
(see R4), not a TOCTOU resume on ambiguity — there was no ambiguity, and the
evidence used was complete and equal.

### R2 — GENUINE DRIFT DETECTION — **PASS**

Matching triple (`content_hash` + `sequence`/`sequence_at_checkpoint` +
`state_snapshot_ref`) → `{ ok:true, verified:true }` (deep-frozen). Independently
confirmed each single-field divergence, both directions, denies with
`DENY_CHECKPOINT_DRIFT`: hash differs; sequence advanced (8) *and* rewound (6);
snapshot ref forged. Sequence `0`==`0` correctly verifies (0 is a valid sequence,
not treated as falsy-missing). The equality loop uses `!==` over the atomic
snapshot, so the deny is per-field and specific. Field-name mapping matches the
ratified contract (`contracts/checkpoint.schema.json`: `sequence_at_checkpoint`
integer ≥ 0, `state_snapshot_ref` minLength 1, `content_hash` 64-hex).

### R3 — INTEGRITY PRECEDES COMPARISON — **PASS**

`evaluateResumeFromLedger` resolves through the ledger's existing read-only
resolvers only. Traced the chain first-hand:
`resolveCheckpoint`/`resolveLatest` (`checkpoint-ledger.mjs:64,79`) call
`this.read()` → `#verifyRecords` (`durable-ledger.mjs:107,109`) which **throws**
`LedgerError("LEDGER_INTEGRITY_FAILURE")` (`durable-ledger.mjs:94`) on a broken
hash chain. The comparator places **no** try/catch around the resolve call
(comparator lines 222–231), so a tampered persisted ledger surfaces the integrity
exception *before* any comparison and is never swallowed into a "no drift" /
verified result. Confirmed by the shipped composition test (tamper the persisted
`state_snapshot_ref`, reopen, assert `error.code === "LEDGER_INTEGRITY_FAILURE"`
throws through `evaluateResumeFromLedger`). Every non-throwing non-`ALLOW`
resolver outcome (unknown/invalid id, `ALLOW` with null checkpoint) fails closed
to `DENY_DRIFT_UNVERIFIABLE`; ambiguous/absent locators →
`DENY_DRIFT_MALFORMED` — independently reproduced.

### R4 — ATOMIC SNAPSHOT (TOCTOU-safe) — **PASS**

`snapshotOwn` (comparator lines 95–102) consults `Reflect.ownKeys(obj)` **once**
to establish own-membership and reads each needed key via a **single `[[Get]]`**
(`obj[k]`) only when it is a genuine own key. No `getOwnPropertyDescriptor`
double-read exists, so a Proxy whose descriptor and get traps disagree cannot
split the check from the validated value. Verifiability and equality loops read
from the frozen plain snapshot, never re-touching the hostile object.
Independently proven:
- a value-varying / read-counting getter is invoked **exactly once**
  (`reads === 1`) on both the observed and the recorded side, so a getter that
  returns different values on repeated reads cannot flip the verdict;
- a throwing getter is contained to `DENY_DRIFT_MALFORMED` (never propagates);
- prototype-injected fields are not own keys → `MISSING` → `UNVERIFIABLE`.
The outer `evaluateResume` try/catch is a belt-and-braces guard degrading any
unexpected future throw to the frozen malformed denial.

### R5 — BYTE-IDENTITY — **PASS**

All four primitives the candidate composes are blob-identical between target
`c1a97d3` and base `ec5aa76`, verified via `git rev-parse` (not merely the
in-test SHA-1 pin, which I independently corroborated):

| File | blob @ c1a97d3 == blob @ ec5aa76 | in-test pin matches |
|---|---|---|
| `src/ledger/checkpoint-ledger.mjs` | `4df391f8…` ✓ | ✓ |
| `src/ledger/durable-ledger.mjs` | `6be08fc1…` ✓ | ✓ |
| `src/contracts/contract-validator.mjs` | `c3b37776…` ✓ | ✓ |
| `src/contracts/canonical-fingerprint.mjs` | `721e9903…` ✓ | ✓ |

`checkpoint-ledger` and `durable-ledger` are unmodified. The target commit adds
only the new comparator, the new test, the candidate doc, and the three MANIFEST
registrations (diff-stat: 4 files, +759, 0 deletions) — no ratified `src/` file
is touched.

---

## Supporting verification (task return items)

- **In-glob & runs (10 in suite):** `npm test` runs `node --test tests/*.test.mjs`;
  the new `tests/conformance-v016-drift.test.mjs` matches the glob and runs 10
  tests (10 pass, 0 skip) in isolation.
- **Full-suite totals:** `tests 1125 · pass 1123 · fail 0 · skipped 2 · todo 0`
  — exactly the expected 1125/1123/0/2 (prior 1115 + 10). Exit 0.
- **Validator:** `npm run validate` PASS, exit 0; `schemas.count` = 7 canonical
  bootstrap + 10 governed extensions = **17 schemas**.
- **Merge-cleanliness:** clean fast-forward onto main (`ec5aa76` is the
  merge-base; `merge-tree` shows no conflicts). MANIFEST registers all three new
  files.
- **Byte-identity self-guard:** the shipped byte-identity test re-pins the four
  primitives to their `ec5aa76` blobs and passes inside the suite.

## Notes (informational, non-blocking)

- N1 — The comparator has **zero consumers** in `src/`. Any adoption/wiring into
  a restore-execution / self-pilot / replay path is a later, separately governed
  step and must re-establish the fail-closed and integrity-precedence guarantees
  *at the consumer* (source-ledger head comparison, snapshot dereference). The
  candidate discloses this correctly.
- N2 — `evaluateResume` accepts an observed `sequence` that equals the recorded
  `sequence_at_checkpoint` as verified; the comparator itself performs no
  referential check that the sequence resolves against a live source ledger head
  (by design — that is the deferred consumer's job, consistent with the S1
  advisory notes). Not a defect in this pure-comparator scope.

---

## Authority boundary

This is an advisory Immune cross-review. It does not authorize execution, does
not merge, does not wire the comparator, does not declare production, and does
not constitute the P0-20 governance verdict or P0-18 sign-off. Merge remains an
operator action.

```yaml
self_certification:
  agent_id: claude-immune-crossrev-v016-01
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

### Provenance

Source — first-hand review of branch `bst/p0-18-v016-drift` @ `c1a97d3` against
main @ `ec5aa76`, independent adversarial probe, and full-suite/validator runs in
an isolated worktree. Timestamp — 2026-07-21. Agent ID —
`claude-immune-crossrev-v016-01` (BST-SA Immune, advisory).
