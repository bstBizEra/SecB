# MOD-EVID-S2 Independent Gate Review (REV + SEC)

- gate_id: mod-evid-s2-gate-001
- reviewer_identity: claude-immune-gate-evid-s2
- role: immune (combined REV + SEC gate)
- team_id: BST-SA
- target_branch: bst/mod-evid-s2-ladder
- target_commit: ea1dcde
- base_commit: 0fea774 (origin/main tip)
- authorization: OPERATOR R4 AUTHORIZATION (recorded in tracker) — this gate is the mandated independent REV + SEC review preceding the operator's ratifying merge
- review_date: 2026-07-20
- verdict: GATE_CLOSED_READY_FOR_OPERATOR_MERGE

## Verdict

GATE_CLOSED_READY_FOR_OPERATOR_MERGE. All five gate-scope areas verified first-hand in an isolated worktree after `npm ci`. Zero-kernel-edit claim confirmed by independent blob SHAs; the gap-assessment premise it contradicts is independently confirmed stale; 41/41 adversarial SEC probes deny as required; full-map authority parity holds (byte-identical kernel + both S2 parity tests green); no S2 contamination outside the branch; measured totals match producer claims exactly. No findings at HIGH or CRITICAL. No blocking findings.

## 1. Zero-kernel-edit claim — CONFIRMED

Independent `git rev-parse <commit>:<path>` blob SHAs, base (0fea774) vs target (ea1dcde):

| File | base blob | target blob | result |
|------|-----------|-------------|--------|
| src/control/authority-engine.mjs | 05706bd0d47e588c1cd78e6e13841fadbe5c5e58 | 05706bd0d47e588c1cd78e6e13841fadbe5c5e58 | IDENTICAL |
| src/control/sod-rules.mjs | 4ffbc2019aae88178ecf0e5e6d2aa6b1e4aa9530 | 4ffbc2019aae88178ecf0e5e6d2aa6b1e4aa9530 | IDENTICAL |
| src/control/state-machine.mjs | 3e57b4a18bec64c3af0afd1a2c2a46b5e6315d93 | 3e57b4a18bec64c3af0afd1a2c2a46b5e6315d93 | IDENTICAL |
| MANIFEST.json | 98a3c55f1aefc96c9fdae287493d8e6088ae8fdc | 98a3c55f1aefc96c9fdae287493d8e6088ae8fdc | IDENTICAL |
| docs/MANIFEST.json | 4d357c04963f7b8f6246761e1bc4896d63474fc1 | 4d357c04963f7b8f6246761e1bc4896d63474fc1 | IDENTICAL |

The three kernel files (authority-engine, sod-rules, state-machine) and both MANIFESTs are byte-for-byte unchanged. `git diff --name-only 0fea774 ea1dcde` returns exactly three files: `src/services/evidence-envelope-service.mjs`, `tests/authority-engine.test.mjs`, `tests/evidence-envelope-service.test.mjs`. MANIFEST delta = +0. Claim upheld.

## 2. Stale-premise confirmation — CONFIRMED

The producer states the gap assessment's premise (that VERIFY/ACCEPT authority entries must be added — implying a kernel edit) is stale because those entries pre-existed. Verified by `git show` of `src/control/authority-engine.mjs` at both the base and an earlier merge (f04dee6, PR #10):

At **both** 0fea774 and f04dee6 the authority role map already contains:
- `"Evidence:*->SEALED": "EVIDENCE_PRODUCER"`
- `"Evidence:*->VERIFIED": "EVIDENCE_VERIFIER"`
- `"Evidence:*->ACCEPTED": "EVIDENCE_ACCEPTOR"`

The VERIFIED (verify) and ACCEPTED (accept) authority entries are present before this slice. The premise that they needed adding is stale/false; the ladder correctly consumes pre-existing authority + frozen SoD ladders with zero kernel mutation.

## 3. Ladder adversarial (SEC lens) — 41/41 DENY/behave as required

Independent probe harness (register+seal, real `DurableLedger`, injected clock; a fault-injecting ledger wrapper for audit-first tests). Evidence state machine edges (read from state-machine.mjs @ ea1dcde): `SEALED:[VERIFICATION_PENDING,QUARANTINED]`, `VERIFICATION_PENDING:[VERIFIED,REJECTED,QUARANTINED]`, `VERIFIED:[ACCEPTED,REJECTED,SUPERSEDED,QUARANTINED]`, `ACCEPTED:[SUPERSEDED,QUARANTINED]`, `QUARANTINED:[]`.

