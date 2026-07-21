# MOD-SKILL S3 — Governed Revocation Primitive — Producer Verification 001

**Record ID:** MOD-SKILL-S3-REVOKE-PV-001
**Module / Slice:** MOD-SKILL (SkillsHub) — Slice 3 (IMM-SKILL-V1), **components 1+2 ONLY**
**Producer identity:** `claude-motor-skill-s3-01` (BST-SA motor, worker only)
**Branch:** `bst/mod-skill-s3-revoke-primitive`
**Base:** `main` @ `0aa13f8` (origin/main tip; 20 schemas, 1279-test baseline)
**Recorded:** 2026-07-22
**Status:** CANDIDATE — advisory / planning-prepared. UNWIRED. Awaits independent review + operator ratification. No merge, wiring, or activation.

---

## 1. Scope, authorization, and the coordinator's component-3 exclusion

This slice adds a pure, additive, **UNWIRED** governed skill-revocation primitive that closes the
**components 1 and 2** of the assessment's Slice 3 (IMM-SKILL-V1), and deliberately **excludes**
component 3.

**Authorization basis (recorded explicitly):**

- The operator **reclassified MOD-SKILL S3 from R3 → R2 on 2026-07-22** (operator decision, delivered
  via the coordinator), by the same pattern used for the merged MOD-KNOW / MOD-MEM R2 candidate
  primitives. This is operator-authorized R2 producer work, **not** a self-authorized gate change and
  **not** a modification of ADR-0015 R5, the DecisionLedger authority model, or any risk/authority
  policy.
- The coordinator **SCOPED the build**: build ONLY the genuinely-unwired-R2 portion (components 1+2).
  Component 3 (the live `resolveEffective` resolver mutation) is **explicitly EXCLUDED** and left as a
  separate operator-gated wiring step. Building it would alter existing resolver runtime deny behavior
  and violate the unwired-candidate boundary.

**Built (components 1+2, additive + unwired):**

1. A governed **`revoke(request)`** transition PUBLISHED→REVOKED on a new
   `SkillRevocationLedger extends DurableLedger` (`src/ledger/skill-revocation-ledger.mjs`). It records
   `known_bad_versions`, requires governance approval under the full N-5 bundle, and writes audit-first
   to a durable hash-chained ledger. Deny codes cover every failure path (see §6).
2. The REVOCATION approval decision is **bound to a governed GOVERNANCE decision** — the exact
   HUMAN_PROMOTION binding technique the S2 sibling uses — so a REVOCATION is no longer trusted as bare
   caller data (assessment I2/G5). The bound governed decision is embedded in the ledger fact as the
   revocation's approval evidence.

**Excluded (component 3 — gated follow-ups, NOT built):**

- Resolution-time `resolveEffective` re-validation in `skill-resolver.mjs` / `resolveSkill`
  (`DENY_REVOKED` / `DENY_PROMOTION_LAPSED` at resolution). **EXCLUDED** — alters the live resolver's
  runtime deny behavior; separate operator-gated wiring step.
- Harness-compat (C0–C5) enforcement at resolution. **EXCLUDED** (same reason).
- `skill-resolver.mjs` is **not touched at all**; its existing static-REVOCATION poison check and
  registration-time accept behavior are left exactly as-is (byte-identity pinned, §4/§7).

There was no point at which component 3 was partially built or "prepared". The bound-object-version
carries `REVOKE_SKILL` semantics only inside this ledger; nothing in this module reads, imports, or
mutates any resolver. See §5 (deviation disclosure) for the one place a decision had to be made about
the temptation boundary.

---

## 2. Mirror-of-`CapabilityRegistryService.revoke` proof

The revocation transition is a direct mirror of the delivered N-5 reference pattern
`src/gateway/capability-registry-service.mjs` `revoke()`, rebuilt on the DurableLedger-subclass
discipline of the S2 sibling `src/ledger/skill-promotion-ledger.mjs`:

| `CapabilityRegistryService.revoke` property | This slice's `SkillRevocationLedger.revoke` |
|---|---|
| Audit-first: state change written before it takes effect; throwing writer → structured denial, no state change | The durable append **is** the write-before-effect; there is no separate in-memory status that flips first. A denied attempt returns a structured deny and never takes the append lock (disclosed denial-audit scope, identical to S2). |
| Deny-by-default (only PROMOTED reads; revoke always available under governance) | Deny-by-default throughout; `resolveRevoked()` is a fail-closed read-side lookup; every failure path returns/throws a typed deny. |
| Governance approval required | Governance approval required — **tightened** to the full N-5 bundle (see §3). |
| Transitions target/all versions to REVOKED | `PUBLISHED→REVOKED`; `version|allVersions` supported. |
| Records `known_bad_versions` | Records `known_bad_versions` (single version → `[version]`; allVersions → the declared, de-duplicated known set). |
| In-memory `Map` cross-version singleton check | Replaced by an **atomic-from-day-one** `preWriteCheck` terminal-state gate (`#detectAlreadyRevoked`) that never calls `read()` — closes the check-then-act race class the in-memory Map is only safe against single-process (mirrors `mod-wspace-s3-single-writer-toctou-fix` and the S2 already-published gate). |
| Runtime activation is a separate operator-authorized step | Same — UNWIRED; no activation, no wiring. |

