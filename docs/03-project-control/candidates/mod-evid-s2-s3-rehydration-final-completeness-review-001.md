# MOD-EVID S2/S3 Rehydration — Final Completeness Review (Round 5)

**Record ID:** MOD-EVID-S2-S3-REHYDRATION-FINAL-COMPLETENESS-REVIEW-001
**Status:** ADVISORY — independent review record, not an authorization
**Reviewer role:** REV/SEC, BST-SA independent worker agent (advisory-only; cannot merge, push, or self-authorize execution)
**Reviewed:** branch `bst/mod-evid-s2-s3-ledger-rehydration-fix-001`, commit `e178e57`, parent `910409f` (base `origin/main` @ `24274b0`)
**Reviewed against:** `docs/03-project-control/candidates/mod-evid-s2-s3-ledger-rehydration-fix-producer-verification-001.md` (Addendum 3, producer: claude-motor) and the round-4 independent review at `docs/03-project-control/candidates/mod-evid-s2-s3-rehydration-guard-parity-fix-independent-review-001.md` (reviewer: claude-rev-modevid-s2s3-rehydration-guard-parity-fix-independent-01, `7aa7930`)
**Date:** 2026-07-21
**Isolation:** worked in the pre-existing worktree `C:/Users/ounkh/SecB-worktrees/mod-evid-s2-s3-ledger-rehydration-fix-001`, already checked out at `e178e57` on branch `bst/mod-evid-s2-s3-ledger-rehydration-fix-001` (`node_modules` already present, no reinstall needed). Two ephemeral, from-scratch adversarial/property scripts were written directly against the real `DurableLedger` + `EvidenceEnvelopeService` classes in the scratchpad directory (outside the repo), run, and not committed to the branch. Nothing on the live branch ref or any other worktree was touched. No merge, no push.

---

## Verdict

**APPROVE_FOR_MERGE**

This is the fifth review pass on this code path. My mandate was narrower than prior rounds: validate the round-4 producer's completeness CLAIM (Addendum 3's entry-type-by-entry-type enumeration), not hunt from scratch. I independently re-derived the enumeration from source, reproduced the round-4 exploit fresh, ran a materially larger randomized parity fuzz than any prior round, and specifically probed the two residual-risk axes named in my task brief (content-hash computation drift between the new guard and the live method; cross-service entry-type confusion via a shared ledger file). I found no new gap. The one prior-round-3-disclosed residual (content-integrity vs. transition-legality asymmetry for `getEnvelope()`/`resolveAcceptedStatus()`) remains open, unchanged, and is honestly disclosed in Addendum 2/3 — it is a different axis than what this recursion (rehydration/live-method parity) was ever scoped to close, and does not block merge.

---

## 1. Independently re-derived entry-type enumeration (from source, not from Addendum 3)

Grepped every `this.#ledger.append(` / `#appendLadder(` call site in `src/services/evidence-envelope-service.mjs` myself, independent of Addendum 3's table:

| Call site | Entry `type` written | Triggering live method |
|---|---|---|
| `sealEnvelope()` (line ~520, direct `this.#ledger.append(entry, ...)`) | `EVIDENCE_SEAL` | `sealEnvelope()` |
| `#appendLadder()` (line ~1098, shared helper) called from `requestVerification()` | `EVIDENCE_VERIFICATION_REQUEST` | `requestVerification()` |
| `#appendLadder()` called from `recordVerification()` | `EVIDENCE_VERIFICATION` | `recordVerification()` |
| `#appendLadder()` called from `acceptEvidence()` | `EVIDENCE_ACCEPTANCE` | `acceptEvidence()` |

That is exactly **four** distinct entry types this service can ever write, with `EVIDENCE_SEAL` splitting into two ledger-visible cases (**first sighting** of a key, which creates the record — the sole durable proxy for `registerEnvelope()` — and **re-occurrence** for an already-established key, which is structurally unreachable through the live API and denied unconditionally by `#assertSealTransition`). `registerEnvelope()` itself confirmed (again) to never call `append()` — grepped, zero hits outside `sealEnvelope()` and `#appendLadder()`'s three callers.

**Cross-check against Addendum 3's table:** identical. Same four types, same first-sighting/re-occurrence split for `EVIDENCE_SEAL`, same "registerEnvelope is a fifth lifecycle event but not a ledger entry type" framing. No discrepancy found.

