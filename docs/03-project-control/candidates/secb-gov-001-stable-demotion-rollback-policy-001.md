# SECB-GOV-001 STABLE / Demotion / Rollback Policy (POLICY-001)

| Field | Value |
|---|---|
| Artifact | `secb-gov-001-stable-demotion-rollback-policy-001` |
| Status | **`DRAFT_CANDIDATE` / `NOT_EFFECTIVE` / `ADOPTION_REQUIRES_OPERATOR`** |
| Author | `claude-cortex-w1b-policy-01` (BST-SA Cortex, advisory) |
| Baseline of this draft | main @ `c2ec645` (PR #114 merge; detached-worktree read) |
| Wave | Wave 1b (W1b) of `secb-gov-001-readiness-closure-plan-001.md` — closes review gap **G8** (open-register item 5) |
| Timestamp | 2026-07-22 |
| Scope | Advisory DRAFT of a governed STABLE/demotion/rollback policy for promoted governance artifacts. Drafting only. Adopts nothing, demotes nothing, declares no artifact STABLE or effective. |
| Authority | Advisory only. This document becomes EFFECTIVE **only** when the operator/SEC-GOV ratifies a separate adoption record naming this doc + a version pin (Wave 3, §7). Until then it is a candidate with no force. |

> **Authority boundary of THIS record.** This document *drafts* a policy; it does
> not *enact* one. It does not promote `SECB-GOV-001`, does not declare any
> artifact STABLE/effective, does not demote or roll back anything, and does not
> itself become the reversibility guarantee the readiness reviews demanded until
> the operator adopts it. Drafting is the W1b half of a MIXED gap; the adoption
> half is `OPERATOR_ONLY` and lands in Wave 3. Nothing here is self-adopting.
> This policy does **not** modify ADR-0015 R5, the V-020 human-GOV sealed-slot
> pattern, or any existing lifecycle primitive; it *composes with* them.

---

## 0. Why this policy must exist (the exact G8 complaint, source-bound)

Both independent readiness reviews block promotion partly because reversibility is
undefined. Quoting the source records:

- **First review (`secb-gov-001-promotion-readiness-rev-001.md` §7 item 8):**
  "**Governed `STABLE`/demotion + rollback policy** defined before any promotion,
  so the effectiveness change is reversible by a governed decision."
- **First review §5 (the failure scenario the reviewers feared):** "Superseding
  the legacy constitution and replacing root `AGENTS.md` moves the governance
  source-of-truth; **rollback is not trivial** — it requires a governed demotion
  decision, and the packet itself notes that a `STABLE` disposition (and by
  extension a demotion/rollback policy) is **NOT DEFINED** in the current
  normative pack and must be created first."
- **Second review (`secb-gov-001-second-independent-readiness-review-001.md` §2
  #8):** "**CONFIRMED** — `find` for ADR/policy files matching stable/demotion
  patterns returns nothing."

The concrete fear, stated plainly: an operator promotes `SECB-GOV-001` to STABLE
— which flips the governance source-of-truth and swaps root `AGENTS.md` — and then
**there is no governed, pre-agreed path to walk that back** if a defect,
security finding, or contract break surfaces after the fact. No demotion
authority, no demotion criteria, no rollback anchor, no rollback record shape.
This policy defines exactly those four things **before** any promotion, so the
effectiveness change is reversible by a *governed decision* rather than an
ad-hoc scramble or a history rewrite.

---

## 1. Scope

This policy governs **promoted governance artifacts** — the pack/governance tier
whose effectiveness moves the system's source-of-truth. In scope:

1. **`SECB-GOV-001` itself** and its adopted companions (the OM v0.1 operating
   model, the `agents-instructions-om-v0.1-candidate.md` root-`AGENTS.md`
   replacement) once promoted.
2. **Contracts / schemas** — the canonical + governed schema set (`contracts/*.schema.json`)
   once bound into an effective pack.
3. **Ratified primitives** — module primitives (e.g. the MOD-* ledgers/services)
   at the point they cross from UNWIRED CANDIDATE into effective, wired reliance.
4. **Effective policies** — including *this* policy once adopted (§7).

**Out of scope (governed elsewhere; this policy composes at the boundary, does
not replace):**
- **Skills** — governed by the `skill-manifest.schema.json` status lifecycle
  (`CANDIDATE → SANDBOX → EVALUATION → REVIEW → PUBLISHED → DEPRECATED → REVOKED
  → QUARANTINED`) and the `SkillRevocationLedger` (`PUBLISHED → REVOKED`,
  terminal-forever). This policy mirrors that discipline for the pack tier; it
  does not re-govern individual skills.
- **Capabilities** — governed by `CapabilityRegistryService.promote` / `.revoke`
  (governance-gated, audit-first, deny-by-default, records known-bad versions).
  This policy adopts the same shape one tier up; it does not re-govern
  individual capability records.

> Design intent: the pack-tier lifecycle below is a deliberate **mirror** of the
> already-shipped skill and capability lifecycles, so an operator reasons about
> "how do we walk back an effective governance pack" with the *same* vocabulary
> and the *same* audit-first / governance-gated / terminal-forever discipline
> already proven at the skill and capability tiers. It reuses their doctrine; it
> does not fork a new one.

---

## 2. Lifecycle states + transitions

### 2.1 State set (minimal)

| State | Meaning | Effective? |
|---|---|---|
| `CANDIDATE` | Drafted, reviewed, not in force. The default for every artifact in `docs/**/candidates/`. | No |
| `STABLE` | Promoted and in force. The effective source-of-truth for its topic. (For `SECB-GOV-001` this is the `ACTIVE_READ_ONLY_CONTROLLED_ACTIVATION` disposition the packet requests.) | **Yes** |
| `DEPRECATED` | Superseded by a successor already STABLE; still referenceable during a grace window; scheduled to retire. | Waning (successor authoritative) |
| `RETIRED` | End-of-life. No longer normative for any topic. **Terminal-forever** (mirrors `SkillRevocationLedger` `DENY_ALREADY_REVOKED`). | No |

Governed **exception** paths (not part of the happy path; reached only by a
governed decision):

| State | Meaning | Effective? |
|---|---|---|
| `DEMOTED` | Effectiveness pulled back from STABLE by a governed demotion decision; the system re-pins to the rollback anchor (§4). The reversibility path the reviewers demanded. | No |
| `QUARANTINED` | Emergency isolation on a security/integrity finding; reliance is blocked pending disposition. Does **not** itself assert any effectiveness. | No |

### 2.2 Transition table

Every transition names: **who may authorize**, **what evidence is required**,
**what record must be written** (extend-only — supersede, never rewrite), and
**whether it is reversible**.

| # | Transition | Who may authorize | Evidence required | Record written (extend-only) | Reversible? |
|---|---|---|---|---|---|
| T1 | `CANDIDATE → STABLE` (promotion) | **operator / SEC-GOV only** (the human-GOV decision, V-020) | Full readiness chain evidenced: independent REV + QA + SEC verdicts (G1–G3), single accepted on-main baseline SHA (G4), reproduced test evidence (G5), evidence-acceptance record (G6), effective Project Contract (G7), *this policy adopted* (G8), explicit human-GOV PASS (G9) | Promotion / effectiveness declaration + the human-GOV decision record | Yes — via T4 (`DEMOTED`) or T2 (`DEPRECATED`), both governed |
| T2 | `STABLE → DEPRECATED` (planned supersession) | operator / SEC-GOV | A successor artifact already STABLE + a migration/pointer note | Deprecation record naming the successor + grace window | Yes — re-promote via a fresh T1 |
| T3 | `DEPRECATED → RETIRED` (end-of-life) | operator / SEC-GOV | No remaining live dependents; grace window elapsed | Retirement record | **No — terminal-forever.** A retired artifact-version is never resurrected; a new version supersedes it |
| T4 | `STABLE → DEMOTED` (governed demotion / rollback) | **operator / SEC-GOV only** (agents may only RECOMMEND, §5/§6) | ≥1 objective demotion trigger (§3) + the rollback anchor SHA (§4) | Demotion record naming the trigger, the rolled-back-to baseline SHA, and the repin proof (§4) | Yes — re-promotion requires the **entire** T1 chain again (no shortcut back to STABLE) |
| T5 | `{STABLE, DEPRECATED} → QUARANTINED` (emergency isolation) | operator / SEC-GOV (agent may RECOMMEND with evidence) | A security finding ≥ `HIGH` **or** an integrity/evidence-binding break (§3 triggers 2–3) | Quarantine record + the finding reference | Yes — disposition to `DEMOTED` (roll back) or, after remediation, a fresh T1 |

Notes on the discipline mirrored from existing primitives:
- **Audit-first / record-before-effect.** Every transition writes its governing
  record *before* the disposition is treated as in force — the exact audit-first
  posture of `CapabilityRegistryService` and `SkillRevocationLedger`.
- **Governance-gated, deny-by-default.** No transition is self-effecting; absent
  an authorized record the artifact stays in its prior state (fail-closed).
- **Terminal-forever where it matters (T3).** Retirement (and any recorded
  known-bad baseline under §4) is not reversible, mirroring the ledger's
  `DENY_ALREADY_REVOKED` gate — you supersede forward, you do not un-retire.
- **Extend-only.** Records supersede; the human-GOV sealed slot (V-020) and prior
  records are never rewritten.

---

## 3. Demotion triggers (objective; each REQUIRES initiating a demotion review)

If any of the following is observed against a `STABLE` artifact, a **demotion
review MUST be initiated** (which an agent may recommend, §6; only operator/SEC-GOV
executes the resulting T4/T5). These are gate conditions, not discretionary:

1. **Failed conformance at the bound baseline** — the artifact's accepted baseline
   (G4 SHA) no longer passes its own acceptance bar: `validate-foundation` non-zero,
   or a test-suite regression (fail count > 0) relative to the reproduced G5
   evidence.
2. **Security finding at/above `HIGH`** — a SEC/Immune finding classed `HIGH` or
   `CRITICAL` affecting the artifact or its activation boundary (the
   `ACTIVE_READ_ONLY_CONTROLLED_ACTIVATION` controls or the `AGENTS.md`
   replacement).
3. **Evidence-binding broken** — the accepted-baseline SHA is no longer reachable
   on the integration target, the claim-to-source binding is severed, or the
   evidence-acceptance record (G6) is invalidated. (This is the exact
   binding-integrity property the reviews measured; its loss is a demotion
   trigger, not a footnote.)
4. **Upstream contract/schema change** — a contract or schema the pack depends on
   changes incompatibly (a `contracts/*.schema.json` the pack binds is altered in
   a way that invalidates the pack's assumptions).
5. **N4-class dormant risk activating** — a deferred/dormant risk the artifact was
   promoted *around* crosses into live-reachable (the dormant precondition the
   promotion assumed would stay dormant no longer holds).

Reaching a trigger obliges *initiating the review*; the review's outcome
(DEMOTE / QUARANTINE / accept-with-mitigation) remains a governed operator/SEC-GOV
decision. The trigger removes discretion about *whether to look*, not about *what
to conclude*.

---

## 4. Rollback semantics (in an extend-only / append-only repo)

"Rollback" here never means rewriting history. It is defined precisely:

1. **Revert-by-new-record, never history rewrite.** A demotion is a *new appended
   record* (T4/T5) that supersedes the effectiveness declaration. The prior
   promotion record, its evidence, and the sealed human-GOV slot all remain
   in place, untouched. `git` history is never rewritten; no force-push; no
   deletion of prior records. (This is the same extend-only rule the whole repo
   runs on.)
2. **Pin-to-last-accepted-baseline SHA.** The **rollback anchor** is the single
   operator-accepted on-main baseline SHA fixed by **G4** (the refresh packet's
   one bound SHA — the G4 "single, consistent, on-main baseline" mechanism is
   *precisely* what makes rollback well-defined). Demotion re-pins effectiveness
   to that last-accepted baseline; if the artifact had no prior accepted baseline,
   the rollback target is the **pre-promotion state** (no effective pack — the
   legacy constitution remains authoritative, per `docs/README.md`'s "until
   acceptance, the legacy document remains authoritative").
3. **Byte-identity guard repin discipline for shared files.** Any *shared file*
   touched by the rolled-back artifact must be re-pinned to its **byte-identical
   last-accepted content**. The demotion record MUST carry a repin proof (the
   shared file's expected hash matches the last-accepted baseline). Any drift from
   byte-identity is a *new finding* to be reviewed — it is never silently
   overwritten, and it never justifies editing history to hide the drift. (This
   mirrors the byte-identity pins already used across the module completion work,
   e.g. `skill-resolver.mjs` "byte-identity pinned".)
4. **Sealed-slot and V-020 untouched.** Rollback operates *entirely* through new
   governed records. The human-GOV decision record's sealed slot
   (`verdict: null` / `PENDING_HUMAN_GOV` / `agent_fill_is_a_violation: true`) is
   never edited by a rollback; a demotion is its own record, not a mutation of the
   promotion's decision fields.
5. **Known-bad baseline is terminal.** A baseline SHA recorded as the *cause* of a
   demotion (the failing/compromised commit) is marked known-bad and is
   terminal-forever for re-promotion — re-promotion must bind a *new* accepted SHA
   and re-run the full T1 chain, mirroring `SkillRevocationLedger`'s
   `known_bad_versions` + `DENY_ALREADY_REVOKED` discipline.

---

## 5. Non-goals + boundaries

- **No runtime deployment/rollback automation (R3+).** This is a documentary
  governance policy. It defines *who/what/which-record* for demotion and rollback;
  it does **not** implement, wire, or authorize any executable
  demotion/rollback/deploy service. Building such a runtime is a separate,
  operator-gated R3+ step outside this policy.
- **No agent-initiable demotion.** Agents (Claude, Codex, any LLM) may
  **RECOMMEND** a demotion or quarantine *with evidence* (§6) — exactly as
  `SkillRevocationLedger`/`CapabilityRegistryService.revoke` refuse to trust bare
  caller data and require a governed decision — but **only the operator/SEC-GOV
  executes** T1/T2/T3/T4/T5. A recommendation is not an execution.
- **No modification of ADR-0015 R5**, the **V-020** sealed-slot pattern, or the
  **P0-20** operator HOLD. This policy composes with them and is subordinate to
  them; where any conflict is perceived, ADR-0015 R5 / V-020 win and this policy
  yields.
- **Promotes/demotes nothing itself.** This is a candidate policy. It changes no
  artifact's state on adoption *of itself*; it only defines the rules future
  governed transitions follow.

---

## 6. Agent role in demotion (recommend-only)

To make §5's boundary concrete and reusable:

- An agent that observes a §3 trigger produces a **demotion-recommendation
  record** (advisory): the trigger observed, the evidence (reproducible check),
  the proposed disposition (DEMOTE / QUARANTINE), and the rollback anchor it would
  re-pin to.
- That record carries `authority_status: execution_requires_operator` and
  `approval_authority: false`. It is an input to the operator/SEC-GOV decision,
  never a substitute for it.
- No agent may write, pre-fill, or simulate the demotion decision fields, exactly
  as no agent may fill the human-GOV promotion decision (V-020). The parallel is
  intentional: promotion and demotion are *symmetric* authority acts.

---

## 7. Adoption path (Wave 3 — `OPERATOR_ONLY`)

This policy is `NOT_EFFECTIVE` until, and only until, the operator adopts it. Wave
3 adoption (plan §3, decision point C, W3b) looks exactly like this:

1. The operator/SEC-GOV authors an **adoption record** (extend-only, e.g.
   `secb-gov-001-stable-demotion-rollback-policy-adoption-001.yaml`) that names
   **this document** and a **version pin** (this doc @ its adopted content hash /
   record version).
2. On that record, the operator declares the policy `EFFECTIVE`. Only then does
   this document's status flip `DRAFT_CANDIDATE → EFFECTIVE`, recorded by the
   adoption record — never by editing this doc's own header in place beyond the
   append that references the adoption record.
3. **Sequencing:** adoption of this policy (W3b) is a **precondition of** any
   `CANDIDATE → STABLE` promotion of `SECB-GOV-001` (T1 requires G8 adopted). The
   reviewers' rule holds: the reversibility policy is effective *before* the thing
   it must be able to reverse. Adoption may also be dispatched earlier than the
   rest of Wave 3 without harm, since it gates T1 regardless.
4. Until step 2, no artifact may cite this policy as an *in-force* reversibility
   guarantee — only as a *pending precondition*.

> G8 is a **MIXED** gap. W1b (this draft) is the agent-executable half. The
> adoption above is the `OPERATOR_ONLY` half. **G8 is therefore draft-half
> complete, adoption pending Wave 3 — not closed.**

---

## 8. Advisory status fields

```yaml
truth_status: verified_true          # G8 gap text + failure scenario quoted from the two on-main readiness reviews; lifecycle precedents (skill-manifest enum, SkillRevocationLedger, CapabilityRegistryService) read first-hand at c2ec645
authority_status: advisory_only      # draft only; effectiveness requires the operator adoption record in §7
implementation_status: candidate     # proposes a policy; enacts none of it; adopts nothing
risk_class: high                     # it is itself governance policy (mitigated by candidate-only drafting; adoption is operator-only)
```

## 9. Self-certification

```yaml
self_certification:
  agent_id: claude-cortex-w1b-policy-01
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

> Certified: this is a complete advisory DRAFT policy candidate, source-bound to
> the two `NOT_READY` readiness reviews (the exact G8 complaint) and to the
> on-main lifecycle precedents it mirrors (skill-manifest status enum,
> `SkillRevocationLedger` terminal-forever discipline, `CapabilityRegistryService`
> promote/revoke, ADR-0007 serialized integration, the G4 single-baseline
> mechanism, the V-020 sealed slot). It carries no execution or approval
> authority. It adopts nothing and declares no artifact STABLE or effective.
> Adoption — the operator ratifying an adoption record per §7 — is `OPERATOR_ONLY`
> and lands in Wave 3. Both agents may self-certify advisory work; neither may
> self-authorize execution.
