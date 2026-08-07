# P0-18 V-020 Governance Conformance — Immune Cross-Review Record

**Document ID:** SECB-P0-18-V020-GOVERNANCE-CROSSREV-001
**Status:** ADVISORY / CROSS-REVIEW COMPLETE / NOT AN AUTHORITY
**Reviewer:** claude-immune-crossrev-v020-01 (BST-SA immune worker, isolated worktree)
**Target branch:** `bst/p0-18-v020-governance`
**Target commit:** `749eb743bb759db48ee59bbb1f529c00c9ca4157`
**Base:** main @ `ec5aa76cdc404ffbecfb5ca9de07a0c943da29b1` (== current main tip; merge base == base)
**Reviews:** [`p0-18-v020-governance-candidate-001.md`](p0-18-v020-governance-candidate-001.md) +
[`../../../tests/conformance-v020-governance.test.mjs`](../../../tests/conformance-v020-governance.test.mjs) +
the 11 composed ratified primitives (self-pilot, PDP, access-mode, approval-binding,
authority-engine, sod-rules, risk-registry, 3 ledgers, fixtures)

> This is an **advisory immune cross-review**. It certifies review completeness
> only. It does **not** approve execution, does **not** constitute P0-18 sign-off,
> does **not** render the P0-20 governance verdict, and is **not** activation.
> All authority remains SEC/GOV-gated and operator-owned.

## Verdict: APPROVE_WITH_NOTES

