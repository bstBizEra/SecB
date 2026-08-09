# BOPEN-GOV-EBAG-001 — Evidence-Backed Agent Governance

## Document Control

| Field | Value |
|---|---|
| Artifact ID | BOPEN-GOV-EBAG-001 |
| Version | 0.1.0-candidate |
| Status | **DRAFT / NOT EFFECTIVE — BLOCKED PENDING GENESIS RATIFICATION** |
| Owner | SecB Engineering & Governance Authority |
| Extends | [`08-bopen-engineering-loop.md`](08-bopen-engineering-loop.md) |
| Source | Operator-supplied design, 2026-08-10, "Evidence-Backed Agent Governance" |
| Effective when | Human GOV ratifies the delegation constitution (§11). Not before, and not by any act of a worker agent |
| Authored by | Claude (worker agent) under `SECB-AGENTS-AMD-002` §3 — candidate preparation only |

---

## 1. Why this document cannot bind itself

This specification would move a class of changes that today require human
approval into a class that agents can approve by ballot. A worker agent wrote it.
If the same agent could then act under it, the document would be an instrument of
self-granted authority, and every decision made under it would inherit that
defect.

The source design states this itself, and it is restated here because it is the
single most load-bearing sentence in the whole proposal:

> Without an existing authority signing the Genesis Ratification, making the
> current PR agent-approved is a retroactive self-grant of authority, and cannot
> count as credible governance evidence.

So this document is written as a candidate and binds nothing. The retained hard
gates of [`SECB-AGENTS-AMD-002`](../../AGENTS.md) are unchanged by its existence,
and where this document and a retained hard gate appear to conflict, the gate
governs — not as a transitional courtesy, but permanently, until a human GOV act
says otherwise.

---

## 2. The premise correction: SecB is not the repository this was written against

The source design reasons about a pull request that modifies `ci.yml`, a policy
bundle, an ADR, and a classifier, and asks how such a PR can be approved without
approving itself.

**SecB has none of those four things.** Verified at
`main` on 2026-08-10:

| Assumed artifact | Present in SecB |
|---|---|
| `.github/workflows/ci.yml` | No — the repository tracks zero files under `.github/` |
| Policy bundle (OPA `.rego` or equivalent) | No |
| Governance classifier | No |
| Required status checks, org rulesets, merge app | No — there is no CI surface at all |

This is not a detail. Sections 3, 4, 8 and 10 of the source design describe
controls over a CI pipeline that does not exist here, and their protective value
in SecB is therefore zero until that pipeline exists. A document that adopted
them verbatim would read as though SecB had defences it does not have, which is
the specific failure mode this repository's evidence discipline exists to
prevent.

What SecB has instead is the **primitive layer** those controls would be built
from — and rather more of it than the design assumes. §3 maps it.

---

## 3. Substrate map — what SecB already implements

Every row below is a delivered module in this repository, reachable from
[`src/index.mjs`](../../src/index.mjs) unless marked otherwise.

| Source design mechanism | SecB implementation | Status |
|---|---|---|
| §5 Ballot bound to exact commit and digests | [`src/control/approval-binding.mjs`](../../src/control/approval-binding.mjs) — `bindApprovalDecision`, `verifyApprovalBinding`, `APPROVAL_BOUND` | Delivered, wired |
| §6 Proposer may not approve own work | [`src/control/sod-rules.mjs`](../../src/control/sod-rules.mjs) `checkProhibitedActors`; [`authority-engine.mjs`](../../src/control/authority-engine.mjs) `CONFLICTING_ROLES` | Delivered, wired |
| §6 Independent review + governance roles | `INDEPENDENT_REVIEW_ROLE` / `GOVERNANCE_ROLE`, N-5 promotion gate in [`capability-registry-service.mjs`](../../src/gateway/capability-registry-service.mjs) | Delivered, wired |
| §1 L1 delegation envelope | [`src/control/delegation-gate.mjs`](../../src/control/delegation-gate.mjs) — `evaluateDelegation`, `DENY_HUMAN_APPROVAL_REQUIRED` | Delivered, wired |
| §11 Escalation instead of a binary verdict | [`src/control/escalation-route.mjs`](../../src/control/escalation-route.mjs) | Delivered, wired |
| §7 Evidence pack as a first-class object | [`src/services/evidence-envelope-service.mjs`](../../src/services/evidence-envelope-service.mjs) | Delivered, wired |
| §7 §12 Evidence digest chained and append-only | [`src/ledger/durable-ledger.mjs`](../../src/ledger/durable-ledger.mjs) — hash-chained, `ZERO_HASH` genesis | Delivered, wired |
| §10 Shadow-mode divergence detection | [`src/control/checkpoint-drift-comparator.mjs`](../../src/control/checkpoint-drift-comparator.mjs) — `evaluateResume`, `CHECKPOINT_DRIFT_DENY_CODES` | Delivered, wired |
| §2 Risk-class taxonomy | R0–R4 / M0–M4 / A0–A5, `docs/00-governance/` | Effective |
| §6 Maker ≠ Verifier | [`08-bopen-engineering-loop.md`](08-bopen-engineering-loop.md) §3.1 | Effective |
| §2 Policy decision point | [`src/control/policy-decision-point.mjs`](../../src/control/policy-decision-point.mjs) | Delivered, **held unwired** — its own header places adoption in separately-governed work |

