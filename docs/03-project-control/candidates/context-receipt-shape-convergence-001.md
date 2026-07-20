# Context Receipt Shape Convergence (001)

- record_id: MOD-CONTEXT-S3-CONVERGE-001
- status: CANDIDATE — DRAFT, NOT EFFECTIVE (advisory convergence decision input; operator ratification required before any schema change)
- planner: claude-motor-modcontext-s3 (BST-SA motor agent, module-loop slice S3)
- module: MOD-CONTEXT Context Federation (slice S3 — convergence records + read model)
- slice_source: MOD-CONTEXT gap assessment 001 (record MOD-CONTEXT-000-ASSESS-001), gap G2 (three divergent receipt shapes) and gap G6 (lifecycle read-model completeness); exclusions_digest schema-evolution item folded in from slice S2 (record MOD-CONTEXT-S2)
- base_branch: bst/mod-context-s2-provider-port @ 37352c6
- governance: AMD-002 advise-and-proceed; AGENTS.md worker-not-authority; advisory-only, non-main branch, no push, no merge
- date: 2026-07-20

> This is the convergence DECISION INPUT, not the change itself. It is a
> precise field-by-field crosswalk of the three receipt shapes that exist
> today, with a per-field disposition recommendation. **No schema, contract,
> template, or effective operator receipt is mutated by this record.** Every
> schema-affecting disposition is an R3 operator-gated change and is listed in
> section 4 for the operator to decide.

## 1. The three shapes (read first-hand)

| Shape | Location | schema_version | Character |
|-------|----------|----------------|-----------|
| A — machine shape | [`contracts/context-receipt.schema.json`](../../../contracts/context-receipt.schema.json) | (JSON Schema draft 2020-12, `$id`) | Closed object, `additionalProperties: false`, **16 required fields**. The only shape the service validates and seals. |
| B — effective operator YAML | [`docs/…/claude-p0-15a.context-receipt.yaml`](../effective/context-receipts/claude-p0-15a.context-receipt.yaml), [`docs/…/codex-p0-08.context-receipt.yaml`](../effective/context-receipts/codex-p0-08.context-receipt.yaml) | `"1.0"` | Hand-authored operator receipts. Richest shape: adds agent/session/lease/workspace/authority-packet, `issued_at`/`expires_at`, `receipt_sha256`. |
| C — template | [`docs/templates/context-receipt.yaml`](../../templates/context-receipt.yaml) | `"0.1"` | Oldest field set. Uses `context_receipt_id`, `goal_id`, `module_id`, `token_budget`, `integrity_sha256`. |

The code path (shape A, validated and sealed by
[`src/services/context-federation-service.mjs`](../../../src/services/context-federation-service.mjs))
and the hand-authored artifact path (shape B) never meet: the effective
operator receipts cannot be consumed by the service as written (gap G2).

