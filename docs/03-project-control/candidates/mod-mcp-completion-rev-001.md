# Independent Review: MOD-MCP Module Completion (REV-001)

- review_id: MOD-MCP-002-REV-001
- status: CANDIDATE (advisory review; operator ratification still required)
- reviewer: claude-immune-rev-modmcp-complete-01 (BST-SA immune agent, independent identity)
- producers_reviewed: Claude motor (registry+broker candidate) + Codex lanes (P0-21 deployment candidate)
- module: MOD-MCP (catalog scope: "MCP registry, policy and credential isolation")
- tracker: docs/03-project-control/candidates/module-completion-tracker-001.md (on bst/module-loop-plan)
- review_branch: `claude/rev/mod-mcp-completion` (created FROM `bst/mcp-registry-broker-integration`)
- artifact_A: `bst/mcp-registry-broker-integration` @ 3502d2d (folds producer 278cc02 onto unified main 49d1e0c)
- artifact_B: `bst/p0-21-deployment-candidate` @ 0b75aaf (base rehearsal-3 1c77958)
- spec_of_record: docs/03-project-control/candidates/secb-mcp-p0-001-control-plane.md (SECB-MCP-P0-001, DRAFT / NOT EFFECTIVE)
- governance: AGENTS.md review rules; advisory-only, non-main branch, no push, no merge
- date: 2026-07-20

All findings below were reproduced first-hand in an isolated worktree. No producer
measurement was taken on trust: validator, full suite, per-module suites, the P0-21
suite, and every adversarial probe were executed against the actual module code.

## Ancestry / lineage verification

| Claim | Method | Result |
| --- | --- | --- |
| 3502d2d folds producer 278cc02 | `git merge-base --is-ancestor 278cc02 3502d2d` | TRUE |
| bri sits on unified main 49d1e0c | `git merge-base --is-ancestor 49d1e0c 3502d2d` | TRUE |
| rehearsal-3 1c77958 folded into main | `git merge-base --is-ancestor 1c77958 49d1e0c` | TRUE |
| P0-21 candidate 0b75aaf is NOT yet on main | `git merge-base --is-ancestor 0b75aaf 49d1e0c` | FALSE (needs trivial main fold before operator merge — see Artifact B note) |

## Measured numbers vs producer claims (all on the reviewed refs)

| Metric | Producer claim | Measured (first-hand) | Match |
| --- | --- | --- | --- |
| Foundation validator | 513 checks, 0 fail | 513 checks, 513 PASS, 0 fail | YES |
| 12-schema set | 7 canonical + 5 governed = 12 | `schemas.count` = "7 canonical bootstrap schemas + 5 governed extensions"; 12 `contracts/*.schema.json` present | YES |
| Full suite `node --test tests/*.test.mjs` | 333 / 328 pass / 0 fail / 5 skip | 333 / 328 / 0 / 5 | YES |
| Capability registry suite | 21 / 21 | 21 / 21 / 0 / 0 | YES |
| Credential broker suite | 19 / 19 | 19 / 19 / 0 / 0 | YES |
| P0-21 deployment suite (on 0b75aaf) | 16 / 16 | 16 / 16 / 0 / 0 (after linking repo-root node_modules; initial fail was env-only, missing ajv) | YES |

## Artifact A — Capability registry service + credential broker

Files: `src/gateway/capability-registry-service.mjs`, `src/gateway/credential-broker.mjs`
(reviewed against SECB-MCP-P0-001 N-3 / N-5 on the same branch).

### Control-conformance findings

