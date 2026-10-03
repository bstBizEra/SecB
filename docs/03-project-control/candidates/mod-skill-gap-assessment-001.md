# MOD-SKILL SkillsHub — Gap Assessment 001

**Record ID:** MOD-SKILL-ASSESS-001
**Module:** MOD-SKILL (SkillsHub) — catalog scope "Skill intake, evaluation, promotion and distribution"
**Baseline:** `main` @ `c8c67d2`
**Planner identity:** `claude-cortex-modskill-assess-01` (BST-SA cortex, worker only)
**Authority:** AMD-002 advise-and-proceed. Advisory only — no execution, no push, no merge.
**Recorded:** 2026-07-20
**Status:** DRAFT — extend-only candidate record

## 1. Scope and method

Read-only gap assessment of MOD-SKILL against the delivered P0 surface. Boundaries observed:

- Procedural memory is delegated to MOD-SKILL (per the MOD-MEM assessment); MOD-MEM keeps scoped temporal memory only.
- Skill PROMOTION is a hard governance gate. Any promotion-authority semantics are R3+ and candidate-only: memory/wiki/skill promotion requires governance permission per the BST-SA global contract. No promotion is authorized, self-authorized, or activated by this record.

Reference pattern for intake/promotion/revocation-as-code is the delivered N-5 capability registry `src/gateway/capability-registry-service.mjs` (audit-first ledger, deny-by-default, three-pairwise-distinct-actor SoD, PROMOTED-only reads, governance-gated revoke). MOD-SKILL should mirror it rather than invent a new pattern.

## 2. Existing surface inventory

| # | Artifact | Pillar | What exists today | implementation_status |
|---|---|---|---|---|
| I1 | `src/registry/skill-resolver.mjs` `SkillResolver` | distribution + promotion-enforcement | Fail-closed `resolveSkill(id,version,{projectId,runtime,dataClassification})`; `registerSkill` validates `skillManifest`, denies reserved delimiters, and — for PUBLISHED — requires each `HUMAN_PROMOTION` entry to resolve to a governed `GOVERNANCE` decision via injected `decisionLookup`, plus non-empty `evidence_refs`. Static REVOCATION poison denies resolution even if `status` still reads PUBLISHED. Skills are deep-frozen; duplicate `id@version` denied. | partial |
| I2 | `contracts/skill-manifest.schema.json` (validator key `skillManifest`) | contract | Closed manifest: status enum CANDIDATE/SANDBOX/EVALUATION/REVIEW/PUBLISHED/DEPRECATED/REVOKED/QUARANTINED; `approval_history` decision-type enum covers SANDBOX_ENTRY, EVALUATION_PASS, SECURITY_REVIEW, INDEPENDENT_REV, INDEPENDENT_QA, HUMAN_PROMOTION, REVOCATION; source pin, `project_scopes`, `max_data_classification`, `revocation_conditions` required. | existing |
| I3 | `docs/13-skills/01-skill-set.md` / `02-skill-lifecycle.md` / `03-harness-compatibility.md` (v0.1) | doctrine | Skill taxonomy (17 process skills + domain families); full lifecycle DISCOVER to REVOKED plus package requirements + promotion criteria; harness compatibility levels C0-C5, minimum Codex/Claude/Antigravity/Generic matrix, portability principle. | existing (doctrine) |
| I4 | `docs/07-capabilities/skillshub-lifecycle.md` (SECB-SKILL-001, DRAFT) + `superpowers-intake.md` | legacy doctrine | Publication gates and distribution rule (authorize per Agent Instance, role, project, WP, environment, data class, runtime). Marked DRAFT / NOT EFFECTIVE. | existing (draft) |
| I5 | `docs/templates/skill-candidate.yaml` (v0.1) + `docs/templates/skill-manifest.yaml` (v1.0) | template | Intake and manifest YAML shapes. Templates only — no code binds them. | existing (template) |
| I6 | `tests/conformance-stubs.test.mjs` V-013 + `tests/fixtures/{valid,invalid}/skill-manifest*.json` | assurance | V-013 (unblocked 2026-07-19) exercises resolver positive/negative incl. static REVOCATION poison and scope denials. | existing |