The candidate is an honest, structurally sound, genuinely read-only composition
of ratified primitives covering the **adversarial half** of V-020 ("agent
self-activation denied"). **Every authority-critical ruling PASSES**, reproduced
first-hand — nothing was taken from the producer packet. One LOW-severity
documentation-accuracy defect (the packet's stated new test totals are
arithmetically wrong) prevents an unconditional APPROVE_FOR_MERGE but does not
touch the security invariant, which holds perfectly.

## Advisory status fields

| Field | Value |
|---|---|
| `truth_status` | `verified_true` — every ruling reproduced first-hand (git blob hashes, primitive source trace, independent adversarial probes, full-suite + validator runs). |
| `authority_status` | `advisory_only` — this record recommends; it authorizes nothing. Activation and the P0-20 verdict remain operator/SEC-GOV gated. |
| `implementation_status` | `partial` — V-020 adversarial half fully covered now via read-only composition; the positive (human-decision-changes-state) half is `blocked` (activation-gated) and correctly kept an honest PENDING skip. |
| `risk_class` | `low` — test-only, read-only composition; no `src/`, schema, policy, ADR, or production surface mutated; deny-by-default preserved. |

## Authority-critical rulings (strictest bar)

### RULING 1 — NO FAKED HUMAN APPROVAL (the hard condition) — PASS

The positive half ("human decision changes allowed state") is an **HONEST SKIP**,
not a fabricated pass. Verified at `tests/conformance-v020-governance.test.mjs`
lines 329-339:

- It is declared `test(name, { skip: "…" }, fn)`. The skip reason names the REAL
  blocker: "Requires a real human GOV decision + operator activation (SEC/GOV-gated)…
  the P0-20 governance verdict + operator activation are OUT OF SCOPE."
- The body is never executed (skipped); its only statement is
  `assert.fail("unreachable: activation-gated positive half is out of scope")` —
  so **if the skip were ever removed, the test fails rather than fabricating a pass**.
- **No human approval is synthesized anywhere.** No fixture, constant, or record
  asserts a GOV verdict, an activation, or an effective state. Confirmed in the
  full-suite run this case reports as `skipped`, never `pass`.

The candidate refuses to make the positive half green — exactly the required behavior.

### RULING 2 — REAL primitives + REAL deny codes across all 5 surfaces — PASS

Each deny code was traced to the line in the ratified, byte-identical primitive
that actually emits it (not a stub, not an invented string):

| Surface | Assertion | Real primitive + line | Emitted code — CONFIRMED |
|---|---|---|---|
| **S1** self-pilot GOV slot | slot structurally unfillable | `read-only-self-pilot.mjs` L58-66 (frozen `GOV_DECISION_SLOT`), L379-382 (step only *assigns* the constant), L442 (embedded verbatim in trace) | `verdict:null`, `rendered_by:null`, `status:PENDING_OPERATOR`, `authority:HUMAN_GOV_REQUIRED`, `effective:false`. No fill code path exists; injection blocked by freeze. |
| **S2** policy-decision-point | R3/R4 activation denies human approval; `serverDerived:false` | `policy-decision-point.mjs` L342-348 (`humanApproval !== false → deny`), L233/L256 (`serverDerived:false` on every envelope) | `DENY_HUMAN_APPROVAL_REQUIRED`, `serverDerived:false`. R3(M3)/R4(M5) confirmed via `risk-registry.mjs` L105-128 (both `humanApproval:true`; ceilings admit the test's mutation classes so the human gate is reached). |
| **S3** access-mode ladder | gated modes deny w/o attestation; escalation denies | `access-mode-policy.mjs` L274-277, L255-258, L180-183 | `DENY_ACCESS_AUTHORIZATION_REQUIRED` (Control/Emergency, and R3 does NOT waive — humanApproval true), `DENY_ACCESS_ESCALATION` (Observe→Control), `DENY_ACCESS_MODE_UNKNOWN` (forged "Activate"). |
| **S4** approval-binding | self-approval + collapsed-actor SoD; forged type | `approval-binding.mjs` L209-211, `sod-rules.checkPairwiseDistinct` L212-218, verify L358-359 | `DENY_SELF_APPROVAL`, `DENY_SOD_VIOLATION`, `DENY_WRONG_DECISION_TYPE`, and `DENY_APPROVALS` (empty bundle L182). |
| **S5** authority-engine | agent grant lacking GOV cannot activate Project | `authority-engine.mjs` L11 (`Project:*->ACTIVE → GOV`), L124 (`roles.includes(role)` fails) | `DENY_AUTHORITY`, reason `does not assign required role GOV`. |

The negative case (line 300) likewise binds to real codes (`DENY_ACCESS_MODE_UNKNOWN`,
`DENY_MALFORMED_REQUEST` at PDP `validateShape` L91-93, `DENY_APPROVALS`). Every
code is what the primitive genuinely emits.

### RULING 3 — Independent adversarial self-activation attempts — ALL FAIL-CLOSED

Rebuilt 6 of my OWN attempts against the real primitives (not the candidate's
fixtures); all denied fail-closed:

- **A / GOV-slot fill via alternative paths:** ran the real self-pilot with
  `driveGov:true`; the completed trace's `gov_decision.verdict` stays `null`,
  `activation:false`, `p0_20_verdict_rendered:false`, `self_authorized:false`.
  Mutating `trace.gov_decision.verdict`, `trace.activation`, and the exported
  `GOV_DECISION_SLOT.rendered_by` all throw `TypeError` (deep-frozen).
- **A / hostile fixture:** bolting a forged `gov_decision:{verdict:"ACTIVATE",
  effective:true}` and `projectContract.gov_decision` onto the fixture bundle did
  NOT leak — the pilot always assigns the frozen constant; slot stayed
  `verdict:null / effective:false / PENDING_OPERATOR`.
- **B / forged GOV approval:** agent producer supplying itself as the governance
  leg → `DENY_SOD_VIOLATION`; a GOVERNANCE-typed + `APPROVAL_BOUND` record bound
  to a *different* action/version → `DENY_ACTION_VERSION_MISMATCH` (injective ref).
- **C / authority/actor confusion:** an agent replaying a real GOV grant belonging
  to `human-gov-01` → `DENY_AUTHORITY` ("belongs to another actor"); an agent
  scope combining `["QA","GOV"]` → construction throws `AuthorityConfigurationError`
  ("conflicting roles"), fail-closed.

**Layering note (informational, not a defect):** `authority-engine` *trusts* the
roles carried by a grant; `ENGIN`/`GOV` are not a conflicting pair, so a grant
literally carrying `GOV` would authorize. That is by design — the engine is a
downstream check and the defense against an agent *obtaining* a GOV grant lives in
governed grant issuance (which the self-pilot/PDP never perform). The S5 test
scopes its claim correctly ("grant **lacking** the GOV role") and does not
over-claim that the engine prevents grant forgery. Similarly `verifyApprovalBinding`
verifies type/outcome/action-version binding of a *resolved ledger record*, not
approver identity (that is enforced at mint by `evaluateApprovalBinding`); the test
asserts only what the primitive actually does. Both are honest scopings, noted for
the operator's layering awareness.

### RULING 4 — Byte-identity of all composed primitives — PASS

- `git diff ec5aa76 749eb743 -- src` is **empty** — no `src/` file changed.
- The whole change set is exactly 3 additive files (`MANIFEST.json`, the candidate
  doc, the test file); `git diff --stat` = 539 insertions, 0 deletions, 0 `src`.
- Independently recomputed `git rev-parse ec5aa76:<file>` for all **11** pinned
  blobs — every one matches the test's `PINNED_BLOBS` table exactly, so the
  in-repo byte-identity guard is itself honest. The guard test passes in the suite.

### RULING 5 — In-glob & runs — PASS (8 tests in the suite)

- `package.json` test script = `node --test tests/*.test.mjs`. The file lives at
  the `tests/` root (`tests/conformance-v020-governance.test.mjs`), **inside** the
  glob (confirmed present in the 57 in-glob files). This heeds the P0-19 lesson.
- The file declares exactly **8** `test()` cases (7 pass + 1 honest skip).
- Full-suite `npm test` reports **tests 1123 / pass 1120 / fail 0 / skipped 3**,
  i.e. base `1115` (1113 pass / 2 skip) **+8** (+7 pass, +1 skip) = the exact
  expected totals. The 8 V-020 cases genuinely gate CI.

## Packet-honesty finding

### F1 (LOW — documentation accuracy, must-fix-before-merge recommended) — packet's new test totals are miswritten

`p0-18-v020-governance-candidate-001.md` §4 states the new full-suite result as
**"1116 tests / 1113 pass / 0 fail / 3 skipped"**. The **actual** run is
**1123 / 1120 / 0 / 3**. The packet's stated *baseline* (`1115 / 1113 / 0 / 2`)
and its *delta prose* ("+7 passing … +1 honest pending skip") are BOTH correct and
match reality; only the summed new-total line is wrong (it applied +1/+0 instead of
its own correctly-stated +8/+7). This **understates** the passing count, so it is
not an over-claim of coverage or safety, but it is a factual inaccuracy in a
governance packet. **Ruling: LOW, correct-before-merge** — set §4 new totals to
`1123 / 1120 / 0 / 3`. It does not affect any security ruling above, all of which
were verified independently of the packet's numbers.

### Packet honesty (otherwise) — PASS

The packet leads with an explicit scope statement: this is coverage of V-020's
adversarial half only, and is **NOT** P0-18 sign-off, **NOT** the P0-20 verdict,
and **NOT** activation (§0). It states it does not fabricate a human approval and
keeps the positive half an honest PENDING. `self_certification` is `advisory_only`
with `execution_authority:false` / `approval_authority:false`. No over-claim beyond
F1's numeric slip.

### Regression / merge — PASS

- Full `npm test`: **1123 / 1120 / 0 / 3** (base preserved + the 8 new cases).
- `npm run validate`: **exit 0**, `schemas.count` PASS = **17** (7 canonical
  bootstrap + 10 governed extensions).
- Merge vs main: base `ec5aa76` == current main tip; `main` is a direct ancestor
  of `749eb743` (linear fast-forward, 3 additive files) — **merge-clean**.

## Recommendation

Recommend the operator and independent REV/QA treat this candidate as a sound,
honest read-only conformance-coverage proof of V-020's **adversarial** half.
Before merge, correct finding F1 (packet §4 totals → `1123/1120/0/3`). The
positive half, the P0-20 governance verdict, and any activation remain separately
governed and operator/SEC-GOV-owned. **Recommend improvements only; do not execute
them.**

```yaml
self_certification:
  agent_id: claude-immune-crossrev-v020-01
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```