Eight of the eleven named mechanisms already exist as code. The gap between SecB
and this design is **not** primitives. It is: no policy engine binding them
together, no CI to run them in, no signing identity, and no external trust
anchor.

---

## 4. Authority-delta classification (replaces file-based protection)

The design's central correct move: stop asking *which file was touched* and start
asking *how much authority the change adds*. Adopted here as the classification
SecB would use, expressed against SecB's own vocabulary.

| Class | Meaning | Verdict under this design | SecB today |
|---|---|---|---|
| G0 | Non-governance code or documentation | `AUTO_ELIGIBLE` | AMD-002 §1 pre-authorized paths — already effective |
| G1 | Governance implementation refactor, outcome-identical | `AGENT_BALLOT_ELIGIBLE` | Human GOV |
| G2 | Change within an already-granted delegation envelope | `AGENT_BALLOT_ELIGIBLE` | Human GOV |
| G3 | Advance along a pre-authorized authority ladder, KPI met | `CONDITIONAL_AGENT_ELIGIBLE` | Human GOV |
| G4 | Raises an absolute ceiling, lowers quorum, adds a bypass, or changes the trust anchor | `CONSTITUTIONAL_REQUIRED` | Human GOV |
| G5 | Disables audit, destroys evidence, skips a verifier | `REJECTED` | `REJECTED` — already, unconditionally |

**The load-bearing invariant.** A change is G1/G2 only if
`authority_delta ≤ delegated_envelope` can be *demonstrated*, not asserted. An
agent claiming its own change is within envelope is making the claim the
classification exists to check. Under §8 the claim is evaluated by both the
current and the proposed policy, and disagreement is disqualifying rather than
resolvable by the newer one.

**Classifier self-classification is the attack.** A classifier that can rate its
own change as G1 has, in one step, converted every future G4 into a G1. The
design's answer — dual evaluation against an external golden corpus — is the
minimum, and in SecB it must additionally satisfy §8's rule that a policy under
change is never the sole judge of its own change.

---

## 5. Ballots are attestations, not opinions

A ballot is admissible only if it binds to the exact subject. SecB's
`approval-binding.mjs` already implements the binding half; what is missing is
the identity and signature half.

```yaml
ballot:
  ballot_id: BAL-GOV-2026-001
  subject_commit: "<exact commit sha>"
  current_policy_digest: "<sha256>"
  proposed_policy_digest: "<sha256>"
  evidence_root: "<merkle root>"
  role: security-reviewer
  decision: APPROVE
  authority_delta: WITHIN_ENVELOPE
  conditions: []
  expires_at: "<ISO 8601>"
  signer_identity: "<workload identity>"
  signature: "<signature>"
```

**Invalidation is not optional.** A new push changes `subject_commit`; every
ballot bound to the previous commit dies with it. This is the same physics as
this repository's existing exact-SHA review records, and the reason
`SECB-AGENTS-AMD-003` renumbering preserved its incumbent's SHA-bound review
chain rather than reusing the identifier.

**SecB cannot produce the last two fields today.** There is no workload identity,
no signing key, and no transparency log. Until there is, a "ballot" in SecB is an
unsigned assertion by a process with no independent identity — which §6 of the
source design correctly says is not a ballot at all.

---

## 6. Separation of duties

| Role | Reviews |
|---|---|
| Architecture | ADR conformance, architecture invariants |
| Governance | Authority delta and delegation envelope |
| Security | Bypass, privilege escalation, negative tests |
| QA | Tests, regression, classifier accuracy |
| Operations | Rollback, observability, blast radius |

Rules: the proposer issues no ballot; the evidence builder does not attest its
own evidence; ≥4 of 5 `APPROVE`; Governance and Security hold veto; G2–G3 require
5 of 5; each voter runs under a distinct service identity; only the merge app
enters the merge queue.

**Distinct identity is the whole mechanism.** Five ballots from five prompts on
one engine, under one credential, are one ballot counted five times. SecB has
already recorded this failure in a narrower form: a subagent sharing the maker's
engine does not satisfy Maker ≠ Verifier, which is why `SECB-ARCH-023
maker-evidence-audit` produces findings and never a verdict. The same reasoning
scales up. A five-agent council without five identities is theatre with a quorum
count attached.

---

## 7. Minimum evidence pack