Prior review context: the P0-14 + skill review cycle closed APPROVE_WITH_NOTES with open V-items, including **IMM-SKILL-V1 (skill revocation lifecycle)**. The resolver source explicitly defers resolution-time re-validation and unpublication to that V-item (`skill-resolver.mjs` constructor comment).

## 3. Gap table

| Gap | Pillar | Description | Reference to mirror | implementation_status | risk_class |
|---|---|---|---|---|---|
| G1 | intake | No SkillCandidate registry as code. Intake is a YAML template only; `registerSkill` ingests already-formed manifests, it does not run candidate intake gates (schema validate, source-pin, maintainer/licence present, always-enter-CANDIDATE, duplicate-version deny, audit-first ledger). | `CapabilityRegistryService.registerCandidate` | missing | low |
| G2 | evaluation | No evaluation-record store and no eval-as-evidence binding. Manifest carries `evidence_refs` but nothing binds baseline-failure / skill-enabled / adversarial / cross-harness (C0-C5) passes to resolvable evidence envelopes as gating records. | evidence envelope + `evidence_refs` lookup | missing | medium |
| G3 | promotion | Promotion happens off-system: a manifest arrives already PUBLISHED and the resolver only checks the ledger binding at registration. There is no `promote()` transition CANDIDATE→PUBLISHED enforcing N-5 SoD (independent REV + governance + producer three-pairwise-distinct). SoD is not enforced by code, unlike the capability registry. | `CapabilityRegistryService.promote` | partial | high |
| G4 | distribution | Resolver keys only on project/runtime/dataClass. Harness compatibility (C0-C5, "unsupported harness must be explicit") is not modeled as manifest data nor enforced; `supported_runtimes` is a flat string list. Doctrine's fuller distribution key (Agent Instance, role, Work Package, environment) is unmodeled. | doc `13-skills/03`, `07-capabilities` distribution rule | partial | medium |
| G5 | revocation (IMM-SKILL-V1) | Revocation is data-driven only: a REVOCATION entry must be pre-baked into a re-submitted manifest, but re-registration is denied as duplicate and stored skills are immutable — so an already-registered PUBLISHED skill cannot be actively revoked. REVOCATION entries are trusted as caller data (not ledger-bound, unlike HUMAN_PROMOTION). No resolution-time `resolveEffective` re-validation: a promotion decision reverted/expired after registration still resolves ALLOW. | `CapabilityRegistryService.revoke` + `resolveEffective` | partial | high |

**Gap counts:** 5 total — missing 2 (G1, G2); partial 3 (G3, G4, G5). By pillar: intake 1, evaluation 1, promotion 1, distribution 1, revocation 1.

## 4. Slice plan (≤3, candidate-only)

### Slice 1 — SkillCandidate intake service (G1)
Add `src/registry/skill-candidate-registry.mjs` mirroring `CapabilityRegistryService.registerCandidate`: injected schema validator + append-only ledger writer, audit-first, deny-by-default, source-pin + maintainer/licence required, always enters CANDIDATE regardless of submitted status, duplicate `skill_id@version` denied. Add `contracts/skill-candidate.schema.json` (bind the existing `skill-candidate.yaml` shape) + tests. Pure in-process; no transport, no promotion authority, CANDIDATE state only.
**R-flag:** none beyond baseline. **risk_class:** low. **authority_status:** planning_allowed.

### Slice 2 — Governed promotion + evaluation binding (G2, G3)
Add a `promote(skillId, version, approvals)` transition enforcing N-5 SoD (independent_review + governance + producer three-pairwise-distinct) AND requiring resolved evaluation evidence (`evidence_refs` that resolve VERIFIED/ACCEPTED) plus a governed `HUMAN_PROMOTION` decision in the DecisionLedger. This consolidates today's off-system promotion into a single governed transition and unifies it with the resolver's existing registration-time ledger check. Add evaluation-record binding so C0-C5 / baseline-failure / adversarial passes are attributable evidence.
**R-flag: R3+** — grants/records promotion authority semantics. Candidate-only; blocked from self-authorization and runtime activation; requires operator + governance ratification. **risk_class:** high. **authority_status:** execution_requires_operator.

