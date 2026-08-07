# MOD-LIVE-S1 Value-Mutation Fix — Cross-Lane Immune Review (crossrev-001)

**Reviewer identity:** `claude-immune-crossrev-live-s1-valmut-01` (BST-SA Immune, cross-lane)
**Review type:** CROSS-LANE (Claude immune reviewing a Codex-produced fix to code the Claude lane shepherded — LIVE-S1 event-family-policy, PR #36 + atomic-snapshot hardening PR #44)
**Target branch:** `bst/mod-live-s1-value-mutation-fix-001` (LOCAL-ONLY)
**Target tip:** `b5989d1` (own independent review) — code commits `24d5dcd` (N3 fix) + `5b93086` (guard repin)
**Branch base (merge-base):** `f78c4fb` (Merge PR #56) — NOTE: not current main. Current main is `f8bd37b`; this branch predates the S3 merges now on main.
**Timestamp:** 2026-07-21T10:34:02Z
**Prior records read (verified, not trusted):**
- `docs/03-project-control/candidates/mod-live-s1-value-mutation-fix-producer-verification-001.md` (producer, commit 24d5dcd)
- `docs/03-project-control/candidates/mod-live-s1-value-mutation-fix-independent-review-001.md` (own-branch REV/SEC review, commit b5989d1 — APPROVE_WITH_NOTES, raised finding N4)

---

## Verdict

**APPROVE_WITH_NOTES**

The narrowly-scoped N3 fix (single-read semantics for VALUES) is genuinely correct for its stated in-scope threat classes and does not regress any ratified LIVE-S1 behavior. It is safe to merge **for a PURE + UNWIRED evaluator with zero live callers**. One security residual (N4, below) — independently reproduced on this tree — must be tracked and closed or re-disclosed **before** `assessEnvelopeConformance` is wired to any consumer that could hand it a caller-controlled Proxy envelope. This cross-lane verdict independently corroborates the own-branch review's disposition.

---

## Rulings on the three mandated focus areas

### 1. Value single-read closure — ACHIEVED (in scope), with one residual (N4)

Independently rebuilt the attack on THIS tree (fresh differential PoC, not the committed suite):

- **Each field value read EXACTLY ONCE — CONFIRMED.** Instrumented all 8 conformance-field getters; invocation counts were all `1` (`{trace_id:1, span_id:1, sequence:1, prior_event_hash:1, fact_classification:1, content_capture_level:1, redaction_status:1, evidence_candidate:1}`). `event_type` is read once via destructuring extraction in `classifyEventType` (`({ eventType } = input)`), unchanged from the WSPACE-S1-lesson single-read. The value used for the present/absent decision is byte-identical to the value that produces the finding: a single local `value` → `present`, with the finding push guarded by `if (!present)`. No decide-on-X / report-Y divergence path exists.
- **N3 PoC A/B/C/D genuinely closed.** Independently reproduced PoC B (a plain-object `trace_id` getter that nulls a genuinely-present `span_id`): result `ok:true`, no `MISSING_SPAN_ID` — the Phase 1 descriptor snapshot captures `span_id`'s value before any Phase 2 getter runs, so the forge fails. PoC A/C/D covered by the committed suite (34/34 pass) and consistent with the mechanism.
- **Presence single-read PRESERVED (not regressed).** `Reflect.ownKeys(envelope)` is still one structural call; the "captures the own-key set in EXACTLY ONE ownKeys invocation" test passes; the N2 inject-a-sibling-key test still shows presence decided solely from the pre-captured Set (injected key never looked up). N1 (key inject/delete) and N2 (descriptor-trap key presence) key-presence guarantees are intact.

**Mechanism (verified sound for plain objects):** Phase 1 captures `Object.getOwnPropertyDescriptor` for each present doctrine field — for a plain object this runs ZERO user code (a getter is captured as a `.get` reference, never invoked; a data property's `.value` is materialized once). Phase 2 resolves each field strictly from its own captured descriptor (`.value`, or one call to the captured `.get`), never re-reading `envelope[key]`. An earlier field's Phase 2 getter therefore cannot alter any sibling's already-captured descriptor. This closes the N3 plain-getter and honest-Proxy-`get` value-forge vectors with certainty.

### 2. No regression to ratified LIVE-S1 behavior (PR #36 + #44) — CONFIRMED

Reran the ratified-behavior tests; all pass:
- **19-family classification** — "every one of the 19 families classifies positively" PASS.
- **Deny-by-default** — non-object / missing-key / prototype-smuggled / non-string / empty / blank / null-byte / undotted / leading-dot / trailing-dot / unknown-family all deny; unknown family is `DENY_EVENT_FAMILY_UNKNOWN`, never a guessed family. PASS.
- **8-element conformance findings** — minimal schema-valid event surfaces all eight doctrine findings; fully-conformant yields zero; partial surfaces only absent. PASS.
- **Doc-parity (1:1 vs live doc)** — `EVENT_FAMILIES` matches the SECB-LIVE-EVENT-001 fenced list verbatim and in order; every conformance element cites a doctrine phrase verbatim. PASS.
- **Descriptor-trap / ownKeys TOCTOU key-presence inertness** — throwing traps contained to denial; delete-a-not-yet-read-sibling fails CLOSED (deny, never a fabricated finding). PASS.
- **Frozen outputs / input never mutated** — output frozen at every level; input event never mutated. PASS.

Full suite: **1086 tests, 1081 pass, 0 fail, 5 skip.**

### 3. The guard repin (5b93086) — CLEAN (not a weakening)

Diffed `5b93086` in full. It touches only `tests/replay-assembler.test.mjs` (+6 / -1):
- Updates the `PINNED_BLOBS` entry for `src/live/event-family-policy.mjs` from the pre-fix blob `75b30a38…` to `47ebc9bb…`, plus 5 explanatory comment lines.
- **Independently recomputed** the new pinned hash: `git rev-parse b5989d1:src/live/event-family-policy.mjs` = `47ebc9bb7e5190c6f0f78232884379b3c284248d` = the pinned value. The file legitimately changed (the N3 fix), so tracking the new authorized blob is the correct action — precedent matches MOD-WSPACE-S3's `validate-foundation.mjs` repin.
- **No guarded path dropped, no assertion loosened.** All other pins remain (`intervention-and-replay.md`, `event-envelope.md`, `scorecard-assembler.mjs`, `write-set-policy.mjs`, workspace-lease schema, `validate-foundation.mjs`, `package.json`). The enforcement body (`assert.equal(gitBlobSha1(rel), pinned)`) is unchanged — repin, not exclusion.
- **Tamper spot-check (empirical):** appended a comment to the pinned `event-family-policy.mjs`; the `byte-identity` guard FAILED (`AssertionError: … blob-identical`); restored to clean. The guard remains tamper-sensitive after the repin.
- The `+7` in `replay-assembler.test.mjs` is exactly this repin (net +6 vs base) — a clean repin, not a weakening.

---

## Scope confirmation

- **Only** `src/live/event-family-policy.mjs` changed in `src/` (isolated vs merge-base `f78c4fb`). The three other `src/` matches for "event-family-policy" are house-style **comments**, not imports.
- **Unwired preserved:** the sole importer of `event-family-policy` is `tests/event-family-policy.test.mjs`. **Zero production callers.** The module is PURE + UNWIRED.
- **Deep-frozen outputs intact:** `Object.freeze({ ok:true, findings: Object.freeze(findings) })`, each finding frozen; `deny()` returns frozen. Purity test passes.
- **Byte-identity of other read files vs base preserved** (both byte-identity guards pass at 1081/0).

---

## Findings by severity

### F1 — N4 residual: Phase 1 re-introduces a hostile `getOwnPropertyDescriptor` value-forge vector — **Medium (if wired) / Low (dormant, unwired)**

Independently reproduced on this tree. A Proxy with honest `ownKeys` + `get` traps but a **hostile `getOwnPropertyDescriptor` trap** can silently forge a sibling field's captured value during Phase 1: my PoC drove a present `span_id` ("REAL-SPAN") to `null` inside the descriptor trap and got `ok:true` with a **fabricated `MISSING_SPAN_ID`** finding and **no denial** — the `if (!descriptor) throw` fail-closed check does not fire because the descriptor is defined (just with a forged `.value`). This is functionally equivalent to N3 one layer down, Proxy-only.

Immune note on why this is more than "a new residual": the **prior N2 hardening (PR #44) had specifically eliminated the `getOwnPropertyDescriptor` trap as inert** ("never invoked at all"). This fix **re-introduces** one `getOwnPropertyDescriptor` trap invocation per present doctrine field to capture values — trading the N3 `get`-trap value channel for a `getOwnPropertyDescriptor`-trap value channel. For plain objects this is a strict improvement (no user code, N3 closed). For Proxies it is lateral: the value-forge surface moves rather than closes. The module's own doc comment honestly discloses both the re-introduction and this residual, and the own-branch review already raised it (as N4 / folded under NOVEL-5).

**Disposition:** does NOT block merge of this narrowly-scoped fix — key presence remains impervious, the fix is correct for its in-scope plain-object/honest-Proxy classes, and the module is PURE + UNWIRED so no live path can supply a caller-controlled Proxy today. **Immune gate condition:** N4 MUST be tracked and closed (or explicitly re-disclosed and risk-accepted) **before** any slice wires `assessEnvelopeConformance` to a consumer capable of passing a Proxy-shaped envelope. This is an authority boundary, not an approval.

### F2 — Provenance: cross-slice review record not in MANIFEST — **Informational**

`mod-live-s1-value-mutation-fix-independent-review-001.md` is present on the branch but **not registered in `MANIFEST.json`** (only the producer-verification record is). Not a validator failure (validator exits 0), but for provenance completeness the review record is untracked. Minor; flag for the operator/producer lane.

### Security / authority scan — CLEAN

No secret-scan hits. No policy or authority-boundary violations. No security gate weakened. No blocked action attempted. The fix stays within advisory/PURE+UNWIRED bounds.

---

## Regression / gate evidence

| Gate | Result |
|------|--------|
| `npm test` (full) | **1086 tests / 1081 pass / 0 fail / 5 skip** |
| `tests/event-family-policy.test.mjs` (standalone) | 34 / 34 pass |
| `npm run validate` | **exit 0** — all PASS; `schemas.count` = 7 canonical + 10 governed = **17** |
| Merge-cleanliness vs main `f8bd37b` (scratch `merge-tree`) | **CLEAN, 0 conflicts** |
| Byte-identity guard tamper spot-check | Guard FAILS on tamper (correct), restored clean |

**Baseline note:** current main `f8bd37b` reports `1093/1088/0/5`; this branch reports `1086/1081/0/5`. The −7 is the S3 work merged onto main *after* this branch's base `f78c4fb` (not a regression). The branch's own baseline (`1086/1081/0/5`, 0 fail) matches the producer's post-repin disclosure exactly.

**Merge-cleanliness detail:** both main and this branch modified `tests/replay-assembler.test.mjs`, yet the 3-way merge is clean (non-overlapping regions). Main still pins `event-family-policy.mjs` at the stale pre-fix hash `75b30a38…` (main is unaware of N3); the merged tree correctly adopts this branch's post-fix pin `47ebc9bb…` (single entry, no duplication) — so the byte-identity guard would PASS post-merge. Verified against the written merge tree.

---

## Advisory status fields

- `truth_status`: verified_true (N3 closure, single-read, no-regression, clean guard-repin, clean merge all independently reproduced); the N4 residual is verified_true as an open item.
- `authority_status`: advisory_only — does not authorize merge, does not declare production.
- `implementation_status`: existing (fix is complete for its scope); N4 = candidate/tracked residual.
- `risk_class`: low (dormant, PURE + UNWIRED) — rises to medium if `assessEnvelopeConformance` is wired to a Proxy-capable consumer without closing N4 first.

```yaml
self_certification:
  agent_id: claude-immune-crossrev-live-s1-valmut-01
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

> Cross-lane immune advisory only. Both lanes can self-certify; neither can self-authorize. Merge and production remain operator authority.
