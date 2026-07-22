# MOD-CONTEXT S2/S3 (CandidateSource Provider Port + Shape-Convergence) — SECOND Independent Review

**Record ID:** MOD-CONTEXT-S2-S3-SECOND-REV-001 / mod-context-s2-s3-second-independent-review-001
**Status:** ADVISORY — reviewer verdict, not an authorization
**Reviewer:** claude-immune-rev-modcontext-s2s3-second-01 (BST-SA immune role, independent — no relationship to the S1/S2/S3 producer, to the S1-only reviewer (`40c461b`), or to the module-completion reviewer (`315e131`/`mod-context-completion-rev-001.md`); that completion review is read for context only, its account is not trusted, and every claim it makes about S2/S3 is independently re-derived here)
**Date:** 2026-07-21
**Review target:** `main` @ `ec5aa76` (current tip at review time); MOD-CONTEXT S1 `ebb543f`, S2 `37352c6`, S3 `017318b`, merged via PR #15 (`64d5c79`)
**Method:** independent, adversarial, first-hand. Isolated detached-HEAD worktree at `C:/Users/ounkh/AppData/Local/Temp/claude/secb-worktrees/mod-context-s2s3-review`, cut from `origin/main` @ `ec5aa76`, no live branch touched. `npm ci`, full `npm test`, the module's five own test files run standalone, full read of `candidate-source-port.mjs` (S2), `context-federation-service.mjs` (S1+S2+S3), `context-retrieval-policy.mjs`, `knowledge-candidate-provider.mjs` (the MOD-KNOW supply side of the same B1 boundary), the S3 convergence decision record, and the one existing MOD-CONTEXT completion review — plus six hand-written adversarial probes not shipped with the candidate (`adv_s2s3_indep.mjs`, run standalone in the worktree, deleted before commit).

---

## Verdict

**APPROVE_WITH_NOTES**

S2 and S3 are, independently verified, exactly what they claim to be: an optional, additive, fail-closed typed shape-validation port (S2) and a read-only lifecycle-facet projection plus a convergence *decision document* (S3, not live convergence code). Every malformed-entry vector I threw at the port was excluded, never silently coerced into an accepted candidate — this project's now-familiar "MOD-GOV-class" bug (a malformed collaborator shape silently downgrading a deny into an allow) is **not present here**, and I ran the same class of adversarial probe used to find that bug elsewhere before concluding this. The mint→issue boundary correctly re-verifies the candidate pool at issuance time rather than trusting the mint-time computation, so there is no check-then-act gap there either. Receipt binding is sound: the seal covers `receipt_id`/`project_id`/`source_references` together, so a document minted for one receipt cannot be substituted onto another.

I did find one genuine, but **not currently live**, architectural gap the completion review's S2 adversarial matrix did not test for and does not mention: **the port has no provider-identity or registration concept at all.** `kind` and `provenance.origin` are entirely self-declared, free-form fields with zero binding to which actual provider (MOD-MEM, MOD-KNOW, MOD-WORK, or an impostor) supplied the entry, and there is no `registerProvider`/allow-list anywhere in the codebase gating who may claim to be a given kind. This is not exploitable today because (a) nothing wires multiple providers into one aggregator yet — S2 and the MOD-KNOW S3 supply-side mapper are both explicitly "PURE, UNWIRED" per their own headers, and (b) `kind` has **zero effect** on the actual ALLOW/DENY retrieval decision — `runRetrieval` never reads `candidate.kind` at all, only `projectId`/`classification`/`current`/`verified`/`resolvable`/`relevance`. So a spoofed `kind`/`origin` today changes nothing. But this is exactly the boundary the task background calls "the central risk" (federating data across MOD-KNOW/MOD-MEM/MOD-WORK), and nothing in S2, S3, or the crosswalk record states who is expected to authenticate provider identity once an aggregator exists. Flagging this now, before that wiring lands, is cheaper than finding it after. Non-blocking; a note for the next wiring slice, not a defect in what shipped.