Placement follows assessment §7.1 ("not the resolver"): the transition lives on a new
`SkillRevocationLedger`, **not** on `skill-resolver.mjs`.

---

## 3. SoD-reuse proof (approval-binding + risk-registry, NOT reimplemented)

The N-5 separation-of-duties evaluation is **entirely reused**, never re-derived:

- `evaluateApprovalBinding` / `bindApprovalDecision` / `verifyApprovalBinding`
  (`src/control/approval-binding.mjs`) are imported READ-ONLY and unmodified. This module contains **no**
  pairwise-distinctness math, **no** self-approval check, and **no** role-matching logic of its own.
  Every SoD outcome (`DENY_APPROVALS` / `DENY_SELF_APPROVAL` / `DENY_SOD_VIOLATION` /
  `DENY_INVALID_ROLE_MATCH_MODE` / `APPROVAL_BOUND`) is exactly whatever the reused primitive returns —
  proved by the `SOD_PARITY_CASES` tests, which assert `revoke()`'s code equals
  `evaluateApprovalBinding(...)`'s code called directly with the identical arguments.
- `riskProfile` (`src/control/risk-registry.mjs`) is imported READ-ONLY to enforce the R3+ floor:
  `revoke()` denies any `riskClass` whose profile does not carry `humanApproval === true`
  (`DENY_RISK_CLASS_BELOW_FLOOR`), so a low risk class can never bypass the human gate.
- A test guard asserts the module does **not** import `sod-rules.mjs` directly, and **does** import
  `approval-binding.mjs` and `risk-registry.mjs`.

**Binding tightened to match HUMAN_PROMOTION (component 2).** `CapabilityRegistryService.revoke`
requires only a single lone GOVERNANCE approval with no independent-review leg and no
producer-distinctness. This slice deliberately **tightens** revocation to the FULL N-5 bundle
(independent-review + governance, pairwise-distinct from the producer and each other) via the same
`evaluateApprovalBinding` path S2 uses for promotion — satisfying assessment §7.2 ("tighten to match the
HUMAN_PROMOTION binding"). The decision is bound to the exact `REVOKE_SKILL@<objectVersion>` and
**re-verified** (`verifyApprovalBinding`) before any write (mint + verify are two independent calls into
the reused primitive, closing MR-3-class replay: an approval bound to revoking `skill-x@1.0.0` cannot
verify against revoking `skill-x@2.0.0`, nor an all-versions revoke of `skill-x`).

Deny codes are returned **verbatim** from the reused primitive rather than remapped to a bespoke
`DENY_REVOKE_UNAUTHORIZED`, so the originating primitive of every denial stays visible (the task's
example code names are honored in spirit by preserving the authoritative source codes).

---

## 4. Purity / unwired proof

- **No new schema.** The governed decision is schema-validated by REUSING the existing `decisionRecord`
  contract (`contracts/decision-record.schema.json`, `decision_type: "GOVERNANCE"`) via
  `validateContract`. The skill-manifest schema already models `status: REVOKED` and the `REVOCATION`
  approval-history type (assessment I2), and the approval binding reuses the decision-record's existing
  `GOVERNANCE` decision_type. `schemas.count` stays **20**; `contract-validator.mjs` and
  `validate-foundation.mjs` are untouched; no byte-identity guard repin and no workspace-lease
  baseline-sweep exclusion were needed.
- **Revocation-fact fields validated in code**, mirroring `CapabilityRegistryService.revoke` (which
  schema-validates only its intake path, never its revocation output): `known_bad_versions` / `reason` /
  `status` / `skill_id` / `content_hash` are structurally checked in code (non-blank, array, literal,
  sha256-hex). Disclosed consequence of the no-new-schema decision.
- **`skill-resolver.mjs` untouched.** A byte-identity guard pins `src/registry/skill-resolver.mjs`
  (plus the reused primitives, the S1/S2 siblings, `reserved-delimiters.mjs`, and the decision-record /
  skill-manifest / skill-promotion schemas) to `0aa13f8`. A source guard asserts the module neither
  imports `skill-resolver` nor calls `resolveEffective`.
- **Zero importers (UNWIRED).** `git grep --untracked -l SkillRevocationLedger -- src/` returns exactly
  `src/ledger/skill-revocation-ledger.mjs` (its own definition) and nothing else — asserted as a test.
- **Deny-by-default, deep-frozen, fail-closed** throughout: `deny()` and the success result are
  `Object.freeze`d; the hash-chain / idempotency / OCC / integrity verification are inherited unmodified
  from `DurableLedger`.

---

## 5. Atomic-snapshot / descriptor-trap-safe note + deviation disclosure

**Atomic snapshot.** Caller input is captured once via `snapshotRequest` (`structuredClone`), which
performs a **single `[[Get]]` per own enumerable field** and never a per-field
`getOwnPropertyDescriptor` probe — a hostile getter/Proxy trap is contained at the boundary and cannot
reach validation or the hash chain. A dedicated test installs a counting getter on `reason` and asserts
it is read exactly once and the cloned value (not a re-read) is what lands in the ledger. A non-object
or unclonable request throws `DENY_REVOKE_MALFORMED` before any lock is taken. This mirrors S2's
`snapshotRequest` / WorkspaceLeaseLedger's `snapshotLease` verbatim.

**Deviation disclosure (honesty on the component-3 temptation).** The one genuine design decision where
component 3 could have crept in was the `bound_object_version` shape. To bind an all-versions revoke I
needed a stable object-version token; the natural, resolver-flavored instinct is to enumerate live
versions from a resolver/manifest store. I deliberately did **not** — this UNWIRED primitive holds no
manifest store and must not reach into one. Instead the caller **declares** the known version set
(`knownVersions`) and the ledger records exactly that. This keeps the primitive pure and resolver-free
at the cost of trusting the caller's declared version set (an acceptable, disclosed limitation for an
unwired candidate; a future wired service would source the set from the manifest store). No other part
of the build approached the component-3 boundary. `known_bad_versions` from the manifest store,
resolution-time re-validation, and C0–C5 enforcement all remain unbuilt, gated follow-ups.

