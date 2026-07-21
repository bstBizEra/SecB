# MOD-LIVE S1 — Value-Mutation Fix (N3) — Independent Review (REV/SEC, third-party)

**Record ID:** mod-live-s1-value-mutation-fix-independent-review-001
**Status:** ADVISORY — NOT EFFECTIVE (independent review only; no execution/approval/merge authority)
**Reviewer:** BST-SA worker agent, REV/SEC role, independent of the producer
**Date:** 2026-07-21
**Branch reviewed:** `bst/mod-live-s1-value-mutation-fix-001` @ `5b93086` (fix `24d5dcd` + fast-follow `5b93086`), base `main @ f78c4fb`
**Worktree used:** isolated `git worktree add --detach` checkout under the scratchpad temp directory, `node_modules` copied in from the live repo (no dependency changes), never touching the live/main branch.
**Target reviewed:** `src/live/event-family-policy.mjs`, function `assessEnvelopeConformance`; `tests/event-family-policy.test.mjs`; `tests/replay-assembler.test.mjs`'s byte-identity pin.
**Prior records read:** `docs/03-project-control/candidates/mod-live-s1-value-mutation-fix-producer-verification-001.md` (this branch's own producer record — read in full, verified independently, not trusted at face value); `docs/03-project-control/candidates/mod-live-s1-toctou-fix-independent-review-001.md` (the N1-fix independent review, which first flagged the "NOVEL-5" Proxy-`getOwnPropertyDescriptor`-trap residual — directly relevant to the new finding below).

---

## Verdict

**APPROVE_WITH_NOTES**

N1, N2, and N3 are all genuinely closed under my own independent reproduction (fresh scripts, not the committed test file, differentially verified against pre-fix code so the tests are not tautologies). Full-suite and both named-file test counts match the producer's claims exactly. The byte-identity repin is numerically correct. No hardcoded test-ID branching. However, I found a **new, reproducible, silent-forge gap** in Phase 1 itself — the exact question this review was asked to focus on — described in detail below. It does not regress anything this fix targeted, is in the same disclosed-but-incompletely-closed risk class as the N1 review's own "NOVEL-5" finding, and the module remains PURE + UNWIRED with zero live callers, so it does not block merge of this specific, narrowly-scoped fix. It should be tracked and disclosed before this evaluator is ever wired to a live path that could hand it a Proxy-shaped envelope.

---

## 1. N1 / N2 / N3 closure — independent reproduction

All reproduced with fresh scripts I wrote myself (not copied from `tests/event-family-policy.test.mjs`), then differentially re-run against the pre-fix code (`git show f78c4fb:src/live/event-family-policy.mjs`) to confirm they are real regression tests, not tautologies that would pass against any implementation.

| Exploit | Against branch `5b93086` | Against pre-fix `f78c4fb` |
|---|---|---|
| N1 injection (getter injects a sibling key) | PASS (still correctly denied presence) | PASS (already closed pre-N3) |
| N1 deletion (getter deletes a snapshotted-present sibling key) | PASS | **FAIL** (bug reproduces) |
| N2 descriptor-trap injection (ownKeys gate holds) | PASS | PASS |
| N2 throwing descriptor trap contained, denies | PASS | FAIL* (old code never calls the trap at all, so this specific assertion doesn't apply — expected, not a regression) |
| N3 PoC A (suppress a genuinely-absent sibling via an earlier plain getter) | PASS | **FAIL** (bug reproduces) |
| N3 PoC B (fabricate a finding for a genuinely-present sibling) | PASS | **FAIL** (bug reproduces) |
| N3 PoC C (Proxy `get`-trap variant, honest `ownKeys`/`getOwnPropertyDescriptor`) | PASS | PASS (this specific variant happened to be closed already by the N2 `Reflect.ownKeys` fix's read-order, confirmed) |
| N3 PoC D (inject + delete combo) | PASS (both sub-assertions) | one sub-assertion FAILs (delete-suppression reproduces) |

This confirms: (a) my PoCs actually distinguish fixed from unfixed code — they are not vacuously true; (b) all four of the producer's PoC A–D variants, reproduced independently, are closed on the branch.

Fail-closed path, tested directly (not just via the existing test's exact construction): a `getOwnPropertyDescriptor` Proxy trap that deletes a **not-yet-visited** sibling's data as a side effect of an **earlier** field's descriptor read causes that sibling's own `Object.getOwnPropertyDescriptor` call to legitimately return `undefined` despite `Reflect.ownKeys` having confirmed it present. Confirmed: the function does not throw unhandled (the `throw` inside the function's own `try` is caught by its own `catch`), does not silently treat the field as absent, and returns a proper frozen `{ ok: false, code: DENY_EVENT_ENVELOPE_MALFORMED }` denial.

## 2. Byte-identity repin — recomputed independently

```
$ git hash-object src/live/event-family-policy.mjs
47ebc9bb7e5190c6f0f78232884379b3c284248d
```

Matches the pin in `tests/replay-assembler.test.mjs` (`PINNED_BLOBS["src/live/event-family-policy.mjs"]`) introduced by `5b93086` exactly. Correct.

## 3. Test counts — independently reproduced

The isolated worktree initially had no `node_modules` (a `git worktree add` artifact, not a project defect); dependencies were copied in from the live checkout (`ajv`, `ajv-formats`, etc. — no version change, no `package.json`/lockfile edits) before running anything.

**Full suite** (`npm test`, i.e. `node tools/validate-foundation.mjs && node --test tests/*.test.mjs`), run directly by me:

```
tests 1086
pass 1081
fail 0
cancelled 0
skipped 5
todo 0
```

Matches the producer's claimed `1086/1081/0/5` exactly, and `npm run validate` reports `"status": "PASS"`.

**`tests/event-family-policy.test.mjs`** alone: `34/34` pass, `0` fail.
**`tests/replay-assembler.test.mjs`** alone: `33/33` pass, `0` fail — confirms the fast-follow repin (`5b93086`) actually fixes the byte-identity trip the producer's own record disclosed as the fix's one full-suite regression at `24d5dcd` (which I did not re-run in isolation, since `5b93086` supersedes it on this same branch and is what's under review).

## 4. Hardcoded test-ID branching

```
grep -niE "test-id|testId|TEST_ID|__test|NODE_ENV|process\.env" \
  src/live/event-family-policy.mjs tests/event-family-policy.test.mjs tests/replay-assembler.test.mjs
```

No matches. Clean.

## 5. Export surface / wiring / behavior preservation

- `diff <(git show f78c4fb:...|grep ^export) <(grep ^export src/live/event-family-policy.mjs)` — empty diff. Export surface unchanged.
- `grep -rln "event-family-policy" --include="*.mjs" src/` outside the module's own file matches only comments in `access-mode-policy.mjs`, `replay-assembler.mjs`, `kpi-registry.mjs` (house-style references), never an `import`. Module remains PURE + UNWIRED, zero live callers, same as both prior rounds.
- The test-file diff (`f78c4fb..5b93086`) is additive plus expected *replacements* of assertions whose invariant literally changed (e.g., the old N2 test asserted the descriptor trap is "NEVER invoked" — true for the N2-only code, but no longer true once N3's fix deliberately starts invoking `getOwnPropertyDescriptor` once per present field to fix N3; the new assertions correctly test "invoked, but contained/gated" instead). No assertion was silently weakened or dropped without a like-for-like replacement.

## 6. NEW FINDING — Phase 1 has the same one-at-a-time ordering vulnerability Phase 2 used to have, one level down (silent, not fail-closed)

This is the question the review brief specifically flagged as the most likely place a residual bug would hide, and it is real.

**Mechanism.** Phase 1 walks `DOCTRINE_CONFORMANCE_ELEMENTS` in fixed order and calls `Object.getOwnPropertyDescriptor(envelope, key)` once per present field, one at a time, exactly as Phase 2 used to do for *values*. If `envelope` is a `Proxy` with a stateful `getOwnPropertyDescriptor` trap, that trap is fully attacker-controlled, synchronously-executing code — the same fact the module's own doc comment already discloses for the "delete a not-yet-queried sibling" sub-case. But the disclosed fix (throw-if-`undefined`) only catches deletion. It does **not** catch the trap **silently redefining** a not-yet-visited, already-present sibling's value to something else, because the resulting descriptor is still a valid, defined descriptor — it just doesn't reflect what was true when `Reflect.ownKeys` ran. Neither of the two existing safety nets fires:

- The `ownKeys` gate doesn't help: the targeted sibling *was* present at snapshot time and still *is* present — only its value changed.
- The fail-closed `undefined`-descriptor check doesn't help: the descriptor comes back defined, just poisoned.

**PoC 1 — suppress a genuinely-present sibling's finding (fresh script, not in the committed suite):**

```js
const target = { eventType: "x.y", trace_id: "t", span_id: "genuinely-supplied-span-id" };
const proxy = new Proxy(target, {
  getOwnPropertyDescriptor(t, key) {
    if (key === "trace_id") {
      // span_id (index 1) hasn't had its Phase 1 descriptor captured yet
      // (trace_id is index 0) -- poison it now, before Phase 1 gets there.
      Object.defineProperty(t, "span_id", { enumerable: true, configurable: true, value: null });
    }
    return Reflect.getOwnPropertyDescriptor(t, key);
  }
});
assessEnvelopeConformance(proxy);
// -> { ok: true, findings: [...MISSING_SPAN_ID...] }
// span_id was genuinely supplied; the finding is fabricated, and no denial occurs.
```

**PoC 2 — fabricate presence for a genuinely-absent sibling**, symmetric construction (poison `span_id` from `null` to a truthy forged value before Phase 1 reaches it): `assessEnvelopeConformance` returns `ok: true` with **no** `MISSING_SPAN_ID` finding, even though `span_id` was genuinely absent. Both reproduced and confirmed against the actual `5b93086` module, not a mental model of it.

**Why this is not just NOVEL-5 re-litigated.** The N1-fix independent review already flagged (as "NOVEL-5", disposed as a non-blocking, tracked, low-severity residual given PURE+UNWIRED status) that a hostile `getOwnPropertyDescriptor` trap's *delete*/*inject* side effects during Pass 1 reopen the TOCTOU window. That specific delete/inject framing is now **closed** as a side effect of this fix and the prior `Reflect.ownKeys` fix: deletion of an already-snapshotted key now fails closed (verified in §1 above); injection of a wholly new key is blocked outright by the `ownKeys` gate (verified in §1). What is demonstrated here is a **third sub-variant neither prior round tested or disclosed**: redefining (not deleting, not injecting) an already-present sibling's *value* through the same trap-during-Phase-1 channel. It trips neither existing safety net and produces a fully silent, undetected forge — functionally identical in effect to the original N3 bug this fix was written to close, just relocated from the `get`/getter-value layer down to the `getOwnPropertyDescriptor`-trap layer. The fix's own doc comment's claim — "Because every OTHER field's descriptor was already captured in Phase 1, invoking one field's getter in Phase 2 can mutate the live envelope all it wants; it cannot change what Phase 1 already captured for any sibling" — is true of Phase 2 exactly as written, but does not account for Phase 1's own internal one-at-a-time order being attackable by the same class of trap the file already discusses in the same paragraph.

**Scope check — is a Proxy envelope in-scope for this module's threat model?** Yes. `isPlainAssessableObject` (`value !== null && typeof value === "object" && !Array.isArray(value)`) does not exclude Proxies, and the existing committed test suite already constructs adversarial Proxies with hostile `get`/`getOwnPropertyDescriptor`/`ownKeys` traps as first-class attack constructions (e.g. the "N2/N3 boundary" delete test, PoC C). This is not an out-of-model construction; it uses the exact same primitive the module's own tests already treat as in-scope.

**DoS / resource-exhaustion check (MOD-LIVE-S3 class):** Phase 1's `Object.getOwnPropertyDescriptor` calls are bounded strictly by `DOCTRINE_CONFORMANCE_ELEMENTS.length` (8, fixed), gated by presence in the `Reflect.ownKeys` Set — confirmed empirically: an envelope with 200,000 attacker-controlled extraneous keys triggered zero descriptor-trap invocations (only doctrine-named fields are ever probed). The `Reflect.ownKeys` call itself does scale with the envelope's total own-key count (~195ms for 200k keys in this environment), but that cost is identical to, and pre-dates, this fix (it was introduced by the N2 `Reflect.ownKeys` hardening, not by N3's descriptor capture). This fix introduces no new resource-exhaustion surface beyond what N2 already carries.

**Severity: low, for now** — identical reasoning to the N1 review's NOVEL-5 disposition: the module is PURE + UNWIRED (§5), so no live caller today can be induced to hand it a Proxy-shaped envelope. The risk is real but dormant.

## 7. Recommendation

None of the following block merge of this specific fix, which does exactly what it says for N1/N2/N3 as scoped:

1. Track this finding (call it N4, or fold it under the existing NOVEL-5 tracking item) explicitly before any future slice wires `assessEnvelopeConformance` to a live consumer that could pass caller-controlled Proxy envelopes.
2. Add a regression test for the "redefine, don't delete" sub-variant (mirroring the existing "N2/N3 boundary: ... DELETES ..." test but with a value-redefinition instead of a `delete`), so this gap is at least detected if anyone later attempts to close it or accidentally regresses the delete-case protection.
3. Soften the doc comment's implicit universal claim about Phase 1 to explicitly scope it: descriptor capture is unconditionally safe only for non-Proxy (plain) envelope objects, or for Proxies whose `getOwnPropertyDescriptor` trap is provably free of cross-field side effects — exactly the same qualifier the file already applies to other Proxy vectors in the same doc comment, just not yet extended to this one.
4. No fix is obviously cheap: reordering, randomizing, or batching the Phase 1 reads (e.g. via `Object.getOwnPropertyDescriptors`) does not close this in general, because a sufficiently adversarial trap can poison every not-yet-queried sibling on its very first invocation regardless of order — this matches the producer's own §10 conclusion that some multi-trap-adjacent constructions are likely unfixable in general within JS's object model for a fully hostile Proxy. The realistic path is disclosure + tracking, not a code fix, unless the module's design is changed to reject non-plain-object envelopes outright.

## Self-certification

```yaml
self_certification:
  agent_id: claude-sonnet-rev-sec-value-mutation-01
  peer_agent_id: claude-producer-secb-mod-live-s1-value-mutation-fix-001
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

**APPROVE_WITH_NOTES.** N1, N2, and N3 are all genuinely closed under independent, fresh, differentially-verified reproduction — not merely trusted from the producer's record. Test counts (`1086/1081/0/5` full suite; `34/34` and `33/33` for the two named files) match exactly. The byte-identity repin (`47ebc9bb7e5190c6f0f78232884379b3c284248d`) is numerically correct, independently recomputed. No hardcoded test-ID branching. No new resource-exhaustion surface. One residual gap was found and confirmed exploitable: a hostile `getOwnPropertyDescriptor` Proxy trap can silently redefine a not-yet-visited, already-present sibling's *value* during Phase 1 itself, triggering neither the `ownKeys` presence gate nor the fail-closed `undefined`-descriptor check — a fully silent forge, functionally equivalent to the original N3 bug, one layer down. This is in the same disclosed, low-severity, PURE+UNWIRED residual-risk class the N1-fix's own independent review already accepted for an analogous (delete/inject) sub-case, and does not regress or undermine anything this fix specifically targeted, so it does not block merge of this narrowly-scoped fix. It should be tracked and closed (or explicitly re-disclosed) before this evaluator is ever wired to a consumer capable of passing it a Proxy-shaped envelope.