Disposition vocabulary (same as slice S2's R3 flag language):

- **canonical** — the concept is already the machine field; the target is shape A, no schema change.
- **rename** — same concept under a different name in B/C; converge the name onto the canonical machine field (an operator-artifact edit, not a machine-schema change).
- **deprecate** — the field is NOT a sealed-document concern; relocate it to the operator-envelope / service-record / read-model. "Deprecate" means "not a sealed-receipt field", not "delete the concept".
- **schema-evolution** — closing the gap requires adding an OPTIONAL property to `contracts/context-receipt.schema.json` (a closed object); this is an R3 contract change, operator-gated, NOT made here.

## 2. Field-by-field crosswalk

Column key: A = machine (`contracts/context-receipt.schema.json`), B = effective 1.0 YAML, C = template 0.1. `—` = absent.

| # | Concept | A (machine) | B (effective 1.0) | C (template 0.1) | Disposition | Note |
|---|---------|-------------|-------------------|------------------|-------------|------|
| 1 | receipt id | `receipt_id` | `receipt_id` | `context_receipt_id` | canonical | C `context_receipt_id` → rename to `receipt_id`. |
| 2 | version | `version` (int ≥1) | — (implied 1) | — (implied 1) | canonical | B/C converge up: adopt explicit `version`; no machine-schema change. |
| 3 | project id | `project_id` | `project_id` | `project_id` | canonical | Aligned across all three. |
| 4 | objective / goal | `objective_id` | `objective_id` | `goal_id` | canonical | C `goal_id` → rename to `objective_id`. |
| 5 | module id | — | — | `module_id` | deprecate | Module scoping is not a receipt concern; drop from receipt. |
| 6 | work package id | `work_package_id` | `work_package_id` | `work_package_id` | canonical | Aligned. |
| 7 | session binding | `session_id` | `agent_session_id` | — | canonical | B `agent_session_id` → rename to `session_id`; C MISSING (must adopt — session binding is load-bearing at verify/consume). |
| 8 | agent instance | — | `agent_instance_id` | — | deprecate | Belongs to agent-registration / workspace-lease, not the sealed receipt. Operator-envelope. |
| 9 | assigned role | `assigned_role` | `assigned_role` | `assigned_role` | canonical | Aligned. |
| 10 | authority scope (paths) | `authority_scope` (array, ≥1) | `authority_scope` (string authority-class label, e.g. `A2_R2_LOCAL_MUTATION_BOUNDED`) | `authority_scope` (array) | canonical | Machine/C agree: array of path strings, scope-subset checked at issuance. |
| 11 | authority class label | — | (B `authority_scope` string) | — | rename | B overloads `authority_scope` with an authority-TIER label — a DIFFERENT concept. Rename B's string to `authority_class`; do not conflate with the path array (row 10). Sealing it requires schema-evolution (see §4). |
| 12 | authority packet ref | — | `authority_packet_ref` | — | deprecate | Authorizing packet is service-record / envelope provenance, not sealed-doc. |
| 13 | baseline version | `baseline_version` | `baseline_version` | `baseline_version` | canonical | Aligned; triple-equality enforced at issuance. |
| 14 | workspace lease id | — | `workspace_lease_id` | — | deprecate | Execution substrate (lease), not receipt seal. |
| 15 | workspace path | — | `workspace_path` | — | deprecate | Execution substrate. |
| 16 | branch | — | `branch` | — | deprecate | Execution substrate. |
| 17 | requirements | — | `requirements` | `requirements` | deprecate | Superseded by `acceptance_criteria` + `evidence_obligations`; map content across, drop the separate field. |
| 18 | acceptance criteria | `acceptance_criteria` (≥1) | `acceptance_criteria` | `acceptance_criteria` | canonical | Aligned. |
| 19 | applicable decisions | — | `applicable_decisions` | `applicable_decisions` | schema-evolution | Optional decision-provenance array; add as OPTIONAL machine field, or keep as service-record link. Operator-gated. |
| 20 | approved knowledge | — | `approved_knowledge` | `approved_knowledge` | deprecate | Governed knowledge flows through `source_references` (MOD-KNOW retrieval); drop the parallel field. |
| 21 | known risks | — | `known_risks` | `known_risks` | deprecate | Evidence / service-record, not sealed-doc. |
| 22 | unresolved questions | — | `unresolved_questions` | `unresolved_questions` | deprecate | Service-record, not sealed-doc. |
| 23 | allowed tools | `allowed_tools` | `allowed_tools` | `allowed_tools` | canonical | Aligned. |
| 24 | allowed skills | `allowed_skills` | `allowed_skills` | `allowed_skills` | canonical | Aligned. |
| 25 | allowed network destinations | — | `allowed_network_destinations` | — | deprecate | Network authority governed elsewhere; not receipt seal. |
| 26 | evidence destination | — | `evidence_destination` | — | deprecate | Service-record / operator-envelope. |
| 27 | evidence obligations | `evidence_obligations` (≥1) | `evidence_obligations` | `evidence_obligations` | canonical | Aligned. |
| 28 | token budget | — | — | `token_budget` | deprecate | Payload/token compaction is MOD-MEM (boundary B2); non-goal for the receipt. |
| 29 | freshness timestamp | `freshness_timestamp` | `freshness_timestamp` | `freshness_timestamp` | canonical | Aligned. |
| 30 | source references | `source_references` (≥1) | `source_references` | `source_references` | canonical | Aligned; survivor-set equality enforced at issuance. |
| 31 | seal / content hash | `content_hash` (64-hex over body-minus-`content_hash`, canonical fingerprint) | `receipt_sha256` | `integrity_sha256` | canonical | Canonical = `content_hash`. |
| 32 | seal field alias | (row 31) | `receipt_sha256` | `integrity_sha256` | rename | Rename B/C seal fields to `content_hash` AND recompute: B/C shas are over the whole YAML, not the canonical body — the value changes, not just the name. |
| 33 | issued at | — (service record `record.issuedAt`) | `issued_at` | — | deprecate | Service-record; surfaced in the read model, never sealed into the doc (a receipt cannot seal its own issuance time before it exists). |
| 34 | expires at | — (service record `record.expiresAt`) | `expires_at` | — | deprecate | Service-record; surfaced in the read model as the EXPIRED lifecycle facet (§3). |
| 35 | schema_version marker | (JSON Schema `$id`) | `"1.0"` | `"0.1"` | schema-evolution | Converge B/C onto the machine schema; a single versioned contract identifier. Operator-gated. |
| 36 | exclusions digest (S2 fold-in) | — (S2 sibling artifact only) | — | — | schema-evolution | Add OPTIONAL `exclusions_digest` to seal the subtractive-exclusion account INTO the document. Today (slice S2) it is a verifiable SIBLING (`canonicalFingerprint(exclusions)`) that a forwarded bare document lacks — exactly gap G3's residual. Operator-gated. |

### Disposition counts

| Disposition | Count | Rows |
|-------------|-------|------|
| canonical | 16 | 1,2,3,4,6,7,9,10,13,18,23,24,27,29,30,31 |
| rename | 2 | 11,32 |
| deprecate | 15 | 5,8,12,14,15,16,17,20,21,22,25,26,28,33,34 |
| schema-evolution | 3 | 19,35,36 |
| **total concepts** | **36** | |

Secondary rename notes (concept canonical, name diverges in B/C): rows 1, 4, 7, 31.

## 3. Lifecycle read-model convergence (gap G6, implemented in S3)

Slice S3 surfaces the derived lifecycle states the machine shape omits, as
OPTIONAL ADDITIONS to the `getReceipt` RETURNED projection only — the sealed
document is untouched. Existing return fields (`receiptId`, `projectId`,
`version`, `state`, `document`, `exclusions`) are byte-identical; new fields
are added to the frozen return object.

| Read-model field | Kind | Source | Reachable in-service? |
|------------------|------|--------|-----------------------|
| `state` (existing) | passthrough | `record.status` — ISSUED / SUPERSEDED / REVOKED | yes (unchanged) |
| `effective_status` (new) | computed scalar | refines `state` with EXPIRED and CONSUMED | yes |
| `expired` (new) | computed boolean | `now >= record.expiresAt` (same `>=` boundary as the resolve-time DENY_EXPIRED gate) | yes |
| `consumed` (new) | ledger-derived boolean | a `CONSUME` entry exists on the head ledger | yes — the ledger is in-service state |

`effective_status` precedence (matches the fail-closed deny order in
`#resolveHead`): `REVOKED` > `SUPERSEDED` > `EXPIRED` > `CONSUMED` > `ISSUED`.
EXPIRED outranks CONSUMED because expiry is a hard deny-on-use gate while
CONSUME is a non-terminal usage marker (a live receipt may be consumed and
remain usable); a currently-expired-but-previously-consumed receipt reads
`EXPIRED` — "can it still be used" = no.

Honesty note (gap assessment G6 wording): the assessment flagged that
consumption state might be external. It is NOT: `consumeReceipt` appends the
`CONSUME` entry to the in-service head ledger (`#receipts` Map), so CONSUMED is
reachable and is implemented as a first-class read-model facet, not a noted
gap. Durable persistence of that ledger remains a MOD-RUNTIME / MOD-EVID
concern (boundary B4) — unchanged here.

## 4. DRAFT / NOT EFFECTIVE — operator decision section (R3, schema-gated)

**Nothing in this section is applied.** Each item is a schema-affecting change
to `contracts/context-receipt.schema.json` (a closed, `additionalProperties:
false` object validated by the foundation validator's identity-field checks)
and is therefore R3, operator-gated. The convergence records above are the
decision INPUT; the operator decides which items enter the build queue.

- **OP-1 (row 11) — authority_class.** Add an OPTIONAL `authority_class` string
  property to disambiguate the authority-TIER label (B overloads
  `authority_scope`). Until ratified, do NOT map B's string into the machine
  `authority_scope` path array — they are different concepts.
- **OP-2 (row 19) — applicable_decisions.** Add an OPTIONAL
  `applicable_decisions` array (decision provenance), OR keep it as a
  service-record link. Operator chooses location.
- **OP-3 (row 35) — schema_version convergence.** Retire the 0.1 template and
  1.0 effective shapes onto a single versioned machine contract. Requires
  reissuing the hand-authored effective receipts under the canonical seal
  (row 32: the sha value changes, not only the name).
- **OP-4 (row 36) — exclusions_digest (S2 fold-in).** Add an OPTIONAL
  `exclusions_digest` property so the subtractive-exclusion account travels
  INSIDE the sealed document, closing gap G3's residual. Until then the digest
  is the verifiable sibling produced by `mintReceiptDocument({...,
  include_exclusions_digest: true})`.
- **Not in scope of any option here:** relocating the deprecated shape-B/C
  execution-substrate fields (rows 8,12,14,15,16,25,26,33,34) is an
  operator-envelope / service-record modelling decision for MOD-RUNTIME, not a
  context-receipt schema change.

Adopting any of OP-1..OP-4 MUST keep the addition OPTIONAL so the existing
closed-schema validator, the live `issueReceipt` seal/identity checks, and every
current test pass unchanged (the S1/S2 additive discipline).

## 5. Advisory status fields

- truth_status: verified_true (all three shapes and the service read path read first-hand at base 37352c6; validator run first-hand, exit 0)
- authority_status: advisory_only (schema items OP-1..OP-4 are execution_requires_operator)
- implementation_status: partial (read-model lifecycle facets implemented in S3; schema convergence items are candidate, operator-gated)
- risk_class: medium (the module is a live authority boundary; every schema disposition is operator-gated and none is applied here)

## 6. Authority boundary

This record and the S3 read-model facets change NO schema, contract, template,
or effective operator receipt, and add NO deny/allow path. The read-model
additions are OPTIONAL fields on the returned projection only; the sealed
document is untouched. No branch was pushed and nothing was merged. Operator
ratification is required before any OP-1..OP-4 schema change enters the build
queue.

```yaml
self_certification:
  agent_id: claude-motor
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```
