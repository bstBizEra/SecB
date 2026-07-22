# Schema Alignment — Project Contract (Producer Verification 001)

| Field | Value |
|---|---|
| Artifact | `schema-alignment-project-contract-producer-verification-001` |
| Status | **`CANDIDATE` / `ADVISORY_ONLY` / `NOT_EFFECTIVE`** |
| Producer | `claude-motor-schema-align-01` (BST-SA Motor, advisory) |
| Branch | `bst/schema-align-project-contract` (from main @ `6f6a5ea`) |
| Timestamp (UTC) | 2026-07-22 |
| Slice | Schema-alignment slice reconciling `contracts/project-contract.schema.json` with the Option-A rich Project Contract shape |
| Authorization | Operator dispatch (2026-07-22) of the schema-alignment slice recorded as the **tracked floor** in the G7 Option-A signing: [`secb-gov-001-w3c-contract-signing-002.md`](secb-gov-001-w3c-contract-signing-002.md) §3 — "The strict `contracts/project-contract.schema.json` is recorded as the **floor for a future alignment slice** (operator-dispatchable)"; `schema_shape_decision: OPTION_A_RICH_SHAPE_NORMATIVE` |

> **Authority boundary.** This is an advisory candidate slice on a non-`main`
> branch. It does **not** push, merge, sign, promote, or declare anything
> effective. It changes no runtime authority behaviour, no policy, no ADR, and
> does not touch the sealed human-GOV slot. It revises one machine schema plus its
> test coverage so the rich normative contract shape becomes *validatable*.

---

## 1. What was normative, and the direction of alignment

The operator signed **Option A — rich shape normative** ([signing record](secb-gov-001-w3c-contract-signing-002.md) §1–3): the rich Project Contract document shape (drafted in [`secb-gov-001-project-contract-v2-r3-draft-001.md`](secb-gov-001-project-contract-v2-r3-draft-001.md) §5, instanced in [`secb-local-v2-r2.project-contract.yaml`](secb-local-v2-r2.project-contract.yaml), predecessor [`secb-local.project-contract.yaml`](secb-local.project-contract.yaml)) is authoritative. The strict machine schema was recorded as the floor for this alignment slice.

**Direction:** the schema moves toward the document. But `contracts/project-contract.schema.json` is a fail-closed validator, and it is **also consumed at runtime** by `src/project/project-contract-service.mjs` (which resolves effectiveness over `valid_from`/`valid_until`, and validates every registered contract against the `"project"` schema). The narrow runtime shape is therefore load-bearing and cannot be dropped without breaking the authority engine (~37 runtime tests).

The alignment is consequently a **strict superset**, not a replacement: the schema now validates **both** the pre-existing narrow runtime shape **and** the rich normative shape, each fully enumerated and typed, with `additionalProperties: false` preserved at every object level and a top-level `oneOf` keeping the two shapes **disjoint** (a document is EITHER narrow OR rich, never an arbitrary mix). No field became `additionalProperties: true`; no type was dropped; no enum was widened beyond values the normative documents use.

## 2. Field-by-field alignment table (old-schema → rich-shape → new-schema)

Old schema required (narrow, all `additionalProperties:false`): `project_id, version, profile_id, status, owners, repositories, risk_class, evidence_destination, valid_from, valid_until, approvals`.

