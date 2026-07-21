# P0-18 V-016 DRIFT Comparator — Candidate 001 (Advisory)

**Document ID:** SECB-P0-18-V016-DRIFT-CANDIDATE-001
**Status:** CANDIDATE / ADVISORY — NOT SIGN-OFF, NOT WIRED, NOT ADOPTED
**Base:** main @ `ec5aa76` (`ec5aa76cdc404ffbecfb5ca9de07a0c943da29b1`)
**Branch:** `bst/p0-18-v016-drift`
**Producer:** `claude-motor-p0-18-v016-drift-01` (BST-SA Motor, advisory)
**Governance mode:** AMD-002 advise-and-proceed (candidate prep authorized; wiring/adoption gated OUT OF SCOPE)

---

## 0. Scope statement (read first)

This candidate builds the **deferred half** of verification-matrix V-016
(`Recovery: verified checkpoint resumes / drifted checkpoint denied`). The
resolved half — resume-point lookup, fail-closed on unknown, tamper detection —
is already live in `tests/conformance-p0-18-candidate.test.mjs`. The remaining
half, the **restore-vs-source DRIFT comparison**, is checkpoint-ledger
**non-goal #3** and was previously an honest BLOCKED stub. This candidate turns
that half into a pure, unwired primitive plus live conformance coverage.

It explicitly does **NOT**:

- wire the comparator into any restore-execution, self-pilot, or
  intervention/replay path — `src/control/checkpoint-drift-comparator.mjs` has
  **zero consumers** in `src/`;
- modify `CheckpointLedger` or any other ratified primitive (byte-identity
  guarded);
- render the **P0-20 governance verdict** or constitute **P0-18 sign-off**;
- activate anything or self-authorize execution.

Adoption (some restore consumer actually calling `evaluateResume` /
`evaluateResumeFromLedger`) is a later, separately governed step.

---

## 1. What this closes

`CheckpointLedger` gives existence + fail-closed lookup only. Its own
restore-semantics note (design-only) describes a future consumer that would
(1) resolve a checkpoint, (2) dereference `state_snapshot_ref`, and (3) compare
the recorded position/content against the observed restore state to decide
verified-resume vs drift-denied — and marks step (3) "explicitly deferred …
non-goal #3". This candidate **is step (3)** and nothing more: a pure decision
over data passed in by the caller.

