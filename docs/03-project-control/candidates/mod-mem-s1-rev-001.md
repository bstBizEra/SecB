# MOD-MEM Slice S1 — Independent Immune Review (mod-mem-s1-rev-001)

- reviewer_identity: `claude-immune-rev-modmem-s1`
- review_role: BST-SA Immune (adversarial verification)
- target_branch: `bst/mod-mem-s1-gateway`
- target_commit: `d2a2118` ([MOD-MEM-S1] Memory gateway facade (unwired, deny-by-default))
- base: `main` @ `f04dee6` (target parent == base, single-commit lineage)
- assessment_source: `docs/03-project-control/candidates/mod-mem-gap-assessment-001.md` (`bst/mod-mem-assessment` @ 01137c7) — gaps G1 (no memory-gateway service), G5 (no admission SoD), G7 (trusted-time enforcement)
- verification_method: first-hand. `npm ci` (6 pkgs), full suite `node --test tests/*.test.mjs`, validator `node tools/validate-foundation.mjs`, independent blob-SHA byte-identity checks, and 11 independent adversarial probes run outside the producer's test doubles.

## Verdict

**APPROVE_FOR_OPERATOR_MERGE**

No findings at INFO+ severity that block merge. Three INFORMATIONAL observations recorded for operator awareness; none are defects.

## Scope verification (charge item 1)

- Diff `f04dee6..d2a2118` = **exactly 3 files**: `MANIFEST.json` (+2 files, -1 line reflow), new `src/services/memory-gateway-service.mjs` (324 lines), new `tests/memory-gateway-service.test.mjs` (314 lines). No other artifacts.
- Single commit; `d2a2118^ == f04dee6` (== base). No trace of the transient main-landing detour: tree is a clean 3-file diff vs base, no stray files, no reverts, no relocation artifacts.
- **Byte-identity, verified independently of the producer's guard test** via git blob SHA at both base and target:
  - `src/control/sod-rules.mjs`: `4ffbc20…` at base == target == `main`. IDENTICAL.
  - `src/ledger/temporal-ledgers.mjs`: `c1e6579…` at base == target == `main`. IDENTICAL.
  - `main` resolves to `f04dee6`, so the producer's in-suite GUARD test (`git show main:<path>`) is meaningful and non-circular in this repo state; my check is the authoritative cross-check.

## Admission pipeline (charge item 2)

Stage order is contractual and code-ordered: shape → clock → layer → classification ceiling → admission SoD → audit-first → store append. Deterministic; earlier-stage denials mask later stages consistently.

- **Deny ordering determinism**: PASS. Blank/unknown `layer` is caught at shape stage (`DENY_MALFORMED_REQUEST`) before layer resolution; a broken clock denies (`DENY_CLOCK_UNAVAILABLE`) before layer/classification. Documented and stable.
- **Classification-ceiling bypass**: PASS. `classificationRank` uses exact-match `indexOf` over an uppercase vocabulary.
  - lowercase `"internal"` → `DENY_CLASSIFICATION_CEILING` (no case-insensitivity hole). [probe 2]
  - unknown `"COSMIC"` → deny. Prototype-key tricks `"__proto__"`, `"toString"` → `DENY_CLASSIFICATION_CEILING` (rank -1). [probes 3, 3b]
  - over-ceiling `RESTRICTED` on `CONFIDENTIAL` layer → deny (rank comparison). Ceiling only ever *narrows*.
- **SoD (kernel-primitive reuse, config-only)**: PASS.
  - producer == approver (project layer) → `DENY_ADMISSION_SOD`, **store not appended** (rows == 0). [producer test + inspection]
  - distinct producer/approver → ADMIT.
  - MISSING approver on project (distinct-approver) layer → `DENY_MISSING_FIELDS`.
  - reviewer == producer (even with distinct approver) → `DENY_ADMISSION_SOD` (stricter/narrowing). [probe 4]
  - The gateway calls `sodRules.checkPairwiseDistinct(actors, { code: "DENY_ADMISSION_SOD" })` — supplies actor set + deny code only, no wrapper behavior; `sod-rules.mjs` exported behavior unchanged.
  - **Sole-producer honesty**: session/work layers declare `sod: "producer-only"` as DATA in each layer's admission config (`SOD_MODES`). Producer-only is transparently disclosed as the lighter mode; the gateway does not secretly enforce distinctness there nor secretly weaken the project layer. Honest.