| Field | Old schema (narrow) | Rich shape (v2-r2 / v2-r3) | New schema | Notes |
|---|---|---|---|---|
| `project_id` | string, required | string | string, required | identity (unchanged) |
| `version` | integer≥1, required | integer | integer≥1, required | identity (unchanged) |
| `status` | enum(7), required | `DRAFT` | enum(7), required | enum **carried forward unchanged**, not widened |
| `profile_id` | string, required | string | string, required | common to both |
| `approvals` | string[], required | `[]` | string[], required | identity (unchanged) |
| `owners` | string[] (approver ids), required | object `{business,technical,security,governance}` | `anyOf[string[] , role-keyed object]`, required | both typed forms accepted; object branch closed, keys `string\|null` |
| `repositories` | string[] (paths), required | object[] `{repository_id,provider,path,default_branch,protected_refs,authorized_baseline_commit,authorized_baseline_tree,baseline_source,baseline_acceptance,remote}` | `anyOf[string[] , bound-record object[]]`, required | rich item closed; required item keys `repository_id/provider/path/default_branch` |
| `risk_class` | enum R0–R4, required | — (rich uses `risk_ceiling`) | enum R0–R4, optional; **required by the narrow `oneOf` branch** | field kept for runtime |
| `risk_ceiling` | — | enum R0–R4 | enum R0–R4, optional; **required by the rich `oneOf` branch** | added; enum matches the R0–R4 scale |
| `evidence_destination` | string, required | — (rich uses `evidence_root`) | string, optional; required by narrow branch | kept for runtime |
| `valid_from` / `valid_until` | date-time, required | — (rich uses `effective_from`/`expires_at`) | date-time, optional; required by narrow branch | kept for `ProjectContractService` windowing |
| `namespace,name,description` | — | string | string, optional | added (typed) |
| `environments` | — | object[] `{environment_id,kind,activation_status}` | closed object[], optional | added |
| `security_classification` | — | `INTERNAL` | **string**, optional | see §4 disclosure (typed as string, not enum) |
| `data_categories,applicable_policies,data_residency,required_exit_gates,activation_restrictions,approved_*,proposed_*` | — | string[] | string[] items, optional | added (typed) |
| `memory_policy` | — | `{project_memory:bool,cross_project_publication:bool}` | closed object, both bool required | added |
| `evidence_root,evidence_destination_status,release_authority,integration_authority,provider_transport_policy,agent_tool_network_policy,credential_policy,retention_policy,expiry_policy` | — | string | string, optional | added (typed as string; see §4) |
| `effective_from,expires_at` | — | `null` (set at signing) | `anyOf[null, date-time]`, optional | added |
| `governing_lifecycle_policy` | — | `{policy_ref,policy_adoption_status}` | closed object, optional | v2-r3 |
| `evidence_chain` | — | `{bound_evidence,independent_rev_verdict,independent_qa_verdict,sec_review}` | closed object, optional | v2-r3 |
| `open_register_alignment` | — | `{closure_report_ref,readiness_gaps_item:int,p0_20_seal_item:int,p0_20_seal_status}` | closed object, optional | v2-r3 |
| `authority_invariant` | — | `{effectiveness/signing/promotion_authority, human_gov_slot_ref, human_gov_slot_state, llm_is_approving_authority:bool}` | closed object, optional | v2-r3 |
| `revocation_policy` | — | `{revocation_authority,demotion_authority,mechanism,agent_role}` | closed object, optional | v2-r3 |

**Added/typed count:** the rich shape contributes **~36 top-level fields** (plus the rich `owners`/`repositories`/repo-item forms) that the old schema rejected; all are now enumerated and typed. Zero narrow fields were removed.

## 3. Strictness-preserved proof

- **`additionalProperties: false`** — held at the top level and inside every nested object (`owners` object branch, each `repositories` rich item, `environments` item, `memory_policy`, `governing_lifecycle_policy`, `evidence_chain`, `open_register_alignment`, `authority_invariant`, `revocation_policy`). No object anywhere is `additionalProperties: true`.
- **Enums intact / not widened** — `status` (7 values) and the risk scale (`R0`–`R4`, for both `risk_class` and `risk_ceiling`) are carried forward verbatim from the prior schema; no enum gained a value. Fields the documents express as free-form governance strings are typed as `string`, not converted into invented enums (§4).
- **No type dropped** — every narrow type is retained; rich types are added alongside.
- **Disjoint shapes** — a top-level `oneOf` (narrow branch requires `risk_class,evidence_destination,valid_from,valid_until`; rich branch requires `risk_ceiling`) forces each document into exactly one coherent shape. A document carrying both shapes' discriminators is REJECTED (proven by the `DISJOINT` test).
- **Identity floor** — `tools/validate-foundation.mjs` `mandatoryIdentityFields` for the project contract (`project_id, version, status, approvals`) is UNCHANGED and all four remain in `required`; the file was NOT touched.
- **Fail-closed verified** — negative fixtures prove an undeclared extra field is rejected (`additionalProperties`) and a type violation is rejected (`type`).

## 4. Disclosed permissive typing (honest disclosure)

The rich documents express several fields as single-value governance strings rather than closed vocabularies: `security_classification` (`INTERNAL`), `release_authority`, `integration_authority`, `provider_transport_policy`, `agent_tool_network_policy`, `credential_policy`, `retention_policy`, `evidence_destination_status`, `expiry_policy`, and the `*_authority` members of `authority_invariant`/`revocation_policy`. These are typed as **non-empty `string`**, NOT as enums. Rationale: the no-widening rule forbids inventing an enum with values the documents do not use, and a single-value enum would fail-closed against any legitimate future value the operator sets at signing. This is a deliberate, disclosed typing choice — the fields remain strictly typed and closed under `additionalProperties:false`; only their value domain is `string` rather than a fabricated enum. No free-form map / `additionalProperties:true` was introduced anywhere.

## 5. Fixture changes (disclosed)

