# MOD-KNOW Gap Assessment 001

- assessment_id: mod-know-gap-assessment-001
- planner_identity: claude-cortex-modknow-assess-01
- module: MOD-KNOW (Knowledge Service)
- catalog_scope: "Claims, contradictions, provenance and supersession"
- baseline: main @ c8c67d2
- branch: bst/mod-know-assessment
- generated_at: 2026-07-20T09:56:39Z
- mode: advisory_assessment_only (AMD-002, read-only except this record)

## Boundary contract (binding, inherited from mod-context / mod-mem assessments)

- KNOW owns claims, contradictions, supersession.
- MEM owns candidate stores plus admission (MemoryGatewayService now exists at
  src/services/memory-gateway-service.mjs).
- CONTEXT owns filtering and receipts and consumes upstream via the
  CandidateSource port (src/services/candidate-source-port.mjs), kind "knowledge".

KNOW therefore PROVIDES into CONTEXT; it never filters. KNOW WRAPS its own ledger;
it never touches MEM's stores or CONTEXT's pipeline.

## 1. Existing surface (inventory)

| # | Artifact | Location | What exists today |
|---|----------|----------|-------------------|
| I1 | KnowledgeLedger | src/ledger/temporal-ledgers.mjs:106-155 | Hash-chained DurableLedger subclass. `appendClaim` enforces the LEARNING BOUNDARY: validates `knowledgeClaim` contract, temporal window, requires `idempotencyKey`, and for every `evidence_ref` resolves an injected `evidenceLookup`, asserts `evidence_id` identity match, and requires `verification_status` in {VERIFIED, ACCEPTED}. `resolveClaim(id,{at})` is deny-on-use temporal resolution of ONE claim within its window. |
| I2 | knowledge-claim schema | contracts/knowledge-claim.schema.json | Closed object (`additionalProperties:false`). Required: claim_id, version(int), project_id, work_package_id, session_id, actor_id, statement, derivation, truth_status(enum), evidence_refs(minItems 1), claimed_at, valid_from, valid_until, retention_policy. Registered as kind `knowledgeClaim` in src/contracts/contract-validator.mjs (part of the reconciled schema set alongside evidenceEnvelope, etc.). |
| I3 | Candidate template | docs/templates/knowledge-candidate.yaml | RICHER pre-admission shape: claim_type, scope{project_ids,module_ids,domains}, source_evidence_refs, confidence, uncertainty, temporal{valid_from,review_by,valid_until}, status_type(CURRENT/HISTORICAL/TRANSITIONAL), contradictions, supersedes, reviewers, admission_state=CANDIDATE. |
| I4 | Doctrine | docs/15-knowledge/02-evidence-knowledge-skill.md | Evidence->Knowledge->Skill pipeline. Knowledge claim contract lists contradictions, supersedes/superseded-by, approver and admission decision, confidence/uncertainty. Prohibitions: no auto transcript->knowledge, no unsupported inference as fact, no vector similarity overriding scope/temporal, no execution authority from knowledge. |
| I5 | Seven-ledger model | docs/15-knowledge/01-seven-ledger-model.md; docs/06-intelligence/memory-and-knowledge.md | Knowledge Ledger = bounded claims, scope, confidence, temporal validity, contradictions; dedup + contradiction analysis named as a stage. |
| I6 | OutcomeLedger | src/ledger/temporal-ledgers.mjs:157-192 | Sibling pattern: append validates contract, resolves a referenced record via an INJECTED lookup with identity match. Model for binding-by-resolver. |
| I7 | CandidateSource port | src/services/candidate-source-port.mjs | kind "knowledge" already reserved in CANDIDATE_SOURCE_KINDS. `normalizeCandidateSources` fail-closed maps provider entries into the canonical {ref,projectId,classification,verified,current,resolvable,relevance,kind,provenance} shape MOD-CONTEXT's runRetrieval consumes. |
| I8 | MemoryGatewayService | src/services/memory-gateway-service.mjs | REFERENCE PATTERN for KNOW: unwired deny-by-default facade, injected collaborators, audit-first ledger write, SoD via kernel `checkPairwiseDistinct` config-only, wrap-not-modify, holds no state/IO. |
| I9 | SoD kernel | src/control/sod-rules.mjs | Pure primitives: checkPairwiseDistinct, checkProhibitedActors, checkConflictingRoles. Config-only reuse for claim admission SoD. |
| I10 | EvidenceEnvelopeService | src/services/evidence-envelope-service.mjs | MOD-EVID S1 = register + seal ONLY. Verify/accept ladder is S2; accepted-evidence resolver is S3. This is the resolver KnowledgeLedger.appendClaim needs but which does not yet exist. |

