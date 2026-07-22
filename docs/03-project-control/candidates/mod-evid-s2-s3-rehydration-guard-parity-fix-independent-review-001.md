# MOD-EVID S2/S3 Rehydration Transition-Guard Convergence — Independent Review (Round 4)

**Record ID:** MOD-EVID-S2-S3-REHYDRATION-GUARD-PARITY-FIX-INDEPENDENT-REVIEW-001
**Status:** ADVISORY — independent review record, not an authorization
**Reviewer role:** REV/SEC, BST-SA independent worker agent (advisory-only; cannot merge, push, or self-authorize execution)
**Reviewed:** branch `bst/mod-evid-s2-s3-ledger-rehydration-fix-001`, commit `910409f`, parent `72dc4f4` (base `origin/main` @ `24274b0`)
**Reviewed against:** `docs/03-project-control/candidates/mod-evid-s2-s3-ledger-rehydration-fix-producer-verification-001.md` (Addendum 2, producer: claude-motor) and the round-3 independent review at `docs/03-project-control/candidates/mod-evid-s2-s3-rehydration-edge-legality-fix-independent-review-001.md` (reviewer: claude-rev-modevid-s2s3-rehydration-edge-legality-fix-independent-01, `72dc4f4`)
**Date:** 2026-07-21
**Isolation:** worked in the pre-existing isolated worktree `C:/Users/ounkh/SecB-worktrees/mod-evid-s2-s3-ledger-rehydration-fix-001`, checked out at `910409f`, separate from the producer's own worktree and from every prior reviewer's worktree; `node_modules` already present (no reinstall needed). Three ephemeral, from-scratch adversarial/property probe scripts (`_poc_round4.mjs`, `_poc_round4b.mjs`, `_poc_round4c.mjs`) were written directly against the real `DurableLedger` + `EvidenceEnvelopeService` classes, run, and deleted before this record was written (`git status --short` confirmed clean before committing this file). Nothing on the live branch ref or any other worktree was touched. No merge, no push.

---

## Verdict

**REQUEST_CHANGES**

All four of round 3's own reported variants are genuinely closed, the two round-2 exploits remain closed, and the shared-guard refactor is implemented correctly — none of the four new guard methods repeat the producer's own self-disclosed "derive-and-substitute" mistake; all four check the ledger's claim against an independently-derived value and deny before ever adopting it. The property-style parity check (25 additional random legitimate histories through the real live API) confirms byte-identical rehydration in every case, and the disclosed content-fingerprint boundary (construction-time transition-legality vs. explicit-call-time content-integrity) is accurately characterized — I constructed the exact swapped-envelope scenario myself and confirmed `resolveAccepted()`/`verifyChain()` deny it while `getEnvelope()`/`resolveAcceptedStatus()` do not, precisely as claimed.

However, adversarial testing found a **new, escalation-class gap** that none of rounds 1–3 audited: `#rehydrate()`'s `EVIDENCE_SEAL` branch establishes a brand-new record's `envelope` and `status: SEALED` directly from the ledger entry's `payload.envelope`, with **no schema validation and no `content_hash` cross-check** — the two checks `registerEnvelope()` itself always performs on the live path before any record is ever created. An attacker with direct `DurableLedger.append()` access (the exact same threat model every prior round in this saga already treats as in-scope) can inject a single, wholly fabricated `EVIDENCE_SEAL` entry — missing most of the 18 required envelope fields, carrying an arbitrary, non-matching `content_hash`, naming any `actor_id` the attacker likes — for an `evidence_id`/`version` that was **never registered through `registerEnvelope()` at all**, and it rehydrates as a legitimate `SEALED` record. I confirmed, further, that this fabricated identity can be driven with three more forged-but-internally-consistent entries (`EVIDENCE_VERIFICATION_REQUEST`, `EVIDENCE_VERIFICATION` with `verdict: "pass"`, `EVIDENCE_ACCEPTANCE`) all the way to `ACCEPTED`, and `resolveAccepted()` — the actual S3 consumption port used by `knowledge-claim-service` and the temporal-ledgers adapter — returns `ok: true` with the fabricated envelope. The SoD checks (`verifier != producer`, `acceptor != producer`/`verifier`) provide no protection here because the attacker also controls `producer` via the fabricated `envelope.actor_id` — there is no independent anchor of identity once the founding envelope itself is unverified. This is a materially different, and more severe, axis than the disclosed content-fingerprint residual (which assumes the *established* envelope is trustworthy and only asks whether a *later* entry's embedded copy matches it); this finding shows the establishment itself is unguarded. Recommend a fast-follow that has `#rehydrate()`'s `EVIDENCE_SEAL` branch call the same `schemaValidator`/content-hash checks `registerEnvelope()` already performs (and the same `verification_status === entryState` forge-on-entry check) before creating a new record, mirroring the live path exactly — the same "single source of truth" principle round 3 just applied to transition legality, extended one level earlier to envelope legitimacy.