- **Audit-first**: PASS. `ledgerWriter` is invoked strictly before `store.append` (producer's order-capture test asserts `["audit","store"]`). Independent spot-run: a throwing `ledgerWriter` → `DENY_AUDIT_UNAVAILABLE` with **store length 0** (no un-audited append). [probe 7]
- **Store-throw fail-closed**: PASS. Throwing `store.append` → `DENY_STORE_UNAVAILABLE`. `admit()` itself never throws even on a hostile `producer` object with a throwing `toString` (rejected as non-string at shape stage). [probe 11]

## Trusted time — G7 (charge item 3)

- **PASS**. `admitted_at` is stamped exclusively from the injected `now()` clock via `Date.prototype.getTime.call(now())` → `instant.iso`. No caller-supplied timestamp path exists:
  - `admitted_at` is not in `RECORD_KEYS`; a record carrying `admitted_at` is rejected as an unknown record field → `DENY_MALFORMED_REQUEST`. [probe 1]
  - the admitted record is constructed field-by-field (no spread of caller input), so `admitted_at`/`admitted_by` are always gateway-derived. [probe 1b: stamped == injected now]
- **Clock-throw / NaN denies**: `serverInstant()` catches throw and rejects non-finite epoch → `DENY_CLOCK_UNAVAILABLE`, on both `admit` and `retrieve`. A caller cannot inject an enforcement instant; the injection point is the server-controlled construction-time clock.

## Retrieval (charge item 4)

- **Cross-project denial**: PASS. `project_id !== scope_project_id` → `DENY_CROSS_PROJECT`. Both fields required non-blank strings, so id-collision via type coercion is impossible: numeric ids fail shape (`DENY_MISSING_FIELDS`). [probe 5] Row-level filter also uses strict `!==` on `project_id` and `layer`.
- **TTL honesty at boundary instants**: PASS. Expiry computed at read as `instant.ms >= admittedMs + ttlMs`. At `ttl-1ms` → 1 record; at exactly `ttl` → 0 records (expired at boundary); never stored, never pruned (store row survives — deny-on-use). [probes 6a/6b + producer test]
- **Frozen + data_untrusted outputs**: PASS. Each surviving record is `deepFreeze({ data_untrusted: true, record: structuredClone(row) })`; result deeply frozen.
- **No mutation through retrieve**: PASS. Assignment to a returned record throws `TypeError` (deeply frozen, ESM strict mode); `retrieve` reads via `structuredClone` and never appends. [probe 8]

## Wrap-not-modify / R3+ hard line (charge item 5)

- **PASS**. The gateway has zero `import` of existing stores/policies; it only invokes injected `store.append/read`, injected `sodRules.checkPairwiseDistinct`, injected `ledgerWriter`, and injected `now`. It can only add gates (classification ceiling, SoD, TTL, cross-project, audit-first) in front of an injected store — it cannot reach into or weaken any existing store's admission check. Existing policy surfaces (`KnowledgeLedger.appendClaim`, `sod-rules.mjs`, temporal ledgers) are byte-identical and untouched. Narrow-only confirmed.
- **Unwired**: PASS. `grep` across `src/` and `tests/` shows no importer of `memory-gateway-service` other than its own test. Nothing in the runtime constructs it.

## Totals — measured vs claimed (charge item 6)

| Metric | Claimed | Measured | Result |
|---|---|---|---|
| total tests | 453 | 453 | MATCH |
| pass | 448 | 448 | MATCH |
| fail | 0 | 0 | MATCH |
| skipped | 5 | 5 | MATCH |
| gateway-file tests | 18 | 18 (18 pass) | MATCH |
| MANIFEST files added | +2 | +2 (src + test) | MATCH |
| validator exit | 0 | 0 | MATCH |
| ledger byte-identity | guard | independently IDENTICAL | MATCH |

## Findings by severity

- CRITICAL: none
- HIGH: none
- MEDIUM: none
- LOW: none
- INFORMATIONAL:
  1. **Guard test depends on local `main` ref.** The in-suite GUARD compares against `git show main:<path>`; if a reviewer's local `main` drifted from the true base, the guard could false-pass/fail. Mitigated here: `main == f04dee6`, and this review independently pins byte-identity via blob SHA against both base and target. No action required.
  2. **Clock stage precedes layer/classification stages.** An unknown-layer request under a broken clock reports `DENY_CLOCK_UNAVAILABLE` rather than `DENY_UNKNOWN_LAYER`. Documented, deterministic, and still fail-closed — not a defect.
  3. **`retrieve` trusts the injected store's `read()` to return the full row set** and filters in-gateway by project/layer/TTL. This is correct under wrap-not-modify (the store is server-injected, not caller-supplied); noted for completeness.

## Adversarial outcomes (summary)

All 11 independent probes produced the fail-closed / narrow-only result expected: caller-timestamp rejected; trusted-time stamped from `now`; lowercase/prototype/unknown classifications denied; reviewer==producer denied; numeric-id retrieval denied; TTL boundary expires at exactly `ttl`; audit-throw leaves store empty; retrieve output immutable (mutation throws); unknown admission field denied; blank layer denied; `admit` never throws on hostile input.

## Advisory fields

- truth_status: verified_true
- authority_status: advisory_only (execution_requires_operator for any merge)
- implementation_status: candidate
- risk_class: low

## self_certification

```yaml
self_certification:
  agent_id: claude-immune-rev-modmem-s1
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

## Provenance

- source: first-hand adversarial verification in isolated worktree of C:\laragon\www\SecB
- agent_id: claude-immune-rev-modmem-s1 (BST-SA Immune, Claude Fable 5)
- timestamp: 2026-07-20
- verdict: APPROVE_FOR_OPERATOR_MERGE (advisory; operator authority required to merge)
