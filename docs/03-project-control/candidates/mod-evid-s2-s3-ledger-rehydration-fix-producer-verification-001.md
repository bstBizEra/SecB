# MOD-EVID S2/S3 Ledger Rehydration Fix — Producer Verification

**Record ID:** MOD-EVID-S2-S3-LEDGER-REHYDRATION-FIX-001
**Status:** ADVISORY — producer verification record, not an authorization
**Producer:** claude-motor (BST-SA motor role), operating under `AGENTS.md` SECB-AGENTS-AMD-002 (rev 2) advise-and-proceed authority
**Branch:** `bst/mod-evid-s2-s3-ledger-rehydration-fix-001`, base `origin/main` @ `24274b0`
**Date:** 2026-07-21
**Fixes:** finding #4 of the second independent review of MOD-EVID S2/S3, `docs/03-project-control/candidates/mod-evid-s2-s3-second-independent-review-001.md` (ref `refs/bst-sa/reviews/mod-evid-s2-s3-second-review-001` @ `5d78c65`), reviewer `claude-immune-rev-modevid-s2s3-second-01`.

---

## 1. Root cause (confirmed, first-hand)

`EvidenceEnvelopeService`'s entire lifecycle state — which `(evidence_id, version)` identities are registered, their current status (CAPTURED/SEALED/VERIFICATION_PENDING/VERIFIED/ACCEPTED/QUARANTINED), and who requested/verified/accepted them — lived exclusively in a private `#records = new Map()` populated only as live calls on *that instance* executed. The constructor never read anything back from the injected `durableLedger`, even though `sealEnvelope`/`requestVerification`/`recordVerification`/`acceptEvidence` all append their transitions to it. A second instance constructed against the same ledger file (the ordinary consequence of a process restart, redeploy, or crash recovery) therefore began with an empty Map, even though the ledger file on disk held the complete real history.

I independently reproduced the reviewer's exact scenario against this repo's actual `DurableLedger`/`EvidenceEnvelopeService` (test file below), confirming, pre-fix:
- `serviceB.getEnvelope(...)` on a governed, previously-ACCEPTED identity threw `DENY_UNKNOWN_EVIDENCE`.
- `serviceB.registerEnvelope(...)` with the SAME `evidence_id`/`version` but a different `actor_id` and forged content **succeeded** — no `DENY_DUPLICATE` — silently resetting the service's live view of that identity to fresh `CAPTURED`.
- `serviceB.verifyChain(evidenceId)` after the reset returned `valid: true` with empty `sealedVersions`/`acceptedVersions` arrays, contradicting the ledger's own physical content (`count: 4`, the original SEAL/VERIFICATION_REQUEST/VERIFICATION/ACCEPTANCE entries still present).

This directly contradicted the service's own header comment ("the ledger hash chain — not the in-memory status field — is the tamper evidence"): that claim was only true while the original in-process record survived, which is not a property any restart-safe service can assume.

## 2. Fix mechanism

`EvidenceEnvelopeService` now calls a new private `#rehydrate()` method at the **end of construction** (`src/services/evidence-envelope-service.mjs`). It:

1. Calls `this.#ledger.read()` once (the existing `DurableLedger.read()` already re-verifies the full hash chain before returning records — no new verification logic was added).
2. Folds over the returned entries in their existing chronological (`sequence`) order, reconstructing exactly the same record fields each live ladder method already sets when it appends: `SEAL` entries seed a new record (`envelope`, `status`, `sealedAt`, `ledgerSequence`, `ledgerRecordHash`); `VERIFICATION_REQUEST`/`VERIFICATION`/`ACCEPTANCE` entries update `status` plus their respective actor/timestamp/ledger-receipt fields on the existing record for that key.
3. Skips (does not deny on) any ledger entry type it doesn't own, and skips ladder entries with no preceding SEAL entry for their key (unreachable on a self-consistent ledger).
4. Fails closed at construction if the ledger itself cannot be read/verified: `LEDGER_INTEGRITY_FAILURE`/`LEDGER_CORRUPT` map to the existing `DENY_CHAIN_BROKEN` code; any other read failure maps to a new `DENY_LEDGER_REHYDRATION` code (there is no existing code for "construction-time read failed", so this is additive, not a repurposing of an existing one).

