# MOD-EVID Module-Completion Review (REV-001)

- review_id: mod-evid-completion-rev-001
- reviewer_identity: claude-immune-rev-modevid-complete-01
- role: immune (BST-SA, independent module-completion reviewer)
- team_id: BST-SA
- module: MOD-EVID — Evidence and Assurance
- catalog_scope: "Evidence envelopes, validators and acceptance"
- target: `main` @ `c044b74` (the full ratified S1+S2+S3 chain)
- base_of_assessment: `bst/mod-evid-assessment` @ `a79cfde` (mod-evid-gap-assessment-001.md, G1–G6)
- review_branch: `claude/rev/mod-evid-completion` (created FROM `main` @ `c044b74`)
- governance: CLAUDE.md BST-SA advisory contract + user CLAUDE.md (non-main branch, no push, no merge)
- review_date: 2026-07-21
- verdict: **FINISHED_WITH_TRACKED_FOLLOWUPS**

All results below were reproduced first-hand in an isolated worktree after
`npm ci`. The full suite and foundation validator were re-run on the trunk, and
an independent whole-chain smoke harness (fresh distinct actors/ids, real
modules, temp file ledgers) was written and executed against the merged main —
no producer or prior-review measurement was taken on trust.

## Verdict

**FINISHED_WITH_TRACKED_FOLLOWUPS.** The three ratified slices compose on the
trunk into one working evidence-envelope lifecycle with no integration drift.
A single clean run of register → seal → verify → accept → resolve → cite-in-claim
reaches ADMITTED end-to-end through both real consumers, and the SEALED-cite
path denies at the ledger boundary (verbatim) and at the port (structured). The
P0 catalog bar — "Evidence envelopes, validators and acceptance" — is met: the
envelope schema + contract validator gate registration, the SoD-gated ladder
governs verify/accept, and the accepted-evidence resolver binds citations to
sealed, ladder-complete evidence. G1/G2/G3 are closed; G5's evidence/knowledge
side is delivered. What keeps this from unqualified FINISHED is honestly-tracked
scope that the assessment itself placed outside the three slices: G4
(failure-evidence first-class kind) and G6 (retention/classification enforcement)
remain deferred R3+, and the G5 decision-record `evidence_refs` binding is still
open. These are enumerated below as tracked follow-ups, not defects — the module
does what the catalog scope claims, and the deferrals were declared up front.

## 1. Whole-chain smoke on merged main — CLEAN, no integration drift

Independent harness over the REAL modules at `c044b74`
(`EvidenceEnvelopeService`, `DurableLedger`, `KnowledgeLedger`,
`knowledge-claim-service`, kernel `sod-rules`), fresh distinct actors
(`rev-modevid-producer` / `-requester` / `-verifier` / `-acceptor`) and fresh
ids, temp-file ledgers only. One clean lifecycle run plus the SEALED-cite denial
and three G-boundary probes:

| Step | Expected | Observed |
|------|----------|----------|
| registerEnvelope | CAPTURED | CAPTURED |
| sealEnvelope | SEALED | SEALED |
| requestVerification | VERIFICATION_PENDING | VERIFICATION_PENDING |
| recordVerification(pass) | VERIFIED | VERIFIED |
| acceptEvidence | ACCEPTED | ACCEPTED |
| resolveAccepted | ok=true, status ACCEPTED projected | ok=true, ACCEPTED |
| verifyChain | valid, acceptedVersions [1] | valid, [1] |
| KnowledgeLedger.appendClaim(accepted) | admits (seq≥1) | seq=1 |
| KnowledgeLedger sealed-cite | DENY_EVIDENCE_CHAIN (verbatim `Evidence reference does not resolve: <id>`) | DENY_EVIDENCE_CHAIN, verbatim |
| proposeClaim(accepted) | ALLOW / ADMITTED | ALLOW / ADMITTED |
| proposeClaim(sealed) | DENY, port DENY_NOT_ACCEPTED, ledger untouched | DENY / DENY_EVIDENCE_UNRESOLVED, port DENY_NOT_ACCEPTED, ledger len 1 |
| SoD producer-self-verify | deny | DENY_VERIFIER_IS_PRODUCER |
| ladder-skip SEALED→accept | deny | DENY_UNDEFINED_TRANSITION |
| forge-on-entry ACCEPTED | deny | DENY_STATUS_FORGERY |

