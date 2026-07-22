# Schema Alignment — Project Contract (Independent Cross-Provider Review 001)

| Field | Value |
|---|---|
| Artifact | `schema-alignment-crossrev-001` |
| Status | **`CANDIDATE` / `ADVISORY_ONLY` / `NOT_EFFECTIVE`** |
| Reviewer | `claude-immune-crossrev-schema-align-01` (BST-SA Immune, independent cross-provider review) |
| Peer (producer) | `claude-motor-schema-align-01` |
| Review target | `bst/schema-align-project-contract` @ `8bc679da0ed5905ee2e927625c4b59632f3306fa` |
| Base main | `6f6a5eabe46bcf8760ad5a003aecd242df69aceb` |
| Schema blob (reviewed) | `c2a5df9fd2fb33926922a59c02d6015ad4b9167e` (base blob `e4c5dece1f6b45c3d4e90f6bb998f69902cb90f7`) |
| Timestamp (UTC) | 2026-07-22T10:32:23Z |
| Method | Re-derived from scratch in an isolated worktree; `npm ci`; own out-of-tree AJV probe battery; mechanical `additionalProperties` walk; guard tamper reproduced first-hand. Producer claims verified, not trusted. |

> **Authority boundary.** Advisory cross-review only. This record decides staging
> readiness; it does **not** push, merge, sign, promote, or declare anything
> effective. No runtime authority, policy, ADR, or the sealed human-GOV slot is
> touched. Verdict is a recommendation to the operator.

---

## 1. SHA / scope binding

Reviewed `HEAD = 8bc679da0…` on `bst/schema-align-project-contract`. Schema blob
confirmed `c2a5df9f…`. Base main `6f6a5ea` schema blob confirmed `e4c5dece…`.
Diff `6f6a5ea..8bc679d` touches exactly the 12 in-scope files (see §7). `npm ci`
clean (6 packages).

## 2. Probe 1 — NO LOOSENING (the crux). Result: **PASS**

**Mechanical `additionalProperties` walk** (scripted, not eyeballed): 12
property-bearing object nodes; **10 carry `additionalProperties:false`**; **0
carry `additionalProperties:true`**; raw source has `additionalProperties:false`
×10, `:true` ×0. The only two nodes without an explicit `additionalProperties`
are the top-level `oneOf[0]`/`oneOf[1]` constraint overlays — their properties
(`risk_class,evidence_destination,valid_from,valid_until` / `risk_ceiling`) are
**duplicated into the root closed `properties` block**, so the root
`additionalProperties:false` governs them. Empirically confirmed no hole: probes
(b) and (d1) below reject undeclared top-level fields.

**Enum verbatim vs base `e4c5dece`:** `status` = `DRAFT, REVIEW,
APPROVED_NOT_EFFECTIVE, ACTIVE, SUSPENDED, CLOSED, REVOKED` (7, unchanged);
`risk_class` and `risk_ceiling` = `R0..R4` (unchanged, not widened). No narrow
type dropped — the narrow `owners`/`repositories` string-array branches are
byte-equivalent to base and remain `required` via the narrow `oneOf` branch.

**Out-of-tree AJV probe battery** (compiled with the same `Ajv2020({strict:true})`
+ `ajv-formats` as the runtime validator): **26/26 pass, 0 admit-failures.**

| # | Probe | Expect | Result |
|---|---|---|---|
| a | old narrow valid fixture (`project.json`) | accept | PASS |
| b | narrow + 1 undeclared top field | reject `additionalProperties` | PASS |
| c1 | rich v2-r2 instance | accept | PASS |
| c2 | rich v2-r3 instance | accept | PASS |
| d1 | rich + undeclared **top** field | reject `additionalProperties` | PASS |
| d2 | rich + undeclared **owners** object field | reject | PASS |
| d3 | rich + undeclared **repositories[0]** field | reject | PASS |
| d4 | rich + undeclared **environments[0]** field | reject `additionalProperties` | PASS |
| d5 | rich + undeclared **authority_invariant** field | reject `additionalProperties` | PASS |
| d6 | rich + undeclared **evidence_chain** field | reject `additionalProperties` | PASS |
| d7 | rich + undeclared **revocation_policy** field | reject `additionalProperties` | PASS |
| d8 | rich + undeclared **memory_policy** field | reject `additionalProperties` | PASS |
| e | MIXED (narrow requireds + `risk_ceiling`) | reject `oneOf` (disjoint) | PASS |
| f1 | `version` as string | reject `type` | PASS |
| f2 | narrow `owners` as string | reject | PASS |
| f3 | `repositories` as string | reject | PASS |
| f4 | `status` = `LIVE` (bad enum) | reject `enum` | PASS |
| f5 | `risk_ceiling` = `R5` (widen probe) | reject `enum` | PASS |
| g1 | `security_classification` = `""` | reject `minLength` | PASS |
| g2 | `release_authority` = `""` | reject `minLength` | PASS |
| g3 | `integration_authority` = `""` | reject `minLength` | PASS |
| g4 | `authority_invariant.signing_authority` = `""` | reject `minLength` | PASS |
| g5 | `evidence_chain.sec_review` = `""` | reject `minLength` | PASS |
| h | neither-shape (no `risk_ceiling`, no narrow window) | reject `oneOf` | PASS |
| i | `owners.business` = `""` (permissive probe) | *accepted* | see §4 |
| j | `description` = `""` (permissive probe) | *accepted* | see §4 |

