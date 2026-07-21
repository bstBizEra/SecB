# MOD-EVID S2/S3 Ledger Rehydration Fix — Independent Review

**Record ID:** MOD-EVID-S2-S3-LEDGER-REHYDRATION-FIX-INDEPENDENT-REVIEW-001
**Status:** ADVISORY — independent review record, not an authorization
**Reviewer role:** REV/SEC, BST-SA independent worker agent (advisory-only; cannot merge, push, or self-authorize execution)
**Reviewed:** branch `bst/mod-evid-s2-s3-ledger-rehydration-fix-001`, commit `be8cfd6`, base `origin/main` @ `24274b0`
**Reviewed against:** `docs/03-project-control/candidates/mod-evid-s2-s3-ledger-rehydration-fix-producer-verification-001.md` (producer: claude-motor)
**Date:** 2026-07-21
**Isolation:** reviewed in a fresh detached-HEAD worktree at `be8cfd6`, independent of the producer's own worktree; nothing in the producer's worktree/branch state was touched.

---

## Verdict

**APPROVE_WITH_NOTES** — the fix correctly closes the reported restart-scenario defect, verified via an independently written, fresh reproduction (not copied from the producer's tests). Every reachable ladder status round-trips correctly across a restart, multi-identity rehydration does not cross-contaminate, and repeated rehydration is deterministic. However, adversarial testing at the rehydration layer itself found a real, reproducible gap: `#rehydrate()` trusts `payload.sealed_status` / `payload.next_status` verbatim with no state-machine edge-legality validation, so a ledger entry appended directly through `DurableLedger.append()` (bypassing the service's own business logic) can make a fresh instance rehydrate an identity straight to `ACCEPTED` with zero verification, zero SoD checks, zero approvals, and zero acceptance-ledger receipt — and both `verifyChain()` and `resolveAccepted()` report success on it. This is a narrower-attack-surface but same-defect-class gap (silent-wrong-state via an unvalidated trust boundary) as the bug this fix was written to close. Recommend landing this fix (the restart-scenario closure is correct and should not be blocked) together with, or immediately followed by, a fast-follow that adds edge-legality validation inside `#rehydrate()` before this is treated as fully closed for a governance-adjacent evidence-assurance service.

---

## 1. Method