The three slices compose on the trunk: S1's registration/seal feeds S2's ladder
feeds S3's resolver feeds both existing knowledge consumers, with no glue code
and no drift. The one clean run and the SEALED-cite denial both behave exactly
as the prior gate reviews claimed, now reproduced against the merged trunk rather
than the individual branches.

## 2. G-coverage ruling (against gap-assessment G1–G6 @ a79cfde)

| Gap | Assessment status | Trunk ruling | Evidence |
|-----|-------------------|--------------|----------|
| G1 — unified evidence-envelope SERVICE | missing | **CLOSED** (S1+S2+S3) | `src/services/evidence-envelope-service.mjs` owns the whole lifecycle: register/seal (S1), requestVerification/recordVerification/acceptEvidence (S2), resolveAccepted/toEvidenceLookup (S3). Single deny-by-default boundary; whole-chain smoke §1 exercises it. |
| G2 — verification-status ladder enforcement | partial | **CLOSED** (S2) | Forge-on-entry guard admits only CAPTURED (`DENY_STATUS_FORGERY`); each edge is source-guarded read-only against `STATE_MACHINES.Evidence` before any ledger touch; ladder-skip SEALED→accept denies (`DENY_UNDEFINED_TRANSITION`). Reproduced §1. |
| G3 — acceptance SoD (verifier/acceptor distinct from producer) | partial | **CLOSED** (S2, kernel reuse) | `checkProhibitedActors` from `src/control/sod-rules.mjs` gates verify (verifier≠producer) and accept (acceptor∉{producer,verifier}); S2 shipped with zero kernel-blob edits (confirmed by the S2 gate's byte-identical SHAs). Producer-self-verify denies (`DENY_VERIFIER_IS_PRODUCER`), reproduced §1. |
| G4 — failure-evidence as first-class kind | missing | **STILL MISSING — deferred R3+ (honest)** | No `contracts/failure-evidence.schema.json`; not in `contract-validator` schemaPaths; not in `validate-foundation` expectedSchemas (grep for "failure" is empty). The template `docs/templates/failure-evidence-envelope.yaml` remains v0.1 only. Explicitly out of the three slices per assessment §3/§4. |
| G5 — evidence→decision linkage | partial | **PARTIAL — evidence/knowledge side DELIVERED (S3); decision-record binding OPEN** | S3 delivered `resolveAccepted(ref)` + `toEvidenceLookup()`; both real consumers admit accepted / deny sealed (§1). The decision-record side is NOT wired: `src/control/policy-decision-point.mjs:217` emits `evidence_refs: ['pdp:request:<fingerprint>']` — a free-string request fingerprint, not a resolver-bound sealed-evidence ref. `decision-record.schema.json` `evidence_refs` are still free `minItems:1` strings bound to nothing. This is MR-3 (cross-reference from the RUNTIME assessment). Tracked below. |
| G6 — retention/classification enforcement | missing (defer R3+) | **MISSING — deferred R3+** | `retention_policy` is required by the schema but read by NO `src/` file (grep empty); classification likewise not enforced on the evidence path. Declarative only, as the assessment declared. |

Net: **4 of 6 gaps discharged within the declared P0 envelope-lifecycle scope**
(G1, G2, G3 closed; G5 evidence side delivered). G4 and G6 were pre-declared
deferrals; the G5 decision-record tail is the one genuinely-open linkage item.

## 3. Verdict rationale (catalog bar + honesty standard)

The catalog scope is "Evidence envelopes, validators and acceptance." Every
noun is satisfied on the trunk: **envelopes** (schema + immutable stored content
+ content_hash self-verification), **validators** (ajv contract gate at
registration, chain re-verification via `verifyChain`, SoD gates), and
**acceptance** (the SoD-gated VERIFIED→ACCEPTED ladder with governance-approval
requirement, plus the accepted-evidence resolver that makes acceptance
consumable). The lifecycle is one deny-by-default service, audit-before-effect
on every transition, fail-closed on every resolver deny.

This is **FINISHED_WITH_TRACKED_FOLLOWUPS**, not unqualified FINISHED, under the
established honesty standard: the module meets its P0 bar, but named work remains
— and it remains *by design and disclosure*, not by omission. G4/G6 were flagged
R3+ deferrals in the assessment; the G5 decision-record binding is an
acknowledged cross-module tail. Calling this "FINISHED" would erase the open
decision-record linkage; calling it "NOT_FINISHED" would deny that the envelope
lifecycle demonstrably works end-to-end. FINISHED_WITH_TRACKED_FOLLOWUPS is the
honest reading.

## 4. Tracked follow-ups (precise)

1. **G4 — failure-evidence first-class kind (R3+).** Add
   `contracts/failure-evidence.schema.json`, wire it into
   `src/contracts/contract-validator.mjs` schemaPaths and
   `tools/validate-foundation.mjs` expectedSchemas, and give it a registration
   path. Today only the v0.1 YAML template exists. Failure→capability loop lacks
   a sealed artifact until closed.
2. **G5 decision-record `evidence_refs` binding (MR-3, cross-module).** The
   knowledge side is bound (S3 resolver). The decision side is not:
   `policy-decision-point.mjs:217` emits a free-string request fingerprint, and
   `decision-record.schema.json` `evidence_refs` bind to nothing. Wire a
   decision-record producer to validate `evidence_refs` against sealed,
   ladder-complete evidence via the same `resolveAccepted` port. Cross-reference
   from the RUNTIME assessment.
3. **G6 — retention/classification enforcement (R3+).** `retention_policy` and
   `classification` are schema-required but read by no `src/` code. Add an
   enforcement surface; declarative-only today.
4. **INFO (from S2 gate) — `verifyChain` O(receipts) hashing.** The ladder-
   coverage loop re-fingerprints each backing ledger envelope per receipt;
   O(receipts) hashing per chain read. Acceptable at phase-0 volumes; flag for a
   future scale review. Not blocking.
5. **INFO (from S3 gate) — sibling-version chain fail-close.** `resolveAccepted`
   calls `verifyChain(ref)`, which re-verifies EVERY stored version of the ref;
   a tampered/broken chain on an *unaccepted* sibling version fail-closes the
   resolution of a legitimately accepted version (`DENY_CHAIN_BROKEN`). This is
   the safe direction (deny, never over-admit) and is arguably correct, but an
   unaccepted sibling can withhold an accepted citation. Noted for awareness.
6. **INFO (from S1 review) — documentation off-by-one.**
   `evidence-envelope-service.mjs` header comment and assessment I1 say the
   contract has "18 required fields"; the schema has **17**. Comment-only, zero
   behavioral effect. Correct opportunistically.

## 5. Totals — measured, EXACT vs claim

- Full `npm test` (`validate` + `node --test tests/*.test.mjs`) @ `c044b74`:
  **tests 703, pass 698, fail 0, skipped 5, todo 0** — matches the 703/698/0/5
  claim exactly.
- `npm run validate` (foundation validator) exit **0** at target, and exit 0
  after adding this record to MANIFEST.
- Independent whole-chain smoke harness: all 14 assertions pass; temp ledgers
  removed, working tree left clean.

## 6. Authority boundary

This review changed no production code, policy, schema, ADR, or authority
surface. It added one advisory record and its MANIFEST entry on a non-main
branch. No push, no merge. Operator/GOV holds the merge decision and the tracker
status transition. ADR-0015 R5 untouched. The tracked follow-ups (G4, G6, G5
decision-record binding) remain blocked pending their own operator-authorized
slices.

## Advisory fields

- truth_status: verified_true
- authority_status: advisory_only
- implementation_status: existing (S1+S2+S3 shipped and ratified on main; G4/G6/decision-refs missing/partial)
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

> Advisory only. This record certifies the independent MOD-EVID module-completion
> review is complete and reports the module verdict for operator/GOV tracker
> disposition. It does not itself authorize, merge, push, or transition tracker
> status. Operator authority remains sole.

**Provenance.** Source — first-hand review of `main` @ `c044b74` (files and line
numbers cited inline; whole-chain smoke executed against the merged trunk).
Reviewer — claude-immune-rev-modevid-complete-01. Timestamp — 2026-07-21
(UTC+7 worktree session).