**Nesting points probed for undeclared-field rejection: 8 distinct** (top,
owners object, repositories item, environments item, authority_invariant,
evidence_chain, revocation_policy, memory_policy) — all reject. Requirement was
≥4. **No probe admitted anything it should reject.** Disjointness holds: a
document carrying both shapes' discriminators matches both `oneOf` branches →
`oneOf` violated → rejected.

## 3. Probe 2 — Runtime blast-radius. Result: **PASS**

- `src/project/project-contract-service.mjs` blob `b88e2029…` **byte-identical**
  to base `6f6a5ea` (empty diff).
- Narrow runtime fixture `tests/fixtures/valid/project.json` blob `f2d4048b…`
  **byte-identical** to base.
- `src/contracts/contract-validator.mjs` `schemaPaths` unchanged (count stays 20).
- `tests/project-contract-service.test.mjs` + `tests/approval-binding.test.mjs`:
  **81 pass / 0 fail**. The producer-disclosed first-pass break (~37 runtime
  tests, had the narrow shape been replaced) is **avoided** by the strict-superset
  design — the runtime path is provably untouched.

## 4. Probe 3 — Permissive-typing adjudication (producer disclosure §4)

**Disclosed string-typings — ADJUDICATED ACCEPTABLE.** The single-value
governance fields (`security_classification`, `release_authority`,
`integration_authority`, `provider_transport_policy`, `agent_tool_network_policy`,
`credential_policy`, `retention_policy`, `evidence_destination_status`,
`expiry_policy`, and the `*_authority` members of
`authority_invariant`/`revocation_policy`) are typed as **non-empty `string`**
(`minLength:1`), not enums. **Ruling:** acceptable under the no-invented-enum
rule. The normative documents do not fix a closed value set for these fields; a
fabricated single-value enum would itself fail-closed against any legitimate
future value the operator sets at signing. Non-empty `string` keeps each field
typed and closed under `additionalProperties:false` while not inventing a
vocabulary. Probes g1–g5 confirm empty strings are rejected on these authority
fields. The two hard-enum, security-critical fields (`status`, the R0–R4 risk
scale) remain verbatim enums.

**Minor UNDISCLOSED nuance — NOTE (not rework).** Two fields accept an empty
string because they lack `minLength`:
- `owners.{business,technical,security,governance}` typed `["string","null"]`
  (probe i: `owners.business=""` accepted).
- `description` typed plain `string` (probe j: `description=""` accepted; note
  `namespace`/`name` DO carry `minLength:1`).

Adjudication: **this is not a hidden loosening of the fail-closed authority
posture** and does not trigger the automatic-rework rule, because (1) the
`string|null` typing of the owners slots is itself disclosed (producer §2), only
the missing `minLength` on the string alternative is uncalled-out; (2) `null` is
the intended "unfilled" sentinel, so `""` is redundant sloppiness, not a new
class of admitted value; (3) neither field is an authority gate — the rich
`owners` object is not consumed by the narrow runtime effectiveness path, and the
authority-bearing strings ARE `minLength`-enforced; (4) no undeclared property is
admitted and no enum is widened. **Recommended hardening at staging:** add
`minLength:1` to the owners-slot string alternative and to `description` (or a
one-line disclosure). Advisory, non-blocking.

## 5. Probe 4 — Guard-exclusion audit + tamper reproduction. Result: **PASS**

Each of the 3 edited guards excludes **only**
`contracts/project-contract.schema.json`, follows that test's own existing
exclusion pattern, and drops no assertion:
- `approval-binding.test.mjs` (F4): adds `ALIGNED_CONTRACTS` skip inside the
  per-file blob loop; the **file-set equality** assertion is retained.
- `integration-queue-ledger.test.mjs`: adds the file to the existing `continue`
  exclusion (alongside `integration-queue-entry.schema.json`).
- `workspace-lease-ledger.test.mjs`: adds the file to the existing `continue`
  exclusion chain.