---

## 1. Method

Verified the branch is at `910409f`, parent `72dc4f4`, base `origin/main @ 24274b0` (`git log --oneline -5`). Read `docs/03-project-control/candidates/mod-evid-s2-s3-ledger-rehydration-fix-producer-verification-001.md` in full, including Addendum 2. Read the complete `git diff 72dc4f4 910409f -- src/services/evidence-envelope-service.mjs` (288 lines changed) line by line, then read the full current file (1005 lines) end to end, including all four new shared guard methods (`#assertSealTransition`, `#assertRequestVerificationTransition`, `#verdictTarget`+`#assertRecordVerificationTransition`, `#assertApprovals`+`#assertAcceptEvidenceTransition`), every live call site, `#rehydrate()`'s full fold, `verifyChain()`, and `resolveAccepted()`. Cross-checked `STATE_MACHINES.Evidence` (`src/control/state-machine.mjs` lines 46–55) and `DurableLedger`'s `validateEntry()` (`src/ledger/durable-ledger.mjs`) directly. Wrote three fresh, from-scratch adversarial/property Node scripts (not derived from the producer's or any prior reviewer's test files), run and deleted:
- `_poc_round4.mjs` — wholly-fabricated-envelope experiments (Experiments A/B below).
- `_poc_round4b.mjs` — fresh reproduction of round 3's four named variants; a two-forged-entry combination probe; the content-fingerprint boundary reconstruction.
- `_poc_round4c.mjs` — 25-seed property-style parity check via a small deterministic PRNG driving randomized legitimate multi-identity, multi-version, branching (sealed-only / pending / quarantined-via-fail / verified-not-accepted / accepted) histories through the real live API.

Ran `npm test` and `node --test tests/evidence-envelope-service.test.mjs` directly, and grepped the service source for hardcoded test-ID branching.

## 2. Shared-guard code review: no recurrence of the producer's self-disclosed mistake

The producer's Addendum 2 discloses catching and fixing a self-introduced bug during development: an early draft had the shared guards *derive* the target status and silently substitute it, rather than *checking* the ledger's claim against it. I read all four final guard methods (`src/services/evidence-envelope-service.mjs` lines 892–973) specifically hunting for this pattern recurring in one of the three guards the producer did not personally catch it in:

- `#assertSealTransition(fromStatus, claimedStatus)` (line 894): `if (claimedStatus !== SEALED_STATE) deny(...)` **first**, then `#assertEdge`. Check-then-derive. Correct.
- `#assertRequestVerificationTransition(fromStatus, claimedStatus)` (line 903): identical shape. Correct.
- `#assertRecordVerificationTransition({status, target, claimedStatus, ...})` (line 932): `if (claimedStatus !== target) deny(...)` **first** (target itself independently derived from `verdict` via `#verdictTarget`, called separately at each call site — line 330 in `#rehydrate()`, line 649 in `recordVerification()` — never inside the guard using a forgeable value), then the `VERIFICATION_PENDING`-only source pin, then `#assertEdge`, then SoD. Correct — and note `verdict` itself is ledger-forgeable in the rehydrate fold, but this is immaterial: the guard's source pin (`status !== VERIFICATION_PENDING_STATE`) and the requirement that `claimedStatus` match whatever `target` a forged `verdict` maps to together mean any pair of `{verdict, next_status}` that passes this guard is, by construction, indistinguishable from what a live call from that exact source state would have produced — that is the point of convergence, not a residual hole.
- `#assertAcceptEvidenceTransition({status, claimedStatus, ...})` (line 963): `if (claimedStatus !== ACCEPTED_STATE) deny(...)` **first**, then the `VERIFIED`-only source pin, then `#assertEdge`, then SoD using `producer`/`verifier` sourced from `record.envelope.actor_id`/`record.verifierActorId` (ledger-established truth), never from the current entry's own forgeable payload fields. Correct.