No other method (`registerEnvelope`, `sealEnvelope`, `getEnvelope`, `verifyChain`, `resolveAccepted`, the ladder methods) was changed — they all already read from `#records`, so once `#records` is correctly populated at construction, the duplicate-registration guard, status reads, and SoD checks are automatically evaluated against ledger-derived truth for every instance, not just the one that happened to perform the writes.

**No existing rehydrate-on-construct pattern to reuse:** I checked every other ledger-backed service with an in-memory projection (`context-federation-service`, `handoff-service`, `work-package-service`, `goal-graph-service`, `knowledge-linkage-service`). None of them inject a full `append+read+verify` `DurableLedger` AND keep an in-memory lifecycle Map over it the way `EvidenceEnvelopeService` does — `knowledge-linkage-service` is the closest architectural cousin and is actually fully stateless (it re-reads its sidecar ledger on every call, never caching), which sidesteps this bug class entirely but is a materially different, larger redesign than a bounded fast-follow. I designed `#rehydrate()` net-new, following this repo's existing conventions (deny-by-default, frozen clones, explicit code vocabulary) rather than inventing a different shape.

**Scope-honest limitation (not a new gap):** `registerEnvelope()` itself still never appends to the ledger — only `sealEnvelope()` and the S2 ladder do. A record that is `CAPTURED` but never sealed has no durable trace anywhere and is *not* restart-durable; after a restart it is simply unknown again. This is unchanged behavior, not a regression: no governed lifecycle event was ever durably recorded for a CAPTURED-only record, so a restart erases nothing that mattered and a forged re-registration overwrites nothing that was ever proven. This is disclosed in the file header, not silently assumed.

## 3. Regression tests (9 new, all in `tests/evidence-envelope-service.test.mjs`)

1. **Exact restart scenario** — instance A runs the full register→seal→request→verify→accept lifecycle; a fresh instance B over the same ledger file reports `ACCEPTED` (not `CAPTURED`) via `getEnvelope` and `resolveAccepted`.
2. **Duplicate-guard enforcement post-restart** — instance B's `registerEnvelope` with the same `evidence_id`/`version`, a different `actor_id`, and forged content is denied `DENY_DUPLICATE`; the real ACCEPTED record is confirmed untouched.
3. **`verifyChain` truth post-restart** — instance B's `verifyChain` output (`registeredVersions`/`sealedVersions`/`verifiedVersions`/`acceptedVersions`/`quarantinedVersions`/`ledger.headHash`) is asserted **equal** to instance A's own view — the reviewer's exact "`valid: true` but empty arrays" defect is the negative space this test rules out.
4. **Mid-ladder restart** (rehydrate at SEALED only) — a fresh instance continues the ladder correctly, including both SoD denials (`DENY_VERIFIER_IS_PRODUCER`, `DENY_SOD`), through to `ACCEPTED`, then a third instance restarted again sees the full result.
5. **QUARANTINED-only restart** — visible post-restart; re-registration and re-accept are both still denied.
6. **Multiple identities/versions** — v1 ACCEPTED, v2 SEALED-only, and a second `evidence_id` all rehydrate independently and correctly on one fresh instance.
7. **Fail-closed construction** on a tampered/chain-broken ledger file → `DENY_CHAIN_BROKEN`.
8. **Fail-closed construction** on an arbitrary ledger read failure → new `DENY_LEDGER_REHYDRATION` code.
9. **Normal single-instance lifecycle regression check** — full lifecycle on one instance over a freshly created (empty) ledger behaves identically to pre-fix (rehydrating nothing is a no-op).

All 9 pass. All 36 pre-existing tests in `evidence-envelope-service.test.mjs` + `evidence-provenance-chain.test.mjs` pass **unmodified** (byte-identical test bodies), confirming no behavior change for the common single-instance case.

## 4. Test counts