### Slice 3 — Revocation lifecycle + resolution hardening (G4, G5 / IMM-SKILL-V1)
Add a governed `revoke(skillId, reason, approvals)` (governance approval required, audit-first, PUBLISHED→REVOKED, records `known_bad_versions`) mirroring `CapabilityRegistryService.revoke`; bind REVOCATION `approval_history` entries to a governed REVERSION/GOVERNANCE decision (tighten to match HUMAN_PROMOTION binding). Add resolution-time `resolveEffective` re-validation in `resolveSkill` — re-check the promotion decision is still effective at a trusted instant, denying `DENY_REVOKED` / `DENY_PROMOTION_LAPSED` if reverted/expired. Fold harness compatibility (C0-C5) into manifest data and enforce "unsupported harness explicit" at resolution. Keep the current static-REVOCATION poison as defense-in-depth.
**R-flag: R3** — changes revocation/resolution behavior of the existing resolver. Candidate-only; independent REV + operator/governance ratification. **risk_class:** high. **authority_status:** execution_requires_operator.

## 5. Non-goals

- No runtime activation of any skill (separate operator-authorized step).
- No self-authorization or granting of promotion authority from this record, votes, scores, or reviews (R3+ governance-gated).
- No modification of ADR-0015 R5, the DecisionLedger authority model, or the resolver's fail-closed contract semantics.
- No new orchestrator, policy runtime, or Deliberation Mesh — reuse MOD-GOV kernel, DecisionLedger, and the existing evidence envelope.
- No permanent promotion of any real skill/memory/wiki knowledge.
- No cross-harness execution adapters (doctrine `13-skills/03` adapters remain future work).
- No rewrite of prior records; extend-only.

## 6. R-flag summary

| Item | R-flag | Basis |
|---|---|---|
| Slice 1 intake | none (baseline) | CANDIDATE state only; no authority granted |
| Slice 2 promotion authority | R3+ | promotion authority = candidate-only; governance permission required |
| Slice 3 revocation/resolution behavior change | R3 | alters existing resolver runtime deny behavior |

## 7. IMM-SKILL-V1 disposition recommendation

**Recommendation:** ADDRESS IN SLICE 3 (candidate-only, R3). Concretely:

1. Add a governed `revoke()` to the SkillsHub service (not the resolver): governance approval required, audit-first ledger write, transition target/all versions to REVOKED, record `known_bad_versions` — direct mirror of `CapabilityRegistryService.revoke`.
2. Bind REVOCATION `approval_history` entries to a governed REVERSION/GOVERNANCE decision in the DecisionLedger, matching the existing HUMAN_PROMOTION ledger binding (today REVOCATION is trusted as caller data).
3. Add resolution-time `resolveEffective` re-validation to `resolveSkill`: deny (`DENY_REVOKED` / `DENY_PROMOTION_LAPSED`) when the promotion decision is reverted or expired at the trusted resolution instant — closing the gap the resolver comment explicitly defers.
4. Retain the current static-REVOCATION poison check as defense-in-depth (do not remove).

**Classification:** truth_status verified_true (behavior confirmed in `skill-resolver.mjs` + V-013 test); implementation_status partial; risk_class high; authority_status execution_requires_operator. Requires independent REV and operator/governance ratification before any code lands. Not self-authorized.

## 8. Advisory fields

```yaml
truth_status: verified_true          # inventory + gaps read from code/docs/tests at c8c67d2
authority_status: advisory_only      # planning only; all slices candidate; R3/R3+ gated
implementation_status: partial       # MOD-SKILL: resolver partial; intake/eval/promotion/revocation missing-or-partial
risk_class: high                     # driven by R3+ promotion + R3 revocation slices
```

## 9. Self-certification

```yaml
self_certification:
  agent_id: claude-cortex
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```
