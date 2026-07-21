# P0-18 V-020 Governance Conformance — Candidate 001 (Advisory Coverage Report)

**Document ID:** SECB-P0-18-V020-GOVERNANCE-CANDIDATE-001
**Status:** CANDIDATE / ADVISORY — NOT SIGN-OFF
**Base:** main @ `ec5aa76` (`ec5aa76cdc404ffbecfb5ca9de07a0c943da29b1`)
**Branch:** `bst/p0-18-v020-governance`
**Producer:** `claude-immune-p0-18-v020-governance-01` (BST-SA Immune, advisory)
**Governance mode:** AMD-002 advise-and-proceed (candidate + advisory packet on a branch)

---

## 0. Scope statement (read first)

This is a conformance-**COVERAGE** candidate for the **adversarial half** of
V-020 (`verification-matrix.md`, SECB-VERIFY-P0-001):

| ID | Control | Positive case | Negative/adversarial case |
|---|---|---|---|
| V-020 | Governance | human decision changes allowed state | **agent self-activation denied** |

It composes the **already-ratified** primitives READ-ONLY over fixtures to
assert — with the real primitives' real deny/unfillable outcomes — that an
**AGENT** (any non-human actor) **cannot** activate, change the allowed state,
self-render a GOV verdict, or promote effectiveness across every governed
surface. That adversarial half is the **security-critical** assertion and is
testable **NOW**; this candidate makes it live in the full suite.

It explicitly does **NOT**:

- render the **P0-20 governance verdict** (residual risk + activation decision);
- constitute **P0-18 sign-off** — that requires the operator plus the still-gated
  positive half below;
- activate anything, mutate any primitive, or self-authorize execution;
- fabricate a human approval to make the positive half pass.

The verification matrix's own result vocabulary applies: `PARTIAL`, `ASSUMED`,
and `WAIVED` **do not** qualify as pass. The positive half is therefore kept an
honest, documented **PENDING** case that names its blocker, not a fake pass.

---

## 1. Why the adversarial half is coverable now

The doctrine's deny-by-default authority boundary is already enforced by
ratified primitives. V-020's adversarial assertion ("agent self-activation
denied") is exactly the invariant each of these already owns; the candidate
COMPOSES them read-only rather than adding any new primitive:

| Surface | Ratified primitive | File | Real deny / unfillable outcome |
|---|---|---|---|
| S1 self-pilot GOV slot | read-only self-pilot | `src/self-pilot/read-only-self-pilot.mjs` | `GOV_DECISION_SLOT` is a deep-frozen, operator-only slot (`status: PENDING_OPERATOR`, `authority: HUMAN_GOV_REQUIRED`, `verdict: null`, `rendered_by: null`, `effective: false`); the pilot has no code path to fill it and it survives injection |
| S2 policy-decision-point | PDP facade | `src/control/policy-decision-point.mjs` | human-gated risk class (R3/R4) → `DENY_HUMAN_APPROVAL_REQUIRED`, envelope `serverDerived: false` (agent-asserted authority is never server-derived) |
| S3 access-mode ladder | access-mode policy | `src/live/access-mode-policy.mjs` | Control/Emergency without attestation → `DENY_ACCESS_AUTHORIZATION_REQUIRED`; Observe→Control → `DENY_ACCESS_ESCALATION` |
| S4 approval-binding | approval-binding | `src/control/approval-binding.mjs` | producer==independent approver → `DENY_SELF_APPROVAL`; collapsed actors → `DENY_SOD_VIOLATION`; forged non-GOVERNANCE decision → `DENY_WRONG_DECISION_TYPE` |
| S5 authority-engine | authority engine | `src/control/authority-engine.mjs` | agent grant lacking the human `GOV` role for `Project:*->ACTIVE` → `DENY_AUTHORITY` ("does not assign required role GOV") |

New live cases live at the **tests/ root** so they GATE the full suite:
`tests/conformance-v020-governance.test.mjs` (per the P0-19 self-pilot lesson —
a conformance file in a subdir would NOT be in the `tests/*.test.mjs` glob).

---

## 2. What each surface asserts (agent self-activation DENIED)

- **S1 — self-pilot GOV slot is structurally unfillable.** The candidate RUNS
  the real read-only self-pilot end-to-end over fixtures; even on a completed
  run the GOV decision remains the frozen operator-only constant. An injection
  attempt that tries to stamp an agent verdict onto the slot is refused by the
  deep freeze; `verdict`/`rendered_by` stay `null` and
  `p0_20_verdict_rendered`/`activation`/`self_authorized` stay `false`.