For each type I independently traced the live method's full validation against `#rehydrate()`'s replay:
- **`EVIDENCE_SEAL` (first sighting):** live = `registerEnvelope()`'s schema/hash/forge-on-entry gate (now `#assertEnvelopeEstablishment`) + `sealEnvelope()`'s `#assertSealTransition`. Rehydrate = `#assertEnvelopeEstablishment(envelope)` when `!existing`, then `#assertSealTransition(fromStatus, payload.sealed_status)` unconditionally. **Matches.**
- **`EVIDENCE_SEAL` (re-occurrence):** live path unreachable (re-seal always denies). Rehydrate: `#assertEnvelopeEstablishment` correctly skipped (`existing` truthy), `#assertSealTransition` denies because `SEALED` has no inbound edge except `CAPTURED`. **Matches**, verified against `STATE_MACHINES.Evidence` directly.
- **`EVIDENCE_VERIFICATION_REQUEST`:** live = `#assertRequestVerificationTransition(record.status, VERIFICATION_PENDING_STATE)`. Rehydrate = same guard, `payload.next_status` in place of the literal. **Matches.**
- **`EVIDENCE_VERIFICATION`:** live = `#verdictTarget(verdict)` + `#assertRecordVerificationTransition({status, target, claimedStatus: target, verifier, producer})`. Rehydrate = same, `claimedStatus: payload.next_status`, `producer` sourced from `record.envelope.actor_id` (itself now establishment-guarded). **Matches.**
- **`EVIDENCE_ACCEPTANCE`:** live = `#assertApprovals(approvals)` + `#assertAcceptEvidenceTransition({status, claimedStatus: ACCEPTED_STATE, acceptor, producer, verifier})`. Rehydrate = same, values folded from payload/record. **Matches.**

No discrepancy against Addendum 3's claim.

## 2. Round-4 scenario: reproduced fresh, confirmed closed

Wrote a from-scratch script (not copy-pasted from `tests/evidence-envelope-service.test.mjs`) that forges a founding `EVIDENCE_SEAL` for a never-registered identity (5-field envelope, `content_hash: "cafebabe".repeat(8)`, non-matching), appended via direct `DurableLedger.append()` (the documented threat model), then walks it through three more forged-but-internally-consistent entries (`VERIFICATION_REQUEST` → `VERIFICATION(pass)` → `ACCEPTANCE`, three distinct attacker-chosen actor ids) to `ACCEPTED`. Constructing a fresh `EvidenceEnvelopeService` over that ledger:

```
PASS: construction denied at founding SEAL -- ContractValidationError DENY_CONTRACT_INVALID: evidenceEnvelope contract failed validation
```

Construction throws before any of the three follow-on forged entries are ever folded. Confirmed genuinely closed.

## 3. Sixth-round adversarial pass — no new gap found

**(a) Content-hash computation drift between the new guard and the live method?** No — and this cannot drift by construction, not just by inspection. `#assertEnvelopeEstablishment(envelope)` is the literal single function body both `registerEnvelope()` and `#rehydrate()`'s first-sighting branch call; there is exactly one `fingerprint(sealBody)` computation in the file for this purpose (`const { content_hash, ...sealBody } = envelope; fingerprint(sealBody) !== content_hash`). There is no second, independent re-implementation anywhere to drift from. This is the strongest possible form of parity (shared code, not synchronized copies).

**(b) Cross-service entry-type confusion via a shared ledger file?** Checked every `new DurableLedger(...)` construction site repo-wide (tests + the one production wiring site in `src/self-pilot/read-only-self-pilot.mjs`). `EvidenceEnvelopeService` is always wired to its own dedicated file (`evidence-seals.ndjson`) and `ledgerId: "secb-evidence-seal-ledger"`, distinct from every other ledger-backed service's file/ledgerId in this repo (`knowledge-linkage-service` uses `"secb-knowledge-linkage-sidecar"`, etc.). Confirmed `DurableLedger#verifyRecords` stamps and checks `record.ledgerId !== this.#ledgerId` on every read, throwing `LEDGER_INTEGRITY_FAILURE` (→ `#rehydrate()`'s `DENY_CHAIN_BROKEN`) if a foreign-ledgerId record ever appeared in the file — so even a misconfigured shared file would fail closed, not silently fold. Grepped the whole `src/` tree for the four entry-type literal strings (`EVIDENCE_SEAL`, `EVIDENCE_VERIFICATION_REQUEST`, `EVIDENCE_VERIFICATION`, `EVIDENCE_ACCEPTANCE`): zero producers outside this service. **No exploitable instance exists today.** Residual note (not a blocking gap, and not new — the same `continue`-on-unknown-type fallthrough existed since round 1): if a future service were ever wired to reuse the *same* file **and** the *same* `ledgerId` **and** happened to pick one of these four literal type strings with a coincidentally-similar payload shape, `#rehydrate()`'s fold has no defense beyond entry-type string matching. This is a naming/wiring discipline concern, not a code defect in this file, and is unchanged by this round's fix.