---

## 6. Deny-code inventory

| Code | Kind | Trigger |
|---|---|---|
| `DENY_REVOKE_MALFORMED` | throw (`LedgerError`) | non-object request; blank `skillId` / `decisionId` / `actorId`; malformed `contentHash` |
| `DENY_MISSING_ENTRY_FIELDS` | throw (`LedgerError`) | missing `idempotencyKey` (base-ledger convention) |
| `DENY_MALFORMED_VERSION_SET` | deny | single-version request with blank `skillVersion`; allVersions request with empty/blank `knownVersions` |
| `DENY_ID_CHARSET` | deny | reserved composite-key delimiter (`@` / `|`) in `skillId` or any version (GOV-P011-08) |
| `DENY_REVOCATION_INVALID` | deny | missing/blank `reason` |
| `DENY_RISK_CLASS_BELOW_FLOOR` | deny | `riskClass` whose profile lacks `humanApproval === true` (below R3+) or unknown class |
| `DENY_APPROVALS` / `DENY_SELF_APPROVAL` / `DENY_SOD_VIOLATION` / `DENY_INVALID_ROLE_MATCH_MODE` | deny (verbatim from `approval-binding`) | N-5 SoD failures |
| `DENY_CONTRACT_INVALID` | throw (reused `decisionRecord` schema) | malformed `decidedAt` / `valid_from` / `valid_until` date-time in the governed decision |
| `DENY_ALREADY_REVOKED` | deny (atomic `preWriteCheck`) | terminal-forever: a prior REVOKED record for the same `skill_id` overlaps this request |
| `DENY_SEQUENCE_CONFLICT` / `DENY_DUPLICATE_ENTRY_ID` / `DENY_IDEMPOTENCY_CONFLICT` | inherited (`DurableLedger`) | OCC / duplicate entryId / idempotency reuse |
| `DENY_INVALID_SKILL_ID` / `DENY_UNKNOWN_SKILL` | deny (`resolveRevoked`) | read-side lookup misses |

---

## 7. Test + validator evidence

- **New file tests:** `tests/skill-revocation-ledger.test.mjs` — **46 tests, all green** in isolation.
  Coverage: legitimate single-version + allVersions revocation (decision bound, chain verified);
  already-revoked terminal denial incl. a PROBE1-style atomicity regression (public `read()` overridden
  to throw, gate unaffected); SoD parity with `evaluateApprovalBinding`; risk-floor / reason /
  version-set / charset denials; malformed-input fail-closed throws; inherited base-ledger behavior
  (OCC, duplicate entryId, idempotent replay); descriptor-trap single-read proof; reuse / unwired /
  skill-resolver-untouched guards; byte-identity guard pinned to `0aa13f8`.
- **Full suite:** `npm test` (validator + `node --test tests/*.test.mjs`) — see the branch commit's
  recorded totals: base baseline **1279** (1276 pass / 3 skip / 0 fail) → post-change **1325**
  (1322 pass / 3 skip / 0 fail); delta **+46**, zero regressions.
- **Foundation validator:** `node tools/validate-foundation.mjs` exits **0**; `schemas.count` = **20**
  (unchanged — no schema added; all 20 prior schemas still registered).

---

## 8. Advisory fields

```yaml
truth_status: verified_true          # mirror/reuse/purity/unwired all confirmed against code + tests at 0aa13f8
authority_status: execution_requires_operator   # candidate; R3→R2 operator reclassification recorded; no self-authorization
implementation_status: candidate     # additive UNWIRED primitive; components 1+2 only; component 3 excluded/gated
risk_class: high                     # revocation-behavior surface; enforced R3+ human-approval floor in code
```

## 9. Self-certification

```yaml
self_certification:
  agent_id: claude-motor-skill-s3-01
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```
