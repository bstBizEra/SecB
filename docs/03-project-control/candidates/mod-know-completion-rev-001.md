# MOD-KNOW Module-Completion Review 001

**Record ID:** MOD-KNOW-REV-001
**Module:** MOD-KNOW — Knowledge Service (catalog scope: "Claims, contradictions, provenance and supersession")
**Reviewer identity:** claude-immune-rev-modknow-complete-01 (BST-SA immune, independent, advisory)
**Review target:** `bst/mod-know-s3-provider` @ `ce9957f` (S3 = `ce9957f`; S1+S2 already ratified on `main` via merge `4e25129`; base lineage `main`)
**Producers:** Claude motor agents (S1/S2/S3); cortex assessment `claude-cortex-modknow-assess-01` (`mod-know-gap-assessment-001`, `bst/mod-know-assessment` @ `3ddfe41`)
**Prior ratified records:** `mod-know-s1-rev-001.md` (APPROVE, 0 findings); `mod-know-s2-rev-001.md` (APPROVE_WITH_NOTES, 1 LOW — walker cross-project read-path scope asymmetry)
**Review branch:** `claude/rev/mod-know-completion` FROM `bst/mod-know-s3-provider` @ `ce9957f`
**Governance:** AMD-002 advise-and-proceed. Independent review; verify-first. No push, no merge. READ-ONLY except this record.
**Status:** DRAFT — candidate advisory record, extend-only.

## Verdict

> **FINISHED_WITH_TRACKED_FOLLOWUPS**

MOD-KNOW delivers its bounded P0 catalog scope. Three of the four catalog capabilities are delivered, first-hand-verified, and adversarially sound:

- **Claims** ✓ — S1 lifecycle facade (`knowledge-claim-service.mjs`) wraps `KnowledgeLedger.appendClaim` with deny-by-default admission and producer/reviewer/approver SoD (G1, G2 closed).
- **Contradictions** ✓ — S2 sidecar records register claim-vs-claim conflicts as linkage, not verdicts, and surface them on the currency walk without blocking resolution (G3 closed).
- **Supersession** ✓ — S2 sidecar SUPERSEDES edges plus a `resolveCurrent` lineage walk answer "which version wins," fail-closed on branched/cyclic lineage (G4 closed). S3 (`knowledge-candidate-provider.mjs`) projects admitted-and-current claims into shape-perfect kind-`knowledge` CandidateSource entries (G6 closed).

The fourth capability, **provenance**, is *code-enforced at the ledger* — `appendClaim`'s learning boundary binds every `evidence_ref` to an accepted envelope via the injected resolver and asserts `verification_status ∈ {VERIFIED, ACCEPTED}` — but is **not end-to-end satisfiable** today: the accepted-evidence resolver and the MOD-EVID verify/accept ladder (MOD-EVID S2/S3) do not yet exist. G5 is therefore honestly **blocked** on a cross-module dependency, operator-gated. G7 (schema thinner than doctrine) is a partial, honestly deferred as an R3 contract change and correctly worked around via S2 sidecar records rather than mutating the closed contract.

The verdict is **not plain FINISHED**: the catalog capability "provenance" is a realizable mechanism whose end-to-end chain cannot close until the MOD-EVID ladder lands — the exact **MOD-WORK latent-but-structural precedent** (a mechanism delivered, gated, and tested, but not yet realized end-to-end because a scoped-out/cross-module integration is pending). It is **not NOT_FINISHED**: everything in the accepted assessment's bar is delivered, tested, and clean; the provenance gap was declared blocked (not skipped) in the assessment, the boundary is enforced in code today, and closing it is owned by MOD-EVID, not MOD-KNOW.

## Verification method

- `npm ci` → 6 packages, clean. Review branch created from `ce9957f` (target tip is itself the S3 commit).
- `node tools/validate-foundation.mjs` → exit **0**, 608 checks, all PASS (parsed programmatically).
- `node --test tests/*.test.mjs` → **tests 632 · pass 627 · fail 0 · skipped 5 · todo 0** — matches the producer claim exactly.
- S3 mapper behavior re-derived first-hand via a standalone adversarial harness against the REAL S1 + S2 + port + mint stack (not by re-reading producer tests). Harness was not committed.

## 1. Measured totals (exact)

| Metric | Claimed | Measured | Match |
|---|---|---|---|
| tests | 632 | 632 | ✅ |
| pass | 627 | 627 | ✅ |
| fail | 0 | 0 | ✅ |
| skipped | 5 | 5 | ✅ |
| validator exit | 0 | 0 | ✅ |
| validator checks | — | 608 PASS / 0 FAIL | — |

The 5 skips are pre-existing base-suite skips (`checkPairwiseDistinct skips absent parties`, `skipped transition fails closed`, and siblings); the S3 test file introduces **zero** skips/todos.