**(c) Broader randomized parity fuzz (my own, beyond rounds 2–4's fixed 5/25-history checks):** Wrote a seeded-PRNG fuzz driving **150** randomized legitimate histories (2–5 evidence_ids per history, 1–3 versions each, random ladder stopping points including CAPTURED-only/SEALED-only/PENDING-only/QUARANTINED-via-fail/VERIFIED-only/ACCEPTED, random restarts interleaved mid-history at realistic durable checkpoints) entirely through the real live API, asserting a freshly-rehydrated instance's `getEnvelope`+`verifyChain` state is byte-identical to the live instance's for every durably-established identity, then continuing one more transition and rehydrating a third instance to check a restart chain. Also asserted CAPTURED-only (registered-but-never-sealed) identities correctly do **not** survive rehydration, per the disclosed SCOPE NOTE. Result: **150/150 histories, 0 failures.**

## 4. Test suite — independently run, counts confirmed

```
npm test
ℹ tests 1171
ℹ pass 1168
ℹ fail 0
ℹ skipped 3
```

Matches Addendum 3's claimed 1171/1168/0/3 exactly. `git hash-object src/services/evidence-envelope-service.mjs` = `264b1c24ab78f427b6a4f0fbcfe55140bc953485`, matching the round-4 `PINNED_BLOBS` update in `tests/p0-19-self-pilot.test.mjs` exactly — the byte-identity guard is internally consistent.

## 5. Hardcoded test-ID branching

`grep -nE "ev_modevid|test-id|testId|NODE_ENV|process\.env" src/services/evidence-envelope-service.mjs` — zero hits. Confirmed, same as every prior round's grep.

## 6. Honest overall assessment: is this saga done?

Five rounds is a lot for one code path, and it is worth being honest about why: each round found a **real, distinct, exploitable** gap (round 1: no rehydration at all; round 2: no edge-legality check; round 3: graph-edge legality is weaker than each live method's own narrower rule; round 4: transition guards never cover record creation). That is not thrashing — it is a genuine, narrowing recursion, and round 4's fix closes the last creation-time gap the recursion could reach (every ladder entry type is now either transition-guarded against an already-established, establishment-guarded record, or is itself the establishment event and is now guarded identically to the live registration path).

My own independent work in this round — a fresh re-derivation of the entry-type enumeration, a from-scratch exploit reproduction, a targeted hunt for the two most likely residual-risk shapes (shared-computation drift and cross-service confusion), and a 150-history randomized fuzz an order of magnitude larger than any prior round's — found **nothing new**. The one gap that remains open (content-fingerprint checking on the two accessor methods that don't call `verifyChain()`) is a different axis than this recursion, was named honestly by the producer in round 3 and reconfirmed unchanged in round 4, and does not let a forged or tampered record reach `ACCEPTED` through the real S3 consumption port (`resolveAccepted()` calls `verifyChain()` internally).

**My recommendation: this file's rehydration/live-method parity work is genuinely done. I would not recommend a sixth round on this specific recursion.** If there is a future round, it should be scoped to the already-named, different-axis residual (construction-time content-fingerprint checking) as a deliberate, separately-justified decision — not because this round's audit is suspected incomplete.

---

## Self-certification

```yaml
self_certification:
  agent_id: claude-rev-modevid-s2s3-final-completeness-01
  peer_agent_id: claude-motor
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

Advisory only. This record certifies the independent verification of the round-4 producer's completeness claim (Addendum 3) is complete and reports it for operator/governance disposition. It does not itself authorize, merge, push, or ratify. Operator authority remains sole. No production declaration, no ADR/policy/schema mutation, no self-authorization of execution is implied or made by this record.

*Provenance — source: fifth independent review pass on `EvidenceEnvelopeService#rehydrate()`, validating the round-4 producer's Addendum 3 exhaustive entry-type enumeration on branch `bst/mod-evid-s2-s3-ledger-rehydration-fix-001` @ `e178e57` (parent `910409f`, base `origin/main` @ `24274b0`). Timestamp: 2026-07-21. Agent ID: claude-rev-modevid-s2s3-final-completeness-01, BST-SA REV/SEC role. No push, no merge, no operator ratification implied.*