Fetched `origin`, verified `bst/mod-evid-s2-s3-ledger-rehydration-fix-001` @ `be8cfd6` (base `origin/main` @ `24274b0` — confirmed via `git log`). Added an isolated `git worktree add --detach` checkout at a path separate from the producer's own worktree (`C:/Users/ounkh/SecB-worktrees/mod-evid-s2-s3-ledger-rehydration-fix-001`, untouched). Read the producer's verification record in full and the complete diff (`git diff 24274b0 be8cfd6`) — `src/services/evidence-envelope-service.mjs` (+111 lines: header comment, `#rehydrate()`, its call site in the constructor), `tests/evidence-envelope-service.test.mjs` (+247 lines, 9 new tests), `tests/p0-19-self-pilot.test.mjs` (byte-identity pin update), and the tracker note. Wrote a fresh, from-scratch adversarial reproduction script (not derived from the producer's test file) exercising the exact restart exploit, every reachable ladder status, malformed/out-of-band ledger entries, multi-identity interleaving, and determinism. Ran the full `npm test` suite independently.

## 2. Exact restart-scenario reproduction — CONFIRMED CLOSED

Independently reproduced, from scratch: instance A runs register → seal → requestVerification → recordVerification(pass) → acceptEvidence to full `ACCEPTED`. A fresh instance B constructed over the same ledger file:

- `B.getEnvelope(...)` correctly reports `ACCEPTED` (not `CAPTURED`, not `DENY_UNKNOWN_EVIDENCE`).
- `B.registerEnvelope(...)` with the same `evidence_id`/`version`, a different `actor_id`, and forged content is denied `DENY_DUPLICATE`; the real record is confirmed untouched after the denied attempt.
- `B.verifyChain(...)` is byte-for-byte `deepEqual` to `A.verifyChain(...)` (`registeredVersions`, `sealedVersions`, `verifiedVersions`, `acceptedVersions`, `quarantinedVersions`, `ledger.count`, `ledger.headHash` all match exactly).
- `B.resolveAccepted(...)` returns `ok: true` with the correct `ACCEPTED`-projected envelope.

This is the exact defect the producer's doc and the second independent review's finding #4 described, and it is genuinely closed for the ordinary-restart case.

## 3. Ladder status round-trip — every reachable status confirmed correct

Enumerated the full `STATE_MACHINES.Evidence` ladder (`CAPTURED → SEALED → VERIFICATION_PENDING → {VERIFIED|REJECTED|QUARANTINED} → {ACCEPTED|SUPERSEDED|QUARANTINED}` plus `ACCEPTED → {SUPERSEDED|QUARANTINED}`). Note: `REJECTED` and `SUPERSEDED` are canonical machine states but are **not reachable through any public method this service actually implements** (`recordVerification` only maps `pass`/`fail` to `VERIFIED`/`QUARANTINED`; there is no accept-time reject/supersede path) — this is a pre-existing scope limit of the service, not something `#rehydrate()` introduces or needs to handle, and not new in this fix.

Round-tripped every status the service *can* actually reach, via the service's own public API only, restarting a fresh instance after each:

| Status | Round-trips correctly | Duplicate/SoD guards still enforced post-restart |
|---|---|---|
| CAPTURED-only (registered, never sealed) | Correctly does **not** survive restart — becomes `DENY_UNKNOWN_EVIDENCE`, exactly as the producer's disclosed scope-honest limitation describes. Re-registration by a different actor is then legitimately allowed (nothing governed was ever recorded, so there is nothing to protect). | N/A (by design) |
| SEALED-only | Yes | Yes (`DENY_DUPLICATE` on re-registration) |
| VERIFICATION_PENDING-only | Yes, including `verificationRequestedBy` | Yes (`DENY_VERIFIER_IS_PRODUCER` still fires against the rehydrated producer) |
| VERIFIED-but-not-accepted | Yes, including `verifierActorId`/`verdict` | Yes (acceptor == verifier still denied against the rehydrated verifier) |
| QUARANTINED (fail verdict) | Yes, and correctly terminal (no outgoing edges) | Yes (`DENY_DUPLICATE` still fires; no further ladder progress possible) |
| ACCEPTED | Yes (see §2) | Yes |

All confirmed via my own fresh script, independent of the producer's 9 tests.

## 4. Malformed/out-of-band ledger entry at the rehydration layer — GAP FOUND

This is the most significant finding. `#rehydrate()` type-switches on `line.entry.type` and then copies `payload.sealed_status` / `payload.next_status` **verbatim** into `record.status`, with no revalidation that the value is a legal edge from the record's prior status. Under the service's *own* public API this can never produce a bad value — `sealEnvelope()` hardcodes `sealed_status: "SEALED"`, and `next_status` is always `VERDICT_TARGETS[verdict]` or a hardcoded ladder constant, each validated before append. But `DurableLedger.append()` (`src/ledger/durable-ledger.mjs`, `validateEntry()`) only checks structural shape — required top-level fields present, `payload` is an object — never payload semantics per `entry.type`. Any code with a reference to the same `DurableLedger` instance/file (a bug elsewhere, a future second writer, a maintenance script, a different ledger-backed service accidentally pointed at the same file) can append a **structurally valid, hash-chain-legitimate** entry whose payload content the real service would never produce for that `entry.type`.

Reproduced two variants, both real and both confirmed:

- **Forged SEAL entry with `sealed_status: "ACCEPTED"`**: a single ledger entry (no verification, no acceptance entries at all) causes a fresh instance to rehydrate the identity straight to `ACCEPTED`. `verifyChain()` reports `valid: true` with the identity in `acceptedVersions`; `resolveAccepted()` returns `ok: true` with an `ACCEPTED`-projected envelope.
- **Forged VERIFICATION entry with `next_status: "ACCEPTED"`** (never a legal `VERDICT_TARGETS` output — only `VERIFIED` or `QUARANTINED` are) following a legitimate SEAL + VERIFICATION_REQUEST: the record reaches `ACCEPTED` with `acceptorActorId: null`, `approvals: null`, and no `acceptanceLedger` receipt at all — i.e., the entire `acceptEvidence()` SoD gate (acceptor ≠ producer, acceptor ≠ verifier) and the approvals requirement are silently bypassed. `verifyChain()`'s "ladder coverage" loop only validates receipts that are *already set* on the record (`if (!receipt) continue`) — it does not require that an `ACCEPTED` status be backed by the existence of an acceptance-ledger receipt, so this passes chain verification cleanly.

A related, lower-severity observation: a SEAL entry with `sealed_status` **omitted** (`undefined`) is accepted at construction with no denial — the record silently gets `status: undefined`, an unrecognized value that happens to fail closed downstream (no `EVIDENCE_MACHINE[undefined]` edge exists, so further transitions deny), but this is fail-closed by accident (an unrecognized string falling through every explicit `===` check), not by design. `#rehydrate()` has no schema/enum validation on either status-bearing field.

**Why this matters / why it doesn't block on its own:** the threat model here is materially different from — and a higher bar to reach than — the original bug. The original defect was reachable by an *ordinary* external caller hitting the service's own public API (`registerEnvelope`) after a completely ordinary process restart; no special access was needed. This gap requires an actor who already holds a reference to the injected `DurableLedger` and can call `.append()` directly, bypassing `EvidenceEnvelopeService` entirely — a narrower, more-privileged injection point. It does **not** reopen the exact restart scenario this fix targets. But for a service whose own header comment states "the ledger hash chain ... is the tamper evidence," and given this project's own convention elsewhere (`#assertEdge`, read-only edge-legality checks in every live ladder method) of never trusting a status transition without checking it against `STATE_MACHINES.Evidence`, `#rehydrate()` is the one place in this file that does *not* apply that discipline to the values it reconstructs from the ledger. Recommend a fast-follow: validate `sealed_status === SEALED_STATE` and that each ladder entry's `next_status` is one of the legal outgoing edges from the record's current status (mirroring the existing `#assertEdge` helper), denying closed (e.g. a new `DENY_REHYDRATION_ILLEGAL_TRANSITION` code, or reusing `DENY_CHAIN_BROKEN`) rather than accepting payload fields verbatim.

## 5. Multi-identity interleaving — no cross-contamination found

Built a fresh scenario (not from the producer's tests) interleaving writes across 4 evidence IDs and 2 versions of one of them, in shuffled order (register/seal/verify/accept operations interleaved across identities rather than run one-at-a-time). A fresh instance's rehydrated view of each identity/version (`getEnvelope`) is `deepEqual` to the live instance's own view for that same key, for all four: one `ACCEPTED`, one `VERIFIED`-not-accepted, one `QUARANTINED`, one `SEALED`-only. Confirmed version separation specifically: v1 and v2 of the same `evidence_id` (`ACCEPTED` vs. `VERIFIED`) did not bleed into each other. `recordKey`'s `JSON.stringify([evidenceId, version])` composite key and the per-line `key` lookup in `#rehydrate()`'s fold correctly isolate each identity.

## 6. Determinism / idempotency — confirmed deterministic

Rehydrated the same immutable ledger with three independent fresh instances; `getEnvelope` and `verifyChain` outputs are `deepEqual` across all three. The fold is a plain in-order iteration over `read()`'s already-chronologically-ordered, already-hash-verified array with no reliance on iteration order of object keys, `Map` insertion order (only ever read back by explicit key, never enumerated in a way that would matter for this check), timers, or randomness — no non-determinism found.

## 7. Performance/scale caveat — accurately characterized, genuinely hypothetical here

Confirmed the claim that `#rehydrate()` adds one more `O(n)` full-ledger read+verify at construction, on top of the pre-existing per-mutation `read()` calls in `sealEnvelope`/`#appendLadder` (both already call `this.#ledger.read()` to compute `expectedSequence` before every append) — this is an existing cost class, not a new order of magnitude. Searched this repository for any persisted `*.ndjson` ledger file or evidence-seal-ledger artifact outside of ephemeral `mkdtempSync` test fixtures: **none exist**. Every ledger in this repo's test suite is created fresh in a temp directory per test and discarded. The disclosed caveat (tens-of-thousands-of-entries range would need a caching/streaming/checkpoint optimization shared by every `DurableLedger` subclass) is correctly characterized as hypothetical/future, not a real near-term concern in this repository today.

## 8. Hardcoded test-ID branching — none found

```
grep -nE "ev_modevid|test-id|testId|NODE_ENV|process\.env" src/services/evidence-envelope-service.mjs
```
Zero matches (confirmed independently, same result as the producer's own grep).

## 9. Full test suite — independently confirmed

```
npm test
```
Result: **1158 tests / 1155 pass / 0 fail / 3 skip**, exit code 0 — matches the producer's claimed post-fix count exactly. `node tools/validate-foundation.mjs` (run as part of `npm test`) completed cleanly with no errors. Did not modify the producer's 9 new tests or the 45/45 module-suite claim; both are consistent with the diff read in §1 (all new test bodies additive, no existing test bodies altered other than the disclosed `PINNED_BLOBS` byte-hash update in `tests/p0-19-self-pilot.test.mjs`, which is an expected consequence of an intentional, disclosed change to the pinned file and not a scope concern).

## 10. Normal single-instance lifecycle — unaffected

Confirmed via the full suite pass above (36 pre-existing tests in the module's own suite, byte-identical bodies per the diff, all still passing) and via my own scenarios 2b–2f and §2, each of which also exercises the plain single-instance, no-restart path as a baseline before the restart check. No behavior change detected for the common case.

## 11. Self-certification

```yaml
self_certification:
  agent_id: claude-rev-modevid-s2s3-rehydration-fix-independent-01
  peer_agent_id: claude-motor
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

Advisory only. This record certifies independent verification of the ledger-rehydration fix is complete and reports it for operator disposition. It does not itself authorize, merge, or push. Operator authority remains sole.

---

*Provenance — source: independent fresh reproduction and adversarial testing against `bst/mod-evid-s2-s3-ledger-rehydration-fix-001` @ `be8cfd6` (base `origin/main` @ `24274b0`), reviewing `docs/03-project-control/candidates/mod-evid-s2-s3-ledger-rehydration-fix-producer-verification-001.md` (producer: claude-motor). Timestamp: 2026-07-21. Agent role: REV/SEC, BST-SA independent worker. No push, no merge, no operator ratification implied.*