Exact diff and semantic authority delta · evaluation under current policy ·
evaluation under proposed policy · regression and negative/bypass tests · replay
against a historical PR corpus · classifier confusion matrix · confirmation that
no constitutional case was downgraded · security scan and dependency provenance ·
rollback test · shadow-mode comparison · signed ballots and independence
attestation · evidence digest bound to the commit SHA.

Item 7 is the one that does the work: *no constitutional case was downgraded.*
The others prove the change is good; that one proves the change did not quietly
move the boundary of what counts as needing approval.

---

## 8. Dual-policy rule

A policy change may never be judged by the policy it proposes.

```text
AUTO_MERGE =
      CURRENT_POLICY_PASS
  AND PROPOSED_POLICY_PASS
  AND AUTHORITY_DELTA_WITHIN_ENVELOPE
  AND EVIDENCE_COMPLETE
  AND BALLOT_QUORUM_MET
  AND NO_VETO
  AND ROLLBACK_VERIFIED
```

Where current and proposed disagree: shadow mode, no activation, a divergence
report, higher quorum, and activation no earlier than the next governance epoch.

This is the one section of the source design that SecB could adopt with no new
infrastructure, because it is a rule about *sequencing*, not about tooling. It is
also the section that most directly closes the self-approval hole.

---

## 9. Two-epoch activation for gate changes

Build the candidate gate as an immutable artifact → the **current** gate judges
it → independent ballots → shadow run → old/new decision comparison → merge the
candidate **inactive** → activate in the following epoch → retain the previous
version for automatic rollback.

Merging and activating in one event means the change that removes a check is
protected only by the check it removes.

---

## 10. The authority ladder, and why it is the most dangerous section

The source design proposes that an agent may advance A2 → A3 → A4 on its own once
Root-Constitution-defined conditions are met, while remaining unable to create A5
or raise the absolute maximum.

The distinction is real: exercising a pre-granted, pre-conditioned advance is not
the same act as inventing new authority. But it is a **narrow** distinction, and
it fails completely if any of the following is true:

1. The agent can influence the KPI that gates the advance (e.g. what counts as a
   "successful PR", or who records a rollback).
2. The agent can edit the ladder definition, in which case A4 → A5 is one
   G4-classified-as-G1 away.
3. The conditions are counted by the same system that benefits from the count.

SecB currently satisfies **none** of the three safeguards those conditions imply:
there is no external KPI source, no immutable ladder definition, and no
independent counter. Until all three exist, this section is documentation of a
target state and must not be implemented, including in partial form. Half a
ladder is a ladder with the safety rail removed.

---

## 11. Blocked actions and the reasons

| # | Action | Block reason |
|---|---|---|
| B1 | Retire `HUMAN_REQUIRED` as an outcome | Retained hard gate, AMD-002. Constitutional; requires human GOV |
| B2 | Reclassify any SecB change from human-approved to agent-ballot-approved | Same. This is the whole proposal and it is the whole block |
| B3 | Configure an external trusted verifier, GitHub App, or organization ruleset | Working rule 5 — no remote configure, publish, deploy or activate without explicit operator authorization |
| B4 | Introduce signing identity, Sigstore/cosign, or a transparency log | Working rule 5 (external service) and authority-model change |
| B5 | Implement the authority ladder in any form | §10 — none of its three safeguards exists |
| B6 | Wire `policy-decision-point.mjs` | Its own header places adoption in separately-governed work |
| B7 | Treat this document as conferring effectiveness on itself | §1 |

Permitted without further authorization: authoring this candidate, mapping it
against the substrate (§3), and preparing implementation candidates on a branch
under AMD-002 §3 — which is the authority under which this document exists.

---

## 12. Adoption path

1. **Bootstrap PR** — installs only the mechanism, activating nothing: external
   trusted verifier, ballot schema, signed delegation envelope, merge app, and
   the §8 dual-policy rule.
2. **Genesis Ratification** — one signature from the *current* authority. This is
   the only human act the model requires per epoch, and it cannot be supplied by
   any agent, this document, or a majority of agents.
3. **Policy Payload PR** — opened separately, and judged under the ratified
   constitution rather than under itself.

The bargain is worth stating plainly, because it is the reason to do any of this:
the human does not approve every policy change. The human approves the
constitution of delegation, once. Everything downstream becomes evidence.

For SecB specifically, step 1 is presently unreachable — items B3 and B4 place
the external verifier and the signing identity outside what a worker agent may
configure, and there is no CI surface to install them into (§2). **The next
actionable step is an operator decision on whether SecB should acquire a CI
surface at all**, since every mechanism in §3–§9 that SecB does not already have
presupposes one.

---

## 13. What this document does not do

It does not activate, amend, or narrow any retained hard gate. It does not
reclassify any change type. It does not create a ballot, a delegation envelope,
or an authority ladder. It does not authorize remote configuration. It does not
make itself effective, and it confers no authority on the agent that wrote it.

It is a specification awaiting a decision that only a human GOV can make.