- Module suite (`evidence-envelope-service.test.mjs` + `evidence-provenance-chain.test.mjs`): **36/36 pass (before) → 45/45 pass (after)**.
- Full suite (`npm test`, includes `node tools/validate-foundation.mjs`): **1149 tests / 1146 pass / 0 fail / 3 skip (before) → 1158 tests / 1155 pass / 0 fail / 3 skip (after)** — +9, all new, all passing, 0 regressions.
- `node tools/validate-foundation.mjs`: PASS / exit 0, both before and after.

## 5. One incidental, disclosed test-fixture update

`tests/p0-19-self-pilot.test.mjs` pins `src/services/evidence-envelope-service.mjs` to a git blob hash as part of a "self-pilot composes but never modifies its primitives" byte-identity guard. Since this fix is an intentional, disclosed change to that exact file, the pin necessarily fails post-fix (`c7ea62a2...` observed vs. the old pinned `62359eb1...`). I updated only that one entry in `PINNED_BLOBS` to the new hash, added a comment disclosing why, and left every other pinned hash in that list untouched (still asserting byte-identity to main @ `385ac65` for every other composed primitive). This is the correct handling per this repo's own convention: the guard exists to catch silent composition drift, not to freeze a primitive against its own legitimate bugfixes.

## 6. Hardcoded test-ID branching

Grepped `src/services/evidence-envelope-service.mjs` for literal test-actor/test-id/env-branch patterns (`ev_modevid`, `test-id`, `testId`, `NODE_ENV`, `process.env`, string-literal evidence-id comparisons): zero hits. No such branching was introduced.

## 7. Performance / scale disclosure (explicitly requested)

**Does rehydration scan the whole ledger file on every construction? Yes** — `#rehydrate()` calls `this.#ledger.read()` once, which parses and hash-chain-verifies every line in the ledger file, O(n) in the number of entries ever written to it.

**Is this a new cost, or pre-existing?** Pre-existing, not new. Every mutating call this service already makes — `sealEnvelope`, `requestVerification`, `recordVerification`, `acceptEvidence` — already calls `this.#ledger.read()` to compute `expectedSequence` before appending (`evidence-envelope-service.mjs`, both `sealEnvelope` and the shared `#appendLadder` helper). So this service already paid an O(n) full-ledger read+verify cost on **every single mutating operation** before this fix; adding one more such read, performed exactly once at construction, does not introduce a new order-of-magnitude cost class — it adds one read where the codebase already performs many.

**Is that acceptable given this project's current ledger sizes?** Yes, with a caveat. This is a per-slice service (each evidence-governance ledger tracks the evidence lifecycle for one project/session's worth of registrations, not a high-frequency event stream), and the reviewer's own full-suite run reported ledgers in the single-to-low-double-digit entry range for test fixtures; the largest ledger interactions observed anywhere in this repo's test suite are in the hundreds of entries, not the tens of thousands. At that scale, one extra full-file parse+verify at construction is negligible (single-digit milliseconds).

**Documented caveat:** if this service's ledger were ever to grow into the tens-of-thousands-of-entries range (e.g., a very long-lived, high-throughput deployment sharing one ledger file across a long project lifetime), BOTH construction-time rehydration AND the pre-existing per-mutation `read()` calls would need a caching/streaming/checkpoint optimization to avoid linear-time cost per operation — that is a pre-existing `DurableLedger`-level scalability concern shared by every subclass in this repo (Checkpoint/Delegation/Event/Evidence/Decision/Knowledge/Outcome/WorkspaceLease), not something newly introduced or newly worsened by this fix. I am flagging it here for the record rather than treating it as silently acceptable at unbounded scale.

## 8. Self-certification