- `tests/fixtures/valid/project.json` — **unchanged** (byte-identical to base; blob `f2d4048b…`). It remains the narrow runtime instance and still validates (proves the superset).
- `tests/fixtures/valid/project-contract-rich.json` — **added.** The [`secb-local-v2-r2.project-contract.yaml`](secb-local-v2-r2.project-contract.yaml) `project_contract` block converted to JSON. Validates against the revised schema (rich `oneOf` branch) — the required proof that the v2-r2 instance is now schema-valid.
- `tests/fixtures/valid/project-contract-rich-v2r3.json` — **added.** The fuller v2-r3 normative object (§5 of the draft) including `revocation_policy`, `evidence_chain`, `authority_invariant`, `governing_lifecycle_policy`, `open_register_alignment`, `expiry_policy`, and the v2-r3 repo-item fields — proves the full superset validates.
- `tests/fixtures/invalid/project-contract-rich-extra-field.json` — **added.** Rich contract + one undeclared field → REJECTED by `additionalProperties:false`.
- `tests/fixtures/invalid/project-contract-rich-bad-type.json` — **added.** Rich contract with `version` as a string → REJECTED by `type`.
- `tests/fixtures/invalid/project-missing-id.json` — **unchanged**; still rejected (missing `project_id`).

New coverage: `tests/project-contract-schema-alignment.test.mjs` (6 tests: narrow-superset, rich v2-r2, rich v2-r3, extra-field reject, type reject, disjoint-mix reject).

## 6. Repin audit (byte-identity guards)

`contracts/project-contract.schema.json` blob: `e4c5dece…` (base `6f6a5ea`) → `c2a5df9f…` (revised). Three byte-identity guards sweep `contracts/` and included this file in their swept set. None pins a literal hash string; each computes the blob at its own BASE and compares — so the correct "repin" is **exclusion per each guard's own established pattern**, with an honest justification (this file is deliberately revised by a later, separately-scoped governed slice; its correctness is relocated to shape-based coverage). No assertion was dropped; each guard still bites on every OTHER schema (verified by tamper spot-check — tampering `decision-record.schema.json` fails all three).

| Guard | BASE(s) | Mechanism | Change |
|---|---|---|---|
| `tests/workspace-lease-ledger.test.mjs` | `0c0f3d2` | `readdirSync(contracts)` sweep with explicit `continue` exclusion list | added `project-contract.schema.json` to the exclusion list (existed at BASE, but revised by this slice) |
| `tests/integration-queue-ledger.test.mjs` | `385ac65` | same sweep, `continue` before the existence check | added `project-contract.schema.json` to the `continue` exclusion |
| `tests/approval-binding.test.mjs` (F4) | `beebfe8`, `71b9d41` | `ls-tree` sweep, per-file blob compare + file-set equality | added an `ALIGNED_CONTRACTS` skip for the per-file blob loop; file-set equality assertion retained (no schema added/removed) |

Files NOT touched (so no repin needed): `src/contracts/contract-validator.mjs` (schemaPaths unchanged — count stays 20), `tools/validate-foundation.mjs` (`mandatoryIdentityFields` unchanged — identity fields did not change), and the F4 protected source files (`sod-rules`, `risk-registry`, `policy-decision-point`, `capability-registry-service`, `goal-graph-service`) — all byte-identical.

## 7. Verification results

- `npm test`: **1331 tests, 1328 pass, 0 fail, 3 skipped** (baseline 1325 + 6 new alignment tests). GREEN.
- `node tools/validate-foundation.mjs`: exit **0**, overall `PASS`, `schemas.count` PASS (**20**, unchanged), project-contract identity check PASS.
- Rich v2-r2 instance validates against the revised schema: **YES**. Rich v2-r3 object validates: **YES**.
- Tamper spot-check bites on every non-excluded schema across all three guards: **YES**.

## 8. Cross-links

Roadmap/authority: [G7 signing record](secb-gov-001-w3c-contract-signing-002.md), [v2-r3 draft](secb-gov-001-project-contract-v2-r3-draft-001.md). Instances: [v2-r2 YAML](secb-local-v2-r2.project-contract.yaml), [v1 YAML](secb-local.project-contract.yaml). Tracker: [module-completion-tracker-001.md](module-completion-tracker-001.md). Schema/tests/runtime (repo-root relative): `contracts/project-contract.schema.json`, `tests/project-contract-schema-alignment.test.mjs`, `src/project/project-contract-service.mjs`, `tools/validate-foundation.mjs`.

## 9. Self-certification

```yaml
self_certification:
  agent_id: claude-motor-schema-align-01
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

```yaml
truth_status: verified_true          # rich instances validate; narrow shape preserved; guards + validator green, all reproduced first-hand
authority_status: execution_requires_operator   # candidate slice; no push/merge/effectiveness
implementation_status: partial       # schema + coverage aligned; operator merge is a separate act
risk_class: medium                   # fail-closed validator consumed by the runtime authority engine; superset preserves existing behaviour
```

> Certified as an advisory work product: `contracts/project-contract.schema.json`
> is aligned to validate the Option-A rich normative Project Contract shape as a
> strict superset, with strictness preserved and the narrow runtime shape intact.
> Carries no execution or approval authority.