No BLOCKER/HIGH findings. One MEDIUM (forward-looking, provider-identity binding — see §2). Two LOW/INFO notes (§4, §5).

---

## 1. Test verification (first-hand)

- `npm ci`: clean install, 6 packages, no vulnerabilities reported.
- `npm test` (full suite, current `main` @ `ec5aa76`): **tests 1115 / pass 1113 / fail 0 / skipped 2.** (The prior completion review measured 463/458/0/5 at the pre-merge branch tip `017318b`, before other modules' subsequent merges added the remaining ~650 tests now on `main`; no discrepancy — different commit, more total tests, all green.)
- `node --test tests/candidate-source-port.test.mjs tests/knowledge-candidate-provider.test.mjs tests/context-federation.test.mjs tests/context-federation-lifecycle-facets.test.mjs tests/context-federation-stubs.test.mjs` in isolation: **55/55 pass, 0 fail.**
- Hardcoded test-ID / environment branching: `grep` across `src/services/candidate-source-port.mjs`, `context-federation-service.mjs`, `knowledge-candidate-provider.mjs`, `context-retrieval-policy.mjs` for test-id/debug/bypass patterns: **zero hits.** (Two unrelated `actorId ===` hits in `handoff-service.mjs`/`work-package-service.mjs` are legitimate SoD self-accept guards, not test backdoors.)

## 2. Provider impersonation / registration gate (MEDIUM, forward-looking, not currently live)

**Question posed by the task:** can a registered provider return data misattributed to a different provider, and is provider registration itself gated?

**Answer, verified first-hand:** there is no provider *registration* at all — `grep -rni "registerprovider\|provider registry" src/` across the whole tree returns zero hits. `normalizeCandidateSources` (the S2 port) validates only the **shape** of each entry (`entryDefect`, candidate-source-port.mjs:86-114): types, enum membership, id charset, provenance object shape. Nothing ties `entry.kind` or `entry.provenance.origin` to the identity of whatever code assembled the array before calling the port. Adversarial confirmation (`adv_s2s3_indep.mjs`):

```
check: kind is decorative — runRetrieval ignores candidate.kind entirely
  -> a "memory"-kind entry and an "operator"-kind entry, identical otherwise,
     produce IDENTICAL retrieval outcomes. Confirmed by reading
     context-retrieval-policy.mjs (7-stage pipeline never reads .kind) and by
     direct execution.
check: port has no cross-check binding provenance.origin to kind or a registry
  -> entry { kind: "memory", provenance.origin: "knowledge-ledger" } is
     accepted with ZERO exclusions. Nothing detects the mismatch because
     nothing defines what a "correct" origin for a given kind even is.
check: no provider registry exists — 5/5 kinds accepted from one arbitrary
  self-declaring caller with a single made-up origin string, zero
  authorization check.
```

**Why this is not a live bug today:** (1) `kind` has no bearing on any ALLOW/DENY path — it is carried through as metadata only, so misattributing it changes nothing about what gets included in a receipt's `source_references` today. (2) There is no aggregator anywhere in `src/` that combines candidate arrays from more than one provider — `grep -rn "candidateSources" src/**/*.mjs` outside the two S2/S1 files hits only the single-source self-pilot fixtures (`src/self-pilot/fixtures.mjs`, `read-only-self-pilot.mjs`). The MOD-KNOW S3 supply-side mapper (`knowledge-candidate-provider.mjs`) is itself explicitly "PURE MAPPER... nothing wires this module," matching S2's own "nothing existing calls this module" disclosure. So today there is no live path where a second, adversarial CandidateSource provider's output could actually reach a real federation decision alongside a trusted one.

**Why it is still worth a note now:** the task background states multiple modules (MOD-KNOW, MOD-MEM, MOD-WORK) are expected to register as CandidateSources, and the S3 convergence record explicitly treats `kind` as something that will matter later ("kind evolution is a contract change and stays operator-gated," candidate-source-port.mjs:31-33). Once a real aggregator exists that calls two or more providers and merges their output before minting, the port as currently specified provides **no mechanism** to prevent one provider's output from claiming another's `kind`/`origin`, and no document anywhere assigns that authentication responsibility to a specific layer (the aggregator? the port? a future registry?). Recommend the next wiring slice either (a) have the aggregator stamp `kind`/`origin` itself from the calling provider's own registered identity rather than trusting provider-supplied values, or (b) extend the port to accept a `kind` only from a caller-supplied trusted-provider parameter rather than reading it out of the untrusted entry. Non-blocking for the already-merged S2/S3; blocking-in-spirit for whatever PR first wires two providers together.

## 3. Shape-convergence (S3) — no MOD-GOV-class coercion, because there is no live convergence code to coerce

The task asks whether shape-convergence "silently coerces/drops/ignores" a malformed provider response instead of failing closed — exactly the bug class just found in MOD-GOV (a PDP downgrading DENY to ALLOW on a malformed collaborator-output shape). I verified this by reading, not by trusting the completion review's characterization:

- `context-receipt-shape-convergence-001.md` is a **crosswalk document** (36 concepts across three receipt shapes, disposition-tagged canonical/rename/deprecate/schema-evolution) — a decision *input* for a future operator-gated schema change (OP-1..OP-4). It contains no executable code and converges nothing at runtime. There is no live code path that ingests heterogeneous provider-declared shapes and normalizes/coerces them into one federated shape — so the specific MOD-GOV bug class (malformed shape silently degrading a deny into an allow) has no analogous surface in S3 to exhibit it on.
- The only S3 **code** is `#lifecycleFacets` in `context-federation-service.mjs` (lines 344-353): a pure, read-only derivation of `effective_status`/`expired`/`consumed` from already-validated in-service record state (`record.status`, `record.expiresAt`, `record.ledger`). It is never fed untrusted external input — its only inputs are the service's own internal record fields, which are themselves already validated at issue/compact time. There is no "malformed provider response" for this function to mis-handle, because it never receives provider responses.
- Confirmed the facets do not touch the authority path: `#resolveHead` (the actual ALLOW/DENY gate for verify/consume) computes its own independent expiry/session/baseline checks and never calls `#lifecycleFacets`; the facets are additive fields on the `getReceipt` return object only.

**Conclusion:** S3 as shipped genuinely has no shape-convergence *runtime* — it correctly, honestly ships only the decision document and the (unrelated) lifecycle read-model. This matches the completion review's own characterization ("G2... tracked followup, honestly... a decision INPUT does not by itself satisfy the catalog bar as done") and I confirm that characterization independently rather than merely repeating it. The eventual schema-convergence implementation (OP-1..OP-4, when built) will be the place to re-run this exact adversarial class — recommend this review be cited as the baseline probe set for that future slice.

## 4. Receipt binding / mint-issue confusion — sound, independently re-verified with a live adversarial run

Ran a fresh (not producer-shipped) probe simulating exactly the check-then-act shape the task asked about: mint a receipt while a candidate is `verified:true`, then attempt to issue the same sealed document after the same-ref candidate has become `verified:false` in between (simulating a provider revoking/expiring between mint and issue):

```
mintReceiptDocument(...) with candidatePool=[{ref:"src-1", verified:true, ...}]
  -> document.source_references === ["src-1"], sealed via content_hash.
issueReceipt({ document, candidateSources: [{ref:"src-1", verified:false, ...}], ... })
  -> DENY_SOURCE_MISMATCH (thrown, code verified)
```

`issueReceipt` does **not** trust the mint-time survivor set baked into the sealed document; it independently re-runs `runRetrieval` against whatever `candidateSources` the issue call is given and requires the result to exactly equal `document.source_references` (context-federation-service.mjs:210-222). This closes the check-then-act gap the task explicitly asked me to look for at the mint/issue boundary. I also confirmed the seal (`sealBody`, content_hash) covers `receipt_id`, `project_id`, and `source_references` together in one canonical fingerprint — a document minted/sealed for one receipt cannot be replayed against a different `receipt_id`/`project_id` without invalidating the seal, so there is no receipt-confusion substitution vector at this boundary. `exclusions_digest` (the S2 sibling artifact) is, confirmed by grep, never read by any ALLOW/DENY path anywhere in the service — it is purely advisory today, so a hypothetical "digest swapped across two mint calls" scenario has no live security consequence (matches the record's own "sibling, not sealed" disclosure).

## 5. Prototype-pollution / fuzz sweep on the port (confirms fail-closed, no new finding)

Re-ran (with fresh vectors, not the shipped fixtures) `__proto__`/`constructor` ids, non-object entries (`null`, `42`, arrays, booleans), unknown-field smuggling, wrong-typed `verified`, and a `__proto__`-nested provenance object designed to attempt prototype pollution via `JSON.parse`. All were excluded with a typed reason (never coerced into `candidates`); `Object.prototype` was confirmed unpolluted after the run. This corroborates, rather than merely repeats, the completion review's S2 matrix — same conclusion, independently reproduced with different vectors.

## 6. Bug-class sweep (this project's recurring findings)

| Class | Result |
|---|---|
| Hardcoded test-ID / environment branching | None found in the four S2/S3-relevant source files (§1). |
| Silent-fail-open shape coercion (MOD-GOV class) | None found — S2 excludes-never-repairs on every malformed vector tried; S3 has no runtime shape-convergence surface at all (§3). |
| Provider impersonation / cross-boundary misattribution | **Genuine gap, not currently live** — no registration or identity binding exists for `kind`/`provenance.origin` (§2). |
| Receipt-confusion / substitution | None found — seal binds identity fields together; mint-time survivor set is independently re-verified at issue time, never trusted as-is (§4). |
| Check-then-act / TOCTOU | None found at the mint→issue boundary (re-verified live, §4). The S3 lifecycle facets are synchronous pure derivations with no async gap. |
| SoD / duplicate-identity gap | Not applicable to this slice — no actor/role decisions are made in S2/S3. |

## 7. Advisory status fields

```yaml
truth_status: verified_true          # all evidence read/executed first-hand on origin/main (ec5aa76) in an isolated detached-HEAD worktree; 1115/1113/0/2 full suite; 55/55 module-specific; six novel adversarial probes run and their outcomes recorded above
authority_status: advisory_only      # second independent reviewer verdict; no push, no merge, no authorization implied
implementation_status: existing      # S1/S2/S3 are already merged to main (PR #15); this record reviews them, it does not propose new work
risk_class: medium                   # core S2 port and S3 read-model are sound, additive, unwired, no live authority-path change; the provider-identity binding gap (S2) is genuine but currently unreachable, and should be closed before (not after) any real multi-provider aggregator is wired
```

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

---

*Provenance — source: independent second-opinion review of `main`@`ec5aa76` (MOD-CONTEXT S1 `ebb543f` + S2 `37352c6` + S3 `017318b`, merged via PR #15 `64d5c79`) against the one existing MOD-CONTEXT completion review (`mod-context-completion-rev-001.md`@`315e131`), which held a broad/holistic scope and gave S2/S3 no dedicated adversarial slice-level pass. No relationship to the producer or to any prior reviewer of this module. Timestamp: 2026-07-21. Agent ID: claude-immune-rev-modcontext-s2s3-second-01. Cross-links: `mod-context-gap-assessment-001.md` (G2-G4, G6, boundary B1), `mod-context-completion-rev-001.md` (module-completion verdict this record independently re-derives rather than trusts), `context-receipt-shape-convergence-001.md` (S3 decision record, re-verified as non-executable in §3), `mod-context-s1-rev-001.md` (S1-only prior review, read for context), `MANIFEST.json`.*