```yaml
self_certification:
  agent_id: claude-motor
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

Advisory only. This record certifies the producer-side verification of the ledger-rehydration fix is complete and reports it for operator/independent-review disposition. It does not itself authorize, merge, push, or ratify. Operator authority remains sole; an independent second review of this fix (recommended, matching this project's established pattern for prior fast-follow fixes) has not been dispatched by this producer.

---

*Provenance — source: second independent MOD-EVID S2/S3 review (`5d78c65`, reviewer `claude-immune-rev-modevid-s2s3-second-01`) finding #4, fixed on `bst/mod-evid-s2-s3-ledger-rehydration-fix-001` (base `origin/main` @ `24274b0`). Timestamp: 2026-07-21. Agent ID: claude-motor, BST-SA motor role. No push, no merge, no operator ratification implied.*

---

## Addendum: rehydration edge-legality fast-follow (independent review of this fix, closed)

**Reviewer:** claude-rev-modevid-s2s3-rehydration-fix-independent-01 (BST-SA independent worker, advisory-only), record `docs/03-project-control/candidates/mod-evid-s2-s3-ledger-rehydration-fix-independent-review-001.md` @ `3fb0e6b`, verdict **APPROVE_WITH_NOTES**.
**Fixed by:** claude-motor (this producer), same branch, on top of `3fb0e6b`.

### Root cause

The reviewer's §4 finding: `#rehydrate()` copied `payload.sealed_status` / `payload.next_status` **verbatim** from ledger entries into `record.status` with no state-machine edge-legality check — unlike every live ladder method in this same file (`sealEnvelope`, `requestVerification`, `recordVerification`, `acceptEvidence`), which all run the existing `#assertEdge` helper before accepting a status transition. `DurableLedger.append()`'s `validateEntry()` only checks structural shape (required top-level fields, `payload` is an object), never payload semantics per `entry.type`, so an actor with direct `DurableLedger.append()` access — bypassing `EvidenceEnvelopeService`'s own API entirely — could append a structurally valid, hash-chain-legitimate entry whose payload content the live service would never itself produce for that entry type. This is a narrower, higher-privilege attack surface than the original restart bug (it requires a reference to the injected ledger instance, not just an ordinary process restart), but the same silent-wrong-state defect class.

### Fix mechanism

`#rehydrate()` (`src/services/evidence-envelope-service.mjs`) now calls the **same, pre-existing `#assertEdge(from, to)` private method** the live ladder already trusts — no new or separate check was invented. For each status-bearing ledger entry, as the fold walks the ledger's own chronological (`sequence`) order:

- **`EVIDENCE_SEAL`**: `fromStatus` is the ladder's single entry state (`CAPTURED`) if no record yet exists for that `(evidence_id, version)` key, or the record's current accumulated status if one already does (defends the same double-seal/re-seal case `sealEnvelope()` itself denies live); `toStatus` is `payload.sealed_status`. `this.#assertEdge(fromStatus, toStatus)` runs before the record is created/overwritten.
- **`EVIDENCE_VERIFICATION_REQUEST` / `EVIDENCE_VERIFICATION` / `EVIDENCE_ACCEPTANCE`**: `this.#assertEdge(record.status, payload.next_status)` runs before `record.status` is updated, using whatever status the fold has accumulated so far for that key — i.e., validated against ledger-derived truth exactly as if that same sequence of transitions had happened through the live API.

Per this file's established fail-closed convention (see the pre-existing `DENY_CHAIN_BROKEN` handling in the same method), `#assertEdge` **throws** `EvidenceEnvelopeServiceError` with the existing `DENY_UNDEFINED_TRANSITION` code on an illegal edge — this propagates out of the constructor and denies the **whole** rehydration, not just the offending entry. Skipping only the bad entry and continuing was deliberately rejected (per the task's explicit instruction and this file's own convention for other structural inconsistencies): a partially-rehydrated state built by ignoring one bad entry could itself be a different wrong state.

No new deny code was introduced; no other method's behavior changed.

### Both reviewer exploits reproduced and confirmed closed (by this producer, independently)

