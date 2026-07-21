# P0-18 Conformance Harness — Candidate 001 (Advisory Coverage Report)

**Document ID:** SECB-P0-18-CONFORMANCE-CANDIDATE-001
**Status:** CANDIDATE / ADVISORY — NOT SIGN-OFF
**Base:** main @ `4abfff2` (`4abfff2259fdf85025448706f888e6ac45cc79c6`)
**Branch:** `bst/p0-18-conformance-candidate`
**Producer:** `claude-motor-p0-18-conformance-01` (BST-SA Motor, advisory)
**Governance mode:** AMD-002 advise-and-proceed (candidate + advisory packet on a branch)

---

## 0. Scope statement (read first)

This is a conformance-**COVERAGE** candidate. It converts V-item conformance
stubs that were previously BLOCKED into **live** positive / negative /
adversarial cases, because their dependency primitives are now ratified on main
@ `4abfff2`.

It explicitly does **NOT**:

- render the **P0-20 governance verdict** (residual risk + activation decision);
- constitute **P0-18 sign-off** — that requires the operator plus the still-gated
  dependencies below;
- activate anything, mutate any primitive, or self-authorize execution.

The verification matrix's own result vocabulary applies: `PARTIAL`, `ASSUMED`,
and `WAIVED` **do not** qualify as pass. Where a control is only partially
mechanised, this candidate says so and keeps the residual half an honest stub.

---

## 1. What changed since the stubs were written

Eleven modules are ratified on main (GOV, REG, WORK, RUNTIME, WSPACE, LIVE,
EVID, CONTEXT, KNOW, OPS, MCP + slices). Four previously-BLOCKED V-item stubs are
therefore now composable against **real, ratified primitives** read-only over
fixtures:

| V-item | Control | Newly-available ratified primitive | File |
|---|---|---|---|
| V-002 | Project scope | `ProjectContractService` (P0-08) | `src/project/project-contract-service.mjs` |
| V-010 | Terminal / observer | access-mode ladder (MOD-LIVE S2) | `src/live/access-mode-policy.mjs` |
| V-014 | MCP cred-bounded | MCP gateway dispatch core (SECB-MCP-P0-001) | `src/gateway/mcp-gateway-core.mjs` |
| V-016 | Recovery (PARTIAL) | `CheckpointLedger` (MOD-RUNTIME S1) | `src/ledger/checkpoint-ledger.mjs` |

New live cases live at the **tests/ root** so they GATE the full suite:
`tests/conformance-p0-18-candidate.test.mjs` (per the P0-19 self-pilot lesson —
a conformance file in a subdir would NOT be in the `tests/*.test.mjs` glob).

---

## 2. Coverage matrix (V-001 … V-020)

Legend: ✅ covered live · ➖ partial · ⛔ blocked (dep named) · P = positive,
N = negative, A = adversarial. "Where" names the file carrying the live case.