| # | Control (SECB-MCP-P0-001) | Method | Result | Severity |
| --- | --- | --- | --- | --- |
| A1 | Deny-by-default: `resolve()` returns only PROMOTED | Code review + spot-run resolve() over CANDIDATE / REVOKED / unknown | CANDIDATE -> DENY_CAPABILITY_NOT_PROMOTED; REVOKED -> DENY_REVOKED; unknown -> DENY_UNKNOWN_CAPABILITY; PROMOTED -> record. `toGatewayRegistry()` also emits PROMOTED only. | PASS |
| A2 | Audit-before-effect; throwing ledger denies | Test reading (registry test asserts DENY_AUDIT_UNAVAILABLE) + spot-run with a throwing ledgerWriter | `#audit` runs before every mutation; ALLOW audit precedes state change; throwing writer -> registerCandidate/promote/revoke all return DENY_AUDIT_UNAVAILABLE with no state change | PASS |
| A3 | Promotion requires independent + governance; self-approval denied | Code review + spot-run: producer as independent reviewer | independent.actor_id == producer -> DENY_SELF_APPROVAL (reproduced). Missing either role -> DENY_APPROVALS. | PASS (but see A-FIND-1 for the residual SoD gap) |
| A4 | Revocation always available under governance | Code review + spot-run | governance-approved revoke sets all versions REVOKED terminally; missing governance -> DENY_APPROVALS; blank reason -> DENY_REVOCATION_INVALID | PASS |
| A5 | Broker never accepts/returns plaintext | Spot-run bind() with real-shaped tokens under a forced-accept (hostile) sealer to exercise the string backstop | ghp_, sk-, PEM, bearer, xoxb- plaintext -> DENY_SEALER_INVALID even when isSealedRef is forced true. resolveForAdapter returns only the opaque sealed_ref, never plaintext. | PASS (coverage gap A-FIND-2 for AWS) |
| A6 | Anti-passthrough boundary documented + enforced | grep import graph both directions | Documented in broker header (lines 11-16). Enforced structurally: `mcp-gateway-core.mjs` has zero references to the broker / sealed refs / resolveForAdapter; dependency is one-way (broker imports REQUIRED_CONTEXT_FIELDS from the gateway). resolveForAdapter output cannot reach invoke() results. | PASS |
| A7 | resolveForAdapter gated on promotion + adapter match + full request_context | Spot-run each deny path | Missing any REQUIRED_CONTEXT_FIELDS -> DENY_CONTEXT; evidence_required != true -> DENY_CONTEXT; capability_id mismatch -> DENY_CONTEXT; unbound -> DENY_HANDLE_UNBOUND; not PROMOTED -> DENY_CAPABILITY_NOT_PROMOTED; adapter mismatch -> DENY_ADAPTER_MISMATCH; valid -> sealed_ref returned after ALLOW audit | PASS |

### Adversarial attempts and outcomes

| Attempt | Vector | Outcome |
| --- | --- | --- |
| Prototype pollution on records | `{"__proto__":{"polluted":"yes"}}` submitted to registerCandidate | BLOCKED — `Object.prototype.polluted` stays undefined. `structuredClone` + `Object.create(null)` hardened records neutralize it. |
| capability_id case aliasing | promote `cap.demo`, then `resolve("CAP.DEMO")` | NO ALIAS — exact-string Map key; `CAP.DEMO` -> DENY_UNKNOWN_CAPABILITY. Case tricks are distinct keys under deny-by-default, not aliases. |
| Approval-object forgery: same actor in BOTH roles | approvals = [independent:mallory, governance:mallory], producer=producerX | **PROMOTED (succeeds)** — see A-FIND-1. Only independent!=producer is enforced; independent==governance is not. |
| Approval-object forgery: governance is the producer | approvals = [independent:indep1, governance:producerX] | **PROMOTED (succeeds)** — see A-FIND-1. Producer may hold the governance role. |
| Revoked-then-repromote | revoke, then promote same version with valid approvals | BLOCKED — DENY_REVOKED (revocation is terminal); resolve stays DENY_REVOKED. |
| Handle rebinding | bind an already-bound handle; re-mint an existing handle | BLOCKED — DENY_HANDLE_ALREADY_BOUND / DENY_HANDLE_EXISTS. |
| sealedRef spoofing (isSealedRef shape) | forged `{__sealed:true, x:"ghp_..."}` object bound under a shape-only sealer | ACCEPTED — by design the broker delegates recognition to the injected sealer; the string screen runs only on strings, not objects. See A-FIND-3 (informational, sealer trust boundary). |

### Artifact A finding register