All four guards check-then-derive; none substitutes silently. The self-caught bug did not recur in the other three.

## 3. All four round-3 variants reproduced fresh — confirmed denied

Independently re-forged all four from scratch:
1. Forged `EVIDENCE_VERIFICATION`, `next_status: "QUARANTINED"`, immediately after a real `SEAL` (no `VERIFICATION_REQUEST`): denied `DENY_UNDEFINED_TRANSITION` via `#assertRecordVerificationTransition`'s source pin (`status !== VERIFICATION_PENDING_STATE`). Confirmed.
2. Forged `EVIDENCE_SEAL`, `sealed_status: "QUARANTINED"`, as the first/only entry: denied via `#assertSealTransition`'s claimed-vs-literal check, before the edge check runs. Confirmed.
3. Forged `EVIDENCE_VERIFICATION`, `next_status: "REJECTED"` (paired with `verdict: "fail"`, which maps to `QUARANTINED`, not `REJECTED`): denied via `#assertRecordVerificationTransition`'s claimed-vs-derived-target cross-check. Confirmed.
4. Forged `EVIDENCE_ACCEPTANCE` retroactively downgrading a real, full, SoD-checked `ACCEPTED` record to `QUARANTINED`: denied via `#assertAcceptEvidenceTransition`'s source pin (`status !== VERIFIED_STATE`; an `ACCEPTED` record's status is `ACCEPTED`, not `VERIFIED`). Confirmed.

Both round-2 exploits (forged SEAL/`ACCEPTED`; forged VERIFICATION/`ACCEPTED`) remain reproduced and denied.

## 4. Two-forged-entry combination: no guard-bypass, confirms the disclosed content-fingerprint residual instead

Constructed: a forged `EVIDENCE_SEAL` for a brand-new key with envelope A (passes its own guard — `CAPTURED → SEALED` is the one legal edge for a first sighting), a legitimate `VERIFICATION_REQUEST`, then a forged `EVIDENCE_VERIFICATION` embedding a **different** envelope B (same `evidence_id`/`version`) with `next_status: "VERIFIED"` matching `verdict: "pass"` (passes its own guard individually — source is `VERIFICATION_PENDING`, target matches verdict).

Result: construction **succeeds** (neither guard, individually or combined, denies this — by design, since neither guard inspects `payload.envelope` at all, only `record.envelope`/`record.status`/`record.verifierActorId`, all ledger-established truth from the *first* SEAL, never the current entry's own embedded copy). `record.envelope` remains envelope A, unaffected by the swap. But `verifyChain()` **does** catch it (`fingerprint(line.entry.payload.envelope) !== fingerprint(record.envelope)` on the VERIFICATION receipt → `DENY_CHAIN_BROKEN`). This is not a new "two-entry combination" gap — it is the single disclosed content-fingerprint residual, confirmed to behave identically whether the mismatched entry is the second of two forged entries or a single forged entry in an otherwise-legitimate history. No guard-bypass results from combining the two: `producer`/`verifier` for the SoD checks are always read from the already-established `record`, never from the swapped entry's own payload, so the swap cannot be used to defeat SoD.

## 5. Content-fingerprint boundary claim — reconstructed independently, holds up exactly as described

Built: real `register → seal → requestVerification → recordVerification(pass)` through the live API, then one forged `EVIDENCE_ACCEPTANCE` entry embedding a **different** envelope (`result: "SWAPPED-CONTENT-AT-ACCEPT-TIME"`) with an otherwise-legitimate-looking `next_status: "ACCEPTED"`. On a fresh instance:
- `getEnvelope()` reports `verificationStatus: "ACCEPTED"` with the **original** (pre-swap) envelope content — does not detect the mismatch. Confirmed.
- `resolveAcceptedStatus()` reports `accepted: true` — also does not call `verifyChain()`, also does not detect it. Confirmed.
- `verifyChain()` denies `DENY_CHAIN_BROKEN: "Ladder acceptance entry ... does not match the registered envelope"`. Confirmed.
- `resolveAccepted()` — the actual S3 consumption port — denies `ok: false, code: "DENY_CHAIN_BROKEN"` via its internal `verifyChain()` call. Confirmed.

The producer's characterization is accurate: closed at the point evidence is actually consumed/cited, open for the two raw introspection accessors, exactly as disclosed, and this is unchanged by round 3 (present since round 1).

## 6. New finding: envelope-establishment is unguarded — schema and content-hash never checked by `#rehydrate()`

`#rehydrate()`'s only gate on the embedded envelope of a *first-sighting* `EVIDENCE_SEAL` entry (the sole point at which a new record's `envelope` field is ever set) is:

