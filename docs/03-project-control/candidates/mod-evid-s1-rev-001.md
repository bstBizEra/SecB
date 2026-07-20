# Independent Review: MOD-EVID-S1 Evidence envelope register+seal (REV-001)

- review_id: MOD-EVID-S1-REV-001
- status: CANDIDATE (advisory review; operator ratification still required)
- reviewer: claude-immune-rev-modevid-s1 (BST-SA immune agent, independent identity)
- producer_reviewed: claude-motor (commit `84f35b8`, `[MOD-EVID-S1] Evidence envelope register+seal service (R2)`)
- review_branch: `claude/rev/mod-evid-s1` (created FROM `bst/mod-evid-s1-register-seal` @ `84f35b8`)
- base_reviewed: main `f04dee6`
- mandate: Slice S1 in `docs/03-project-control/candidates/mod-evid-gap-assessment-001.md` on branch `bst/mod-evid-assessment` @ `a79cfde` — "EvidenceEnvelopeService: register + seal (P0 core)", closes forge-on-entry half of G1/G2 (013-class hole). R-class R2 (additive isolated service; no existing-authority change). S2 verify/accept ladder + SoD (R4) intentionally OUT OF SCOPE.
- governance: CLAUDE.md BST-SA advisory contract + user CLAUDE.md (non-main branch, no push, no merge)
- date: 2026-07-20

All findings below were reproduced first-hand in an isolated worktree after
`npm ci`: the target test file and full suite were re-run, the foundation
validator was re-run, and an independent adversarial probe harness (18 probes +
a JSON-parse prototype-pollution follow-up) was written and executed against the
built service. No producer measurement was taken on trust.

## Verdict

**APPROVE_WITH_NOTES.**

Scope is disciplined (exactly 3 files, additive, zero edits to
state-machine / authority-engine / sod-rules / ledgers). The forge-on-entry
boundary is sound: every advanced status, every casing/prototype-key/extra-field
sneak, the content_hash swap attack, and the duplicate-key case all deny
correctly. Seal semantics are audit-before-effect and fail-closed; `verifyChain`
detects every tamper vector I threw at it (mutated entry, flipped seal receipt
fingerprint, removed seal entry, self-consistent unbacked chain). The
seal-modeling choice (service-store status flip + ledger evidence, TransitionEngine
NOT invoked) is documented honestly in the header and nothing in the seal receipt
or ledger entry masquerades as an authority decision. Measured totals match the
producer's claims exactly. The two notes are non-blocking: an INFO documentation
off-by-one (comment says "18 required fields"; schema has 17 — pre-existing, also
in the assessment), and a LOW fail-closed fragility note on entry-state derivation.

## Findings table