| ID | Severity | Finding | Blocking? |
| --- | --- | --- | --- |
| A-FIND-1 | MEDIUM | Promotion separation-of-duties is incomplete. The N-5 gate is enforced only as independent.actor_id != producer. A single non-producer actor can supply BOTH the independent_review and governance approvals, and the producer may themselves hold the governance role. The intended "two independent authorities" collapses to a one-non-producer-actor gate. Conforms to the DRAFT spec's literal separation clause ("distinct actors from the recording agent", N-6) and downstream operator/GOV acceptance (N-6 gate 3) remains a separate control, so not blocking. Recommend enforcing independent.actor_id != governance.actor_id and governance.actor_id != producer. | No — tracked follow-up FU-1 |
| A-FIND-2 | LOW | The broker's defense-in-depth SECRET_MATERIAL string backstop (which guards against a misbehaving sealer that mislabels plaintext as a sealed ref) does not match AWS credentials: the AKIA access-key id and a 40-char AWS secret key both pass. The primary control (an honest sealer's isSealedRef) is unaffected; this is backstop coverage only. | No — tracked follow-up FU-3 |
| A-FIND-3 | INFO | `isSealedRef` trust is delegated to the injected sealer. A shape-only isSealedRef is forgeable (see spoofing row). The broker core is correct to delegate; the production sealer must provide an unforgeable check (e.g., WeakSet-backed identity), not a structural shape test. Documented boundary; no core defect. | No — hardening note |

## Artifact B — P0-21 deployment wiring candidate

Files: `tools/secb-mcp-server-wiring.mjs` (+ `tools/run-secb-mcp-server.mjs`, seed fixture),
tests `tests/mcp-server-deployment.test.mjs`.

| # | Guarantee | Method | Result | Severity |
| --- | --- | --- | --- | --- |
| B1 | No serve without SECB_MCP_DEPLOYMENT_AUTHORIZED=operator | Spot-run prepareDeployment with no env / wrong value | Both -> DENY_DEPLOYMENT_UNAUTHORIZED (single OPERATOR_AUTH_MESSAGE). Authorization is checked before any filesystem/seed access. | PASS |
| B2 | Caller identity required | Spot-run authorized but no --caller | DENY_CALLER_UNBOUND | PASS |
| B3 | Valid seed required, fail-closed | Spot-run authorized+caller, no seed; test: authorized but invalid seed | no seed -> DENY_SEED_PATH; malformed/shape/version/contract failures each -> typed DENY_SEED_* before any server exists. Seed registrations validated against agentRegistration contract; activate-without-approve rejected. | PASS |
| B4 | Fail-closed audit (ledger write failure denies) | Test reading + suite run | Invocation ledger writer preflights writability; write failure THROWS (no try/catch) so the server denies the call (DENY_AUDIT_UNAVAILABLE). Covered by "an invocation-ledger write failure denies the call". | PASS |
| B5 | Suite passes on 0b75aaf | `node --test tests/mcp-server-deployment.test.mjs` in a detached worktree at 0b75aaf | 16 / 16 / 0 / 0 | PASS |

Note (not a defect): `0b75aaf` is not an ancestor of `main` (verified). It needs a
trivial main fold before operator merge. The tracker already records a folded
variant (`bst/p0-21-deployment-integration`, 309/304/0/5). Folding is out of scope
for this reviewer and was not performed.

## Gap C — gateway output secret-material screen (`src/gateway/mcp-gateway-core.mjs`)

Producer flag: the gateway's own output value screen uses a hyphen-only separator,
while the registry-broker producer widened its local copy to `[-_]` because the
gateway regex misses `ghp_` / `sk_` underscore tokens.

Assessment: **REAL detection gap, confirmed empirically.**

Gateway `SECRET_VALUE` = `...(?:sk|ghp|github_pat|xox[baprs])-[-a-z0-9_]{8,}...`
(hyphen only). Broker `SECRET_MATERIAL` = the same but `[-_]`.