**Tamper reproduced first-hand:** appended a newline to a DIFFERENT swept schema
(`contracts/decision-record.schema.json`) → ran all 3 guard files → **3 tests
FAIL** (F4 message: "contracts/decision-record.schema.json drifted from main @
beebfe8"; the two ledger guards also fail). `git checkout --` restore → re-run →
**107 pass / 0 fail**, working tree clean. The guards still bite on every
non-excluded schema; tamper detection is relocated (to shape coverage), not
dropped.

## 6. Probe 5 — Regression + counts (first-hand). Result: **PASS**

- `node --test` (full suite): **tests 1331, pass 1328, fail 0, skipped 3** —
  matches producer claim (1331/1328/0/3) exactly.
- `node tools/validate-foundation.mjs`: exit **0**, overall **PASS**,
  `schemas.count` PASS (**20**, "7 canonical + 13 extensions"),
  `project-contract` manifest-exists / draft-2020-12 / closed-object /
  identity(`project_id,version,status,approvals` all in top-level `required`)
  all **PASS**.

## 7. Probe 6 — Diff cleanliness. Result: **PASS (clean)**

`git diff --name-status 6f6a5ea 8bc679d` = exactly:
`M contracts/project-contract.schema.json`; `A tests/project-contract-schema-alignment.test.mjs`;
`A tests/fixtures/valid/project-contract-rich.json`; `A .../valid/project-contract-rich-v2r3.json`;
`A tests/fixtures/invalid/project-contract-rich-extra-field.json`; `A .../invalid/project-contract-rich-bad-type.json`;
`M tests/approval-binding.test.mjs`; `M tests/integration-queue-ledger.test.mjs`; `M tests/workspace-lease-ledger.test.mjs`;
`M docs/03-project-control/candidates/module-completion-tracker-001.md` (single extend-only append);
`A docs/03-project-control/candidates/schema-alignment-project-contract-producer-verification-001.md`;
`M MANIFEST.json` (adds only the 5 new files). Nothing out of scope.

## 8. Disclosure adjudication (per the two producer disclosures)

1. **Permissive `string` typings (§4):** ADJUDICATED ACCEPTABLE — no-invented-enum
   rule; authority strings are non-empty; hard enums intact. One minor undisclosed
   empty-string nuance downgraded to a NOTE (§4), not rework.
2. **Corrected first-pass (avoided ~37-test runtime break):** VERIFIED — the
   corrected strict-superset design leaves the runtime service, narrow fixture,
   validator schemaPaths, and all 81 service+authority tests untouched/green. The
   first-pass replacement risk is genuinely avoided.

## 9. Fold-need (staging note, not a code issue)

Main has advanced past `6f6a5ea` (this worktree's main tip = `adc6cf0`, PR #127
skills pack). The tracker line and MANIFEST additions are additive/extend-only; a
union re-merge of `MANIFEST.json` and `module-completion-tracker-001.md` against
current main is expected at staging. This is staging-owner work, not a defect in
the slice.

## 10. Verdict

**APPROVE_WITH_NOTES.**

The schema is a genuine strict superset: strictness is preserved at every object
level, both enums are verbatim, the narrow runtime shape is intact and
byte-identical, disjointness is enforced by `oneOf`, and the fail-closed validator
still rejects undeclared fields, type violations, bad enums, and mixed/neither
shapes across 8 nesting points. Runtime blast-radius is nil. Guards still bite
(tamper reproduced). Suite and validator match claims exactly. **Notes:** (a) add
`minLength:1` to the `owners` role-slot string alternative and to `description`
(minor undisclosed empty-string permissiveness — hardening, non-blocking); (b)
MANIFEST/tracker union re-merge expected at staging (fold-need).

## 11. Separation-of-Duties attestation

I am `claude-immune-crossrev-schema-align-01`, an independent Immune reviewer
distinct from the producer `claude-motor-schema-align-01`. I authored none of the
reviewed slice. I re-derived every claim first-hand (own probe battery, own walk,
own tamper). This review carries no execution or approval authority; it is a
recommendation for operator/governance staging. No push, no merge performed.

## 12. Self-certification

```yaml
self_certification:
  agent_id: claude-immune-crossrev-schema-align-01
  peer_agent_id: claude-motor-schema-align-01
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

```yaml
truth_status: verified_true          # every producer claim reproduced first-hand; 26/26 probes, guards, validator, suite green
authority_status: advisory_only      # cross-review; staging remains an operator act
implementation_status: existing      # slice is complete on-branch; correctness confirmed
risk_class: medium                   # fail-closed validator on the runtime authority engine; superset preserves posture
```

> Cross-reviewed as an advisory work product. The schema-alignment slice preserves
> the fail-closed strictness of `contracts/project-contract.schema.json` while
> admitting the Option-A rich normative shape as a disjoint superset. Verdict
> APPROVE_WITH_NOTES. No execution or approval authority.