| # | Check | Method | Result | Severity |
| --- | --- | --- | --- | --- |
| 1 | Scope discipline | `git diff --name-status f04dee6..84f35b8` | Exactly 3 files: `MANIFEST.json` (+2 lines, two new path entries), new `src/services/evidence-envelope-service.mjs` (271 lines), new `tests/evidence-envelope-service.test.mjs` (191 lines). ZERO edits to `state-machine.mjs`, `authority-engine.mjs`, `sod-rules.mjs`, or any ledger. `STATE_MACHINES.Evidence` is imported read-only. | PASS |
| 2 | Forge-on-entry — 7 advanced statuses | Re-ran target suite: all 7 (`SEALED, VERIFICATION_PENDING, VERIFIED, ACCEPTED, REJECTED, SUPERSEDED, QUARANTINED` = every non-`CAPTURED` enum member) denied; each verified NOT admitted afterward. These pass the schema enum, then the forge guard (svc lines 107-113) denies. | `DENY_STATUS_FORGERY` on all 7 | PASS |
| 3 | Forge sneak — casing tricks | Probe: `verification_status` = `"sealed"`, `"Sealed"`, `"CAPTURED "` (trailing space). Not valid enum members → schema gate denies before the forge guard. | `DENY_CONTRACT_INVALID` (all 3) | PASS |
| 4 | Forge sneak — prototype-key statuses | Probe: `verification_status` = `"__proto__"`, `"constructor"` (object-literal). Plus a **JSON-parsed own `__proto__` key** with a polluting value (realistic injection vector). Closed schema denies; `Object.prototype.polluted` stays `undefined` after — no prototype pollution. | `DENY_CONTRACT_INVALID`; no pollution | PASS |
| 5 | Forge sneak — extra fields (closed schema) | Probe: nested `extra:{a:1}` and JSON-parsed `"smuggled":true`. `additionalProperties:false` (evidence-envelope.schema.json) rejects both. | `DENY_CONTRACT_INVALID` | PASS |
| 6 | content_hash — recomputed vs claimed | Probe: valid envelope with `content_hash` overwritten by the **fingerprint of a DIFFERENT (still-valid) envelope** (swap attack). Server recomputes `canonicalFingerprint(envelope minus content_hash)`; the swapped hash does not match. Also uppercase-hex `content_hash` (schema pattern is lowercase-only). | swap → `DENY_CONTENT_HASH_MISMATCH`; uppercase → `DENY_CONTRACT_INVALID` | PASS |
| 7 | Duplicate evidence_id+version vs same id different version | Probe + target test: re-register same `(id,v1)` denied; `(id,v2)` registers. Composite key is `JSON.stringify([evidenceId, version])` — content-collision-free. | dup → `DENY_DUPLICATE`; v2 → registers | PASS |
| 8 | Seal — CAPTURED→SEALED only; re-seal denied | Target test + probe: register→seal→re-seal. Edge legality checked read-only against `STATE_MACHINES.Evidence[status]` (svc 149) BEFORE any ledger touch (TE-H3 discipline). `SEALED` has no `SEALED` out-edge. | re-seal → `DENY_UNDEFINED_TRANSITION` | PASS |
| 9 | Seal — audit-before-effect (ledger fail leaves CAPTURED) | Spot-run: injected a throwing ledger (`append` throws), registered, attempted seal, then read the record status. Ledger append is attempted BEFORE the status flip (svc 177-191); on failure it denies and the flip never executes. | deny `DENY_LEDGER_APPEND`; record stays `CAPTURED` | PASS |
| 10 | verifyChain — mutate a ledger entry | Probe: seal, then mutate `"result":"PASS"`→`"TAMPERED"` in the seal entry's payload without recomputing hashes. `DurableLedger.read()`/`verify()` recompute the hash chain → `LEDGER_INTEGRITY_FAILURE`, mapped to chain-broken. | `DENY_CHAIN_BROKEN` | PASS |
| 11 | verifyChain — flip a seal receipt's fingerprint | Probe: seal, then overwrite the ledger record's `recordHash` with `f*64`. Chain re-verification fails (recordHash is part of the linked hash). | `DENY_CHAIN_BROKEN` | PASS |
| 12 | verifyChain — remove a seal entry for a SEALED version | Probe: seal two evidences, drop the first ledger line. Sequence gap breaks chain verification on read; independently, the missing-backing branch (svc 251-253) and empty-valid-chain case (probe 11) both deny. | `DENY_CHAIN_BROKEN` | PASS |
| 13 | verifyChain — self-consistent unbacked chain | Probe + target test: seal, then truncate ledger to empty (self-consistent, count 0). A still-SEALED in-memory record has no backing entry. | `DENY_CHAIN_BROKEN` | PASS |
| 14 | Convention conformance — content_hash sealing | Read `handoff-service.mjs` (153-154) and `context-federation-service.mjs` `#seal` (82-83). Both use `const {content_hash, ...body} = env; fingerprint(body) !== content_hash`. Evidence service (99-102) is byte-for-byte the same pattern over the same shared `canonicalFingerprint`. | Matches repo-wide convention | PASS |
| 15 | Entry-state derivation robustness | `ENTRY_STATES` = states with no inbound edge; constructor requires exactly 1 (svc 78-80). For `STATE_MACHINES.Evidence`, `CAPTURED` is the unique no-inbound state. Assessed fragility under hypothetical ladder edits (see LOW-1). | Correct today; fail-closed under change | PASS (note LOW-1) |
| 16 | Honesty of seal-modeling choice | Header (svc 11-24) states plainly that the `TransitionEngine` + authority-engine `Evidence:*->SEALED`→`EVIDENCE_PRODUCER` path is NOT invoked and the ladder is consulted read-only. Inspected the seal receipt and `EVIDENCE_SEAL` ledger entry: no `authorityDecisionId`, no `policyDecision`, no authority claim of any kind — payload is `previous_status/sealed_status/content_hash/envelope`. | Documented honestly; nothing masquerades as authority | PASS |
| 17 | Totals vs claims | `npm ci`; `node --test tests/*.test.mjs`; `node --test tests/evidence-envelope-service.test.mjs`; `node tools/validate-foundation.mjs`. | Full suite **454 tests / 449 pass / 0 fail / 5 skip** (matches claim exactly). Target file **19/19 pass**. Validator **exit 0**. | PASS |
| 18 | Documentation off-by-one | Counted schema `required` programmatically. | Service comment (svc 93) and assessment I1 both say "18 required fields"; schema has **17**. Comment-only, no behavioral effect. | INFO (INFO-1) |