| Token (real-world shape) | Gateway SECRET_VALUE match | Broker SECRET_MATERIAL match |
| --- | --- | --- |
| `ghp_...` (GitHub PAT — canonical form) | FALSE (missed) | TRUE |
| `github_pat_...` (fine-grained GitHub) | FALSE (missed) | TRUE |
| `sk_...` (underscore variant) | FALSE (missed) | TRUE |
| `sk-...` (OpenAI) | TRUE | TRUE |
| `xoxb-...` (Slack) | TRUE | TRUE |
| PEM `-----BEGIN RSA PRIVATE KEY-----` | TRUE | TRUE |
| AWS AKIA id | FALSE | FALSE (see A-FIND-2 — neither screen covers AWS) |
| AWS 40-char secret key | FALSE | FALSE |

GitHub's canonical token prefixes (`ghp_`, `github_pat_`, and the `gho_/ghu_/ghs_`
family) are underscore-delimited, so the gateway's value screen misses the single
most common real-world token family. A GitHub PAT embedded in adapter output under
a benign key name (one that does not match `SECRET_KEY_NORMALIZED`) would pass the
value screen undetected.

Severity: **MEDIUM.** Rationale it is NOT blocking:
- It is a defense-in-depth OUTPUT-content screen, not the primary credential-isolation
  boundary. That boundary is the broker (adapters see handles, never secrets), and
  the broker's screen already uses the correct `[-_]`.
- The gateway's companion key-name screen (`SECRET_KEY_NORMALIZED`: token, secret,
  authorization, credential, apikey, ...) still redacts secrets under sensibly-named
  fields; the gap is only for secrets hiding under innocuous key names.
- The fix is a one-character change (`-` -> `[-_]`) already proven in the broker.

Classification: **tracked follow-up FU-2** (fold the AWS coverage gap A-FIND-2 in with it).

## Follow-ups (tracked, non-blocking)

- FU-1 (MEDIUM): Registry promotion — enforce independent.actor_id != governance.actor_id, and governance.actor_id != producer, so the dual-authority gate cannot be satisfied by one actor. File: `src/gateway/capability-registry-service.mjs` (promote()).
- FU-2 (MEDIUM, Gap C): Align the gateway `SECRET_VALUE` separator to `[-_]` (matches the broker) so `ghp_` / `github_pat_` / `sk_` underscore tokens are screened in adapter output. File: `src/gateway/mcp-gateway-core.mjs`.
- FU-3 (LOW): Extend both secret-material screens to cover AWS access/secret keys; document and require an unforgeable sealer `isSealedRef` (not shape-only). Files: `src/gateway/mcp-gateway-core.mjs`, `src/gateway/credential-broker.mjs`.

## Module verdict

**MOD_MCP_FINISHED_WITH_TRACKED_FOLLOWUPS**

The catalog scope "MCP registry, policy and credential isolation" is met on the
unified base:
- Registry: promotion / revocation / deny-by-default / candidate-hidden / prototype-
  pollution-resistant / audit-first-fail-closed — all verified first-hand.
- Policy: promotion authority gate present (independent + governance + producer-self-
  approval denied) and revocation governance-gated.
- Credential isolation: broker manages opaque handles + sealed refs, rejects plaintext
  on bind, gates resolveForAdapter fully, and the anti-passthrough boundary is
  structurally enforced (gateway cannot reach sealed material).
- P0-21 deployment wiring is operator-authorization-gated, caller-bound, seed-fail-
  closed, and audit-fail-closed, with 16/16 tests.

No blocking defects. Three tracked follow-ups (FU-1, FU-2, FU-3): two MEDIUM, one LOW.
None breaks a primary boundary; FU-2 (the flagged gap) is a secondary output screen
whose primary counterpart (the broker) is already correct.

## Advisory status fields

- truth_status: verified_true (every producer numeric claim reproduced first-hand; two independent, non-blocking gaps found by adversarial review)
- authority_status: advisory_only
- implementation_status: existing (registry + broker + P0-21 wiring delivered) with tracked follow-ups
- risk_class: medium (MCP permission surface; two MEDIUM follow-ups, no blocking defect)

## Authority boundary

This is an advisory review only. Operator ratification, the operator-controlled merge
to `main`, the trivial P0-21 main fold, and disposition of FU-1/FU-2/FU-3 remain
required and were not performed. No push, no merge, no configuration change was made
by this reviewer.

```yaml
self_certification:
  agent_id: claude-immune-rev-modmcp-complete-01
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```