| Concern | Where it lives | This candidate |
|---|---|---|
| Checkpoint persistence + lookup | `src/ledger/checkpoint-ledger.mjs` (ratified) | composed **read-only**, unmodified |
| Restore-vs-source DRIFT decision (V-016 non-goal #3) | *(absent on main)* | **new** `src/control/checkpoint-drift-comparator.mjs` |

---

## 2. Comparator semantics (API + deny codes)

Module: `src/control/checkpoint-drift-comparator.mjs` (PURE, UNWIRED,
deny-by-default). House style matches `src/control/write-set-policy.mjs`:
result objects, every return value deep-frozen.

**Primary (pure):** `evaluateResume({ checkpoint, observedState })`
- `→ Object.freeze({ ok: true, verified: true })` when the observed restore
  state is byte-equal to the checkpoint's recorded evidence on all three
  dimensions — no drift, **resume PERMITTED**.
- `→ Object.freeze({ ok: false, code, message })` otherwise — **resume DENIED**.

**Composing (read-only ledger):**
`evaluateResumeFromLedger({ ledger, sessionId?, checkpointId?, observedState })`
- fetches the checkpoint through the ledger's EXISTING fail-closed resolvers
  (`resolveCheckpoint` / `resolveLatest`), then delegates to `evaluateResume`;
- surfaces the ledger's own `LEDGER_INTEGRITY_FAILURE` (a thrown `LedgerError`)
  **before any comparison** — a tamper is an integrity fault, not a resume
  decision, and is not downgraded into a soft deny.

**Compared evidence (recorded vs observed):**

| Dimension | Checkpoint field | Observed field | Type gate |
|---|---|---|---|
| Content hash | `content_hash` | `content_hash` | non-blank string, no NUL |
| Source-ledger position | `sequence_at_checkpoint` | `sequence` | safe integer ≥ 0 |
| Snapshot pointer | `state_snapshot_ref` | `state_snapshot_ref` | non-blank string, no NUL |

**Deny codes (frozen closed set `CHECKPOINT_DRIFT_DENY_CODES`):**

| Code | Meaning |
|---|---|
| `DENY_DRIFT_MALFORMED` | Input container not a usable object, or a hostile getter / Proxy trap made the input impossible to inspect. **Contained, never thrown.** |
| `DENY_CHECKPOINT_DRIFT` | All fields readable and well-formed on both sides, but a recorded value differs from the observed value — the world drifted; resume denied. |
| `DENY_DRIFT_UNVERIFIABLE` | The comparison could not be performed — a required field is missing or unusable on one/both sides. **Fail-closed: never reported as "no drift".** |

**Decision precedence** (deny-by-default, most structural first):
1. non-object `checkpoint`/`observedState` → `DENY_DRIFT_MALFORMED`
2. hostile/unreadable extraction → `DENY_DRIFT_MALFORMED` (contained)
3. any comparison field missing/unusable on either side → `DENY_DRIFT_UNVERIFIABLE`
4. all fields usable but any recorded ≠ observed → `DENY_CHECKPOINT_DRIFT`
5. else → `{ ok: true, verified: true }`

Verifiability (step 3) is judged for ALL fields **before** any equality
(step 4), so a comparison that could not be performed is reported honestly as
`UNVERIFIABLE` and is never mislabeled `DRIFT` or downgraded to a silent resume.

---

## 3. Fail-closed-on-ambiguity rationale (the load-bearing rule)

A resume is permitted **only** on affirmative, fully-verifiable evidence that the
observed triple equals the recorded triple. Every ambiguous path denies:

- **Missing field** (either side) → `DENY_DRIFT_UNVERIFIABLE`, never "no drift".
  Absence of evidence is treated as evidence of risk.
- **Present-but-unusable** value (blank string, NUL byte, wrong type, e.g.
  `sequence: "7"`) → `DENY_DRIFT_UNVERIFIABLE`. A value we cannot trust to
  compare is not coerced toward a match.
- **Unresolvable checkpoint** via the ledger (unknown id/session, invalid id) →
  `DENY_DRIFT_UNVERIFIABLE`. If we cannot fetch what to compare against, we
  cannot verify a resume.
- **Tampered ledger** → `LEDGER_INTEGRITY_FAILURE` surfaces before comparison.
- **Unreadable input** (hostile getter/Proxy) → `DENY_DRIFT_MALFORMED`.

This is deliberately asymmetric: an affirmative match must clear every gate; any
doubt at any gate denies. Resuming on ambiguous or absent evidence would be the
exact failure mode V-016 exists to prevent.

**Atomic single-read extraction (descriptor-trap-safe):** each object's needed
keys are established once via `Reflect.ownKeys`, and each own key is read at most
once via a single `[[Get]]`. Consequences:
- a hostile own getter is invoked exactly once — a throwing getter is contained
  to `DENY_DRIFT_MALFORMED`; a getter that returns different values per read
  cannot flip the decision (no TOCTOU);
- a value smuggled onto `Object.prototype` (prototype pollution) is not an own
  key, resolves to a MISSING sentinel, and denies as `DENY_DRIFT_UNVERIFIABLE`;
- membership (`ownKeys`) and value (single `[[Get]]`) are read consistently, so a
  Proxy whose descriptor and get traps disagree cannot split the check from the
  value it validates.

**No clock injected.** The comparison is a pure equality over recorded-vs-observed
evidence and is time-independent; there is no time-derived branch to make
deterministic, so no clock is a dependency (contrast: injected clocks exist only
where a decision reads "now"). The comparator has no I/O, no persistence, and no
transport; the one composing helper touches the ledger only through its existing
read-only resolvers.

---

## 4. V-016 conformance coverage (P / N / A)

File: `tests/conformance-v016-drift.test.mjs` at the **`tests/` root** — inside
the `node --test tests/*.test.mjs` glob, so it **runs in the full suite** (per
the P0-19 lesson that a subdir file would silently not run).

**POSITIVE**
- Observed triple equal to the recorded triple → `{ ok: true, verified: true }`,
  result deep-frozen; resume permitted.
- Same via `evaluateResumeFromLedger` on both `checkpointId` and `sessionId`
  locators.

**NEGATIVE (`DENY_CHECKPOINT_DRIFT`)**
- `content_hash` differs.
- source-ledger `sequence` advanced under the checkpoint (`7 → 8/9`).
- `state_snapshot_ref` changed (points at different materialized state).
- Same drift asserted end-to-end through the ledger-composing entry point.

**ADVERSARIAL (fail-closed proofs)**
- Missing comparison field (observed side and recorded side) →
  `DENY_DRIFT_UNVERIFIABLE`, and explicitly **not** permitted.
- Present-but-unusable (blank ref, NUL-tainted hash, string `sequence`) →
  `DENY_DRIFT_UNVERIFIABLE`.
- Hostile getter forging a "matching" hash (throws on read) → contained to
  `DENY_DRIFT_MALFORMED`.
- Atomic single-read: a counting getter returning a drifted value is invoked
  **exactly once** and still denies `DENY_CHECKPOINT_DRIFT`.
- Prototype-pollution of `content_hash` (reachable via prototype, not an own key)
  → `DENY_DRIFT_UNVERIFIABLE`.
- Malformed/array containers → `DENY_DRIFT_MALFORMED`; every emitted code is in
  the frozen closed set.
- Tampered persisted checkpoint record → `LEDGER_INTEGRITY_FAILURE` surfaces
  before comparison (integrity fault, not a soft resume decision).

**Net V-016 movement:** the drift half moves BLOCKED → covered (P/N/A) **as a
candidate primitive**. The verification matrix's own vocabulary applies —
coverage of an unwired candidate is not `PASS` for the wired control; V-016
sign-off still requires adoption plus operator/governance action.

---

## 5. Integrity guarantees

- **Byte-identity:** `tests/conformance-v016-drift.test.mjs` pins every composed
  ledger/contract primitive to its git blob hash at main @ `ec5aa76` and fails if
  any drifts: `checkpoint-ledger`, `durable-ledger`, `contract-validator`,
  `canonical-fingerprint`. **No `src/` primitive is modified by this candidate.**
- **Read-only composition:** the comparator reads a `CheckpointLedger` only
  through its existing `resolveCheckpoint` / `resolveLatest`; it never appends or
  rewrites.
- **Deny-by-default + deep-frozen outputs:** every return value is a frozen
  `{ ok: true, verified: true }` or `{ ok: false, code, message }`.
- **Suite gating:** the new file sits at the `tests/` root, inside the
  `tests/*.test.mjs` glob, so it runs in the full suite.

### Verification results (this candidate)

- `npm run validate` → **exit 0** (17 schemas: 7 canonical bootstrap + 10
  governed extensions; **no new schema** introduced).
- `npm test` full suite → **1125 tests / 1123 pass / 0 fail / 2 skipped**
  (baseline `1115 / 1113 / 0 / 2`; delta **+10** live V-016 drift cases, all
  passing; the 2 skips are unchanged pre-existing honest stubs).

---

## 6. Advisory status fields

- **truth_status:** `verified_true` — coverage claims are backed by executed
  tests (`npm test` green) and the comparator's real deny codes.
- **authority_status:** `advisory_only` — no execution or approval authority;
  wiring/adoption and any V-016 sign-off remain operator/governance gated.
- **implementation_status:** `candidate` — the drift comparator exists and is
  covered, but is unwired and unadopted; not P0-18 sign-off.
- **risk_class:** `low` — new pure module plus test-only, read-only composition;
  no primitive, schema, policy, ADR, or production surface is mutated;
  deny-by-default and fail-closed-on-ambiguity preserved.

```yaml
self_certification:
  agent_id: claude-motor-p0-18-v016-drift-01
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

**Final rule:** Recommend the comparator as a CANDIDATE; do not wire, adopt, or
sign off. V-016 sign-off requires adoption by a governed restore consumer plus
the operator and governance verdict.
