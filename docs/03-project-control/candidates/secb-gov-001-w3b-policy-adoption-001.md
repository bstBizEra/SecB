# SECB-GOV-001 — W3b Policy-Adoption Record (G8)

**Artifact ID:** SECB-GOV-001-W3B-POLICY-ADOPTION-001
**Status:** DRAFTED_PENDING_OPERATOR_ADOPTION
**Wave:** 3b (per `secb-gov-001-readiness-closure-plan-001.md`, ratified PR #114)
**Gap closed on adoption:** G8 — STABLE/demotion/rollback policy (draft-half closed at PR #116; this record closes the adoption-half)
**Drafted by:** claude-coordinator-w3b-draft-01 (agent; advisory only)
**Drafted at:** 2026-07-22
**Base at drafting:** main @ `bf2b20d66de851520adbb56034db8bec6c6959fd`

---

## 1. What this record is

Both readiness reviews required a governed STABLE/demotion/rollback policy to be
*defined before any promotion* so that any effectiveness change is reversible by a
governed decision. The policy was drafted (W1b) and ratified onto main as a
candidate (PR #116) with status `DRAFT_CANDIDATE / NOT_EFFECTIVE /
ADOPTION_REQUIRES_OPERATOR`. Per the policy's own §7 adoption path, it becomes
EFFECTIVE only when the operator ratifies an adoption record naming the document
and a version pin.

**This is that adoption record.** An agent drafted the enumeration; an agent cannot
adopt policy. Adoption is the operator's act, exercised per §4.

## 2. The policy being adopted (exact version pin)

- **Document:** `docs/03-project-control/candidates/secb-gov-001-stable-demotion-rollback-policy-001.md`
- **Version pin (git blob):** `15a3b012f19adea394c86fba2469a614dcf0bbfb`
  (the blob at main @ `bf2b20d`; adoption applies to this byte-exact version only)
- **Landed:** W1b draft, PR #116, merge `d75a9bf`, 2026-07-22
- **Author:** `claude-cortex-w1b-policy-01` (advisory draft)

Any change to the policy text after adoption produces a different blob and is NOT
covered by this adoption — a new revision requires a new adoption record
(extend-only; supersede-by-reference).

## 3. What is being adopted (summary; the pinned document governs)

- **Lifecycle state machine:** `CANDIDATE → STABLE → DEPRECATED → RETIRED`
  (RETIRED terminal-forever), with `DEMOTED` / `QUARANTINED` as governed exception
  paths reachable only by operator/SEC-GOV decision (transitions T1–T5, each with
  authorizer, required evidence, extend-only record, reversibility declaration).
- **Five objective demotion triggers** requiring a demotion review: failed
  conformance at the bound baseline; security finding ≥ HIGH; evidence-binding
  broken; upstream contract change invalidating assumptions; N4-class dormant risk
  activating.
- **Rollback semantics:** revert-by-new-record (never history rewrite); re-pin to
  the last operator-accepted G4 baseline SHA; byte-identity repin proof for shared
  files; causing commit recorded known-bad and terminal for re-promotion.
- **Boundaries:** no runtime rollback automation (R3+); agents may RECOMMEND
  demotion with evidence but only operator/SEC-GOV executes; ADR-0015 R5, V-020,
  and the sealed-slot pattern untouched.

## 4. Adoption semantics

> **The operator's ratification of this record on main (merge of its staging PR,
> ordered explicitly by the operator) constitutes G8 adoption: the policy at the
> version pin in §2 becomes the EFFECTIVE lifecycle/demotion/rollback policy for
> SECB-GOV-001 promotion objects, from the merge timestamp forward.**

- Adoption closes G8 fully (draft-half + adoption-half).
- Adoption does NOT seal G9, does NOT touch the P0-20 sealed slot
  (`verdict: null`, `agent_fill_is_a_violation: true`), does NOT sign the G7
  contract (the contract's `governing_lifecycle_policy` reference upgrades from
  `PENDING_OPERATOR_ADOPTION_WAVE_3` to satisfied at the W3c signing), and does
  NOT declare promotion or production.
- This resolves the G3 SEC lane's policy-dependency flag **PD-1**.
- An agent filling any adoption semantics on the operator's behalf — including
  merging this record without an explicit operator order — is a governance
  violation.

## 5. Self-certification

```yaml
self_certification:
  agent_id: claude-coordinator-w3b-draft-01
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```