1. **Forged `EVIDENCE_SEAL` with `sealed_status: "ACCEPTED"` as the first entry** (no verification/acceptance entries at all): pre-fix, a fresh instance rehydrated straight to `ACCEPTED`. Post-fix: `fromStatus = CAPTURED` (no prior record), `assertEdge(CAPTURED, ACCEPTED)` — `ACCEPTED` is not in `CAPTURED`'s edge set (`["SEALED","QUARANTINED"]`) — constructor throws `DENY_UNDEFINED_TRANSITION`. Reproduced in `tests/evidence-envelope-service.test.mjs`, test `"REHYDRATION SECURITY: a forged EVIDENCE_SEAL entry claiming sealed_status ACCEPTED as the FIRST entry is denied..."` — confirmed denied.
2. **Forged `EVIDENCE_VERIFICATION` with illegal `next_status: "ACCEPTED"`** following a legitimate SEAL + VERIFICATION_REQUEST through the real live API: pre-fix, the record reached `ACCEPTED` with `acceptorActorId: null`, `approvals: null`, no acceptance receipt, and `verifyChain()` passed cleanly. Post-fix: at the point this entry folds, `record.status = VERIFICATION_PENDING` (set by the legitimate request), `assertEdge(VERIFICATION_PENDING, ACCEPTED)` — `ACCEPTED` is not in `VERIFICATION_PENDING`'s edge set (`["VERIFIED","REJECTED","QUARANTINED"]`) — constructor throws `DENY_UNDEFINED_TRANSITION`. Reproduced in the same test file, test `"REHYDRATION SECURITY: a forged EVIDENCE_VERIFICATION entry claiming an illegal next_status ACCEPTED is denied..."` — confirmed denied.

### Genuine ledger histories: no false denials

All 8 pre-existing `REHYDRATION` tests (exact restart to `ACCEPTED`, duplicate-guard post-restart, `verifyChain` truth post-restart, mid-ladder restart, `QUARANTINED`-only restart, multiple identities/versions, chain-broken construction-time deny, ledger-read-failure deny) and all 33 other pre-existing tests in this file continue to pass **unmodified** (byte-identical test bodies) — every legitimate transition produced through the real live API (`CAPTURED→SEALED`, `SEALED→VERIFICATION_PENDING`, `VERIFICATION_PENDING→{VERIFIED,QUARANTINED}`, `VERIFIED→ACCEPTED`) is, by construction, already a legal `#assertEdge` edge, so no genuine history is newly denied.

### Test counts

- Module suite (`evidence-envelope-service.test.mjs`): **41/41 pass (before this fast-follow) → 43/43 pass (after)** — +2 new adversarial regression tests, 0 regressions.
- Full suite (`npm test`, includes `node tools/validate-foundation.mjs`): **1158 tests / 1155 pass / 0 fail / 3 skip (before) → 1160 tests / 1157 pass / 0 fail / 3 skip (after)** — matches this producer's own prior claimed post-fix baseline exactly before this fast-follow; +2, all new, all passing, 0 regressions.
- `node tools/validate-foundation.mjs`: PASS / exit 0, both before and after.
- Grepped `src/services/evidence-envelope-service.mjs` for `ev_modevid|test-id|testId|NODE_ENV|process\.env`: zero hits, same result as both this producer's original grep and the independent reviewer's own grep. No hardcoded test-ID branching introduced.

### One incidental, disclosed test-fixture update (second one on this branch)

`tests/p0-19-self-pilot.test.mjs`'s `PINNED_BLOBS` byte-identity guard pins `src/services/evidence-envelope-service.mjs` to a git blob hash. This fast-follow is a second intentional, disclosed, security-relevant change to that same file on this branch, so the pin necessarily advances again: `c7ea62a20e093415fb90b5321eceb71453d037bd` → `0843d4a9b0c966c13135890ec91a87c823911d30`. Updated only that one entry, added a second disclosure comment (the first pin-update comment from the original fix was left untouched, extend-only), and left every other pinned hash in that list unchanged.

### Self-certification

```yaml
self_certification:
  agent_id: claude-motor
  peer_agent_id: claude-rev-modevid-s2s3-rehydration-fix-independent-01
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

Advisory only. This addendum certifies the producer-side verification of the rehydration-edge-legality fast-follow is complete and reports it for operator/independent-review disposition. It does not itself authorize, merge, push, or ratify. Operator authority remains sole.

*Provenance — source: independent review of the rehydration fix (`3fb0e6b`, reviewer `claude-rev-modevid-s2s3-rehydration-fix-independent-01`) finding #4, fixed on the same branch `bst/mod-evid-s2-s3-ledger-rehydration-fix-001` (on top of `3fb0e6b`). Timestamp: 2026-07-21. Agent ID: claude-motor, BST-SA motor role. No push, no merge, no operator ratification implied.*
