# MOD-EVID S2/S3 Rehydration Edge-Legality Fast-Follow — Independent Review (Round 3)

**Record ID:** MOD-EVID-S2-S3-REHYDRATION-EDGE-LEGALITY-FIX-INDEPENDENT-REVIEW-001
**Status:** ADVISORY — independent review record, not an authorization
**Reviewer role:** REV/SEC, BST-SA independent worker agent (advisory-only; cannot merge, push, or self-authorize execution)
**Reviewed:** branch `bst/mod-evid-s2-s3-ledger-rehydration-fix-001`, commit `fffd515`, parent `3fb0e6b` (base `origin/main` @ `24274b0`)
**Reviewed against:** `docs/03-project-control/candidates/mod-evid-s2-s3-ledger-rehydration-fix-producer-verification-001.md` (addendum, producer: claude-motor) and `docs/03-project-control/candidates/mod-evid-s2-s3-ledger-rehydration-fix-independent-review-001.md` (round-2 review, finding #4, reviewer: claude-rev-modevid-s2s3-rehydration-fix-independent-01)
**Date:** 2026-07-21
**Isolation:** fetched the branch into a fresh `git worktree add --detach fffd515` checkout at `C:/Users/ounkh/SecB-worktrees/mod-evid-s2-s3-rehydration-edge-legality-review-001`, separate from the producer's own worktree and from the round-2 reviewer's worktree. `node_modules` was reused via a filesystem junction to the main checkout's `node_modules` (read-only, gitignored, not committed) purely to avoid a redundant `npm install`; no source or test file was shared or symlinked. Nothing on the live branch ref, the producer's worktree, or any other worktree was touched. Two ephemeral, from-scratch adversarial probe scripts were written directly against the real `DurableLedger` + `EvidenceEnvelopeService` classes, run, and deleted before this record was written (never committed).

---

## Verdict

**APPROVE_WITH_NOTES** — the fast-follow correctly closes both of the round-2 reviewer's reproduced exploits (forged `EVIDENCE_SEAL` with `sealed_status: "ACCEPTED"`; forged `EVIDENCE_VERIFICATION` with illegal `next_status: "ACCEPTED"`), and `#assertEdge` is now genuinely applied to **every** status-bearing ledger entry type this service reads during rehydration (`EVIDENCE_SEAL`, `EVIDENCE_VERIFICATION_REQUEST`, `EVIDENCE_VERIFICATION`, `EVIDENCE_ACCEPTANCE`) — confirmed by construction, not just by reading the diff. No path to an illegitimate `ACCEPTED` status survives this fix; that was the actual, in-scope defect and it is closed.

However, adversarial testing found a real, reproducible, related gap that this fast-follow does not close: `#assertEdge(from, to)` validates a claimed transition against the **full abstract `STATE_MACHINES.Evidence` graph**, not against the **narrower set of transitions the live ladder method for that entry type can actually produce**. Two live methods (`recordVerification`, and implicitly `sealEnvelope`/`acceptEvidence` via their hardcoded literals) each enforce a stricter business rule than raw graph-edge legality — because `QUARANTINED` (and `REJECTED`, `SUPERSEDED`) are modeled in the canonical machine as reachable from almost every state (a generic "reject/supersede at any time" pattern, likely intended for a broader governance surface than this service alone implements). `#rehydrate()`'s fold does not reproduce those extra, narrower guards for the same entry types it otherwise correctly gates. Concretely and confirmed by fresh, independent reproduction below: a forged `EVIDENCE_VERIFICATION` or `EVIDENCE_ACCEPTANCE` (or, for the seal case, `EVIDENCE_SEAL`) entry claiming `QUARANTINED` (or `REJECTED`) as its target is **not denied** by rehydration even when the live method for that entry type could never itself have produced that exact transition. This cannot be used to reach `ACCEPTED` (confirmed absent in every variant tried) — it is a downgrade/mislabel-class gap, not an escalation-class gap, and it requires the same narrow, already-acknowledged high-privilege prerequisite (direct `DurableLedger.append()` access, bypassing the service entirely) as the round-2 finding. Recommend landing this fix as-is (it correctly closes the reported, in-scope finding) together with a further fast-follow that either (a) restricts `#assertEdge`'s source argument per entry type to mirror each live method's real narrower guard, or (b) validates that every rehydrated entry's `(from, to)` pair is a transition at least one live method could have produced, not merely a graph-legal edge.

---

## 1. Method

Verified `bst/mod-evid-s2-s3-ledger-rehydration-fix-001` is at `fffd515` (`git log --oneline -5`), parent `3fb0e6b` (the round-2 reviewer's own commit), base `origin/main @ 24274b0`. Added an isolated `git worktree add --detach fffd515` checkout at a path distinct from every other active worktree on this branch. Read `docs/03-project-control/candidates/mod-evid-s2-s3-ledger-rehydration-fix-producer-verification-001.md` in full, including the round-3 addendum. Read the complete `git diff 3fb0e6b fffd515` (4 files: the producer-verification doc, the module-completion tracker, `src/services/evidence-envelope-service.mjs`, `tests/evidence-envelope-service.test.mjs`, `tests/p0-19-self-pilot.test.mjs`). Read the full current `src/services/evidence-envelope-service.mjs` (841 lines) and `STATE_MACHINES.Evidence` in `src/control/state-machine.mjs` (lines 46–55) directly, not just the diff, to understand every legal edge, not only the edges the diff touches. Wrote three fresh, from-scratch adversarial Node scripts (not derived from the producer's or round-2 reviewer's test files) exercising: the two original exploits; a forged entry of each remaining status-bearing entry type; the QUARANTINED/REJECTED-reachable-from-many-states asymmetry; cross-identity interleaving; ledger-level replay/duplicate semantics; and partial-construction-failure. Ran the 8 pre-existing `REHYDRATION`-named tests directly (`node --test --test-name-pattern="REHYDRATION"`), the full module suite, and `npm test` (which runs `npm run validate` — `tools/validate-foundation.mjs` — before the test run). Grepped the service source for hardcoded test-ID branching. All probe scripts were deleted before this record was written; the working tree is clean (`git status --short` empty other than this new file).

## 2. `STATE_MACHINES.Evidence` — the graph consulted by `#assertEdge`

```
CAPTURED:            ["SEALED", "QUARANTINED"]
SEALED:               ["VERIFICATION_PENDING", "QUARANTINED"]
VERIFICATION_PENDING: ["VERIFIED", "REJECTED", "QUARANTINED"]
VERIFIED:             ["ACCEPTED", "REJECTED", "SUPERSEDED", "QUARANTINED"]
ACCEPTED:             ["SUPERSEDED", "QUARANTINED"]
REJECTED:             []
SUPERSEDED:           []
QUARANTINED:          []
```

`QUARANTINED` is a legal target from **five** different source states; `REJECTED` from two. Neither `REJECTED` nor `SUPERSEDED` is ever produced by any method this service actually implements (grepped: zero occurrences outside this constant table). `ACCEPTED` is reachable from exactly one source (`VERIFIED`) — this is the reason the original finding #4 and this fast-follow are fully effective for the escalation path specifically: there is only one edge into `ACCEPTED` in the whole graph, so gating it via `#assertEdge` alone is complete. The same is not true of `QUARANTINED`/`REJECTED`.

## 3. Both round-2 exploits reproduced fresh — CONFIRMED CLOSED

Independently re-forged both exploits from scratch (not copied from the producer's or round-2 reviewer's test bodies):

- **Forged `EVIDENCE_SEAL`, `sealed_status: "ACCEPTED"`, as the sole/first entry:** `assertEdge(CAPTURED, ACCEPTED)` — `ACCEPTED` not in `CAPTURED`'s edge set — construction denies `DENY_UNDEFINED_TRANSITION: "Evidence cannot transition from CAPTURED to ACCEPTED"`. Confirmed.
- **Forged `EVIDENCE_VERIFICATION`, `next_status: "ACCEPTED"`,** following a legitimate `register → seal → requestVerification` through the real live API: `assertEdge(VERIFICATION_PENDING, ACCEPTED)` — not a legal edge — construction denies `DENY_UNDEFINED_TRANSITION: "Evidence cannot transition from VERIFICATION_PENDING to ACCEPTED"`. Confirmed.

Both match the producer's and round-2 reviewer's claims exactly.

## 4. Entry-type coverage — all four status-bearing types gated, but not equivalently

Confirmed by reading the full `#rehydrate()` fold (lines 217–287) that `SEAL_ENTRY_TYPE`, `VERIFICATION_REQUEST_ENTRY_TYPE`, `VERIFICATION_ENTRY_TYPE`, and `ACCEPTANCE_ENTRY_TYPE` — the complete set of status-bearing entry types this service's constants define — each call `this.#assertEdge(...)` before adopting the claimed status. There is no separate "QUARANTINE entry type"; quarantine/rejection are reached only via `next_status` values inside `VERIFICATION_ENTRY_TYPE` or (per the graph) theoretically `ACCEPTANCE_ENTRY_TYPE` payloads, both covered by the same generic `#assertEdge(record.status, toStatus)` call as every other transition.

Two forged-entry probes confirm this coverage is real for the cases the round-2 reviewer's own exploits pattern-matched:

- Forged `EVIDENCE_ACCEPTANCE` with `next_status: "ACCEPTED"` immediately after only a `SEAL` (skipping verification entirely): `assertEdge(SEALED, ACCEPTED)` — not legal — denied `DENY_UNDEFINED_TRANSITION`. Confirmed.
- Forged `EVIDENCE_VERIFICATION_REQUEST` with `next_status: "ACCEPTED"` from `SEALED`: not a legal edge — denied `DENY_UNDEFINED_TRANSITION`. Confirmed.

So for the specific defect class round 2 found (a single forged entry reaching `ACCEPTED`), every entry type is now correctly and equivalently gated — this fix does what it claims.

## 5. Gap found: `#assertEdge` alone is weaker than the live method's real guard for `QUARANTINED`/`REJECTED` targets

This is the substantive finding of this round. Two live methods enforce more than raw graph-edge legality:

- `recordVerification()` (line 574): `if (record.status !== VERIFICATION_PENDING_STATE) deny("DENY_UNDEFINED_TRANSITION", ...)` **before** it even consults `#assertEdge(VERIFICATION_PENDING_STATE, target)` (line 577) — the source code's own comment explains why: *"QUARANTINED is reachable from several states, so the target-edge check alone is insufficient — pin the source to VERIFICATION_PENDING so a fail verdict cannot quarantine straight from SEALED (a ladder skip)."*
- `sealEnvelope()` and `acceptEvidence()` never write anything other than their one hardcoded literal (`SEALED_STATE`, `ACCEPTED_STATE` respectively) — they are narrower than the graph by construction, not by an explicit extra check.

`#rehydrate()`'s fold does not reproduce any of this narrowing for the same entry types. It only ever calls the generic `this.#assertEdge(record.status, toStatus)` (or, for `SEAL_ENTRY_TYPE`, `this.#assertEdge(fromStatus, toStatus)` against the entry state or existing record status). Confirmed exploitable, fresh, from-scratch, in four independent variants:

1. **Forged `EVIDENCE_VERIFICATION` entry, `next_status: "QUARANTINED"`, immediately after a real `EVIDENCE_SEAL` — no `EVIDENCE_VERIFICATION_REQUEST` in between.** `assertEdge(SEALED, QUARANTINED)` — legal per the graph (`SEALED: [..., "QUARANTINED"]`) — rehydration **does not deny**; construction succeeds with `status: QUARANTINED`, `verifierActorId: "attacker"`, `verdict: "fail"`, `verificationRequestedAt: null`. Cross-checked against the real live API: `service.sealEnvelope(...)` then `service.recordVerification(evidenceId, 1, "attacker", "fail")` **without** a preceding `requestVerification()` call **is** denied `DENY_UNDEFINED_TRANSITION` by the live method's explicit source guard — i.e., this is a ledger state the live API could never itself have produced, but rehydration accepts it silently.
2. **Forged `EVIDENCE_SEAL` entry, `sealed_status: "QUARANTINED"`, as the first/only entry.** `assertEdge(CAPTURED, QUARANTINED)` — legal per the graph (`CAPTURED: [..., "QUARANTINED"]`) — rehydration does not deny; construction succeeds with `status: QUARANTINED`. `sealEnvelope()` itself can never write anything but `sealed_status: "SEALED"` (hardcoded literal, line 374) — this exact ledger content is unreachable via the live API for this entry type at all.
3. **Forged `EVIDENCE_VERIFICATION` entry, `next_status: "REJECTED"`,** following a legitimate seal + verification-request. `assertEdge(VERIFICATION_PENDING, REJECTED)` — legal per the graph — rehydration does not deny; construction succeeds with `status: REJECTED`. `VERDICT_TARGETS` (the only mapping `recordVerification()` ever consults) is `{ pass: VERIFIED, fail: QUARANTINED }` — `REJECTED` is not a producible output of this method under any input; a record showing `REJECTED` is therefore *always* forged, by construction, yet rehydration accepts it.
4. **Retroactive downgrade of an already-legitimately-`ACCEPTED` record:** ran the full real ladder (`register → seal → requestVerification → recordVerification(pass) → acceptEvidence`) through the live API to a genuine `ACCEPTED` state, then appended one forged `EVIDENCE_ACCEPTANCE` entry with `next_status: "QUARANTINED"`. `assertEdge(ACCEPTED, QUARANTINED)` — legal per the graph (`ACCEPTED: [..., "QUARANTINED"]`) — rehydration does not deny; the rehydrated record's status becomes `QUARANTINED` with `acceptorActorId: "attacker"`, silently overwriting the record of a real, SoD-checked, approved acceptance. `acceptEvidence()` itself never writes anything but `next_status: ACCEPTED_STATE` (hardcoded literal) — this is the most notable variant, since it can decertify evidence that a legitimate governance process already accepted, not merely mislabel evidence that was never fully processed.

None of these four variants reach `ACCEPTED` illegitimately — every attempted forged path to `ACCEPTED` (§3, §4) is correctly denied, and this was re-confirmed specifically as part of variant 4 above (the only way to reach `ACCEPTED` in this ledger was the real, SoD-checked live-API sequence). All four are downgrade/mislabel-class, not escalation-class.

**Scope/severity assessment:** this requires the exact same narrow, already-acknowledged high-privilege prerequisite as the round-2 finding — direct `DurableLedger.append()` access, bypassing `EvidenceEnvelopeService`'s own API entirely (a bug elsewhere, a maintenance script, or a second writer against the same ledger file). It does not reopen the ordinary-restart defect this branch exists to fix, and it does not create any new path to `ACCEPTED`. It is real, reproducible, and worth a fast-follow, but on the same footing as the round-2 finding itself was: not blocking.

## 6. Locally-legal-but-globally-inconsistent sequences — no *additional* gap beyond §5

Specifically tested for the sequence-level attack the task asked about, beyond the single-entry cases in §5:

- **Cross-identity interleaving:** built two identities (A, B) via the real live API, interleaved their ladder calls, ran B all the way to a genuine `ACCEPTED`, then inserted one forged `EVIDENCE_VERIFICATION` entry for A (`next_status: "ACCEPTED"`) immediately after B's legitimate acceptance entries in ledger order. Confirmed denied (`DENY_UNDEFINED_TRANSITION`) — A's per-key fold state (keyed by `recordKey(evidence_id, version)` via `JSON.stringify`) is not confused or polluted by B's more-advanced status appearing earlier in the same chronological ledger.
- **Replay/duplication:** appending a byte-identical entry a second time with the same `idempotencyKey` does not write a second ledger line at all (`DurableLedger.append()` returns `{ replayed: true }` without appending — confirmed: `ledger.read().length` stays `1`); reusing the same `idempotencyKey` with different payload content is denied `DENY_IDEMPOTENCY_CONFLICT` at `append()` itself, before it could ever reach the ledger file. A raw file-level duplicate (bypassing `append()` entirely, e.g. a hand-edited `.ndjson` line) would break the hash chain (`previousHash`/`recordHash` linkage) and is caught as `LEDGER_INTEGRITY_FAILURE` → `DENY_CHAIN_BROKEN` at `#rehydrate()`'s `this.#ledger.read()` call, before the fold even runs. So the append-level idempotency guarantees plus the read-level chain-integrity check together already close the specific "replayed/duplicated legal-looking entry" sub-case named in the task; §5 remains the only demonstrated gap.

## 7. Fail-closed propagation — confirmed complete, no partial-construction-failure gap

Confirmed a caller that wraps `new EvidenceEnvelopeService(...)` in `try { } catch { }` around one of the §3 forged-ledger scenarios never obtains a usable instance: the local variable assigned from `new EvidenceEnvelopeService(...)` remains `undefined` after the throw (ordinary JS constructor semantics — a throwing constructor never returns a value to assign), and the caught error carries `code: "DENY_UNDEFINED_TRANSITION"`. `#rehydrate()` runs as the very last statement of the constructor (line 163) and is the only place `#records` is populated before any method becomes callable, so there is no code path where a partially-folded `#records` Map escapes to a caller even if the exception is swallowed — swallowing the error simply leaves the caller without a reference to any instance at all, not a broken one. Also confirmed no module-level or static-state leakage: constructing a second, well-formed instance against a *different* ledger in the same process immediately afterward succeeds normally and is unaffected by the prior throw.

## 8. Pre-existing REHYDRATION tests — confirmed passing, run directly

```
node --test --test-name-pattern="REHYDRATION" tests/evidence-envelope-service.test.mjs
```
Result: **11/11 pass** — the 8 pre-existing genuine-ledger-history tests named in the task (exact restart to `ACCEPTED`; duplicate-guard post-restart; `verifyChain` truth post-restart; mid-ladder restart; `QUARANTINED`-only restart; multiple identities/versions; chain-broken construction-time deny; ledger-read-failure deny) plus the 2 new adversarial regression tests from this fast-follow plus the "normal single-instance lifecycle unaffected" test, all passing, none skipped.

## 9. Full module suite and full test suite — independently confirmed

```
node --test tests/evidence-envelope-service.test.mjs   →  43/43 pass
npm test                                                →  1160 tests / 1157 pass / 0 fail / 3 skip
```
Matches the producer's claimed counts (41/41 → 43/43 module; 1158/1155/0/3 → 1160/1157/0/3 full suite) exactly. `npm run validate` (`tools/validate-foundation.mjs`), which `npm test` runs before the `node --test` pass, completed with no reported failure ahead of the test run.

## 10. Hardcoded test-ID branching — none found

```
grep -nE "ev_modevid|test-id|testId|NODE_ENV|process\.env" src/services/evidence-envelope-service.mjs
```
Zero matches — same result as both the producer's and the round-2 reviewer's own grep.

## 11. Self-certification

```yaml
self_certification:
  agent_id: claude-rev-modevid-s2s3-rehydration-edge-legality-fix-independent-01
  peer_agent_id: claude-motor
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

Advisory only. This record certifies independent verification of the rehydration edge-legality fast-follow (`fffd515`) is complete and reports it for operator/governance disposition. It does not itself authorize, merge, or push. Operator authority remains sole. No production declaration, no ADR/policy/schema mutation, no self-authorization of execution is implied or made by this record.

---

*Provenance — source: independent fresh reproduction and adversarial testing against `bst/mod-evid-s2-s3-ledger-rehydration-fix-001` @ `fffd515` (parent `3fb0e6b`, base `origin/main` @ `24274b0`), reviewing `docs/03-project-control/candidates/mod-evid-s2-s3-ledger-rehydration-fix-producer-verification-001.md` (producer: claude-motor, round-3 addendum) and the round-2 independent review at the same path @ `3fb0e6b`. Timestamp: 2026-07-21. Agent role: REV/SEC, BST-SA independent worker. No push, no merge, no operator ratification implied.*