## 2. Gap table

| ID | Gap | Evidence | implementation_status | risk_class |
|----|-----|----------|-----------------------|------------|
| G1 | No claim lifecycle SERVICE (propose->verify->admit->supersede->retract). `appendClaim` is a single admission primitive; nothing wraps it with a candidate->admitted transition or approver binding. MEM has MemoryGatewayService; KNOW has no analogue. | I1, I8 | missing | high |
| G2 | Admission SoD absent for knowledge. `appendClaim` requires only idempotencyKey + evidence chain; no producer/reviewer/approver distinctness though doctrine requires "approver and admission decision". sod-rules unused on the knowledge path. | I1, I4, I9 | missing | high |
| G3 | Contradiction primitives missing. Schema has no `contradictions` field; no registry to record/link claim-vs-claim conflicts. Honest P0 bar = registration + linkage records, NOT semantic NLP detection. | I2, I4, I5 | missing | medium |
| G4 | Supersession semantics missing. Schema carries `version` int but NO supersedes/superseded-by linkage; `resolveClaim` answers ONE claim id, never "which version wins" across a lineage. No retract/tombstone. | I1, I2, I4 | missing | high |
| G5 | Provenance chain unsatisfiable end-to-end. `appendClaim` binds evidence_refs to accepted envelopes via injected lookup, but the accepted-evidence resolver does not exist (MOD-EVID accept ladder S2 + resolver S3 unbuilt). Learning boundary is enforced in code yet cannot be satisfied by real sealed->accepted envelopes today. | I1, I10 | blocked | high |
| G6 | Retrieval-as-provider adapter missing. kind "knowledge" enum entry exists in the port, but no component projects admitted+current claims into normalizeCandidateSources entries for MOD-CONTEXT. | I7 | missing | medium |
| G7 | Schema thinner than doctrine. knowledge-claim.schema.json omits claim_type, scope, status_type, contradictions, supersedes, confidence, approver/admission_decision present in doctrine (I4) and the candidate template (I3). Candidate<->admitted shape divergence is unmodeled. Closing it in-schema is a CONTRACT change (R3). | I2, I3, I4 | partial | medium |

Gap counts: 7 total — missing 4 (G1,G2,G3,G6), blocked 1 (G5), partial 1 (G7), plus G4 missing (5 missing / 1 blocked / 1 partial).

## 3. Slice plan (<= 3 slices, all additive, wrap-not-modify)

### Slice S1 — Knowledge claim lifecycle facade (UNWIRED)
- Closes: G1, G2.
- Shape: `createKnowledgeClaimService({ knowledgeLedger, sodRules, now, ledgerWriter, evidenceResolver })` mirroring MemoryGatewayService. Deny-by-default staged pipeline: shape -> clock -> classification/scope -> admission SoD (producer/reviewer/approver pairwise-distinct via `sodRules.checkPairwiseDistinct`, config-only) -> audit-first ledger write -> DELEGATE the evidence-chain admission to `knowledgeLedger.appendClaim` unchanged.
- Discipline: wraps `appendClaim`; never alters its logic or `ACCEPTED_EVIDENCE_STATUSES`. Holds no state, no I/O. `evidenceResolver` is INJECTED (a port) so real satisfaction is deferred to MOD-EVID without coupling.
- risk_class: high (governance-adjacent), authority_status: execution_requires_operator.

