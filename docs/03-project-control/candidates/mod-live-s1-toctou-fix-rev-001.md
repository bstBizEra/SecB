# MOD-LIVE S1 TOCTOU Fix — Independent Cross-Lane Review: N1 closure in `assessEnvelopeConformance`

**Record ID:** mod-live-s1-toctou-fix-rev-001
**Status:** DRAFT / ADVISORY — NOT EFFECTIVE
**Reviewer:** claude-immune-rev-live-toctou-01 (BST-SA immune, independent cross-lane review gate; the fix was produced in the operator's other session)
**Date:** 2026-07-21
**Review target:** branch `bst/mod-live-s1-toctou-fix-001` @ `4445cc303f84448024cf3a669159f42f89aad956`
**Base:** `main` @ `332b7ab` (confirmed: `4445cc3^` = `332b7ab`, "Merge pull request #37 from bstBizEra/bst/mod-wspace-s1-staged")
**Binding finding under closure:** N1 (MEDIUM) in `mod-live-s1-event-family-second-independent-review-001.md` (on `main` since PR #39) — cross-field TOCTOU: a getter on an earlier-checked doctrine field mutates a later-checked sibling field mid-iteration, fabricating or suppressing that sibling's finding, with the check order publicly discoverable via the exported `DOCTRINE_CONFORMANCE_ELEMENTS`.
**Files changed by the fix (`git show --stat 4445cc3`):** `src/live/event-family-policy.mjs` (+56/-5), `tests/event-family-policy.test.mjs` (+97), `docs/03-project-control/candidates/mod-live-s1-toctou-fix-producer-verification-001.md` (+203), `docs/03-project-control/candidates/module-completion-tracker-001.md` (+1). Four files; no source drive-bys.
**Method:** clean-room `npm ci`; source and diff read line by line; the two documented N1 exploits and three novel variants reproduced first-hand via throwaway `node` probe scripts (`scratch-immune-probe.mjs`, `scratch-proxy-confirm.mjs`, `scratch-classify.mjs`, all deleted after use, never committed) run directly against the committed module; full suite, validator, and a scratch merge against a later `main` tip reproduced independently.

---

## Verdict: APPROVE_WITH_NOTES

The fix closes the **exact documented N1 exploits** — the getter-driven cross-field deletion and injection, in both directions — and does so cleanly, additively, with no regression to `classifyEventType`, the 26 pre-existing tests, the full suite, the validator, or merge-cleanliness. It is a genuine net-positive to the module's fail-closed posture (it also incidentally kills the Proxy `has`-trap vector, since the fix no longer calls `Object.hasOwn` on the caller-supplied envelope at all).

However, adversarial probing surfaced **one residual (N2, MEDIUM)**: the *same cross-field TOCTOU class* N1 belongs to remains reproducible when the envelope is a **`Proxy` carrying a `getOwnPropertyDescriptor` trap**. Pass 1's "atomic snapshot" is a loop of eight *separate* `Object.getOwnPropertyDescriptor(envelope, element)` calls; on a Proxy each call is arbitrary user code, executed sequentially in the public `DOCTRINE_CONFORMANCE_ELEMENTS` order, so an earlier element's trap can inject or delete a later element **before that later element's descriptor is captured**. Both suppression and fabrication reproduced. The module remains **PURE + UNWIRED** (zero consumers), so — exactly as for N1 itself — the current live blast radius is zero, which is why this is APPROVE_WITH_NOTES and not REWORK_REQUIRED. N2 is a *newly surfaced* variant of the same class, not a failure to deliver the agreed fix (see "Why not REWORK" below).

---

## Findings by severity

**CRITICAL:** none. **HIGH:** none.

**MEDIUM**
- **N2 (novel, residual of the N1 class) — `assessEnvelopeConformance`'s snapshot is not atomic for a `Proxy` envelope; cross-field suppression and fabrication remain reproducible via a `getOwnPropertyDescriptor` trap.**
  Pass 1 is `DOCTRINE_CONFORMANCE_ELEMENTS.map((spec) => Object.getOwnPropertyDescriptor(envelope, spec.element))`. For a plain object this invokes no user code and is genuinely atomic. For a `Proxy` (which passes `isPlainAssessableObject`: `typeof === "object"`, non-null, non-array — see I4 of the binding review), each of the eight calls fires the Proxy's `getOwnPropertyDescriptor` trap, i.e. arbitrary code, in element order, *inside* Pass 1. A trap keyed on `trace_id` (index 0) that runs `target.evidence_candidate = true` injects the last element before its own descriptor is captured at index 7 → `MISSING_EVIDENCE_CANDIDATE_FLAG` is **suppressed** (verified: finding absent). A trap keyed on `span_id` (index 1) that runs `delete target.sequence` deletes index 2 before its descriptor is captured → `MISSING_SEQUENCE` is **fabricated** (verified: finding present though `sequence` was on the object at call time). This is the identical observable effect N1 described, achieved through a Proxy trap instead of a data-property getter — and Proxy traps are explicitly inside the module's own stated threat model (the shipped suite already exercises throwing get/has traps per field).
  *Not a regression:* the pre-fix module (`4445cc3^`) was equally vulnerable to this vector (its `Object.hasOwn(envelope, …)` also fires the trap), reproduced and confirmed. The fix neither introduced nor removed it.
  *Why MEDIUM:* module is UNWIRED — no consumer acts on these findings today, so nothing live can be fooled; latent robustness gap, mirroring N1's own severity rationale.
  *Gate:* close or explicitly scope out before `assessEnvelopeConformance` is wired into any consumer, and before S2/S3 reuse this iteration pattern. Candidate remediations: reject exotic/non-plain envelopes up front (e.g. brand-check or `Reflect`-free structural clone into a null-proto data-only object before assessment), or document Proxy envelopes as an accepted, out-of-scope input class. Note: the binding review's own suggested remediation (`Object.getOwnPropertyDescriptors(envelope)` once, up front) would **not** close N2 either — that plural call also drives one trap invocation per key sequentially — so N2 is a class-level residual, not a shortfall against the agreed remediation.

**LOW**
- **L1 (doc-accuracy) — the fix's inline comment and commit message overclaim closure.** The comment states Pass 1 "Reading a property descriptor never invokes a getter … so no getter runs during this pass and **no side effect can occur here**," and the commit states "A sibling getter's side effect can no longer change another field's already-decided presence." Both are true only for plain objects and for the *getter* vector; both are false for a `Proxy` envelope (a `getOwnPropertyDescriptor` trap is a side-effecting operation that runs during Pass 1). Recommend narrowing the claim to "plain data/accessor properties" and cross-referencing N2 so the residual is not mistaken for closed.

**INFORMATIONAL (positive confirmations)**
- **I1 — documented N1 exploits closed, both directions.** Injection (getter on `trace_id` sets `evidence_candidate`): `MISSING_EVIDENCE_CANDIDATE_FLAG` **still present** post-fix. Deletion (getter on `trace_id` deletes `sequence`): `MISSING_SEQUENCE` **not fabricated** — finding reflects first-snapshot state. Both reproduced against the committed module.
- **I2 — novel getter variants closed.** (a) later field's getter (`evidence_candidate`) deletes earlier fields (`trace_id`, `span_id`) → earlier fields, already decided from snapshot, are **not** flagged; the "vice versa" earlier→later direction likewise closed. (b) getter that swaps the whole envelope prototype to a donor defining all doctrine fields as inherited getters → prototype-injected fields **not** counted present (own-only presence rule holds); only the own `trace_id` getter counts.
- **I3 — Proxy `has`-trap vector eliminated.** The fix removed `Object.hasOwn(envelope, …)`; a Proxy `has` trap never fires during assessment (verified: trap not invoked). This is a strict improvement over pre-fix.
- **I4 — single-read / invocation-count discipline intact.** Every doctrine field's accessor is invoked **exactly once** (verified counts: all 8 = 1). A data property's value is taken from the captured descriptor with no live re-read.
- **I5 — `classifyEventType` behaviorally unchanged.** Probed unknown (`foo.bar` → `DENY_EVENT_FAMILY_UNKNOWN`), case-sensitivity (`SESSION.start`, `Session.start` → unknown), confusables (`sessión.start` → unknown; full-width `session．start` → `DENY_EVENT_TYPE_MALFORMED`), substring non-confusion (`sub.foo` unknown vs `subagent.foo` ok), prototype-key smuggling (rejected). All fail-closed and consistent with the reviewed baseline.

---

## Snapshot-discipline confirmation (checklist item 2)

- **All doctrine fields snapshotted before iteration:** yes, for plain objects. Pass 1 captures all eight own-property descriptors in one uninterrupted `map` before any conditional logic or value read; descriptor reads on a plain object invoke no user code, so no side effect can occur during Pass 1 (the sole exception is the `Proxy`-trap case = N2).
- **Each field read exactly once:** confirmed by invocation-count probe (all getters = 1). A data property is read from `descriptor.value` (no envelope re-lookup); an accessor is invoked once via `descriptor.get.call(envelope)`.
- **Exported `DOCTRINE_CONFORMANCE_ELEMENTS` order now harmless — why:** for a plain envelope Pass 1 runs zero user code, so the order in which descriptors are captured cannot cross-contaminate any presence decision; Pass 2 reads only from the frozen snapshot, so the order of value reads/getter invocations cannot change any already-fixed presence determination. Order affects only the ordering of findings in the output array, not their content. (For a `Proxy` the order becomes exploitable again — that is precisely N2.)

---

## Regression evidence (checklist items 3–4)

- **Full suite (`npm test`):** tests **846**, pass **841**, fail **0**, skipped **5** — matches the producer's stated `846/841/0/5`.
- **Validator (`npm run validate`):** exit **0** (`status: PASS`).
- **Test-file change is additive only:** 26 → 29 tests; `git diff 4445cc3^ 4445cc3 -- tests/…` shows **no removed lines** in the test file — the original 26 are byte-unchanged, three N1 regression tests appended (deletion, injection, control).
- **Diff scope:** limited to the fix + tests + producer record + a one-line tracker append; no unrelated source touched.
- **Merge-cleanliness vs a later `main`:** scratch `git merge --no-commit --no-ff e4b092d` into `4445cc3` → "Automatic merge went well," **zero conflicted paths** (aborted after inspection).

---

## Why not REWORK

N2 is a real MEDIUM finding, but blocking this fix would be disproportionate: (1) it delivers exactly its stated scope — the documented, reproduced N1 exploits are closed, both directions; (2) N2 is a *newly surfaced* variant of the same class (this cross-lane review's contribution, analogous to how the second review surfaced N1 beyond the first), pre-existing in the module and **not a regression**; (3) the binding review's own suggested remediation would not have closed N2 either; (4) the module is UNWIRED, so N2's live blast radius is zero today; (5) the fix strictly improves posture (all getter vectors + the Proxy `has`-trap closed). The proportionate immune action is to approve the merge with N2 and L1 recorded as a hard **pre-wiring gate**, identical in spirit to how N1 itself was dispositioned (APPROVE_WITH_NOTES, close before wiring). Operator-only merge stands; this record neither merges, pushes, nor activates anything.

---

## Advisory status fields

```yaml
truth_status: verified_true            # documented N1 exploits closed and N2 residual both reproduced first-hand at 4445cc3
authority_status: advisory_only
implementation_status: existing        # fix code exists on bst/mod-live-s1-toctou-fix-001 as reviewed
risk_class: medium                     # N2 is a real cross-field-manipulation residual, but on a PURE + UNWIRED module (zero live consumers today)
self_certification:
  agent_id: claude-immune-rev-live-toctou-01
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

> Independent cross-lane review verdict is advisory. This record recommends APPROVE_WITH_NOTES; it does not merge, push, or authorize activation, and it carries no authority to weaken any gate. N2 (Proxy `getOwnPropertyDescriptor`-trap residual) and L1 (documentation overclaim) must be tracked and closed — or the Proxy input class explicitly scoped out — before `assessEnvelopeConformance` is wired into any consumer and before S2/S3 reuse this iteration pattern.
