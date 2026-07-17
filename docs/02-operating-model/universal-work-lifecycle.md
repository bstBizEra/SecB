# Universal Work Lifecycle

**Document ID:** SECB-OM-LIFECYCLE-001
**Version:** 1.0.0-draft
**Status:** DRAFT / NOT EFFECTIVE

## Lifecycle

| Stage | Purpose | Required output |
|---|---|---|
| INTENT | Establish desired result | Objective Brief |
| REGISTER | Establish identity and authority boundary | Effective Project Contract |
| DISCOVER | Establish current state | Context Baseline |
| FRAME | Define problem, stakeholders, constraints | Problem Definition |
| RESEARCH | Gather and qualify evidence | Evidence Pack |
| OPTIONS | Compare alternatives | Options and Trade-off Record |
| DECIDE | Select direction | Decision Record |
| DESIGN | Define contracts and boundaries | Solution/Architecture Contract |
| PLAN | Decompose bounded work | Work Packages |
| AUTHORIZE | Grant effective scoped authority | Authorization Record |
| EXECUTE | Perform the authorized work | Events and Artifacts |
| SELF-VERIFY | Producer checks own claims | Producer Verification Report |
| INDEPENDENT REVIEW | Challenge conformance and quality | REV Findings |
| QA / ASSURANCE | Independently verify acceptance | QA/SEC Verdict |
| GOVERNANCE DECISION | Permit or deny transition | Approval / Rejection / Risk Acceptance |
| DELIVER / RELEASE | Transfer or activate output | Delivery/Release Receipt |
| OBSERVE OUTCOME | Measure actual effect | Outcome Receipt |
| LEARN | Capture bounded experience | Experience Record |
| KNOWLEDGE CANDIDATE | Propose reusable claim | Knowledge Candidate |
| SKILL CANDIDATE | Propose executable capability | Skill Candidate |
| PROMOTE / RETIRE | Govern lifecycle | Promotion, Restriction, Deprecation, or Revocation |

## Transition Rules

- Every transition requires current-state match, authorized actor, required evidence, and idempotency key.
- A transition request is rejected if its source object changed after approval.
- Repeated requests must return the prior disposition rather than duplicate effects.
- Terminal states are explicit and immutable.
- Failure, blocked, quarantine, cancellation, and recovery paths are first-class states.
- Work may return to an earlier stage only through a recorded rework transition.

## Professional Judgment Protocol

Agents must separate:

```text
Verified Fact
Reported Fact
Assumption
Hypothesis
Inference
Recommendation
Decision
Policy
Unresolved Question
```

Before a material recommendation, record objective, evidence, unknowns, options, trade-offs, risks, reversibility, confidence, authority required, and review triggers.
