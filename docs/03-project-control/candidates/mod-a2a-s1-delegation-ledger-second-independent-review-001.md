# MOD-A2A S1 Delegation Ledger — Second Independent Review 001

**Record ID:** MOD-A2A-000-REV3 / mod-a2a-s1-delegation-ledger-second-independent-review-001
**Status:** ADVISORY — SECOND INDEPENDENT REVIEW, NOT A MERGE DECISION (module already merged to `main`, PR #24)
**Reviewer identity:** claude-immune (BST-SA Immune worker, independent of the producer AND of the first reviewer)
**Reviewed:** `src/ledger/delegation-ledger.mjs`, `contracts/delegation-request.schema.json`, `src/control/delegation-gate.mjs` (S2), `src/ledger/durable-ledger.mjs` — read at `origin/main` @ `a67169b` (isolated `git worktree --detach`, no live branch touched, no push).
**Prior review consulted (not trusted):** `docs/03-project-control/candidates/mod-a2a-s1-delegation-ledger-independent-review-001.md` (verdict `APPROVE_FOR_MERGE`, 33 novel mutation probes, 3 tamper reproductions — note: this record is NOT actually "zero findings"; it already carries two disclosed low-severity notes, §3/§6). Every claim below was independently reproduced from source, not taken on the first review's account.
**Date:** 2026-07-21

---

## Verdict: **APPROVE_FOR_MERGE (already merged — confirmed clean)**, with one cross-cutting advisory note

No TOCTOU/check-then-act gap, no identity-continuity/spoofing gap, and no silent-fail-open gap were found in `DelegationLedger`. One non-blocking, ecosystem-wide (not S1-specific) advisory note on `content_hash`/`version` semantics is recorded in §4.

---

## 1. TOCTOU / check-then-act — NOT PRESENT, and not simply "not yet named"

`DelegationLedger.appendDelegationRequest` calls only `this.append(entry, { expectedSequence })` — it passes **no** `preWriteCheck`. Read `durable-ledger.mjs` in full: `preWriteCheck` is an existing hook (already used by `WorkspaceLeaseLedger`'s single-writer-per-session gate, per its own inline comment citing "the mod-wspace-s3 single-writer-toctou-fix producer-verification record") that runs a subclass business-rule check **inside** the same lock-held, freshly-read critical section, before the write. `DelegationLedger` was authored *after* this hook existed (its own file header explicitly builds on `DurableLedger` without reimplementing anything), so this is not a case of a ledger predating the hook.

The question is whether `DelegationLedger` needs the hook and silently omits it. It does not, because:
- The only state-dependent gate `append()` itself performs — duplicate `entryId` (`delegation_id`) denial and optimistic-sequence conflict — is already evaluated **atomically inside the same lock** by the base class itself (`durable-ledger.mjs:154-172`), before any subclass hook would even run. There is no separate, subclass-owned invariant (e.g. "no two pending delegations for the same work package," "cumulative budget ceiling," "one delegation per destination_role") that this slice implements outside that lock. The producer's own file comment (lines 4-25) and the schema explicitly disclose this as scope: "no accounting logic in this slice," "not enforced/evaluated in this slice" (for `due_condition`), "present but NOT YET CONSUMED" (for `escalation_route`).
- I independently confirmed there is no separate unlocked `read()` anywhere in `delegation-ledger.mjs` preceding a write — `resolveDelegationRequest` is the only `read()`-calling method, and it is never called from within `appendDelegationRequest`. This is exactly the shape the MOD-LIVE/MOD-WSPACE/MOD-EVID/MOD-INTEG-queue bugs this session has previously found all shared (a business-rule read taken outside the write's lock); it is structurally absent here because there is no business-rule read at all, not because one exists but is well-behaved.

Verdict: no TOCTOU gap, and no equivalent-but-unnamed version of it either — the slice has zero extra invariants for the hook to protect.

## 2. Identity-continuity / spoofing — NOT PRESENT

Checked whether any field this ledger treats as authoritative (`source_actor_id`, `budget`, `ceiling`, `destination_role`) can be altered by a subsequent write for the same `delegation_id` — the MOD-WORK SoD-bypass shape.

`entryId` is bound 1:1 to `delegation_id` (`delegationRequestEntry()`, line 90). `DurableLedger.append()` denies `DENY_DUPLICATE_ENTRY_ID` for **any** second `append()` call reusing an existing `entryId`, unconditionally — this check runs before the idempotency-replay check would ever allow a same-key, different-content replay (idempotency replay itself requires an exact `entryHash` match; a same-key/different-content replay throws `DENY_IDEMPOTENCY_CONFLICT`, never silently overwrites). I independently verified this with `node --test tests/delegation-ledger.test.mjs` (test "duplicate delegation-request entry identity fails closed" passes) and confirm by reading the base class that no code path lets a second write for the same `delegation_id` succeed with different payload content, regardless of `idempotencyKey`, `expectedSequence`, or the schema's own `version` field (which is required ≥1 but never read or branched on anywhere in `delegation-ledger.mjs` — it cannot be used to smuggle an "update" past the duplicate-entryId gate). A delegation-request record is architecturally a single immutable fact once appended.

Verdict: no identity-continuity gap.

## 3. Silent-fail-open shape — NOT PRESENT

- Schema: `additionalProperties: false`, all 19 fields in `required`, closed `ceiling` sub-object, enum-constrained `riskClass`/`dataClassification` — Ajv `strict: true`. No coercion path (Ajv2020 with no `coerceTypes` option set, confirmed by reading `contract-validator.mjs:26` — default is `false`).
- `resolveDelegationRequest`: unknown/invalid ID → typed `DENY_UNKNOWN_DELEGATION`/`DENY_INVALID_DELEGATION_ID`, never a permissive default (e.g. never returns a synthesized/empty-but-`ALLOW` record).
- `appendDelegationRequest`: missing `idempotencyKey` throws `DENY_MISSING_ENTRY_FIELDS` before any write is attempted.
- Malformed ledger file content: `#readRecords`/`#verifyRecords` throw `LEDGER_CORRUPT`/`LEDGER_INTEGRITY_FAILURE` rather than skipping bad lines or returning a partial, silently-truncated record set.

Verdict: fail-closed throughout, consistent with sibling `CheckpointLedger`/`WorkspaceLeaseLedger` deny-on-use discipline.

## 4. Cross-cutting advisory note (non-blocking): `content_hash`/`version` are schema-shape-only, not self-verified — and this is not disclosed anywhere

Grepped `content_hash` usage repo-wide. In `evidence-envelope-service.mjs`, `handoff-service.mjs`, and `context-federation-service.mjs`, `content_hash` is an actively **self-verifying seal**: the server recomputes a fingerprint over the body and denies (`DENY_CONTENT_HASH_MISMATCH` / `DENY_FINGERPRINT_MISMATCH`) if the caller-supplied value doesn't match. In `delegation-request.schema.json` (and identically in the sibling `checkpoint.schema.json` and `workspace-lease.schema.json`), `content_hash` is required only as a `^[a-f0-9]{64}$` **shape** — nothing in `delegation-ledger.mjs`, `checkpoint-ledger.mjs`, or `workspace-lease-ledger.mjs` recomputes or checks it against the payload. A caller can submit any syntactically-valid 64-hex-char string as `content_hash` with no relationship to the actual delegation-request content, and it will be accepted and durably persisted as-is. The `version` field (required, integer ≥1) is similarly present-but-unused: never read or branched on by `DelegationLedger`.

This is **not** a slice-specific defect — it is a consistent, pre-existing pattern across all three thin `DurableLedger` subclasses (delegation, checkpoint, workspace-lease), and `DurableLedger`'s own hash-chain (`entryHash`/`recordHash`) already provides genuine tamper-evidence at the ledger-storage layer independent of this field. It is inert today: nothing in `delegation-gate.mjs` (S2) or elsewhere reads `content_hash` for any decision. I am naming it because the field's name and pattern are byte-identical to the self-verifying seal used elsewhere in this same codebase, which creates a latent risk that a future consumer (a not-yet-built S3 escalation-route primitive, or an external caller) could mistakenly assume `delegation_request.content_hash` is itself a verified integrity guarantee the way `evidence_envelope.content_hash` is. No code change is needed for this merged slice; recommend a one-line doc note (in the S1 file header or the schema) stating `content_hash` here is caller-supplied and unverified, to pre-empt that misreading before a future slice builds on it.

## 5. Downstream consumers (S2/S3) — no false cross-slice assumption found

Read `src/control/delegation-gate.mjs` (S2, merged separately via PR #31, already independently reviewed twice per `mod-a2a-s2-non-escalation-gate-independent-review-001.md` and `-rev-001.md`) in full, not re-reviewing its own internal logic. `evaluateDelegation`/`evaluateDelegationRequest` are pure functions with **no reference to `DelegationLedger` at all** — no import, no `read()`/`resolveDelegationRequest()` call, no assumption about persistence, hash-chain integrity, or content_hash verification. `evaluateDelegationRequest`'s only touch point is duck-typed access to `.ceiling` on whatever record it's handed, with the module's own comment explicitly disclaiming any dependency: "S2 does not depend on S1 ... it operates on ceilings directly." Since S2 makes zero assumptions about S1's guarantees, there is no cross-slice trust mismatch to find here. **S3 (escalation-route)** does not exist as code yet on `main` — it remains a deferred, unbuilt slice per the gap assessment and `module-completion-tracker-001.md`; there is nothing to check for a false assumption because nothing consumes `DelegationLedger`'s `escalation_route` field today. (This is the reason the §4 advisory note is framed forward-looking rather than as a live bug.)

## 6. Test results — independently reproduced, isolated worktree, clean `npm ci`

- Full suite: `npm test` → **1149 tests / 1146 pass / 0 fail / 3 skipped**.
- Targeted: `node --test tests/delegation-ledger.test.mjs tests/delegation-gate.test.mjs` → **41/41 pass, 0 fail**.
- `node tools/validate-foundation.mjs` → exit code **0**, 800/800 `"status": "PASS"` entries, zero non-PASS.
- Hardcoded test-ID branching: `grep -n "del_p0_test|test_001|test_002" src/ledger/delegation-ledger.mjs src/control/delegation-gate.mjs src/contracts/contract-validator.mjs` → **no hits**; fixture IDs appear only in test files as ordinary data.

## Summary of findings

| # | Category | Result |
|---|---|---|
| 1 | TOCTOU / check-then-act (preWriteCheck usage) | Not present — no extra invariant exists for the hook to protect; not omitted-in-error |
| 2 | Identity-continuity / spoofing | Not present — `DENY_DUPLICATE_ENTRY_ID` is unconditional; `version` cannot bypass it |
| 3 | Silent-fail-open | Not present — closed schema, no coercion, typed deny codes throughout |
| 4 | `content_hash`/`version` unverified-shape-only field | Non-blocking cross-cutting advisory note (applies to 3 sibling ledgers, not S1-specific); recommend doc clarification before a future slice consumes it |
| 5 | S2/S3 cross-slice trust assumption | None found — S2 makes zero assumptions about `DelegationLedger`; S3 unbuilt |
| 6 | Tests | 1149/1146/0/3 full suite; 41/41 targeted; validate-foundation exit 0, 800/800 PASS; no hardcoded test-ID branching |

## Advisory status fields

```yaml
truth_status: verified_true
authority_status: advisory_only
implementation_status: existing
risk_class: low
self_certification:
  agent_id: claude-immune
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

## Provenance

- source: first-hand reproduction in an isolated `git worktree --detach` checkout of `origin/main` @ `a67169b`, separate from any live branch and from any other concurrent agent session; no push, no merge, no live-branch mutation.
- agent_id: claude-immune (BST-SA Immune worker, Claude Sonnet 5)
- timestamp: 2026-07-21
- disposition: advisory review only; no execution/approval/merge authority exercised; recorded on a detached-HEAD commit via `git update-ref`, not on any live branch, for operator/GOV review per AMD-002 rev 2.

> This module is already merged. This review's finding is: confirmed clean, no TOCTOU/identity/fail-open defect, one forward-looking non-blocking doc note (§4). Recommend no fast-follow code change; optional one-line doc clarification on `content_hash` semantics whenever S3 (escalation-route) is next produced. This review recommends; it does not authorize or itself constitute merge/production ratification.
