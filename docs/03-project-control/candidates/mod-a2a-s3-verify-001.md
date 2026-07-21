# MOD-A2A Slice S3 — Independent Cross-Provider Re-Verification (mod-a2a-s3-verify-001)

- reviewer_identity: `claude-immune-verify-a2a-s3-01`
- reviewer_role: BST-SA Immune worker (independent security/governance re-verification; advisory only — no execution, merge, or approval authority)
- review_type: **independent confirmation of an existing cross-provider review** — this candidate already carries `mod-a2a-s3-escalation-route-crossprovider-review-001.md` (verdict APPROVE_WITH_NOTES by `claude-rev-a2a-s3-crossprovider-01`). My job is to RE-DERIVE that review's load-bearing claims first-hand and either confirm or challenge them, not rubber-stamp.
- candidate under review: branch `origin/bst/mod-a2a-s3-crossprovider-review-001` @ tip `5531865aabafd0a3de0a9ae4f3f44677b4aeed21` (`[MOD-A2A-S3-CROSSPROVIDER] Fold main (union)`)
- base main: `bd00c53`
- merge-base(tip, bd00c53): `ee31db7` (the fold's second parent — see provenance note below)
- producer_record (read, NOT trusted): `mod-a2a-s3-escalation-route-producer-verification-001.md` (producer `codex-root` / `ENGIN`, impl `420d6af`)
- prior review (read, independently re-derived, NOT trusted as verdict): `mod-a2a-s3-escalation-route-crossprovider-review-001.md`
- date: 2026-07-22
- environment: isolated detached-HEAD git worktree outside the live checkout; `npm ci` clean (6 packages); node `v24.12.0`; no push, no merge, no touch of the live branch; record committed on non-main branch `claude/rev/a2a-s3-verify` from the tip.

---

## Verdict: APPROVE_WITH_NOTES (agrees with the existing cross-provider review)

I independently reach the **same verdict** as `mod-a2a-s3-escalation-route-crossprovider-review-001.md`. The candidate is a small, correctly-scoped, pure, deny-by-default, **UNWIRED** escalation-route evaluator (`src/control/escalation-route.mjs`, 47 LOC) plus its test. Every load-bearing claim of the existing review that I re-derived held. I add two provenance-level notes the existing review did not surface (N1, N2 below) — neither blocks merge of the unwired candidate.

**Agreement with existing review: YES.** I confirm its Blocking=none, its M2 (no linkage to S2's actual gate decision), L1 (case-sensitive self-escalation confusable), L2 (narrow single-identity SoD), and its positive finding (bound records + `evidence_refs` deeply frozen). I did not find any claim in it to be false. I disagree with nothing material; I extend it.

---

## Independent re-derivation (probes run first-hand against the checked-out tip)

47/47 probes pass. Highlights:

### 1. Deny-by-default / fail-closed — CONFIRMED
`evaluateEscalationRoute()` denies every non-happy path with a distinct code, and the `ok:true` path requires *all* of: well-formed candidate (`delegation_id`/`version≥1 integer`/`source_actor_id`/`escalation_route` present) → well-formed actor identity → role ∈ `{REV,QA,GOV}` and `role === normalizeRole(escalation_route)` → `escalationActorId !== source_actor_id`. Independently reproduced: no-args, `null`/array candidate, `version` = `0`/`1.5`/`"1"`/`NaN`, blank route/role/actor all deny (`DENY_MALFORMED_DELEGATION` / `DENY_MALFORMED_ROUTE`). Rebuilt the core denials from scratch — not copied from the prior review.

### 2. Non-escalation composition (composes ratified A2A-S2, does not reinvent authority) — CONFIRMED, with the correct nuance
- **What it DOES compose:** the ratified SoD role vocabulary from `sod-rules.mjs` — `ESCALATION_ROLES = Object.keys(HANDOFF_ACCEPTANCE_LADDER)` = `["REV","QA","GOV"]` (frozen), plus `normalizeRole` (alias `governance→GOV` authorizes correctly). It reuses the ratified ladder's *keys* rather than re-declaring a literal `['REV','QA','GOV']` table. **No reinvention of the authority/role set.**
- **What it does NOT compose:** S2's actual gate (`delegation-gate.mjs` `evaluateDelegation`) or the non-escalation-comparator (`withinCeiling`). `escalateRoute` takes no S2 decision input and cannot require a prior S2 denial. This is exactly the existing review's central finding **M2**, and I confirm it first-hand: an escalation route can be bound for a `delegationCandidate` that was never put through S2 at all. For the *authority-ceiling* sense of "non-escalation" (a delegate getting more authority than the delegator), that logic lives entirely in S2 and is **not** enforced here.
- **My independent ruling:** correct reuse of the one primitive that overlaps (role vocabulary); correct non-duplication of S2's ceiling logic (no parallel ceiling table); but a genuine, disclosed **absence** of enforced linkage to S2's decision. Acceptable for a deliberately-unwired pure-evaluator slice (identical deferral pattern to S1/S2). **It must be an explicit, non-optional precondition of the future wiring slice that a freshly-read S2 denial (matching exact delegation id+version) is required before `bindEscalationRoute` is invoked.** I agree with the review that this is not yet written into the candidate's own comments and should be, before any wiring begins.

### 3. Binding immutability (TASK-014) — CONFIRMED (immutable post-creation; cannot corrupt the decision)
- `bindEscalationRoute(...)` returns a record where `Object.isFrozen(record)` **and** `Object.isFrozen(record.evidence_refs)` are both true (deep-frozen output via `freezeRecord`).
- `evidence_refs.push(...)` throws `TypeError`; `Object.defineProperty(record,'outcome',...)` throws; strict-mode assignment `record.outcome = 'HACKED'` throws (ESM strict mode — **stronger** than a silent no-op) and the value is unchanged.
- A denial cannot mint a bound outcome (`bindEscalationRoute` of a self-escalation yields `outcome: "DENY_SELF_ESCALATION"`, never `ESCALATION_BOUND`).
- `verifyEscalation` still returns `{ok:true}` after every attempted mutation of the bound record. **The binding cannot be mutated post-creation to corrupt the escalation decision.**

### 4. Atomic-snapshot / single-get (the N4 descriptor-trap lesson) — CONFIRMED
Instrumented a hostile `Proxy` `delegationCandidate` that flips `delegation_id` on a second read and counts every trap. Read-count trace: `{delegation_id:1, version:1, source_actor_id:1, escalation_route:1, project_id:1, work_package_id:1, session_id:1}` — **each field read exactly once**, via destructuring (a single `[[Get]]` per property).
- No `getOwnPropertyDescriptor` trap was ever invoked on the untrusted candidate (no descriptor-based double-read — the N4 lesson is honored).
- No `ownKeys` enumeration over the untrusted candidate.
- The minted `evidence_refs[0]` is bound to the **coherent snapshot** value (`del-1`), never the later-flipped `MUTATED` value — so a value that changes across reads cannot desync the binding ref from the evaluated decision. Note `bindEscalationRoute` re-reads only the informational metadata (`project_id`/`work_package_id`/`session_id`) from the candidate; the *security-critical* fields come solely from `evaluateEscalationRoute`'s single snapshot, so there is no TOCTOU between evaluate and bind for the binding-relevant fields.
- A throwing accessor propagates (throws) rather than being swallowed into a false authorization.

### 5. Adversarial escalation — CONFIRMED all deny
- **Self-escalation** (`escalationActorId === source_actor_id`) → `DENY_SELF_ESCALATION`.
- **Escalating beyond the pre-declared route ceiling** (in this module the "ceiling" is the requester-declared `escalation_route` role): claiming any role other than the declared route → `DENY_ROUTE_NOT_AUTHORIZED` (e.g. route `GOV` / actor `QA`; route `QA` / actor `GOV`; a role not in the ladder such as `ENGIN` or `PRODUCER`). There is no *authority-ceiling* comparison here (that is S2's; see M2) — the enforced ceiling is role-vs-declared-route + independence.
- **Replay** across each of the four bound dimensions (delegation id, version, role, actor) → `DENY_DELEGATION_MISMATCH`. Wrong decision type → `DENY_WRONG_DECISION_TYPE`; non-bound outcome → `DENY_NOT_BOUND`; unknown verify role → `DENY_ROUTE_NOT_AUTHORIZED`; malformed verify request → `DENY_MALFORMED_VERIFICATION_REQUEST`; null decision → `DENY_UNKNOWN_ESCALATION`.
- **Chained escalation:** feeding a bound record's identity back as a fresh `delegationCandidate` for the same actor denies as self-escalation; a distinct actor gets only a fresh route decision (no ceiling composition — consistent with M2).
- **Forged binding (disclosed scope boundary):** a hand-crafted record `{decision_type:"GOVERNANCE", outcome:ESCALATION_BOUND, evidence_refs:[<correct-format ref>]}` **verifies OK**. `verifyEscalation` trusts the record's own contents; for an unwired pure primitive with no cryptographic binding, record *authenticity* is the caller's/ledger's responsibility (same house pattern as `approval-binding.mjs`). The replay/dimension binding still prevents cross-delegation/cross-role/cross-actor reuse of a *genuine* record. This matches the existing review's authority-boundary note; I confirm it as a boundary to close at wiring time, not a defect in the unwired slice.

### 6. Byte-identity of composed / adjacent primitives vs `bd00c53` — CONFIRMED (hash-verified, not asserted)
`src/control/sod-rules.mjs`, `delegation-gate.mjs`, `authority-engine.mjs`, `approval-binding.mjs` are **byte-identical** across `bd00c53` and the tip (`git rev-parse <ref>:<path>` blob-SHA match). `src/control/escalation-route.mjs` and `tests/escalation-route.test.mjs` do **not** exist at `bd00c53` — genuinely new. Source carries no `process.env`/clock/`Math.random`/dynamic-`import`/hardcoded-test-id branch (grep-confirmed); its only import is `{ HANDOFF_ACCEPTANCE_LADDER, normalizeRole }` from `./sod-rules.mjs`.

---

## Scope + regression

- **Scope:** diff vs `bd00c53` adds exactly `src/control/escalation-route.mjs` + `tests/escalation-route.test.mjs` + 3 candidate docs, and appends 5 `MANIFEST.json` entries. **Unwired:** the only repo reference to the module outside its own test is a *deferring comment* in `src/ledger/delegation-ledger.mjs` ("escalation-route primitive against this field") — no live importer (grep-confirmed).
- **Targeted test:** `node --test tests/escalation-route.test.mjs` → **12 total, 12 pass, 0 fail** (matches producer & prior review).
- **Full suite at the TIP:** `npm test` → **1161 total, 1158 pass, 0 fail, 0 cancelled, 3 skipped, 0 todo**, exit `0`.
- **Validator:** `npm run validate` (`node tools/validate-foundation.mjs`) → exit `0`, all checks `PASS`.
- **`npm ci`:** clean, 6 packages.

### N1 — Provenance note: the existing review's regression totals are stale relative to the tip it accompanies (NEW; not a code defect)
The prior review reports `npm test` = **800 total / 795 pass / 5 skipped**, "matching the producer exactly." That measurement was taken at the **pre-fold candidate SHA `9155246`** (45 test files). The artifact I am actually reviewing is the branch **tip `5531865`**, which folded main-at-`ee31db7` (union) and therefore carries **60 test files → 1161 tests**. Both are green (0 fail), so the *conclusion* holds at the tip — but the specific totals cited in the accompanying review do not correspond to the tip that would merge. I re-ran against the tip and independently confirm green. Recommend future review records pin their regression totals to the exact SHA that carries them.

## Merge-cleanliness vs main @ `bd00c53`

- `git merge-tree --write-tree bd00c53 5531865` → exit `0`, **zero conflicts**. The resulting merged tree (a) contains `src/control/escalation-route.mjs` + test, (b) **preserves** the main-added files the two-dot diff appears to "delete" (`module-completion-tracker-001.md`, `session-summary-2026-07-module-loop-and-p0-terminal.md`), and (c) yields a valid `MANIFEST.json` (444 files, parses; contains both the escalation entries and the main-added entries). No schema/contract file added → **no conflict with MEM-S2 / SKILL-S2** — confirmed.

### N2 — Provenance note: stale-fold MANIFEST produces a misleading two-dot diff (NEW; not a code defect)
The tip's `MANIFEST.json` was rebuilt on the fold's second parent `ee31db7`, not on current main `bd00c53`. Consequently a two-dot `git diff bd00c53 HEAD -- MANIFEST.json` shows spurious **removals** of `session-summary-2026-07-module-loop-and-p0-terminal.md` (and re-orders `secb-gov-001-second-...`). These are artifacts of the branch predating those main entries — the real **3-way** merge into `bd00c53` does **not** delete them (verified above). A rebase/retarget onto current main would clear the illusion. No data-loss risk on merge; flagged so a reviewer reading only the two-dot diff is not misled.

---

## Governance / authority boundary

Candidate is **UNWIRED**: no live path imports it; it accepts/rejects/dispatches/grants/appends nothing. This re-verification is **advisory only** — it does not authorize merge, wiring, activation, or production. Operator/GOV retains merge authority. This Immune reviewer does not weaken any gate, does not merge, does not push, and does not self-authorize execution.

## Advisory status fields

- truth_status: `verified_true` (all load-bearing claims of the prior review re-derived first-hand at the tip; producer & prior-review records treated as unverified input)
- authority_status: `advisory_only`
- implementation_status: `existing` (candidate complete for its disclosed unwired S3 pure-evaluator scope; wiring out of scope, not built)
- risk_class: `low` (unwired, pure, deny-by-default, deep-frozen outputs, fully reversible; M2 residual risk scoped to a not-yet-written future wiring slice)

### Rulings requested by the task
- **Binding-immutability ruling:** PASS — bound record and `evidence_refs` are deeply frozen; every mutation path (push / defineProperty / strict-mode write) throws; a denial cannot mint a bound outcome; verification is unaffected by tamper attempts.
- **Non-escalation-composition ruling:** PASS with note — composes the ratified A2A-S2 SoD role vocabulary (`HANDOFF_ACCEPTANCE_LADDER`/`normalizeRole`) without reinventing the authority set; does **not** compose S2's ceiling gate (M2) — acceptable for the unwired slice, must be documented as a mandatory wiring precondition.
- **Agreement with existing cross-provider review:** YES — same verdict (APPROVE_WITH_NOTES), all its load-bearing claims independently confirmed, extended with N1/N2.

```yaml
self_certification:
  agent_id: claude-immune
  peer_agent_id: codex-immune
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```