## 2. S3 adversarial outcomes (first-hand, real stack)

All results reproduced first-hand against a live real stack (`KnowledgeLedger` + `createKnowledgeClaimService` + `createKnowledgeLinkageService` + `normalizeCandidateSources` + `mintReceiptDocument`), not producer doubles unless noted.

### 2.1 Mapping honesty — no escapes found

| Hunted escape | Guard | Observed |
|---|---|---|
| `verified:true` for a non-`verified_true` status | `truth_status === "verified_true" && !contested` (line 219) | Only `kc_a` (verified_true, uncontested) → `verified:true`; all other statuses → `verified:false`. No escape. ✅ |
| Contested claim regains relevance / verified | `relevance: contested ? 0 : 1`; contested forces `verified:false` | Real-contradiction claim `kc_ct1` → included, `verified:false`, `relevance:0`. Contradiction is linkage, not a verdict; it never blocks resolution but is honestly annotated. ✅ |
| Classification widening | `VALID_CLASSIFICATIONS.includes(claim.classification) ? … : "INTERNAL"` | All real claims map to default `INTERNAL`; invalid label (`ULTRA`) → `INTERNAL`. No widening. ✅ (see Observation O1) |

### 2.2 Exclusion accounting invariant under a mixed batch

One projection over `["kc_a","kc_ct1","kc_old","kc_br"]` through the real stack:
- `kc_a` clean current → **included** (`verified:true`, `relevance:1`).
- `kc_ct1` contested (real `recordContradiction`) → **included** (`verified:false`, `relevance:0`).
- `kc_old` superseded (real `recordSupersession` by `kc_new`) → **excluded** `CURRENT_SUPERSEDED`, `current_claim_id: kc_new`.
- `kc_br` superseded (real edge to `kc_bx`) → **excluded** `CURRENT_SUPERSEDED`, `current_claim_id: kc_bx`.
- `accounting = { requested: 4, included: 2, excluded: 2 }`; `included + excluded === refs.length` holds. ✅

Each iteration pushes to exactly one of `sources`/`exclusions` (deny-by-default `continue`); nothing is silently dropped and nothing throws per-ref. Every exclusion `reason` is in the closed vocabulary and stamped with `stage: "knowledge-provider"`.

### 2.3 Feed-forward with adversarial claims (real port + real mint)

The two included entries (`kc_a` verified, `kc_ct1` contested/`verified:false`) normalized through the **real** `normalizeCandidateSources` with **ZERO** port-level exclusions — shape-perfect, because the mapper emits exactly the port's `SOURCE_KEYS` and the contested entry is still well-*typed* (the port judges types; values are judged downstream). The normalized candidates then minted a sealed Context Receipt: the contested `verified:false` candidate was correctly excluded **downstream** by the mint's `verification` stage (`reason: unverified`), so `source_references = ["kc_a"]` only, `version: 1`, 64-hex `content_hash`. The layering is exactly as designed — **KNOW reports honestly, CONTEXT judges** — a live contradiction lowers relevance and blocks the seal without ever blocking claim resolution.

### 2.4 Broken lineage — defense in depth

Attempting to create a **branched** lineage (a second superseder of `kc_br`) through the real record path was refused at record time: `DENY_ALREADY_SUPERSEDED`. Branched/cyclic broken lineage is therefore **structurally unreachable** through the real sidecar record path. The provider's `LINEAGE_BROKEN` translation path was verified against a fake S2 returning `DENY_BROKEN_LINEAGE`: it produces the correct typed exclusion carrying `lineage_issue: "branched"` and the verbatim passthrough `code`. Correct translation, and a stronger-than-required upstream guarantee.

### 2.5 Determinism, purity, freeze

- **Deterministic:** two identical calls produced byte-identical `sources`/`exclusions`; the clock is read once per projection so all `retrieved_at` are uniform (would drift under a per-ref advancing clock — the producer test proves this and I reproduced it). ✅
- **Purity / no state change:** the input query object was unmutated after projection; the provider holds no state, no I/O, no ledger authority; every collaborator is injected; output is deep-frozen (mutation attempts throw `TypeError`). ✅
- **Frozen surface:** the provider exposes only `toCandidateSources`; construction is fail-closed on every missing/malformed collaborator (`INVALID_CLAIM_SERVICE` / `INVALID_LINKAGE_SERVICE` / `INVALID_CLOCK`) and on an unusable clock (`DENY_CLOCK_UNAVAILABLE`). ✅

## 3. Observations (advisory, non-blocking)