## Adversarial probe outcomes (independent harness)

18 probes + 1 JSON-parse follow-up executed against the built service. All
security-relevant probes denied as required. Raw:

```
PASS  status lowercase 'sealed'            => DENY_CONTRACT_INVALID
PASS  status mixed 'Sealed'                => DENY_CONTRACT_INVALID
PASS  status 'CAPTURED ' trailing space    => DENY_CONTRACT_INVALID
PASS  status '__proto__'                   => DENY_CONTRACT_INVALID
PASS  status 'constructor'                 => DENY_CONTRACT_INVALID
PASS  extra nested field                   => DENY_CONTRACT_INVALID
(N/A) extra __proto__ own key (literal)    => NO_THROW  [HARNESS ARTIFACT, see note]
PASS  swap: content_hash of different env   => DENY_CONTENT_HASH_MISMATCH
PASS  duplicate id+version                 => DENY_DUPLICATE
PASS  same id, version 2 registers         => NO_THROW (expected)
PASS  re-seal denied                       => DENY_UNDEFINED_TRANSITION
PASS  append-fail denies                   => DENY_LEDGER_APPEND
PASS  record stays CAPTURED                => CAPTURED
PASS  verifyChain payload tamper           => DENY_CHAIN_BROKEN
PASS  verifyChain flipped recordHash       => DENY_CHAIN_BROKEN
PASS  verifyChain removed seal entry       => DENY_CHAIN_BROKEN
PASS  verifyChain sealed version unbacked  => DENY_CHAIN_BROKEN
PASS  uppercase content_hash               => DENY_CONTRACT_INVALID
--- JSON-parse follow-up ---
PASS  JSON-parsed own __proto__ key        => DENY_CONTRACT_INVALID; Object.prototype NOT polluted
PASS  JSON-parsed smuggled own field       => DENY_CONTRACT_INVALID
```

**Harness-artifact note (the one `NO_THROW`):** `{ ...env, __proto__: 1 }` in an
object *literal* sets the object's prototype slot (ignored because `1` is not an
object) and does NOT create an own enumerable `__proto__` key, so the envelope is
effectively unchanged and registers normally. This is a quirk of my probe, not a
defense gap: the realistic vector — an own `__proto__` key arriving via
`JSON.parse` — is denied by the closed schema with no prototype pollution
(JSON-parse follow-up above). No fix needed.

## Notes (non-blocking)

- **INFO-1 (documentation).** `evidence-envelope-service.mjs:93` says the contract
  is a "closed object, 18 required fields"; the schema (`contracts/evidence-envelope.schema.json`)
  has **17** required fields. The same "18" appears in the assessment (I1), so this
  is a pre-existing copy-forward, not a regression. Comment-only, zero behavioral
  effect. Suggest correcting to 17 opportunistically; not a merge blocker.
- **LOW-1 (fragility, note-only per mandate item 4).** Entry-state derivation
  (`ENTRY_STATES` = states with no inbound edge; constructor asserts exactly 1) is
  coupled to the topology of `STATE_MACHINES.Evidence`. If a future ladder edit
  gives the entry state an inbound edge, or introduces a second no-inbound state,
  `ENTRY_STATES.length !== 1` and the constructor throws `DENY_CONFIG` — the service
  becomes unconstructable rather than silently admitting the wrong state. That is the
  **safe (fail-closed) direction**; I flag it only so a future ladder change knows to
  revisit this service. No change requested for S1.

## Authority boundary

This review changed no production code, policy, schema, ADR, or authority
surface. It added one advisory record and its MANIFEST entry on a non-main
branch. No push, no merge. Operator/GOV holds the merge decision. ADR-0015 R5
untouched. S2 (verify/accept ladder + SoD, R4) remains out of scope and blocked
pending its own slice.

## advisory_status_fields

- truth_status: verified_true
- authority_status: advisory_only
- implementation_status: existing (S1 register+seal shipped on the reviewed branch)
- risk_class: low

## self_certification

```yaml
self_certification:
  agent_id: claude-immune-rev-modevid-s1
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```