### Slice S2 — Supersession + contradiction linkage records (sidecar, additive)
- Closes: G3, G4.
- Shape: SUPERSEDES / CONTRADICTS relation records appended as their OWN audit-first ledger entries (sidecar), NOT new fields on the closed knowledge-claim schema. Add `resolveCurrent(lineageId,{at})` that walks supersedes links over `resolveClaim` results to answer "which version wins" and surfaces registered contradictions.
- Honest P0 bar: registration + linkage ONLY. No semantic/NLP contradiction detection.
- Rationale for sidecar: mutating knowledge-claim.schema.json is an R3 contract change (G7); sidecar records avoid it and keep S2 at R2.
- risk_class: medium, authority_status: execution_requires_operator.

### Slice S3 — Knowledge retrieval provider adapter (pure mapper)
- Closes: G6.
- Shape: a pure function projecting admitted + temporally-current (non-superseded / contradiction-losing filtered) claims into kind "knowledge" CandidateSource entries consumable by `normalizeCandidateSources` -> MOD-CONTEXT runRetrieval. Reuses the existing port contract; adds no new port.
- Depends on S2 for supersession-aware "current" determination.
- risk_class: medium, authority_status: execution_requires_operator.

## 4. Non-goals

- Semantic / NLP contradiction or duplicate detection (registration + linkage only).
- Any change to KnowledgeLedger.appendClaim admission logic, the learning boundary, or ACCEPTED_EVIDENCE_STATUSES (R3+ hard line).
- Extending / mutating the closed knowledge-claim.schema.json contract (R3, operator-gated) — deferred; S2 uses sidecar records instead.
- Building the MOD-EVID accept ladder or accepted-evidence resolver (owned by MOD-EVID S2/S3).
- Vector / similarity retrieval; execution authority derived from claims; auto transcript->knowledge promotion.
- Wiring any slice into live runtime (all facades remain unwired, MOD-GOV S3 precedent).

## 5. R-flags

- R3+ (HARD LINE): KnowledgeLedger.appendClaim learning boundary (evidence-chain statuses VERIFIED/ACCEPTED) is a governance line and pollution-guard sibling. The new service may WRAP ONLY (call appendClaim); any change to its admission statuses, the evidence-chain checks, or ACCEPTED_EVIDENCE_STATUSES is R3+.
- R3: knowledge-claim.schema.json is a closed contract in the reconciled validator schema set. Adding supersedes/contradictions fields to it is a contract change (operator-gated). S2 avoids this via sidecar relation records.
- R4: sod-rules.mjs reuse is CONFIG-ONLY (supply actor sets + deny code, MOD-MEM precedent). Modifying sod-rules exported behavior is R4.
- Doctrine prohibitions (doc 02) must be preserved by every slice: no auto transcript->knowledge, no unsupported inference as fact, no vector similarity overriding scope/temporal, no execution authority from knowledge/skill.

## 6. Cross-module dependencies

- MOD-EVID (HARD): G5 provenance closure needs MOD-EVID S2 verify/accept ladder + S3 accepted-evidence resolver. S1 injects an `evidenceResolver` port but cannot close the loop at runtime until MOD-EVID delivers. Blocking for G5 only; S1/S2/S3 code can land against the injected port.
- MOD-CONTEXT (consumer): S3 output flows through CandidateSource port kind "knowledge" (already reserved). Boundary owned by CONTEXT; KNOW only provides. No KNOW change to the port contract.
- MOD-MEM (sibling, no dependency): reuse MemoryGatewayService pattern. Boundary holds — MEM owns candidate stores + admission, KNOW owns claims/contradictions/supersession — provided KNOW wraps its own KnowledgeLedger and never MEM's stores.
- Kernel (reuse): sod-rules.mjs + DurableLedger + contract-validator, all config/compose only.

## 7. Advisory status fields

- truth_status: verified_true (inventory read directly from baseline code/docs at c8c67d2).
- authority_status: advisory_only (this record); each slice marked execution_requires_operator.
- implementation_status: existing=1 (I1 ledger + I2 schema), partial=1 (G7), missing=4 (G1,G2,G3,G6), blocked=1 (G5), candidate=3 (S1,S2,S3 plans).
- risk_class: high (module touches the learning boundary and admission SoD).

```yaml
self_certification:
  agent_id: claude-cortex
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

> Final rule: recommend improvements only. Do not execute them.