- **O1 (INFO) — classification widening guard rests upstream, not in the mapper.** The mapper honors any `VALID_CLASSIFICATIONS` value verbatim, which *would* include a wider label (`PUBLIC`) than the `INTERNAL` default if a claim ever carried one. In practice this is unreachable: `contracts/knowledge-claim.schema.json` is `additionalProperties:false` and defines **no** `classification` field, so an S1-admitted claim can never carry one (mapper always defaults to `INTERNAL`), and the downstream mint applies a `classificationCeiling`. Residual risk is nil; the header's "never widens past it" is accurate for reachable inputs but is guaranteed by the schema + mint ceiling, not by the mapper in isolation. No change required; noted for honesty. The identical situation applies to `content_hash` (schema-absent, so always omitted — defensive carry branch).

## 4. G-coverage and module bar

| Gap | Status | Where closed | Verified |
|---|---|---|---|
| G1 — no claim lifecycle service | **closed** | S1 `knowledge-claim-service.mjs` | ✅ (S1 rev, re-confirmed via real-stack admission) |
| G2 — admission SoD absent | **closed** | S1 (producer/reviewer/approver pairwise-distinct, config-only kernel reuse) | ✅ |
| G3 — contradiction primitives missing | **closed** | S2 sidecar `recordContradiction` + surfaced on walk | ✅ (real contradiction included, annotated) |
| G4 — supersession semantics missing | **closed** | S2 sidecar SUPERSEDES + `resolveCurrent` walk | ✅ (real supersession excluded current-loser) |
| G5 — provenance chain unsatisfiable end-to-end | **blocked** | ledger boundary code-enforced (`appendClaim`); accepted-evidence resolver + MOD-EVID S2/S3 ladder absent | ✅ blocked-status honest; operator-gated cross-module |
| G6 — retrieval-as-provider adapter missing | **closed** | S3 `knowledge-candidate-provider.mjs` (pure mapper) | ✅ (feed-forward, zero port exclusions) |
| G7 — schema thinner than doctrine | **partial (deferred)** | R3 contract change; S2 sidecar avoids mutating the closed schema | ✅ honest deferral |

Module bar against catalog scope "Claims, contradictions, provenance and supersession": claims ✓, contradictions ✓, supersession ✓, provenance = **code-enforced at the ledger but end-to-end unsatisfiable until the MOD-EVID ladder exists**. This is the MOD-WORK latent-but-structural precedent → **FINISHED_WITH_TRACKED_FOLLOWUPS**.

## 5. Tracked follow-ups (governed, non-blocking to this verdict)

1. **[BLOCKER-for-full-FINISHED, cross-module] Close G5 provenance chain.** Deliver MOD-EVID S2 verify/accept ladder + S3 accepted-evidence resolver, then wire the resolver into the knowledge claim path so `appendClaim`'s learning boundary is satisfiable by real sealed→accepted envelopes end-to-end. Operator-gated; owned by MOD-EVID. Until then MOD-KNOW's provenance enforcement is real but latent.
2. **[R3 contract, deferred] G7 schema/doctrine convergence.** If/when doctrine fields (claim_type, scope, status_type, confidence, approver/admission_decision) must live in-schema rather than in sidecar records, that is an operator-gated `knowledge-claim.schema.json` contract change. Currently satisfied structurally via S2 sidecars.
3. **[LOW, carried from S2] Walker cross-project read-path scope asymmetry.** The S2 `resolveCurrent` walk follows a raw foreign-writer cross-project supersession edge on the READ path even though the service WRITE path denies cross-project supersession (`DENY_SCOPE_MISMATCH`). Read-path/write-path scope symmetry is the open item from `mod-know-s2-rev-001.md`; folded here as a module-level tracked follow-up.
4. **[INFO] O1 classification/content_hash defensive branches** — no action required; documented above.

## Advisory fields

- **truth_status:** verified_true (all claims re-derived first-hand from code at `ce9957f`; totals and validator parsed programmatically).
- **authority_status:** advisory_only (execution_requires_operator for any merge; this record has no execution or approval authority).
- **implementation_status:** existing (S1/S2 ratified) + candidate (S3 under this review); module-complete for in-scope gaps, G5 blocked, G7 partial.
- **risk_class:** low (S3 is a pure, unwired, additive mapper; no state, no I/O, no ledger authority; module-level residual risk is the cross-module G5 dependency, which is honestly blocked).

## self_certification

```yaml
self_certification:
  agent_id: claude-immune-rev-modknow-complete-01
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

## Provenance

- source: first-hand adversarial verification in an isolated worktree of C:\laragon\www\SecB
- agent_id: claude-immune-rev-modknow-complete-01 (BST-SA Immune, Claude Fable 5)
- timestamp: 2026-07-20
- verdict: FINISHED_WITH_TRACKED_FOLLOWUPS (advisory; operator authority required to merge)
