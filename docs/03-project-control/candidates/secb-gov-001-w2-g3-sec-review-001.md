# SECB-GOV-001 Promotion Object — Independent SEC Review (W2-G3, SEC-001)

| Field | Value |
|---|---|
| Artifact | `secb-gov-001-w2-g3-sec-review-001` |
| Executor identity | `claude-sec-w2-g3-01` (BST-SA Immune, advisory SEC lane) |
| Gap addressed | **G3** — "Completed SEC review for the R3/R4 activation-boundary controls and the `AGENTS.md`-replacement authority change, with residual risks recorded" (first readiness review §7 item 3; closure plan §2 G3 card) |
| Wave / dispatch | Closure plan §3 **Wave 2 lane W2c** — SEC review at the accepted baseline |
| **Evidence SHA (RUN binding)** | main @ `c2ec6458b60ded0a93d74e717cd7816f55834f01` |
| **Evidence tree** | `3b7300f1b7cd378d373cf8e2da10dc459bb8f63b` |
| Record-authoring branch | `bst/w2-g3-sec-review`, cut from current main @ `5223db9` (PR #115 merge) |
| Timestamp (UTC) | 2026-07-22 |
| Scope | Independent advisory SEC review of the promotion object (the whole tree at the accepted baseline). NOT a promotion, NOT an activation, NOT a P0-20 seal, NOT an acceptance of residual risk. |
| Authority | Advisory only. **Acceptance of residual risk stays with the operator/GOV** (closure plan §2 G3 executor note). |

> **Authority boundary of THIS record.** This is an Immune-lane advisory SEC
> review. It does not promote `SECB-GOV-001`, does not declare it effective,
> does not activate anything, does not seal P0-20, and does not accept residual
> risk on the operator's behalf. Restricted execution remains blocked; the
> promotion/activation decision is operator-only per AMD-002 retained hard gates
> and the P0-20 operator HOLD (PR #78). The sealed human-GOV slot
> (`verdict: null`, `status: PENDING_HUMAN_GOV`, `producer_may_fill: false`) is
> untouched by this review.

---

## 0. Separation-of-duties attestation

- This SEC lane executor `claude-sec-w2-g3-01` is **distinct** from the W1a
  producer `claude-motor-w1a-baseline-01` who cut the baseline/evidence records,
  and distinct from the G1 REV and G2 QA lanes running in parallel. No
  coordination with those lanes occurred; this review is first-hand and
  independent.
- The SEC review reads the W1b STABLE/demotion/rollback policy as a rollback-path
  input **where it exists**; where policy is missing it is FLAGGED as a **policy
  dependency (G8 draft pending adoption)**, not invented (see §6).

## 1. Two-tree discipline (RUN vs RECORD)

This review deliberately separates two trees; conflating them would void the
evidence binding:

- **RECORD tree** — this `.md` file, the tracker line, and the MANIFEST entry
  are authored on branch `bst/w2-g3-sec-review`, cut from current main `5223db9`.
- **RUN tree** — every command, scan, test, validator run, `npm audit`, and the
  guard tamper-check was executed first-hand at a **detached checkout of
  `c2ec645`** (tree `3b7300f`), the operator-accepted single promotion baseline
  (G4 proposal `secb-gov-001-baseline-recut-001.md`; G4 accepted at PR #115 / G4
  object per the task context).
- **Why the two-tree binding is honest here.** `git diff --name-only c2ec645
  5223db9` returns exactly four docs-only paths (`MANIFEST.json`, the
  module-completion tracker, and the two W1a records); **zero** files under
  `src/`, `tools/`, `contracts/`, or `tests/` differ. The governance-critical
  code that this SEC review assesses is therefore **byte-identical** across both
  trees. This is why the byte-identity guard net (§2e), which compares the
  working tree against the `main` ref, runs green at the `c2ec645` checkout.

**Every finding and number below is bound to `c2ec645` / tree `3b7300f`. It is
void if cited against any other SHA.**

---

## 2. Security sweep results (per category, first-hand at `c2ec645`)

### 2a. Secret scan — **CLEAN**

- High-signal credential regex sweep (`AKIA…`, PEM private-key markers,
  `xox*`/`gh*`/`AIza…`/`sk-…` tokens, JWT triplets) across `src tools docs tests
  contracts`: **6 matches, all non-secret test fixtures / probe documentation** —
  the canonical AWS *documentation placeholder* `AKIAIOSFODNN7EXAMPLE` and PEM
  header strings used as **inputs to redaction/detection tests**
  (`tests/conformance-v011-redaction.test.mjs`, `tests/credential-broker.test.mjs`,
  `tests/mcp-gateway-core-adversarial.test.mjs`) and as documented probe rows in
  gate/module review docs. These are values the system is designed to *detect and
  deny*, not live credentials.
- Assignment-pattern sweep (`password|secret|api_key|token|private_key|access_key
  = "<8+ chars>"`) across `src tools contracts` (excluding schema/description/env/
  placeholder/test noise): **0 matches.**
- Verdict: **no real credentials in the promotion object.**

### 2b. Authority-boundary audit — **PASS**

- **Sealed P0-20 slot.** `docs/03-project-control/candidates/secb-gov-001-human-gov-decision-001.yaml`
  at `c2ec645`: `status: PENDING_HUMAN_GOV`, `producer_may_fill: false`,
  `codex_may_activate: false`, `project_contract_effective: false`. The slot is
  **null/unfillable**; agent fill is a declared violation.
- **V-020 conformance present + passing.** `tests/conformance-v020-governance.test.mjs`
  ran first-hand: **8 tests / 7 pass / 0 fail / 1 skipped**. The single skip is
  itself the control working — it is the test that "requires a real human GOV
  decision + operator activation … covering it here would self-authorize
  activation, a hard block." The adversarial S1 case proves the GOV decision slot
  is **structurally unfillable**: `trace.gov_decision.verdict === null`,
  `rendered_by === null`, `effective === false`, `p0_20_verdict_rendered ===
  false`, and an in-test injection attempt (`GOV_DECISION_SLOT.verdict =
  "ACTIVATE"`) is rejected by `Object.freeze`, leaving `verdict` null after
  injection.
- **No agent-activation path.** Grep across `src tools` for any code that flips
  `effective`/`activation_authorized`/`activation_authority` to `true`, or sets
  `producer_may_fill`/`codex_may_activate` true: **0 matches** — no such code path
  exists in the runtime substrate. The only place these tokens appear set is the
  frozen constant in the V-020 test fixture, which the injection probe proves is
  immutable.

### 2c. Injection / hostile-input posture — **PASS**

Spot-verified 3 governance-critical input handlers first-hand:

| Handler | Snapshot discipline | Fail-closed posture |
|---|---|---|
| `src/control/checkpoint-drift-comparator.mjs` | Single-read `snapshotOwn` via ONE `Reflect.ownKeys` + single `[[Get]]` per field; **no `getOwnPropertyDescriptor` double-read** (descriptor-trap-safe); explicit "ANY ambiguity resolves to DENY, never a silent resume". | Frozen `CHECKPOINT_DRIFT_DENY_CODES`; every non-verifiable comparison → `DENY_DRIFT_UNVERIFIABLE`/`DENY_DRIFT_MALFORMED`; `deny()` returns `Object.freeze`. |
| `src/ledger/skill-revocation-ledger.mjs` | `snapshotRequest` via trap-free `structuredClone` (single `[[Get]]` per field); malformed input throws `DENY_REVOKE_MALFORMED` before any lock/write. | Structural checks fail closed with typed `DENY_*` codes; terminal-forever `DENY_ALREADY_REVOKED` gate via atomic `preWriteCheck` that never calls `read()`. |
| `src/services/memory-candidate-provider.mjs` | `snapshotOwn` (ONE `Reflect.ownKeys` presence snapshot + single `[[Get]]`), rejects custom-proto / symbol keys / unknown fields; `deepFreeze` on returns. | `DENY_SNAPSHOT_MALFORMED`/`DENY_UNKNOWN_FIELD`/`DENY_PROJECT_SCOPE`; returns `deepFreeze({ decision: "DENY", …, data_untrusted: true })`. |

- **No silent fallback.** Targeted scan of the 3 handlers for `catch(...) {…
  ok:true | return true | ALLOW | PERMIT | verified:true }`: **0 matches** — no
  catch block converts a deny/throw into a permit.
- Corroborating: `tests/conformance-v016-drift.test.mjs` ran **10/10 pass**
  (drift fail-closed), reinforcing the descriptor-trap discipline above.

### 2d. Supply-chain floor — **PASS_WITH_NOTES**

- **Lockfile present** (`package-lock.json`, 495-entry MANIFEST includes it).
  `npm ci` reproducibly installed **6 packages** from the lockfile with no
  warnings.
- **No install-lifecycle hooks of concern.** `package.json` declares only
  `validate` and `test` scripts; **no** `preinstall`/`install`/`postinstall`/
  `prepare`/`prepublish` hooks. Direct dependencies: **2** (`ajv@^8.20.0`,
  `ajv-formats@^3.0.1`), **0 devDependencies**. `type: module`, `engines.node
  >=22`.
- **`npm audit --omit=dev`** — the configured registry (npmmirror) does not
  implement the audit endpoint; re-run honestly against `registry.npmjs.org`:
  **1 high / 0 critical / 0 moderate / 0 low (total 1).**
  - The single finding: **`fast-uri` 3.0.0–3.1.3 — "host confusion via literal
    backslash authority delimiter" (GHSA-v2hh-gcrm-f6hx, high).** Installed
    `fast-uri@3.1.3`. Dependency chain: `secb → ajv@8.20.0 → fast-uri@3.1.3`
    (transitive; **no direct import in `src`/`tools`**). It is reachable only as
    ajv's internal URI-format validator.
  - **Classification: actionable-upstream, low real-world exploitability here.**
    A patched `fast-uri` exists (`npm audit fix` is offered), so the actionable
    remediation is a **lockfile bump** — not a first-party code change. The
    advisory's host-confusion impact applies to code that makes trust decisions
    from a parsed URI host; in this object `fast-uri` only backs ajv `format:
    uri` *validation* (pass/fail on contract schemas), with no host-based trust
    routing, so exploitability against the promotion object is low. Recorded as a
    supply-chain-floor NOTE, not a promotion-object vulnerability.

### 2e. The guard net — **PASS** (tamper-check verified)

- **Byte-identity guard tests at the baseline: 31** `test(...)` declarations
  asserting protected source/`contracts` files remain byte-identical to named
  baselines, spread across 29 test files (e.g. `approval-binding` F4,
  `knowledge-claim-service` GUARD, `memory-gateway-service` GUARD,
  `skill-promotion-ledger`/`skill-revocation-ledger` byte-identity,
  `integration-queue-ledger`, `workspace-lease-*`). The mechanism compares the
  working-tree file against `git show main:<path>`.
- **Tamper-check (fail → restore → green), first-hand at `c2ec645`:**
  1. Clean baseline: `tests/knowledge-claim-service.test.mjs` → **23/23 pass**,
     GUARD green.
  2. Appended one comment line to the guarded source `src/control/sod-rules.mjs`
     → the GUARD test **`✖ … byte-identical to main`** tripped (the single-byte
     tamper was caught).
  3. `git checkout -- src/control/sod-rules.mjs` (restore) → re-run → GUARD
     **green** again.
  - The guard net detects a single-byte drift of governance-critical source and
    fails closed. Working, and honestly demonstrated.

---

## 3. Independent acceptance run (full suite + validator, first-hand)

Executed at the detached `c2ec645` checkout after `npm ci`:

| Check | Result | Exit |
|---|---|---|
| `node --test tests/*.test.mjs` | **1325 tests / 1322 pass / 0 fail / 3 skipped** | 0 |
| `node tools/validate-foundation.mjs` | status **PASS**, **859 checks / 0 non-PASS**, version `0.3.0-alpha.0` | 0 |

- **Agreement with the G5 record.** These numbers are **byte-for-byte identical**
  to the W1a/G5 bound-evidence record (`secb-gov-001-bound-evidence-001.md`:
  1325/1322/0/3; validator PASS 859/859 exit 0, schemas.count 20) and to the G4
  baseline-recut enumeration. **This SEC lane independently reproduces and
  agrees** with the G5 self-report — it is now independently corroborated, not
  merely asserted.

---

## 4. What changes if the promotion object is made effective (activation-boundary subject matter)

Recorded for the operator per the G3 card (a)/(b), consistent with the first
readiness review §5:

1. **Governance-substrate swap (R3/R4).** Making `SECB-GOV-001` effective adopts
   OM v0.1 as normative and adopts
   `docs/00-governance/agents-instructions-om-v0.1-candidate.md` as the
   replacement for root `AGENTS.md` (its §19 ports AMD-002 forward). This swaps
   the effective authority model, SoD, and evidence rules for every agent.
2. **`ACTIVE_READ_ONLY_CONTROLLED_ACTIVATION` boundary.** The requested activation
   is bounded (local read-only; `mutation_authority: false`; network/remote/
   deploy/release/stable denied) — blast radius is contained — but *declaring
   anything `ACTIVE`* crosses the retained hard gate requiring SEC review +
   explicit human GOV.
3. **Reversibility precondition.** Superseding the legacy constitution + root
   `AGENTS.md` moves the source-of-truth; rollback is **not trivial** and requires
   a governed demotion path that **does not yet exist as adopted policy** (see
   §6, policy dependency).

**SEC posture on the boundary controls:** at `c2ec645` the activation boundary is
enforced fail-closed and is **not agent-crossable** — the slot is structurally
unfillable (§2b), no activation-flip code path exists (§2b), and the guard net
protects the boundary source from silent drift (§2e). The boundary *controls*
pass SEC review. The *acceptance* of the residual (the AMD-002 port-forward
completeness and the missing rollback policy) is an operator/GOV act, not this
review's.

---

## 5. SEC VERDICT (bound to `c2ec645` / tree `3b7300f`)

### `SEC_PASS_WITH_NOTES`

The promotion object at the accepted baseline is **security-sound for the operator
to weigh a promotion decision on**: no secrets, an intact and injection-proof
authority boundary, fail-closed hostile-input handlers with no silent fallbacks,
a working byte-identity guard net, and a full green suite + validator that this
lane independently reproduced. The **NOTES** are (a) one high-severity *upstream/
transitive* supply-chain advisory remediable by a lockfile bump, and (b) the
rollback-policy **policy dependency** below, which is a G8 adoption gap — not a
vulnerability in the object.

### Findings by severity (actual security findings)

| Sev | Finding | Disposition |
|---|---|---|
| High | `fast-uri` 3.1.3 transitive advisory (GHSA-v2hh-gcrm-f6hx), via `ajv`. Not directly imported; backs ajv URI-format validation only; low real-world exploitability here. | **Actionable-upstream:** bump the lockfile (`npm audit fix`) at re-cut. Advisory NOTE, not a promotion blocker on its own. |
| Medium | — | none found |
| Low | Secret-scan matches are all test fixtures / probe docs (AWS placeholder + PEM markers used as detection inputs). | Informational; no action. |

**No BLOCKER, no CRITICAL, no code-level HIGH in the promotion object.**

### Policy-dependency flags (NOT vulnerabilities — G8 draft pending adoption)

| Flag | Nature | Owner |
|---|---|---|
| PD-1 | **STABLE/demotion + rollback policy is not adopted** (G8). The reversibility precondition for any future effectiveness change does not exist as adopted policy at `c2ec645`. A W1b policy DRAFT is being produced in parallel; where it lands it is the rollback-path input, but **adoption is operator/GOV-only**. Flagged as a policy dependency, **not invented here**. | Operator/GOV (closure plan G8, Wave 3b) |
| PD-2 | **AMD-002 §19 port-forward acceptance** — the `AGENTS.md`-replacement carries the amendment forward; *verifying and accepting* that port-forward is the operator's authority act, gated behind the P0-20 HOLD. | Operator/GOV |

These flags feed the G8 policy question the G3 card notes; they are listed
separately from the actual security findings above by design.

---

## 6. What this review does NOT do

- Closes **no** gate by authority: G3's SEC review *exists* now, but its
  *acceptance* (of residual risk) and the promotion decision remain operator/GOV.
- Performs **no** promotion, effectiveness declaration, activation, or P0-20 seal;
  does **not** touch the sealed GOV slot (`verdict: null`) or the operator HOLD.
- Invents **no** policy — the missing rollback/demotion policy is flagged as a G8
  dependency (PD-1), deferred to the W1b draft + operator adoption.
- Changes **zero** files under `src/`, `contracts/`, `tools/`, or `tests/`.

---

## 7. Advisory status fields

```yaml
truth_status: verified_true        # every scan, run, count, and the tamper-check executed first-hand at c2ec645 / tree 3b7300f
authority_status: advisory_only    # SEC review is advisory; residual-risk acceptance + promotion are operator/GOV
implementation_status: existing    # the reviewed controls exist and pass at the baseline; the SEC review artifact now exists (closes the G3 "no review existed" complaint)
risk_class: high                   # subject matter is the governance-substrate swap; contained at c2ec645 by unmet gates + fail-closed boundary
```

## 8. Self-certification

```yaml
self_certification:
  agent_id: claude-sec-w2-g3-01
  peer_agent_id: claude-motor-w1a-baseline-01
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

> Certified: this W2-G3 SEC review is complete as an advisory work product,
> source-bound to the closure plan's G3 card and both NOT_READY readiness
> reviews, with every scan, the full suite/validator run, the `npm audit`, and
> the guard tamper-check executed first-hand at
> `c2ec6458b60ded0a93d74e717cd7816f55834f01` (tree `3b7300f1b7cd378d373cf8e2da10dc459bb8f63b`).
> Verdict `SEC_PASS_WITH_NOTES`. It carries no execution or approval authority;
> acceptance of the one upstream advisory and the G8 policy dependency, and the
> promotion/activation decision itself, remain with the operator/GOV.