- **S2 — the PDP cannot self-grant human approval.** Identity, contract, grant,
  and SoD are all driven to ALLOW — the maximal authority an agent could
  assemble for itself — yet a human-gated activation risk class (R3/R4) always
  denies `DENY_HUMAN_APPROVAL_REQUIRED`, and the result is `serverDerived: false`.
  The PDP never substitutes for a human approval.
- **S3 — gated modes deny without explicit authorization.** The writable/
  destructive modes that change allowed state (Control = enter terminal/runtime
  input; Emergency = pause/terminate/quarantine/revoke) deny
  `DENY_ACCESS_AUTHORIZATION_REQUIRED` without an explicit attestation, and a
  human-gated risk class does not waive it; escalation above the granted rank
  denies `DENY_ACCESS_ESCALATION`.
- **S4 — a producer cannot approve its own activation.** The agent-as-producer
  supplying itself as the independent-review leg is `DENY_SELF_APPROVAL`;
  collapsing both legs onto one actor is `DENY_SOD_VIOLATION`; and a forged
  AUTHORITY-typed decision fails the versioned `verifyApprovalBinding` at use
  time (`DENY_WRONG_DECISION_TYPE`).
- **S5 — the authority engine won't derive an agent-granted activation.** A
  `Project:*->ACTIVE` transition requires the human `GOV` role; an agent grant
  carrying only agent roles (ENGIN) is denied `DENY_AUTHORITY`.

**Negative:** a forged/malformed activation attempt fails closed with the real
primitive's deny code — a forged `"Activate"` access token →
`DENY_ACCESS_MODE_UNKNOWN`; a PDP request smuggling an unknown `self_activate`
field → `DENY_MALFORMED_REQUEST`; an empty approval bundle → `DENY_APPROVALS`.

---

## 3. The positive half is activation-gated (honest PENDING)

V-020's positive case — "human decision changes allowed state" — requires a
**real human GOV decision plus operator activation**. That is SEC/GOV-gated and
**OUT OF SCOPE** for a candidate: covering it here would require self-authorizing
activation, which is a hard block. It is kept as a documented pending case
(`{ skip: ... }`) whose skip reason names the blocker (the P0-20 governance
verdict + operator activation) and which asserts nothing false. No human
approval is fabricated.

---

## 4. Discipline & guarantees

- **No new primitive.** The candidate composes EXISTING ratified primitives
  read-only; it invents no authority and adds nothing to `src/`.
- **Byte-identity.** A guard test pins every composed module (self-pilot +
  fixtures, PDP, access-mode, approval-binding, authority-engine, their shared
  `sod-rules`/`risk-registry` deps, and the three ledger modules the self-pilot
  needs) to its `git rev-parse ec5aa76:<file>` blob hash. If any drifts, the
  guard fails — proving the composed primitives are unchanged vs `ec5aa76`.
- **Real deny codes.** Every adversarial/negative assertion binds to the SPECIFIC
  deny code the real primitive emits, not a re-implementation.
- **Suite gating.** The file is at the `tests/` root, inside the
  `node --test tests/*.test.mjs` glob, so it runs in the full suite.

### Verification results (this candidate)

- `npm run validate` → **exit 0** (17 schemas: 7 canonical bootstrap + 10 governed extensions).
- `npm test` full suite → **1123 tests / 1120 pass / 0 fail / 3 skipped**
  (baseline was 1115 / 1113 / 0 / 2). Delta: +7 passing V-020 adversarial/
  negative/byte-identity cases and +1 honest pending skip (the activation-gated
  positive half).

---

## 5. Advisory status fields

- **truth_status:** `verified_true` — the agent-self-activation-denied claims are
  backed by executed tests (`npm test` green) using the real primitives' deny/
  unfillable outcomes; the positive half is verified-pending (activation-gated).
- **authority_status:** `advisory_only` — this candidate has no execution or
  approval authority; activation and the P0-20 verdict remain operator/SEC-GOV gated.
- **implementation_status:** `partial` — V-020 adversarial half fully covered now
  via composition; the positive (human-decision-changes-state) half is pending
  activation and out of scope.
- **risk_class:** `low` — test-only, read-only composition; no primitive, schema,
  policy, ADR, or production surface is mutated; deny-by-default preserved.

```yaml
self_certification:
  agent_id: claude-immune-p0-18-v020-governance-01
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

**Final rule:** Recommend coverage; do not sign off. This is a CANDIDATE — not
P0-18 sign-off, not the P0-20 governance verdict, and not activation. The
positive half and any activation require the operator and the SEC/GOV gate.