| V | Control | P | N | A | Status | Where / blocking dep |
|---|---|---|---|---|---|---|
| V-001 | Identity | ✅ | ✅ | ✅ | covered (pre-existing) | `conformance-harness` (adapter resolve/quarantine) |
| V-002 | Project scope | ✅ | ✅ | ✅ | **NEW live this candidate** | `conformance-p0-18-candidate` |
| V-003 | Authority | ✅ | ✅ | ✅ | covered (pre-existing) | `conformance-harness` (authority+registry) |
| V-004 | Context | ✅ | ✅ | ✅ | covered (pre-existing) | `conformance-stubs` |
| V-005 | SoD | ✅ | ✅ | ✅ | covered (pre-existing) | `conformance-stubs` |
| V-006 | Workflow | ✅ | ✅ | ✅ | covered (pre-existing) | `conformance-harness` / TE-H3 |
| V-007 | Idempotency | ✅ | ✅ | ✅ | covered (pre-existing) | `conformance-harness` / TE-H2 |
| V-008 | Evidence | ✅ | ✅ | ✅ | covered (pre-existing) | `conformance-harness` (hash chain) |
| V-009 | Approval | ✅ | ✅ | ✅ | covered (pre-existing) | `conformance-stubs` |
| V-010 | Terminal/observer | ✅ | ✅ | ✅ | **NEW live this candidate** | `conformance-p0-18-candidate` |
| V-011 | Redaction (display) | ✅ | ✅ | — | partial (pre-existing) | `conformance-stubs` (display plane) |
| V-011 | Redaction (storage) | ⛔ | ⛔ | ⛔ | **BLOCKED** | storage-plane redaction-before-append primitive (P0-08 security policy surface) — not on main |
| V-012 | Memory | ✅ | ✅ | — | covered (pre-existing) | `conformance-stubs` (temporal boundary) |
| V-013 | Skill | ✅ | ✅ | ✅ | covered (pre-existing) | `conformance-stubs` |
| V-014 | MCP | ✅ | ✅ | ✅ | **NEW live this candidate** | `conformance-p0-18-candidate` |
| V-015 | A2A | ✅ | ✅ | ✅ | covered (pre-existing) | `conformance-stubs` (handoff non-escalation) |
| V-016 | Recovery (resume) | ➖ | ✅ | ✅ | **NEW partial this candidate** | `conformance-p0-18-candidate` |
| V-016 | Recovery (drift) | ⛔ | ⛔ | ⛔ | **BLOCKED** | restore-execution DRIFT comparator (checkpoint-ledger non-goal #3) — not on main |
| V-017 | Knowledge | ✅ | ✅ | — | covered (pre-existing) | `conformance-stubs` |
| V-018 | Outcome | ✅ | ✅ | — | covered (pre-existing) | `conformance-stubs` |
| V-019 | Runtime | ✅ | ✅ | ✅ | covered (pre-existing) | `conformance-harness` |
| V-020 | Governance | ⛔ | ⛔ | ⛔ | **BLOCKED** | human decision → allowed-state change / agent self-activation denial is an **activation-dependent** control; the P0-20 verdict + operator activation are OUT OF SCOPE |

---

## 3. Coverage delta added by this candidate

Newly-live conformance cases (each real deny code asserted against the real
primitive):

### V-002 — Project scope (`ProjectContractService`)
- **Positive:** an ACTIVE project contract `resolveEffective` returns `allowed:true`
  and exposes the approved repository scope (`repositories`) — an approved
  repository read succeeds.
- **Negative:** an unrelated / unknown project fails closed → `DENY_PROJECT_UNKNOWN`.
- **Adversarial:**
  - forging effectiveness at registration (`status: "ACTIVE"`) → `DENY_INITIAL_STATE`;
  - replaying one governance decision across two transitions → `DENY_DECISION_REUSE`;
  - a REVOKED contract no longer resolves effective → `DENY_CONTRACT_REVOKED`.

### V-010 — Terminal / observer (`evaluateAccessRequest`)
- **Positive:** `Observe` request against an `Observe` grant → `ok:true`,
  `authorizationSatisfiedBy: "not-required"` (observer can view).
- **Negative:** observer requesting `Control` / `Emergency` → `DENY_ACCESS_ESCALATION`
  (observer input denied).
- **Adversarial:**
  - prototype-key smuggling (`Object.create`) → `DENY_ACCESS_MODE_MALFORMED`;
  - hostile throwing getter on `requestedMode` → `DENY_ACCESS_MODE_MALFORMED`;
  - unknown / case-variant token, null-byte token → `DENY_ACCESS_MODE_UNKNOWN` / `DENY_ACCESS_MODE_MALFORMED`;
  - gated mode (`Control`) with a `Control` grant but no explicit authorization → `DENY_ACCESS_AUTHORIZATION_REQUIRED`.

### V-014 — MCP credential-bounded invocation (`McpGatewayCore.invoke`)
- **Positive:** a well-formed context carrying a bounded credential
  (`authorization_id` + `capability_id`) invoking an allowlisted READ capability
  dispatches → `ok:true`, receipt `content_disposition: "data_untrusted"`, SUCCESS audited.
- **Negative:**
  - unapproved capability/method → `DENY_UNKNOWN_CAPABILITY`;
  - non-read (mutating) capability → `DENY_NON_READ`;
  - missing bounded credential (`authorization_id` absent) → `DENY_CONTEXT`.
- **Adversarial:**
  - adapter result carrying credential material → `DENY_RESULT_INVALID` (secrets never cross the boundary);
  - revoked authorization → `DENY_REVOKED` (kill switch, pre-dispatch);
  - prototype-pollution in params (`__proto__` own key) → `DENY_REQUEST_INVALID`.

### V-016 — Recovery, PARTIAL (`CheckpointLedger`)
- **Positive (resume-point):** append checkpoints, `resolveLatest(sessionId)` →
  `ALLOW` with the latest resume point; `resolveCheckpoint(id)` → `ALLOW`.
- **Negative:** unknown checkpoint → `DENY_UNKNOWN_CHECKPOINT`; unknown session →
  `DENY_UNKNOWN_SESSION`; invalid ids → `DENY_INVALID_CHECKPOINT_ID` /
  `DENY_INVALID_SESSION_ID` (no silent resume-from-nothing).
- **Adversarial:** tampering a persisted checkpoint record breaks the hash chain
  → `LEDGER_INTEGRITY_FAILURE` on `verify()`.

**Net V-item movement:** V-002, V-010, V-014 move BLOCKED → fully covered
(P/N/A). V-016 moves BLOCKED → partial (resume-point half covered; drift half
still blocked).

---

## 4. What remains BLOCKED and why (gated deps, no faked coverage)

| Item | Missing dependency (NOT on main @ 4abfff2) | Why it cannot be honestly covered now |
|---|---|---|
| V-011 storage-plane redaction | A storage-plane redaction/classification-enforcement-**before-append** primitive (P0-08 security policy surface). `evidence-envelope-service` validates + seals but does not redact; the MCP gateway screens result-plane secrets, not storage-plane RESTRICTED payloads. | No primitive redacts RESTRICTED data before ledger append; asserting it would fake coverage. Display-plane withholding is already covered and is NOT storage redaction. |
| V-016 drift comparator | The restore-execution DRIFT comparator (dereference `state_snapshot_ref`, compare `source_ledger_id` @ `sequence_at_checkpoint` vs the live source-ledger head to deny a drifted resume). This is checkpoint-ledger **non-goal #3** — existence + lookup only. | Nothing on main performs the source-ledger-head-vs-checkpoint comparison; the "drifted checkpoint denied" control is genuinely absent. |
| V-020 governance activation | The P0-20 governance verdict + operator activation (human decision → allowed-state change; agent self-activation denial in a live activation path). | Activation-dependent and OUT OF SCOPE; SEC/GOV-gated. Covering it would require self-authorizing activation, which is a hard block. |
| (live-execution cases generally) | Real Host Runtime Agent PTY observation, live runtime-adapter execution. | Read-only fixture composition cannot substitute for live-runtime observation; those stay honest. |

---

## 5. Integrity guarantees

- **Byte-identity:** `tests/conformance-p0-18-candidate.test.mjs` pins every
  composed primitive (and its load-bearing transitive deps) to its git blob hash
  at main @ `4abfff2` and fails if any drifts. Composed modules:
  `project-contract-service`, `access-mode-policy`, `risk-registry`,
  `mcp-gateway-core`, `checkpoint-ledger`, `durable-ledger`, `contract-validator`,
  `canonical-fingerprint`. **No `src/` primitive is modified by this candidate.**
- **Read-only, fixture-driven:** every case composes ratified primitives
  read-only over in-test fixtures and temp ledgers; deny-by-default assertions
  use the **real** deny codes emitted by the primitives.
- **Suite gating:** the new file is at the `tests/` root, inside the
  `node --test tests/*.test.mjs` glob, so it runs in the full suite.

### Verification results (this candidate)

- `npm run validate` → **exit 0** (17 schemas: 7 canonical bootstrap + 10 governed extensions).
- `npm test` full suite → **1115 tests / 1113 pass / 0 fail / 2 skipped**
  (baseline was 1113 / 1108 / 0 / 5). Delta: +4 live V-item cases + 1
  byte-identity guard = +5 passing; −3 removed skip stubs (V-002/V-010/V-014,
  now live); remaining 2 skips are the honest blocked halves (V-011 storage,
  V-016 drift).

---

## 6. Advisory status fields

- **truth_status:** `verified_true` — coverage claims are backed by executed
  tests (`npm test` green) and the real primitives' deny codes; blocked items are
  verified-absent on main @ `4abfff2`.
- **authority_status:** `advisory_only` — this candidate has no execution or
  approval authority; activation and the P0-20 verdict remain operator/SEC-GOV gated.
- **implementation_status:** `partial` — V-002/V-010/V-014 fully covered,
  V-016 partial, V-011 storage + V-016 drift + V-020 blocked.
- **risk_class:** `low` — test-only, read-only composition; no primitive, schema,
  policy, ADR, or production surface is mutated; deny-by-default preserved.

```yaml
self_certification:
  agent_id: claude-motor-p0-18-conformance-01
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

**Final rule:** Recommend coverage; do not sign off. P0-18 sign-off and the
P0-20 governance verdict require the operator and the gated dependencies named
in §4.