```js
if (!envelope || typeof envelope.evidence_id !== "string" || !Number.isInteger(envelope.version)) continue;
```

Compare to `registerEnvelope()` on the live path, which additionally requires: full schema validation (`this.#validate("evidenceEnvelope", envelope)`, 18 required fields, closed object), a `content_hash` that matches `fingerprint(sealBody)` recomputed server-side, and `verification_status === entryState` (forge-on-entry guard, `DENY_STATUS_FORGERY`). None of these three checks exist anywhere in `#rehydrate()`, and `DurableLedger.validateEntry()` (confirmed by direct read of `src/ledger/durable-ledger.mjs`) only validates top-level structural shape (`payload` is an object, `timestamp` parses, required top-level keys present) — never payload semantics per `entry.type`, exactly as the producer's own comments already state for the *status*-legality axis, but this is equally true for envelope *content* legality, which no round has audited.

**Experiment A** (`_poc_round4.mjs`): appended a single forged `EVIDENCE_SEAL` entry for a never-registered `evidence_id`, with a 5-field envelope (missing 13 of the 18 required fields), `content_hash: "deadbeef".repeat(8)` (not a fingerprint of anything), `sealed_status: "SEALED"` (matching the one literal the guard checks for). Result: construction **succeeds**; `getEnvelope()` returns `verificationStatus: "SEALED"` with the fabricated content intact; `verifyChain()` returns `valid: true`.

**Experiment B** (same script): extended this to a full forged ladder (`SEAL → VERIFICATION_REQUEST → VERIFICATION(pass) → ACCEPTANCE`), each entry individually self-consistent with the guard it passes through, attacker choosing `producer`/`verifier`/`acceptor` to be three distinct strings (trivially satisfying both SoD checks, since the attacker controls all three identities via the fabricated envelope's `actor_id` and the entries' own actor fields — there is no genuine, independently-anchored identity anywhere in this chain). Result: construction **succeeds**; `resolveAccepted()` — the real S3 port — returns `ok: true` with the fabricated envelope reported as `ACCEPTED`.

This requires the same threat model every prior round in this saga already treats as in-scope and worth fixing (direct `DurableLedger.append()` access, bypassing `EvidenceEnvelopeService`'s API entirely) — it is not a broader or newly-invented attacker model. Unlike round 3's own finding (confirmed downgrade/mislabel-class only, never reaching `ACCEPTED` illegitimately), this is escalation-class: a completely fabricated, non-schema-conforming, content-hash-inconsistent identity reaches `ACCEPTED` and is served by the actual consumption port, with zero real registration ever having occurred. This is a materially more severe defect than what round 3 fixed or what round 3's reviewer flagged as residual, and I believe it warrants a fast-follow before this branch merges, on the same "escalation-class, not blocking-for-downgrade-class" calibration this project has consistently applied across rounds 1–3.

**Recommended fix shape** (not prescribing implementation, per advisory-only scope): `#rehydrate()`'s `EVIDENCE_SEAL` branch, on first sighting of a key (`!existing`), should call `this.#validate("evidenceEnvelope", envelope)`, verify `fingerprint(sealBody) === envelope.content_hash`, and verify `envelope.verification_status === entryState`, denying (fail-closed, whole-rehydration, matching this file's established convention) on any failure — mirroring `registerEnvelope()`'s three checks exactly, applied one level earlier in the fold than the transition-guard convergence round 3 just completed.

