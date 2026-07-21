# MOD-WSPACE Slice S3 — Workspace-Lease Durable Record — SECOND Independent Review

**Record ID:** MOD-WSPACE-S3-SECOND-REV-001 / mod-wspace-s3-second-independent-review-001
**Status:** ADVISORY — reviewer verdict, not an authorization
**Reviewer:** claude-rev-wspace-s3-second-01 (BST-SA immune/REV role, independent — no relationship to the producer of `da36c50` or to the first S3 reviewer of record `0542e76`; this session's own prior review of the S2 lease primitive, `mod-wspace-lease-second-independent-review-001`, is read for context only, not relied on for this slice's own verdict)
**Date:** 2026-07-21
**Review target:** `main` @ `944c3ff` (merge of PR #52, `bst/mod-wspace-s3-staged`); source commit `da36c50` "[MOD-WSPACE-S3] Workspace-lease durable record + WorkspaceLeaseLedger (R2)"; prior review commit `0542e76` "[MOD-WSPACE-S3-REV] Independent immune review: APPROVE_FOR_MERGE"
**Method:** independent, adversarial, first-hand. Fresh isolated worktree at `C:/Users/ounkh/SecB-worktrees/mod-wspace-s3-second-review-001` on new branch `bst/mod-wspace-s3-second-review-001` (cut from current `main`), `npm ci`, full `npm test`, isolated ledger-file run, `node tools/validate-foundation.mjs`, full read of `WorkspaceLeaseLedger` + `DurableLedger` + both sibling ledger subclasses (`CheckpointLedger`, `DelegationLedger`) for architectural-pattern comparison, and six hand-written adversarial probes not shipped with the candidate (script retained standalone at `scratch-adversarial-probe.mjs` in the worktree only — not committed). No push, no merge, no modification of `main` or any existing branch.

---

## Verdict

**APPROVE_WITH_NOTES**

The ledger primitive's core guarantees — hash-chain integrity, idempotent replay, optimistic concurrency, fail-closed `resolveActiveLease`, deep-frozen outputs, atomic single-read snapshot against hostile accessors — are all genuinely sound and correctly inherited from `DurableLedger`, matching this project's established ledger-family correctness bar. I confirm the first reviewer's findings are accurate as far as they go. However, adversarial testing surfaced **one genuine architectural gap the first review's probes did not reach**: the single-writer-per-session gate (`DENY_LEASE_SINGLE_WRITER`) — the one piece of *new* business logic this slice adds beyond a thin `DurableLedger` subclass — is checked via an **unlocked** read that is not atomic with the locked append, so the invariant it is meant to enforce is not actually guaranteed under a plausible (if currently unreachable, since the module is unwired) concurrent-caller pattern. I also confirm, first-hand, that the durable-record layer has **zero binding** to the S2 pure lease-evaluation primitive — a disclosed, by-design property, not a hidden defect, but one worth stating explicitly for whoever eventually wires a caller. Neither finding blocks the already-merged status; both are notes for the next slice/wiring step. No BLOCKER/HIGH; one MEDIUM (single-writer atomicity), two LOW/INFO (primitive/ledger decoupling; `ttl`/`expires_at` arithmetic is uncross-checked).

---

## 1. Test verification (first-hand)

- `npm ci`: clean install, 6 packages.
- `npm test` (full suite, current `main` @ `944c3ff`): **tests 1081 / pass 1076 / fail 0 / skipped 5**. Matches both the producer's claim and the first reviewer's measurement exactly.
- `node --test tests/workspace-lease-ledger.test.mjs` in isolation: **19/19 pass, 0 fail** — confirms the slice's own suite is green and its exact count.
- `node tools/validate-foundation.mjs`: **PASS** (schema set-equality — 17 schemas including `workspace-lease` — manifest uniqueness, mandatory identity fields).

## 2. Thin-subclass claim — mostly true, with one exception

Read `src/ledger/durable-ledger.mjs`, `src/ledger/checkpoint-ledger.mjs`, `src/ledger/delegation-ledger.mjs`, and `src/ledger/workspace-lease-ledger.mjs` in full to compare architectural patterns across the ledger family.

- `DurableLedger` itself is **byte-identical** to base (`git diff 0c0f3d2 944c3ff -- src/ledger/durable-ledger.mjs` empty). Hash-chain verification (`#verifyRecords`), idempotency-key replay/conflict, optimistic concurrency (`expectedSequence`), duplicate-`entryId` rejection, and the writer-lock (`mkdirSync`/`rmSync` on a `.lock` directory) are all inherited unmodified.
- `CheckpointLedger.appendCheckpoint` and `DelegationLedger.appendDelegationRequest` are genuinely thin: `validateContract(...)` then a single straight-through call to `this.append(entry, { expectedSequence })`. Neither adds any business-rule gate before the append; both `resolveCheckpoint`/`resolveLatest`/`resolveDelegationRequest` are simple `this.read().find/filter(...)` lookups with no extra invariant.
- `WorkspaceLeaseLedger.appendLease` follows the same pattern for validation (`validateContract`, `idempotencyKey`/`now` checks) but **adds a new invariant the siblings do not have**: `#detectSingleWriterConflict(snapshot, now)`, which calls the **public** `this.read()` — an unlocked, independent read of the whole chain — **before** calling `this.append(...)`. This is architecturally different from every other guarantee in the ledger family, all of which are evaluated **inside** the single locked read+write in `DurableLedger.append`. This is the "reimplement something instead of reusing the base class's guarantee" drift risk flagged in my brief, and it is real, though narrow: everything else in the file (snapshot, freeze, hash-chain reliance, `resolveActiveLease`) correctly reuses the base's atomicity; only the single-writer gate does not.

## 3. Single-writer gate — genuine TOCTOU between the check and the durable write (MEDIUM)

`#detectSingleWriterConflict` (workspace-lease-ledger.mjs:157-167) scans `this.read()` for a conflicting active lease under the same `session_id`, entirely **before** `appendLease` calls `this.append(...)`. `this.append(...)` (the base class) protects against generic conflicts (duplicate `entryId`, idempotency-key reuse, stale `expectedSequence`) but has **no knowledge of session/lease semantics** — its only defense against a stale caller view is the exact-match `expectedSequence` check, which is unrelated to the single-writer business rule.

**Adversarial reproduction (PROBE1, `scratch-adversarial-probe.mjs`):** I modeled a caller/wrapper whose view of the chain at single-writer-check time is stale relative to its own (separately, correctly, freshly computed) `expectedSequence` at write time — done by overriding the public `read()` accessor used only by the pre-check on a second `WorkspaceLeaseLedger` instance pointed at the same file, leaving the base class's actual write path (private `#readRecords`/lock/`expectedSequence` compare) completely untouched and reading real state:

```
"Process A" appends lease wl_A for session ses_race (real, unmodified path). Chain length -> 1.
"Process B" (fresh ledger instance, same file): read() overridden to return [] (stale view)
  for the single-writer check only. b.appendLease(lease_wl_B, { expectedSequence: 1, ... }).
Result: bResult.ok === true — TWO active leases (wl_A, wl_B) now coexist for ses_race.
```

This is not a contrived logic error in my probe — it is a direct consequence of the check and the write drawing on two different reads that are not coupled by the lock. I want to be precise about the caveat: reproducing this from two genuinely concurrent OS processes additionally requires the second writer's `expectedSequence` to be sourced independently of a read taken at the exact same instant as its own single-writer check (e.g., a coordinator/allocator handing out sequence numbers, or a caching read path) — a plausible but not universal calling pattern, and one that cannot be ruled out or in today because **the module is unwired and no caller convention exists yet**. The first review's concurrency-adjacent probes (idempotency replay, stale sequence, lock contention) were all single-threaded/sequential and did not exercise this specific cross-read non-atomicity, so "verifiably correct... in every probed direction" (first review §5) should be read as "correct under the probes run," not as a proof of atomicity for this specific new invariant.

**Recommendation (non-blocking, for whoever wires a live caller):** move the single-writer scan inside the same locked critical section as the write (e.g., have `append()` accept an optional pre-write validation hook invoked after lock acquisition and the internal read, or have `WorkspaceLeaseLedger` acquire the lock itself before doing both the conflict scan and the delegated append), so the check and the write share one atomic read.

## 4. Binding gap between the S2 pure primitive and the S3 durable record — disclosed, confirmed real (LOW/INFO)

Per my brief's item 3: does recording a lease to the ledger correctly interact with the pure `workspace-lease-policy.mjs` primitive's own decisions? **No — there is no interaction at all**, and this is disclosed rather than hidden. `grep -rn "mintLease|evaluateLease|renewLease"` across `src/` and `tools/` returns hits only inside `workspace-lease-policy.mjs` itself; `workspace-lease-ledger.mjs` never imports or calls any of the three. The ledger's own header states this explicitly: "the primitive decides, this ledger records" (workspace-lease-ledger.mjs:19-26) — an intentional peer relationship, not an oversight, consistent with this codebase's PURE+UNWIRED pattern (mirrors `approval-binding.mjs`'s "mint/verify only; the caller appends" discipline named in the same comment).

**Adversarial confirmation (PROBE2 + PROBE6):**
- PROBE2: `mintLease({ writeSet: ["../../etc", "src/ledger"], ... })` is correctly refused by the S2 primitive (`DENY_LEASE_MALFORMED`, traversal segment fails its own self-containment check). The **exact same** `write_set` handed to `WorkspaceLeaseLedger.appendLease` is **accepted and durably persisted** — the JSON schema only requires `write_set` to be a non-empty array of non-empty strings; it encodes no traversal/absolute-path/containment semantics at all. A caller that skips the primitive and calls `appendLease` directly can record a lease grant the primitive would have denied.
- PROBE6: the schema also does not cross-validate `issued_at + ttl === expires_at`. A lease with `ttl: 1` (millisecond) but `expires_at: "2099-01-01T00:00:00Z"` is accepted; `resolveActiveLease` consults `expires_at` alone for liveness, so this lease resolves as active in the year 2050 — `ttl` is decorative for the durable record's own liveness computation, entirely unlike the S2 primitive (which derives `expiresAt` itself from `issuedAt + ttl` and never trusts a caller-supplied expiry string).

**Assessment:** this is a correctly-disclosed design property, not a bug in this slice's stated scope — the ledger's job (per its own header) is to durably record a FACT, not to re-run policy. But it means the durable-record layer provides **zero enforcement** on its own; a future wiring step (B5, out of scope here) that connects `mcp-gateway-core.mjs` to this ledger **must** call `mintLease`/`evaluateLease` before `appendLease` and must derive `expires_at` from the primitive's own computed value, never from an independently-supplied string, or the two layers can silently diverge exactly as the cross-field TOCTOU class this project has repeatedly found elsewhere. Flagging this explicitly closes the loop the first review's §5 LOW-1 (schema field-set divergence) touched on but did not state in these terms.

## 5. Novel adversarial probes run this review (not shipped with the candidate)

All run standalone in the isolated worktree (`scratch-adversarial-probe.mjs`, not committed):

| Probe | Result |
|---|---|
| 1. Single-writer TOCTOU (stale pre-write view vs. fresh `expectedSequence`) | **Bypass reproduced** — see §3. |
| 2. Ledger persists a lease the S2 primitive would refuse to mint (traversal `write_set`) | **Confirmed** — see §4. |
| 3. Mid-chain record-splice tamper (swap two adjacent, individually-well-formed lines rather than a substring field edit) | Caught: `read()` and `resolveActiveLease` both throw `LEDGER_INTEGRITY_FAILURE` — genuine tamper detection, not a dead-code check, confirmed with a mutation style distinct from the shipped suite's single-field string replace. |
| 4. Same `actor_id`, two different `session_id`s | Both leases persist — the gate is session-scoped, not actor-scoped, exactly as designed/disclosed ("single writer **per session**"); documented as expected behavior, not a gap. |
| 5. Idempotency-key reuse with a mutated `session_id` (not just mutated payload content) | Correctly denied `DENY_IDEMPOTENCY_CONFLICT` regardless of which field changed. |
| 6. `ttl`/`expires_at` arithmetic inconsistency | **Confirmed** — see §4; `ttl` has no bearing on liveness once a record is durably stored. |

## 6. resolveActiveLease and expiry-boundary re-verification (independently reproduced)

- `now === expires_at` → `DENY_LEASE_EXPIRED` (fail-closed `>=` boundary), `now` one ms before → active. Reproduced.
- Three versions of the same `lease_id` all active → highest version wins. Reproduced.
- Unparseable stored `expires_at` → treated as NOT active in `resolveActiveLease` (deny-by-default) but treated as STILL active in `#detectSingleWriterConflict` (also deny-by-default, opposite direction, correct for each method's own safe side) — reproduced by direct code reading; matches the first reviewer's §4 characterization exactly.
- Tamper (chain hash mismatch) is caught **before** any lease is ever returned by `resolveActiveLease` — reproduced (probe 3 above, and the shipped test's own substring-replace variant, both pass).

## 7. Completion review's "S3 ledger half open" — genuine functional gap at the time, substantively closed now, with one caveat

The MOD-WSPACE completion review (`42147b6`) named four concrete absences as the reason the module was `NOT_FINISHED`: no `contracts/workspace-lease.schema.json`, no `WorkspaceLeaseLedger` class, no `resolveActiveLease`, and no `workspace-lease` entry in `contract-validator.mjs`/`validate-foundation.mjs`. I confirmed **first-hand, by reading the current code**, that all four are now genuinely present and functioning: the schema exists and is enforced (`additionalProperties:false`, closed set of 11 required fields), `WorkspaceLeaseLedger extends DurableLedger` exists and correctly reuses the base class for its core guarantees, `resolveActiveLease` exists and is fail-closed on every probed dimension, and the 16→17 schema registration is live (`npm run validate` reports 17 schemas, exit 0). This is **not** a cosmetic closure — the ledger genuinely persists, verifies, and resolves leases; it is not a stub or a no-op.

The completion review's remaining named non-goals (G3 worktree/namespace creation, G4 session state-machine widening, B5 gateway wiring, G7 P0 backlog anchor) are correctly **not** addressed by this slice and were never claimed to be — each remains an honest, explicitly-scoped R3/R4/operator item, consistent with this project's PURE+UNWIRED-then-wire-later pattern used throughout MOD-WSPACE, MOD-RUNTIME, and MOD-A2A. I re-confirmed `mcp-gateway-core.mjs` is byte-identical to base and `STATE_MACHINES.Session` is untouched (only a comment names what the file does not do).

**My one qualification on top of the first review's and the completion review's own read of this slice:** the single-writer feature (follow-up #3, which this slice folded in ahead of its named sequencing) is the one piece of *new* logic added beyond "land the ledger," and it is the one place my adversarial testing found a real gap (§3). The core "ledger half" the completion review was actually blocking on — durable persistence, tamper detection, fail-closed resolution, mechanical registration — is genuinely, soundly delivered. The extra single-writer invariant is not yet as solid as the rest, but it is also not yet reachable by any live caller, so it does not retroactively make the module's *ledger-existence* gap reopen — it is a distinct, narrower, forward-looking note.

## 8. Bug-class sweep (this project's recurring findings)

| Class | Result |
|---|---|
| Hardcoded test-ID / environment branching | None found — `grep` for `NODE_ENV`, literal test IDs (`wl_test_001`, `ses_test_001`, etc.) inside `src/ledger/workspace-lease-ledger.mjs` and `src/contracts/contract-validator.mjs`: zero hits. No test-only branch anywhere in the shipped source. |
| Schema/validator no-op | None — `contract-validator.mjs` gains exactly one live `schemaPaths` key; `supportedContractKinds()` runtime-returns 17 and includes `workspace-lease`; confirmed by direct execution, not by reading the diff alone. |
| SoD / duplicate-identity gap | Single-writer is session-scoped by design (probe 4); no actor-level gate exists or is claimed to exist. |
| Cross-field TOCTOU (MOD-LIVE S1 N1-style) | Found one genuine instance: §3 (single-writer check vs. durable write). The atomic single-read snapshot discipline for hostile-getter/Proxy attacks on the LEASE OBJECT ITSELF (mirrors write-set-policy REV-002/lease-primitive F3) is correctly closed — `structuredClone` reads every own key exactly once before both validation and storage consume the one snapshot; verified with my own value-varying-getter probe distinct from the shipped one (confirmed `reads === 1`, no divergence). |
| Silent-skip-instead-of-fail-closed | None found — every malformed path denies with a structured code or throws a typed `LedgerError`; nothing coerces to a permissive default. |
| Ledger tamper detection (genuine, not dead code) | Confirmed with a novel mutation style (§5 probe 3, whole-record reordering) distinct from the shipped suite's single-field substring replace — both `read()` and `resolveActiveLease` fail closed before returning any lease. |

## 9. Advisory status fields

```yaml
truth_status: verified_true          # all evidence read/executed first-hand on current main (944c3ff) in an isolated worktree; 1081/1076/0/5; ledger-file 19/19; validator PASS; six novel adversarial probes run and their outcomes recorded above
authority_status: advisory_only      # second independent reviewer verdict; no push, no merge, no authorization implied
implementation_status: existing      # this slice is already merged to main; this record reviews it, it does not propose new work
risk_class: medium                   # core ledger guarantees are sound (R2 additive, unwired, no live authority surface); the single-writer gate's non-atomicity (S3) is a genuine but currently-unreachable correctness gap that should be closed before any live caller depends on it
```

## self_certification

```yaml
self_certification:
  agent_id: claude-rev-wspace-s3-second-01
  peer_agent_id: claude-immune-rev-wspace-s3-01   # the first reviewer, for provenance only — not a joint approval
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

---

*Provenance — source: independent second-opinion review of `main`@`944c3ff` (candidate `bst/mod-wspace-s3-lease-ledger`@`da36c50`) against the first review `mod-wspace-s3-lease-ledger-rev-001`@`0542e76` and the MOD-WSPACE completion review `mod-wspace-completion-rev-001`@`42147b6`. No relationship to the producer or the first reviewer. Timestamp: 2026-07-21. Agent ID: claude-rev-wspace-s3-second-01. Cross-links: `mod-wspace-gap-assessment-001` (G2/G6/S3), `mod-wspace-completion-rev-001` (module-completion NOT_FINISHED verdict this slice was built to address), `mod-wspace-s3-lease-ledger-rev-001` (first review), `mod-wspace-lease-second-independent-review-001` (this session's own prior clean review of the S2 primitive, for context only), `MANIFEST.json`.*
