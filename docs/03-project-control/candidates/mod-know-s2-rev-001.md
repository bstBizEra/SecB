# MOD-KNOW Slice S2 — Independent Immune Review (mod-know-s2-rev-001)

- reviewer_identity: `claude-immune-rev-modknow-s2`
- review_role: BST-SA Immune (adversarial verification)
- target_branch: `bst/mod-know-s2-sidecar`
- target_commit: `a67d49e` ([MOD-KNOW-S2] Supersession + contradiction SIDECAR linkage, UNWIRED)
- base: `bst/mod-know-s1-claims` @ `8b550c8` (target parent == base, single-commit lineage)
- assessment_source: `docs/03-project-control/candidates/mod-know-gap-assessment-001.md` (`bst/mod-know-assessment` @ 3ddfe41) — gaps G3 (no contradiction primitives) and G4 (no supersession semantics); sidecar rationale (keep S2 at R2, avoid R3 contract mutation of the closed knowledge-claim schema)
- verification_method: first-hand in an isolated worktree. `npm ci` (6 pkgs), full suite `node --test`, S2 file in isolation, validator `node tools/validate-foundation.mjs`, independent git-blob-SHA byte-identity checks against BOTH base and `main`, and 6 independent adversarial probes run outside the producer's test doubles (raw foreign-writer sidecar injection).

## Verdict

**APPROVE_WITH_NOTES**

Every claimed guarantee holds under first-hand adversarial verification. One LOW-severity defense-in-depth asymmetry is recorded (NOTE 1): the read-path lineage walker `resolveCurrent` defends against foreign-writer branched / cyclic / self-referential / malformed edges but does **not** re-enforce project scope, so a raw cross-project supersession edge injected directly into the sidecar (bypassing the scope-gated write path) is followed to a cross-project winner. This violates no stated guarantee (the service header promises read-path structure defense for broken lineage, not read-path scope enforcement), the output is `data_untrusted`, the winner is still validated at the trusted server instant via S1, and no claim is mutated. It does not block merge; it is a recommendation for symmetric hardening.

## Scope verification (charge item 1)

