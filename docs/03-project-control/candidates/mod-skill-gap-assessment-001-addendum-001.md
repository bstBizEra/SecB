# MOD-SKILL SkillsHub — Gap Assessment Addendum 001

**Record ID:** MOD-SKILL-ASSESS-001-ADD-001
**Extends:** `docs/03-project-control/candidates/mod-skill-gap-assessment-001.md` (MOD-SKILL-ASSESS-001, commit `7b7ff43`, branch `bst/mod-skill-assessment` — not yet merged to `main`, but its findings are already referenced and acted on via the tracker; see §1)
**Module:** MOD-SKILL (SkillsHub)
**Baseline:** `main` @ `8e30d89` (this record's branch point)
**Planner identity:** `claude-cortex-modskill-assess-02` (BST-SA cortex, worker only)
**Authority:** AMD-002 advise-and-proceed; BST-SA global contract Dual-Agent Self-Certification Rule. Advisory only — no execution, no push, no merge.
**Recorded:** 2026-07-21
**Status:** DRAFT — extend-only candidate record. This is an ADDENDUM, not a rewrite: MOD-SKILL-ASSESS-001's inventory, gap table, and non-goals stand as recorded and are not restated in full here except where this record updates them.

## 0. Why an addendum instead of a new 001

Before doing any of steps 1-6 of this dispatch fresh, this record checked the repository state (`git log --all`, `git branch -a`, the tracker's own iteration log) and found MOD-SKILL is materially further along than a from-scratch gap assessment would assume:

- MOD-SKILL-ASSESS-001 (`7b7ff43`, `bst/mod-skill-assessment`) already performed the exact read-only inventory + gap-table + 3-slice plan this dispatch asked for. It is sound and is **not re-derived here**.
- Slice 1 (G1, candidate intake) was already **PRODUCED** (`a629325`, `bst/mod-skill-s1-intake`: `src/registry/skill-candidate-registry.mjs`, `contracts/skill-candidate.schema.json`), independently **REVIEWED** (`eb2dd4b`, APPROVE_FOR_OPERATOR_MERGE), and **MERGED to `main`** via PR #18. Confirmed present on `main` @ `8e30d89` by direct read of `src/registry/skill-candidate-registry.mjs` (284 lines) and `contracts/skill-candidate.schema.json` in this worktree.
- The tracker's own status line already reads: `MOD-SKILL | S1 RATIFIED; S2 promotion R3+, S3 revocation/IMM-SKILL-V1 R3` (only the queue-table row #12, which the dispatch instructions themselves say is extend-only/not to be touched, still shows the pre-assessment "QUEUED" text — that row is stale by design, not a signal that no work happened).

Writing a second, from-scratch `mod-skill-gap-assessment-001.md` on a new branch would (a) duplicate `7b7ff43` and `026aab3`'s content, (b) collide in spirit with the "one producer per file/scope" invariant this project enforces repeatedly in its own iteration log, and (c) throw away two concrete facts that change the S2/S3 design: two general-purpose primitives landed on `main` **after** MOD-SKILL-ASSESS-001 was written, and both are direct hits for MOD-SKILL's remaining gaps. This addendum reuses them per the project's own "reuse existing primitives rather than inventing new ones" convention, and directly answers this dispatch's step 6 (TOCTOU class check) with a concrete, code-grounded finding the original assessment did not have available to it.

## 1. What changed on `main` since MOD-SKILL-ASSESS-001 (`c8c67d2` -> `8e30d89`)

| New primitive | Landed via | Relevance to MOD-SKILL |
|---|---|---|
| `src/control/approval-binding.mjs` (`bindApprovalDecision` / `verifyApprovalBinding` / `evaluateApprovalBinding`) | MOD-RUNTIME-S3, PR #32 | Extracts the exact N-5 SoD gate MOD-SKILL-ASSESS-001 Slice 2 planned to hand-roll again (independent-review + governance, pairwise-distinct from producer and each other), plus a genuinely new capability neither `capability-registry-service.promote()` nor `goal-graph-service.evaluateForceRetireApprovals()` had: a fail-closed **exact action + exact object-version** bind/verify pair, so an approval minted for one skill version cannot be replayed against another. Composes `risk-registry.riskProfile(riskClass).humanApproval` (deny-by-default: only an explicit `false` skips the human gate). |
| `DurableLedger.append(entry, { expectedSequence, preWriteCheck })` generalized hook | MOD-WSPACE-S3 single-writer TOCTOU fix (merged) | A subclass business-rule check (e.g. "is this already promoted/leased?") can now run **inside** the same lock-held, freshly-verified critical section as the write, instead of an unlocked `read()` taken before a locked `append()`. This is the exact shape of bug this addendum's §3 flags for MOD-SKILL S2/S3 — see below. |

Both are **unwired candidates** (no service imports them yet); adopting them is exactly what this addendum's slice plan proposes for MOD-SKILL, not a new invention.

## 2. Gap table: no change, one re-scoping

MOD-SKILL-ASSESS-001's G1-G5 stand. G1 is CLOSED (S1 ratified). G2 (evaluation-evidence binding) and G3 (governed `promote()` transition) are **re-scoped, not reopened**: `approval-binding.mjs` now supplies the SoD-check half of G3 as a reusable primitive, so G3's remaining scope for MOD-SKILL is (a) the promotion *state transition itself* (CANDIDATE -> PUBLISHED, currently absent in code — promotion still happens off-system per the original assessment) and (b) wiring the evaluation-evidence check (G2) into that transition, not re-deriving SoD logic. G4 (distribution/harness-compat modeling) and G5 (revocation lifecycle / IMM-SKILL-V1) are unchanged and still open.

## 3. TOCTOU / check-then-act flag for S2 and S3 (dispatch step 6)

Every promotion-shaped service in this codebase that keeps its own state (`capability-registry-service.mjs`'s `promote()`, the S1 `SkillCandidateRegistry`) does so as **pure in-process `Map`s** with an injected `ledgerWriter` used only as an audit sink, not as the read-back source of truth for its own gate. Concretely, `capability-registry-service.promote()` does:

```js
for (const other of versions.values()) {
  if (other.status === "PROMOTED") return this.#denyAudited("PROMOTE", "DENY_ALREADY_PROMOTED", fields);
}
...
entry.status = "PROMOTED";
```

Within a single JS event loop this check-then-write is atomic (no `await` between them), so it is safe *only* as long as exactly one in-process instance ever holds the authoritative `Map` for a given `capability_id`/`skill_id`. It is **not** safe the moment two instances (two processes, two worktree-isolated producer sessions, or a restart) share the same underlying persisted ledger but each keep an independent in-memory `Map` — each instance's "already PROMOTED?" check only sees its own prior writes, not the other's. That is exactly the bug class that hit `WorkspaceLeaseLedger` (`mod-wspace-s3-single-writer-toctou-fix-001`): a business-rule gate evaluated against an unlocked, possibly-stale snapshot taken separately from the locked write.

**If MOD-SKILL S2's `promote()` (and S3's `revoke()`) are built by copying this same in-memory-`Map`-plus-audit-sink shape** (the natural thing to do, since it is what S1 and `capability-registry-service` both already do), MOD-SKILL inherits the identical "is this skill version already promoted / already revoked?" check-then-act gap the moment it runs as more than one instance against a shared store — which candidate-only code cannot assume it never will.

**Design-out-from-the-start recommendation:** S2/S3's state store should be a genuine `DurableLedger` subclass (mirroring `CheckpointLedger`, `DelegationLedger`, and now `WorkspaceLeaseLedger`), and the "already PUBLISHED"/"already REVOKED" business check should be implemented as a `preWriteCheck(records, entry)` hook passed to `append()` — evaluated *inside* the same lock-held, freshly-read-and-verified critical section as the write itself, per the pattern `src/ledger/durable-ledger.mjs` now documents explicitly (lines 113-136) and the WSPACE fix's own record (`mod-wspace-s3-single-writer-toctou-fix-producer-verification-001.md`) proves out end-to-end, including its own fast-follow finding (the hook must receive a `structuredClone` of `entry`, not the live object, or a mutating hook desyncs `entryHash`). This closes the gap **before** S2/S3 code exists, rather than requiring a second-review TOCTOU fix round the way WSPACE needed.

## 4. Boundary rulings (unchanged from MOD-SKILL-ASSESS-001, reaffirmed against current `main`)

- **MOD-KNOW** (claims/contradictions/supersession, `knowledge-linkage-service.mjs`): no overlap. MOD-KNOW's claim/evidence/supersession model governs *propositions about the world*; a skill manifest is an *artifact with a lifecycle*, not a claim. MOD-SKILL should not route intake/promotion through the knowledge-linkage sidecar. Reaffirmed.
- **MOD-GOV** (`src/control/sod-rules.mjs`, `risk-registry.mjs`, now also `approval-binding.mjs`): promotion is R3+ (`risk-registry.RISK_CLASSES.R3.humanApproval === true`, confirmed by direct read) and MUST reuse the kernel's SoD/risk primitives, never re-derive them. This addendum tightens that ruling with a specific primitive to reuse (`approval-binding.mjs`) rather than leaving it as a general instruction.
- **MOD-RUNTIME**: no execution/retry/checkpoint overlap — skill *invocation* is out of MOD-SKILL's scope entirely (see MOD-A2A/runtime below). MOD-RUNTIME is now also the *origin* of the approval-binding primitive MOD-SKILL should consume — a one-way dependency (MOD-SKILL depends on a MOD-RUNTIME-produced control primitive), not a boundary blur.
- **MOD-A2A / MOD-RUNTIME (execution)**: skill *invocation/execution* still belongs to the runtime/delegation surface, not MOD-SKILL. `SkillResolver.resolveSkill()` answers "may this project/runtime/data-class combination use this skill version," not "run it." Reaffirmed. `src/control/delegation-gate.mjs` (MOD-A2A S2) is a useful sibling precedent for *how* to reuse `risk-registry.mjs` read-only in a gate — not something MOD-SKILL wires into directly.

## 5. Refined S2 slice proposal (supersedes MOD-SKILL-ASSESS-001 §4 Slice 2's sketch on primitive reuse only; scope and R-flag unchanged)

**S2 — Governed promotion transition, built on reused primitives (G2, G3).**

- Add a `SkillPromotionLedger` (or equivalently named) as an actual `DurableLedger` subclass, not a bare `Map`, so "already PUBLISHED"/duplicate-promotion checks are evaluated via `preWriteCheck` inside the lock (§3).
- The N-5 approval evaluation itself is **not reimplemented**: call `evaluateApprovalBinding`/`bindApprovalDecision`/`verifyApprovalBinding` from `src/control/approval-binding.mjs` (read-only import, unmodified), binding the promotion decision to the exact `skill_id@version` via its `boundAction`/`boundObjectVersion` fields — this closes MR-3-class replay risk (an approval minted for `skill-x@1.0.0` cannot be replayed to promote `skill-x@1.1.0`) for free, which the original Slice 2 sketch did not have available.
- Evaluation-evidence binding (G2): require `evidence_refs` entries to resolve via the existing evidence chain (`register -> seal -> verify -> accept -> resolve`, MOD-EVID, already ratified on `main`) before a promotion decision is minted — reuses MOD-EVID's resolver rather than inventing a second evidence-resolution path.
- Still **R3+, candidate-only, unwired, execution_requires_operator** — this addendum changes *what gets reused*, not the authority posture MOD-SKILL-ASSESS-001 already assigned.

S3 (revocation, IMM-SKILL-V1) is unchanged in scope from MOD-SKILL-ASSESS-001 §7, with the same `preWriteCheck` design-in-advance recommendation from §3 above applied to `revoke()`.

## 6. Non-goals

Unchanged from MOD-SKILL-ASSESS-001 §5, plus: this addendum does not implement `approval-binding.mjs` adoption, does not wire MOD-EVID resolution into any skill service, and does not write S2/S3 code. Producer work only follows a separate dispatch.

## 7. Advisory fields

```yaml
truth_status: verified_true          # S1-ratified state, approval-binding.mjs, and preWriteCheck all confirmed by direct read of main @ 8e30d89
authority_status: advisory_only      # planning only; S2/S3 remain R3+/R3 operator-gated
implementation_status: partial       # MOD-SKILL: G1 closed; G2/G3 re-scoped-open; G4/G5 open
risk_class: high                     # unchanged driver: R3+ promotion, R3 revocation
```

## 8. Self-certification

```yaml
self_certification:
  agent_id: claude-cortex
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```