| Adversarial vector | Expected | Observed |
|---|---|---|
| Skip-ahead SEALED->accept | deny | DENY_UNDEFINED_TRANSITION |
| Skip-ahead CAPTURED->verify | deny | DENY_UNDEFINED_TRANSITION |
| Re-accept (ACCEPTED->accept) | deny | DENY_UNDEFINED_TRANSITION |
| Accept-after-quarantine | deny | DENY_UNDEFINED_TRANSITION |
| verify(fail) from VERIFICATION_PENDING | -> QUARANTINED | QUARANTINED |
| **SEALED->QUARANTINED via fail verdict (skip)** | deny | DENY_UNDEFINED_TRANSITION (source guard pins VERIFICATION_PENDING; critical — SEALED->QUARANTINED IS a defined edge, so target-edge check alone is insufficient) |
| SoD producer-verifies | deny | DENY_VERIFIER_IS_PRODUCER |
| SoD producer-accepts | deny | DENY_SOD |
| SoD verifier-accepts | deny | DENY_SOD |
| Distinct producer/verifier/acceptor trio | accept | ACCEPTED |
| Identity forgery: blank verifier | deny | DENY_MALFORMED_REQUEST |
| Identity forgery: numeric verifier | deny | DENY_MALFORMED_REQUEST |
| Identity forgery: `__proto__` verifier (≠ producer) | plain id, no pollution | accepted as literal id; no prototype pollution |
| `__proto__` verifier == `__proto__` producer | deny | DENY_VERIFIER_IS_PRODUCER (Set-based membership, no key confusion) |
| Empty approvals array | deny | DENY_MALFORMED_REQUEST |
| Blank approval entry | deny | DENY_MALFORMED_REQUEST |
| Bogus / object verdict | deny | DENY_MALFORMED_REQUEST |
| Audit-first: throwing ledger on REQUEST | deny + state unchanged | DENY_CHAIN_BROKEN, status stays SEALED |
| Audit-first: throwing ledger on VERIFICATION | deny + state unchanged | DENY_CHAIN_BROKEN, status stays VERIFICATION_PENDING |
| Audit-first: throwing ledger on ACCEPTANCE | deny + state unchanged | DENY_CHAIN_BROKEN, status stays VERIFIED |
| Chain tamper: remove VERIFY ledger entry | verifyChain denies | DENY_CHAIN_BROKEN |
| Chain tamper: mutate VERIFY entry payload | verifyChain denies | DENY_CHAIN_BROKEN |
| Frozen outputs (request/verify/accept incl. approvals/resolve) | frozen | all Object.isFrozen true |
| resolveAcceptedStatus honesty (SEALED/PENDING/VERIFIED/QUARANTINED) | accepted:false | false at every non-ACCEPTED state |
| resolveAcceptedStatus at ACCEPTED | accepted:true | true only at ACCEPTED |
| Unknown evidence / blank id / version<1 guards | deny | DENY_UNKNOWN_EVIDENCE / DENY_MALFORMED_REQUEST |

Total: 41 probe assertions, 0 failures. The audit-before-effect discipline (ledger append inside try/catch BEFORE any `record.status` flip) holds on all three new transitions, matching the S1 seal pattern. The `verifyChain` ladder-coverage extension catches dropped/mutated verify/accept receipts even when the surviving chain self-verifies.

## 4. Parity — HOLDS

- `tests/authority-engine.test.mjs` @ target: 15 tests, 15 pass, 0 fail — includes both S2 parity tests:
  - "MOD-EVID-S2 parity: the authority role map equals its expected table (Evidence verify/accept present, nothing else changed)"
  - "MOD-EVID-S2 parity: evidence verifier authority resolves for the VERIFIED edge"
- Independent non-Evidence outcome sampling is trivially identical by construction: authority-engine.mjs blob SHA is byte-identical base↔target (section 1), so `authorize()` and the internal role map are unchanged. WorkPackage authority entries (RUNNING/SELF_VERIFIED/REVIEW/QA/GOV_DECISION/ACCEPTED, lines 12-17) are identical at base and target; Evidence entries (lines 21-23) identical. Parity is guaranteed, not merely asserted.

## 5. Contamination check — CLEAN

- `git diff --name-only 0fea774 ea1dcde` = exactly the three intended files; no stray files.
- Working tree clean after probe cleanup (`git status --porcelain` empty).
- Disclosed worktree slip (main checkout transplant + restore) is correctly resolved: `origin/main` @ 0fea774 service has **0** occurrences of `requestVerification`/`recordVerification`/`acceptEvidence`/`resolveAcceptedStatus`; a fresh worktree of 0fea774 confirms the base service lacks the S2 methods. No S2 artifact leaked outside `bst/mod-evid-s2-ladder`.

## 6. Totals — EXACT vs claims

- Full `npm test` (validate + node --test) @ target ea1dcde: **tests 647, pass 642, fail 0, skipped 5** — matches producer claim 647/642/0/5 exactly.
- Base 0fea774 (independent worktree): tests 632, pass 627, fail 0, skipped 5.
- Delta = +15 tests. Split: authority-engine 13->15 (+2 parity), evidence-envelope-service +13. Matches producer claim (+13 service, +2 authority parity).
- `npm run validate` exit 0 (foundation validator green at target).
- MANIFEST delta = +0 (blob identical, section 1).

## Findings by severity

- CRITICAL: none
- HIGH: none
- MEDIUM: none
- LOW: none
- INFO-1: The S2 `verifyChain` ladder-coverage loop re-fingerprints each backing ledger envelope per receipt; O(receipts) hashing per chain read. Acceptable for phase-0 volumes; noted for future scale review only. Not blocking.
- INFO-2: `resolveAcceptedStatus` is honestly scoped (self-documented as NOT the S3 resolver — it reports lifecycle status only, does not re-derive ladder completeness or resolve refs). Correct boundary; noted so downstream S3 work does not assume completeness semantics here.

## Advisory fields

- truth_status: verified_true
- authority_status: execution_requires_operator
- implementation_status: existing
- risk_class: low

## self_certification

```yaml
self_certification:
  agent_id: claude-immune
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

> Advisory only. This gate certifies the independent REV + SEC review is complete and the slice is ready for the operator's ratifying merge. It does not itself authorize, merge, or push. Operator authority remains the sole merge authority.
