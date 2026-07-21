# MOD-LIVE S1 — TOCTOU Fix (N1) — Independent Review (REV, third-party)

**Record ID:** mod-live-s1-toctou-fix-independent-review-001
**Status:** ADVISORY — NOT EFFECTIVE (independent review only; no execution/approval/merge authority)
**Reviewer:** claude-sonnet-rev (BST-SA REV/independent-reviewer role), no relationship to the producer
**Date:** 2026-07-21
**Branch reviewed:** `bst/mod-live-s1-toctou-fix-001` @ `4445cc3` (base `main` @ `332b7ab`)
**Worktree used:** `C:/laragon/www/SecB-worktrees/bst-mod-live-s1-toctou-fix-001` (pre-existing, clean, read-only use) plus an isolated scratch worktree `C:/laragon/www/SecB-worktrees/rev-toctou-baseline-332b7ab` (detached at `332b7ab`, used only for baseline counts, removed after use) and standalone Node scripts in the scratch directory (never committed to any branch).
**Target reviewed:** `src/live/event-family-policy.mjs`, function `assessEnvelopeConformance` only.
**Prior records read:** `docs/03-project-control/candidates/mod-live-s1-event-family-second-independent-review-001.md` (N1 finding) and `docs/03-project-control/candidates/mod-live-s1-toctou-fix-producer-verification-001.md` (producer's self-verification).

---

## Verdict

**APPROVE_WITH_NOTES**

The fix genuinely closes both of the second reviewer's N1 exploits, is behavior-preserving, byte-identity-clean, purely additive to the test suite, unwired, and free of hardcoded test-ID branching. One narrower, out-of-original-scope residual gap was found (see Novel Adversarial Findings, NOVEL-5): when the caller-supplied `envelope` argument is itself a `Proxy` with a stateful (non-throwing) `getOwnPropertyDescriptor` trap, the identical TOCTOU class (sibling-field deletion or injection influencing a not-yet-decided field) is reproducible during Pass 1 itself. This does not undermine the fix's stated purpose (closing N1 as scoped — a getter as a *field value*) and does not block merge given the module is still PURE + UNWIRED with zero live callers, but it does mean one sentence of the fix's own doctrine comment ("no side effect can occur here") is not universally true, and the gap should be tracked before this evaluator is ever wired to a live path that might hand it a Proxy-shaped envelope.

---

## 1. Test counts — independently reproduced

All counts run by me, directly, in the worktree — not copied from the producer's record.

**Module suite** (`node --test tests/event-family-policy.test.mjs`):

| | tests | pass | fail |
|---|---|---|---|
| Baseline (`main` @ `332b7ab`, isolated worktree, fresh `npm install`) | 26 | 26 | 0 |
| Branch (`bst/mod-live-s1-toctou-fix-001` @ `4445cc3`) | 29 | 29 | 0 |

**Full repo suite** (`npm test`, which runs `node tools/validate-foundation.mjs` then `node --test tests/*.test.mjs`):

| | tests | pass | fail | skipped |
|---|---|---|---|---|
| Baseline (`main` @ `332b7ab`) | 843 | 838 | 0 | 5 |
| Branch (`4445cc3`) | 846 | 841 | 0 | 5 |

Both deltas (module +3, full +3) match the producer's claim exactly. `node tools/validate-foundation.mjs` reports `"status": "PASS"` on the branch.

Note on method: my first baseline run (in a nested temp scratch path) showed spurious failures (`ERR_MODULE_NOT_FOUND: ajv`) — a missing `node_modules` in a freshly-added bare worktree, not a real regression. Re-running after `npm install` in a worktree under the repo's normal sibling-worktree convention (`C:/laragon/www/SecB-worktrees/rev-toctou-baseline-332b7ab`) produced the clean 843/838/0/5 baseline above. Worktree removed after use (`git worktree remove ... --force`); no branch or main history touched.

## 2. Mechanism read — confirmed line-by-line against the actual diff

Read `src/live/event-family-policy.mjs` lines 266–309 (the whole of `assessEnvelopeConformance`) directly, then diffed it against `main` @ `332b7ab` to confirm my reading matched the actual change (not just the comments describing it):

- **Pass 1** (`const descriptors = DOCTRINE_CONFORMANCE_ELEMENTS.map((spec) => Object.getOwnPropertyDescriptor(envelope, spec.element))`): for an ordinary object, `Object.getOwnPropertyDescriptor` reads own-property metadata via the `[[GetOwnProperty]]` internal method and **never** invokes a `get` accessor — confirmed correct for plain objects and arrays.
- **Pass 2** (`DOCTRINE_CONFORMANCE_ELEMENTS.forEach((spec, index) => { const descriptor = descriptors[index]; ... })`): presence is decided purely from the captured `descriptor` object — `descriptor.value` for a data property (already-captured, no live re-read), or `descriptor.get.call(envelope)` for an accessor property. Critically, `descriptor.get` is a *captured function reference* from Pass 1's snapshot — Pass 2 never does a fresh `envelope[spec.element]` lookup, and never re-checks `Object.hasOwn(envelope, ...)`. This is real: even if a sibling's Pass-2 getter mutates or redefines the live property afterward, the already-captured `descriptor` object for a not-yet-processed sibling is unaffected (it's a plain snapshot object, not a live reference into the property table).

This mechanism is genuinely two-pass and genuinely decouples "does this property exist / what accessor does it have" (frozen at Pass 1) from "what does invoking that accessor return" (Pass 2, exactly once per element). For **ordinary objects**, the doctrine comment's claim ("no getter runs during this pass and no side effect can occur here [Pass 1]") is true. See §4 for the one case (Proxy-as-envelope) where it is not.

## 3. Reproduction of both of the second reviewer's exact exploits — independently

Ran both exploits myself, fresh, against the real fixed module (imported directly via a `file://` URL from the worktree, no copy, no modification), in a standalone script in my scratch directory:

- **Deletion**: `sequence = 42` (present at call time); a getter on `trace_id` (checked first) does `delete envelope.sequence`. **Result: `MISSING_SEQUENCE` does NOT appear.** Closed.
- **Injection**: `evidence_candidate` never supplied; a getter on `trace_id` (checked first) does `envelope.evidence_candidate = true`. **Result: `MISSING_EVIDENCE_CANDIDATE_FLAG` DOES appear** (i.e., the injection did not suppress the correct finding). Closed.

Both confirmed closed against the real module, independently of the committed regression tests (which I also read and independently re-ran — they assert the same outcomes and pass).

## 4. My own novel adversarial variants (distinct from both prior rounds)

Five variants, run against the real fixed module:

1. **A LATER-checked field's getter mutates an EARLIER-checked field** (e.g. `evidence_candidate`, checked 8th/last, deletes `trace_id`, checked 1st, when its own Pass-2 getter runs). **Result: safe.** By the time the 8th element's Pass-2 getter executes, the 1st element's presence was already decided (Pass 2 is a plain sequential `forEach` over the fixed doctrine order) — nothing "reopens" an already-closed decision. `trace_id` correctly still reports present.
2. **A getter throws partway through Pass 2**, after other findings have already been pushed to the in-progress `findings` array. **Result: safe.** The throw is caught by the function's single outer `try`/`catch`; the function returns the structured `DENY_EVENT_ENVELOPE_MALFORMED` denial, and the partially-built `findings` array (with earlier findings already pushed) is discarded — it is a local variable never returned on the error path, so no partial/inconsistent result leaks.
3. **A getter returns a Proxy value that itself has further traps** (its own `get`/`getOwnPropertyDescriptor` traps track whether they were invoked). **Result: safe.** The assessor only checks `value !== undefined && value !== null` on the returned value — it never dereferences into that value further, so the inner Proxy's traps are never touched (confirmed via a `trapTouched` flag that stayed `false`).
4. **A getter defined on a field NOT in the 8 doctrine-checked elements, with a side effect deleting a field that IS one of the 8.** **Result: safe.** Pass 1 only calls `Object.getOwnPropertyDescriptor` for the 8 fixed `DOCTRINE_CONFORMANCE_ELEMENTS` entries; a getter on an unrelated property key is simply never invoked by this function at all (confirmed: the getter never fired, and the doctrine field it targeted was unaffected).
5. **The `envelope` argument itself is a `Proxy` whose `getOwnPropertyDescriptor` trap has a genuine (non-throwing) side effect, invoked during Pass 1.** **Result: NOT safe — residual gap.** Both directions reproduced:
   - Deletion: target has `sequence = 42` (present) and `trace_id = "trace-01"` (present, index 0). The Proxy's `getOwnPropertyDescriptor` trap, when asked about `trace_id` (index 0, processed first in Pass 1's `.map()`), does `delete target.sequence` (index 2, not yet snapshotted) as a side effect before truthfully reflecting `Reflect.getOwnPropertyDescriptor(target, prop)`. Outcome: `MISSING_SEQUENCE` **is fabricated**, identical in effect to the original (pre-fix) N1 deletion exploit.
   - Injection: symmetric case — the trap, when asked about `trace_id`, injects `target.evidence_candidate = true` (index 7, not yet snapshotted). Outcome: `MISSING_EVIDENCE_CANDIDATE_FLAG` **is suppressed**, identical in effect to the original N1 injection exploit.

   Root cause: `Object.getOwnPropertyDescriptor(envelope, spec.element)` on a `Proxy` invokes the Proxy's own `getOwnPropertyDescriptor` trap handler by spec — this is fully attacker-controlled, synchronously-executing code, not inert metadata inspection. The trap in my probe is spec-legal (it truthfully reflects the *current* state of a real, mutable target after its own side effect, so no Proxy invariant is violated and no exception is thrown). Because Pass 1 is a single uninterrupted `.map()` over the 8 elements *in doctrine order*, a trap invoked for an earlier element in that same Pass-1 loop can still mutate the target before a later element in the *same pass* is snapshotted — reopening the exact TOCTOU window the two-pass redesign was built to close, just moved one level down (from "getter as field value" to "trap as descriptor-reader on the envelope itself").

   This is a distinct code path from what N1 targeted (N1's exploits, and the producer's fix, are entirely about *value* getters on the 8 fields; this variant requires the *envelope argument itself* to be an exotic/Proxy object) and is outside N1's original threat-model framing. The existing test suite (`attack: Proxy descriptor trap that throws yields the malformed denial (conformance)`) only covers a *throwing* descriptor trap, not a *stateful, truthfully-returning* one — so this gap is untested and, before my probe, unconfirmed either way.

   Severity assessment: **low, for now.** The module remains PURE + UNWIRED (confirmed §7) — no live caller currently constructs or forwards a Proxy-shaped envelope into this function. The gap only becomes live risk once (a) the module is wired to a consumer and (b) that consumer's call path can be induced to pass a Proxy as the envelope (e.g., a future adapter that wraps incoming envelopes for logging/validation). Recommend tracking as a follow-up hardening item (e.g., reject non-plain-object-exotic envelopes explicitly, or defensively shallow-copy own enumerable/non-enumerable descriptors through `Object.assign`/`structuredClone`-style extraction before Pass 1 in a way that forces materialization off a trusted plain object) **before** any future S2/S3 slice wires this evaluator to a live path.

## 5. Behavior-preservation for ordinary inputs

- `git diff 332b7ab 4445cc3 -- tests/event-family-policy.test.mjs` shows the change to the test file is **purely additive**: the diff contains zero removed/modified lines among the pre-existing 26 tests — only 97 new lines (3 new tests + section header) are appended after the existing "attack" section. No existing test's assertions or expected outcomes were touched.
- **Byte-identity**, re-verified independently via `git hash-object` (not the test's own self-computed hash) and cross-checked against `git rev-parse <commit>:<path>` at all three of `280d32c` (the pin target), `332b7ab` (this branch's base), and `4445cc3` (the branch tip), for all 7 files the test file pins:
  `docs/05-live-operations/event-envelope.md`, `contracts/event-envelope.schema.json`, `src/control/retry-policy.mjs`, `src/control/risk-registry.mjs`, `tests/risk-registry.test.mjs`, `tools/validate-foundation.mjs`, `package.json`.
  All 7 report the identical blob SHA1 across all three commits — confirmed unchanged.
- Minor documentation note (non-blocking): the test file's own comment block (lines ~15–17) says "MANIFEST.json is excluded because this slice intentionally appends its two new file entries there," but `git diff 332b7ab 4445cc3` shows `MANIFEST.json` is **not** actually part of this branch's diff at all (only 4 files changed: the module, its test file, the producer-verification doc, and one appended line in `module-completion-tracker-001.md`). This sentence appears to be stale boilerplate carried over from the comment style of a prior slice and does not describe this branch's actual diff — harmless, but worth a follow-up cleanup so the comment matches the real change set.

## 6. Hardcoded test-ID branching

`grep -nE "test[-_]?id|TEST_ID|__test|process\.env\.(NODE_ENV|TEST)|if \(.*test.*\)"` against `src/live/event-family-policy.mjs`: **zero matches.** The fix's only new branching is on descriptor shape (`Object.hasOwn(descriptor, "value")`, `typeof descriptor.get === "function"`) — universal `Object`-level property-descriptor mechanics, not caller/test-fixture identity. Confirms the producer's own grep claim.

## 7. Module purity / unwired status

- **Export set unchanged**: `grep -n "^export"` on the branch and on `main` @ `332b7ab` return the identical 6 exports (`DENY_EVENT_TYPE_MALFORMED`, `DENY_EVENT_FAMILY_UNKNOWN`, `DENY_EVENT_ENVELOPE_MALFORMED`, `EVENT_FAMILIES`, `DOCTRINE_CONFORMANCE_ELEMENTS`, `classifyEventType`, `assessEnvelopeConformance`) — no new export added.
- **No new imports**: `grep -n "^import"` on the module returns zero lines, before and after — no I/O surface added (no `fs`, `fetch`, `process`, clock, etc.).
- **No wiring**: `grep -rn "event-family-policy" --include="*.mjs" src/` excluding `tests/` returns no matches outside the module's own file — nothing in `src/` imports or consumes this module. Still fully unwired.

## Self-certification

```yaml
self_certification:
  agent_id: claude-sonnet-rev
  peer_agent_id: claude-sonnet-main (producer)
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

```yaml
truth_status: verified_true
authority_status: advisory_only
implementation_status: existing
risk_class: low
```

## Disposition

**APPROVE_WITH_NOTES.** The two-pass atomic-snapshot redesign genuinely closes N1 as scoped (both exploits independently reproduced and confirmed closed against the real module, not just the committed tests), is behavior-preserving for ordinary inputs (test diff purely additive, 7 pinned files byte-identical across three commits, confirmed via independent `git hash-object`), free of hardcoded test-ID branching, and remains PURE + UNWIRED with an unchanged export surface. One residual gap distinct from N1's scope — a stateful (non-throwing) `getOwnPropertyDescriptor` trap on the envelope argument itself, when the envelope is a Proxy — reopens the identical class of TOCTOU bug during Pass 1; this is untested by the current suite, contradicts the absolute wording of the fix's own doctrine comment ("no side effect can occur here"), but poses no current live risk given the module's unwired status. Recommend: (1) file this as a tracked follow-up finding for closure before any live wiring of this evaluator, (2) soften or scope the doctrine comment's claim to "for ordinary (non-Proxy) envelope objects," (3) optional cleanup of the stale MANIFEST.json sentence in the test file's header comment. None of these block merge of this specific, narrowly-scoped fix.

This is advisory only. I hold no execution, approval, or merge authority; this record is prepared for operator/governance review.