## 7. Property-style parity: 25 additional random legitimate histories, byte-identical every time

`_poc_round4c.mjs` drove 25 independently-seeded random legitimate multi-identity (2–4 ids), multi-version (1–2 versions each) histories through the real live API, each version randomly stopped at one of `sealed` / `pending` / `verified-fail(quarantined)` / `verified-pass(not accepted)` / `accepted`. For every touched identity/version, a freshly-rehydrated instance's `getEnvelope()` and, per distinct `evidence_id`, `verifyChain()` were asserted `deepEqual` against the live instance. **All 25 seeds passed** — no divergence found beyond the producer's own 5 point-example histories and the existing parity test's cases.

## 8. Full test suite and module suite — independently confirmed

```
npm test                                              → 1165 tests / 1162 pass / 0 fail / 3 skip
node --test tests/evidence-envelope-service.test.mjs  → 48/48 pass
```
Both match the producer's claimed counts exactly. `npm run validate` (`tools/validate-foundation.mjs`), which `npm test` runs first, completed with no reported failure ahead of the test run.

## 9. Hardcoded test-ID branching — none found

```
grep -nE "ev_modevid|test-id|testId|NODE_ENV|process\.env" src/services/evidence-envelope-service.mjs
```
Zero matches — same result as the producer's and every prior reviewer's own grep.

## 10. Overall assessment: is the rounds 1–3 recursion done?

The specific recursion rounds 1–3 chased — "does rehydration reproduce every live-method *transition* guard, not just graph-edge legality" — **is genuinely closed**. I found no recurrence of the producer's self-disclosed derive-and-substitute mistake in any of the three guards they did not personally re-audit, all four of round 3's own variants deny correctly, the property check found no parity divergence across 25 additional histories beyond the producer's own 5, and the disclosed content-fingerprint boundary is accurately characterized and does not enable any guard-bypass even under a two-forged-entry combination.

However, this review found that the *broader* question the task asked me to hold this code to — "is there any status-bearing (or, as it turns out, identity-establishing) field this project's ledger can contain that isn't covered by one of the four named guards" — has an affirmative answer: envelope schema conformance and content-hash self-consistency, the two checks that gate every record's *creation* on the live path, are never replayed by `#rehydrate()` at all, on any of the three prior rounds. This is not the content-fingerprint axis the producer already disclosed (that axis assumes the founding envelope is trustworthy); it is one level more fundamental, and it is escalation-class, not downgrade-class. I do not believe rounds 1–3's fix should be treated as fully closing this code's rehydration-security surface until this is addressed.

## 11. Self-certification

```yaml
self_certification:
  agent_id: claude-rev-modevid-s2s3-rehydration-guard-parity-fix-independent-01
  peer_agent_id: claude-motor
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

Advisory only. This record certifies independent verification of the round-3 transition-guard convergence fast-follow (`910409f`) is complete and reports it, together with one new escalation-class finding outside that fix's own scope, for operator/governance disposition. It does not itself authorize, merge, or push. Operator authority remains sole. No production declaration, no ADR/policy/schema mutation, no self-authorization of execution is implied or made by this record.

---

*Provenance — source: independent fresh reproduction and adversarial testing against `bst/mod-evid-s2-s3-ledger-rehydration-fix-001` @ `910409f` (parent `72dc4f4`, base `origin/main` @ `24274b0`), reviewing `docs/03-project-control/candidates/mod-evid-s2-s3-ledger-rehydration-fix-producer-verification-001.md` (producer: claude-motor, Addendum 2) and the round-3 independent review at the same path @ `72dc4f4`. Timestamp: 2026-07-21. Agent role: REV/SEC, BST-SA independent worker. No push, no merge, no operator ratification implied.*