- Diff `8b550c8..a67d49e` = **exactly 3 files**: `MANIFEST.json` (+2 file entries), new `src/services/knowledge-linkage-service.mjs` (+604), new `tests/knowledge-linkage-service.test.mjs` (+661). No other artifacts, no reverts, no relocation traces. Single commit; `a67d49e^ == 8b550c8`.
- `MANIFEST.json` change is exactly `+ src/services/knowledge-linkage-service.mjs` and `+ tests/knowledge-linkage-service.test.mjs` appended to `files` (the last pre-existing line gains a trailing comma). No deletions, no reordering.
- **Byte-identity, verified independently of the producer's in-suite GUARD** via git blob SHA at base, target, AND `main` — all three identical for each of the four sensitive files:
  - `contracts/knowledge-claim.schema.json`: `0821dc8…` (base == target == main). IDENTICAL.
  - `src/ledger/temporal-ledgers.mjs`: `c1e6579…` (base == target == main). IDENTICAL.
  - `src/control/sod-rules.mjs`: `4ffbc20…` (base == target == main). IDENTICAL.
  - `src/services/knowledge-claim-service.mjs` (S1 facade, ratified on `main` via PR #17): `a9ffafb…` (base == target == main). IDENTICAL — the critical wrap-not-modify boundary at the S1 layer holds; the ratified facade is untouched.
  - Because `main`'s blob SHAs equal the base blob SHAs, the producer's in-suite guard (`git show <base>:<path>`) is meaningful and non-circular; this blob-SHA cross-check is the authoritative confirmation.

## Lineage integrity — adversarial verdict question (charge item 2)

The read-only walker `resolveCurrent` was attacked with raw sidecar rows appended **directly to the DurableLedger, bypassing `recordSupersession`** (the same foreign-writer threat model the producer's branched/cyclic tests use). Results:

| Attack (raw injection) | Expected | Observed | Result |
|---|---|---|---|
| Branch: A→B and A→C | structured DENY, no throw | `DENY_BROKEN_LINEAGE` `lineage_issue=branched` (producer test) | PASS |
| Cycle: A→B then B→A | structured DENY, no throw | `DENY_BROKEN_LINEAGE` `lineage_issue=cyclic` (producer test + probe) | PASS |
| Self-reference: A→A | deny, no throw | `DENY_BROKEN_LINEAGE` `lineage_issue=cyclic` [probe 2] | PASS |
| Malformed rows (blank ref / unparseable `asserted_at` / wrong type) | skipped, no throw, no mis-resolve | rows filtered by `supersessionEdges`/`contradictionRecords` (`continue`); `resolveCurrent("kc_a")` → ALLOW, current=`kc_a` [probe 3] | PASS |
| Cross-project: A(proj-1)→B(proj-2) raw edge | (not promised) | ALLOW, current=`kc_p2`, winner project=`proj-2` — edge **followed**, scope **not** re-checked [probe 1] | NOTE 1 (LOW) |

- **Supersession-chain semantics (write path):** `A→B then B→A` → `DENY_CYCLIC_LINEAGE`; second superseder of same claim (`A→B` and `A→C`) → `DENY_ALREADY_SUPERSEDED` (deny-by-default against branching at write time). Both confirmed by producer tests. So legitimately-created lineages can never be branched or cyclic; only foreign injection can, and the read walker structures those.
- **Backdated `at` / inclusive boundary:** `at` selects which edges are effective (`assertedMs <= atMs`, inclusive, mirroring `valid_from` inclusivity). Producer test proves: strictly before `t1` → head unchanged; exactly `t1` → first edge effective; exactly `t2` → full chain. Inclusive semantics consistent.
- **Resurrection attack (critical):** a superseded winner that is EXPIRED at server-now cannot be resurrected. `at` is a query instant for edge-effectiveness only; the winning claim is always resolved through the S1 read path at the **trusted server instant**, not at `at`. [probe 4] With server-now advanced past the winner's `valid_until`, `resolveCurrent(..., { at: <server-now> })` → `DENY_TEMPORAL_BOUNDARY` `failed_ref=kc_short` (verbatim S1 denial). Backdating `at` before the edge simply stops the walk at the earlier still-valid claim (correct historical answer), never resurrecting the expired one. Producer test line 607–622 independently confirms the expired-winner and unknown-winner passthrough.

## Symmetric duplicates & canonicalization (charge item 3)

- **Symmetric duplicate:** `A-B` then `B-A` → `DENY_ALREADY_LINKED` (set-equality over both orders); same-order re-register also denied. Stored record is canonicalized (lexicographically smaller ref first; `entryId = con:<low>|<high>`), so A-B and B-A produce one identical record. Producer test confirms; result freezes.
- **Canonicalization tricks (case / whitespace in refs):** the service does not trim/lowercase refs — but this is safe, because every ref must first resolve through the S1 read path (`getClaim`), which matches on exact `claim_id`. A whitespace variant `"kc_a "` → `DENY_UNKNOWN_CLAIM` `failed_ref="kc_a "`; a case variant `"KC_A"` → `DENY_UNKNOWN_CLAIM`. [probe 5] A phantom duplicate cannot be created from a non-canonical ref because the ref itself must be a real, admitted claim id. Canonicalization is correctly delegated to S1 identity.

## Separation of duties (charge item 4)

- Asserter == approver → **denied on both ops**: `recordSupersession` → `DENY_SUPERSESSION_SOD`; `recordContradiction` → `DENY_CONTRADICTION_SOD`. Producer tests also cover reviewer==asserter and reviewer==approver (pairwise-distinct). No sidecar append and no audit on SoD denial (rows == 0, audit entries == 0).
- **Kernel primitive, config-only:** the service calls `sodRules.checkPairwiseDistinct(actors, { code })` — supplying the actor set (ASSERTER/APPROVER, plus REV when a reviewer is present) and the deny code only. Zero changes to `sod-rules.mjs` exported behavior (blob `4ffbc20…` byte-identical). Actor roles for the reuse are derived here from doctrine (evidence-knowledge-skill admission rule) as data, not by mutating the kernel.

## Audit-first & passthrough (charge item 5)

- **Audit-first spot-run, both ops:** `auditWriter` is invoked strictly before `sidecarLedger.append`. Producer's order-capture test asserts `["audit","append"]`. A throwing `auditWriter` → `DENY_AUDIT_UNAVAILABLE` with **sidecar length 0** on both `recordSupersession` and `recordContradiction` — no un-audited append.
- **Frozen outputs:** every ALLOW/DENY result is `deepFreeze`d; `resolveCurrent` ALLOW additionally freezes `lineage`, `contradictions`, `contradictions[i]`, and returns the winner via `structuredClone` marked `data_untrusted: true`.
- **Passthrough verbatim for unknown / unresolvable claims:** an S1/ledger denial surfaces with its **own** code and reason plus the failing ref — `DENY_UNKNOWN_CLAIM` (`reason: "Unknown claim: kc_b"`, `failed_ref: kc_b`), `DENY_TEMPORAL_BOUNDARY`, and the sidecar ledger's own `DENY_SEQUENCE_CONFLICT` (`source: sidecar-ledger`) are never pre-empted or re-coded. Confirmed across supersession, contradiction, and resolveCurrent paths.
- **No claim mutation:** the only write is one appended sidecar entry; the knowledge-claim ledger is byte-for-byte unchanged after each linkage (producer `deepEqual(knowledgeLedger.read(), before)`), consistent with the sidecar-not-field rationale (keeps the closed R3 schema untouched → S2 stays R2).

## Totals — measured vs claimed (charge item 6)

| Metric | Claimed | Measured | Result |
|---|---|---|---|
| total tests | 589 | 589 | MATCH |
| pass | 584 | 584 | MATCH |
| fail | 0 | 0 | MATCH |
| skipped | 5 | 5 | MATCH |
| S2 linkage-file tests | 30 | 30 (30 pass, 0 skip) | MATCH |
| MANIFEST files added | +2 | +2 (src + test) | MATCH |
| 4-file byte-identity | guard | independently IDENTICAL vs base AND main | MATCH |
| validator exit | 0 | 0 | MATCH |

The 5 skips are pre-existing elsewhere in the suite (e.g. `checkPairwiseDistinct skips absent parties`, `skipped transition fails closed`); the S2 file contributes 0 skips.

## Findings by severity

- CRITICAL: none
- HIGH: none
- MEDIUM: none
- LOW:
  1. **NOTE 1 — `resolveCurrent` does not re-enforce project scope on the read path.** The write path (`recordSupersession` / `recordContradiction`) hard-denies cross-project links with `DENY_SCOPE_MISMATCH` [probe 6 confirms]. The read walker defends foreign-writer rows structurally (branched/cyclic/self-ref/malformed) but follows a raw cross-project supersession edge to a cross-project winner (ALLOW, winner project ≠ anchor project) [probe 1]. Impact is bounded: (a) it requires a foreign writer with direct sidecar append that bypasses the scope-gated service; (b) the winner is still a real claim validated at the trusted server instant via S1; (c) output is `data_untrusted` with the full `lineage[]` visible for a consumer to inspect `project_id`; (d) no claim is mutated. Because the producer explicitly positions the walker as a foreign-writer defense (test header) and enforces scope as a hard boundary at write time, the read-path omission is an asymmetry worth closing. **Recommendation (advisory, non-blocking):** in `supersessionEdges`/the walk, skip or deny edges whose `project_id` differs from the anchor claim's project (e.g. emit `DENY_BROKEN_LINEAGE` `lineage_issue="cross_project"`), mirroring the branched/cyclic guards. A regression test with a raw cross-project edge should accompany the change.
- INFORMATIONAL:
  1. The in-suite GUARD compares against `git show <S2_BASE>:<path>` with the base pinned by full SHA (`8b550c8…`), which is more robust than a `main`-relative guard; this review additionally pins byte-identity by blob SHA against both base and `main`. No action.
  2. Clock stage precedes S1 resolution and sidecar gates; a broken clock denies `DENY_CLOCK_UNAVAILABLE` before other stages. Deterministic and fail-closed — not a defect.

## Adversarial outcomes (summary)

6 independent probes (raw foreign-writer injection, outside producer doubles), all behaving as required: (1) cross-project raw edge followed → NOTE 1; (2) self-referential edge → cyclic DENY, no throw; (3) malformed payload rows filtered, resolves anchor to itself, no throw; (4) expired superseded winner NOT resurrected (`DENY_TEMPORAL_BOUNDARY` at trusted instant), backdated `at` stops at earlier valid claim; (5) whitespace/case ref variants → `DENY_UNKNOWN_CLAIM` (no phantom duplicate); (6) service-path cross-project supersession → `DENY_SCOPE_MISMATCH`. No probe produced a throw, a mis-resolution of a legitimately-created lineage, a claim mutation, or a weakened gate. Probe file was not committed.

## Advisory fields

- truth_status: verified_true
- authority_status: advisory_only (execution_requires_operator for any merge)
- implementation_status: candidate
- risk_class: low

## self_certification

```yaml
self_certification:
  agent_id: claude-immune-rev-modknow-s2
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

## Provenance

- source: first-hand adversarial verification in isolated worktree of C:\laragon\www\SecB
- agent_id: claude-immune-rev-modknow-s2 (BST-SA Immune, Claude Fable 5)
- timestamp: 2026-07-20
- verdict: APPROVE_WITH_NOTES (advisory; operator authority required to merge)
