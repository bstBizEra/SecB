# MOD-LIVE S2 — SECOND, Independent Review: Access-Mode Authorization Ladder Evaluator

**Record ID:** mod-live-s2-access-mode-second-independent-review-001
**Status:** DRAFT / ADVISORY — NOT EFFECTIVE
**Reviewer:** claude-rev-sec-live-s2-002 (BST-SA REV/SEC role, independent — no relationship to the producer or to the first reviewer)
**Date:** 2026-07-22
**Review target:** `src/live/access-mode-policy.mjs`, reviewed commit `677f149` (`[MOD-LIVE-S2] Access-mode authorization ladder evaluator (G2, PURE + UNWIRED)`), as it stands, byte-identical, at `origin/main @ bd00c53`
**Base:** `origin/main @ bd00c53ad88cf195830609fd6db7e5582391b684`
**Relationship to prior record:** this is a **SECOND, independent** re-verification of `docs/03-project-control/candidates/mod-live-s2-access-mode-rev-001.md` (reviewer `claude-immune-rev-live-s2-01`, verdict `APPROVE_WITH_NOTES`). Every claim below was reproduced first-hand in a fresh isolated detached-HEAD worktree, with a standalone adversarial probe script (never committed) run independently of the shipped suite. The first review's specific TOCTOU probe class (N1-class, per the LIVE-S1 saga) was re-run rather than trusted, and the boundary/importer claim was re-checked against the *current* `main` tip rather than the tip the first review was written against.
**Method:** `git fetch origin main`; isolated `git worktree add --detach` at `origin/main`; fresh `npm install`; full file read; full `npm test` and direct `node --test tests/access-mode-policy.test.mjs`; a standalone 9-part adversarial probe script executed directly against the built module; `git grep`/`git log` sweeps for downstream importers and hardcoded test-ID branching.

---

## Verdict: APPROVE_WITH_NOTES

The module is a genuinely pure, fail-closed, deny-by-default codification of the SECB-LIVE-CONTROL-001 access ladder. Independent re-verification reproduces every one of the first review's PASS claims with no discrepancy: the ladder-vs-grant check is a true ceiling comparison (never a stepwise transition graph, and doesn't need to be — see §2), the explicit-authorization gate for Control/Emergency is sound, the fail-closed extraction genuinely closes off cross-field TOCTOU (verified with a fresh probe, not the first reviewer's script), and the injected `risk-registry.riskProfile` collaborator cannot return a malformed shape or throw regardless of how hostile the caller-supplied `riskClass` value is (checked specifically — see §4). No blocking finding.

One thing has changed since the first review that its record does not and could not reflect: **the module's "wired to nothing" / "zero importers" claim is now stale.** `src/self-pilot/read-only-self-pilot.mjs` (commit `43ed19d`, landed on `main` *after* `677f149`) imports `evaluateAccessRequest` and calls it twice with literal, hardcoded requests. This is not a security defect — see N4 below for why — but it means B5's "wired to nothing" language should be read as "not wired to any live/session/gateway path," not literally "has no importers," going forward.

---

## 1. Ladder honesty and doc-parity — PASS (reconfirmed)

Read `docs/05-live-operations/intervention-and-replay.md` and `docs/17-operations/01-live-operations.md` in full, first-hand. `ACCESS_MODES` (six entries: Observe/Annotate/Approve/Steer/Control/Emergency) matches the "## Access Modes" table 1:1 in row order; `ACCESS_MODE_ORDER` matches the arrow ladder in `01-live-operations.md`. `requiresExplicitAuthorization` is `true` for exactly Control and Emergency, matching the verbatim phrase "Writable terminal control and emergency intervention require explicit authorization." `tests/access-mode-policy.test.mjs` parses both doctrine documents live (`readFileSync` at test runtime, not embedded fixtures) — confirmed by reading the test file directly; drift in either doc fails the suite. `git hash-object src/live/access-mode-policy.mjs` = `5d96eec7af6e717218a81ea5563e09c6b18d191b`, matching the byte-identity pin in `tests/conformance-v020-governance.test.mjs` line 364 — the file has not drifted since that conformance pin was set.

## 2. "Mode-transition legality" — re-scoped and confirmed sound, not a gap

The task brief for this review asks whether every access-mode transition is validated against a genuine state-machine/graph (in the style of `#assertEdge` in `src/services/evidence-envelope-service.mjs`), on the theory that an illegal jump could otherwise be accepted. Having read the doctrine and the code, this concern does not transfer cleanly to this module, and I want to be explicit about why rather than force-fitting the pattern:

- `#assertEdge`-style checks exist for state machines with a *current state* that transitions to a *next state* along specific edges (e.g. evidence envelope verification status).
- This evaluator has no "current mode" and no transition edges. Its two inputs are `requestedMode` (what the caller wants right now) and `grantedMode` (the ceiling of authority the caller claims to hold), and the doctrine's own rule — "Each higher mode requires separate authority" — is fully expressed by `requested.rank > granted.rank` denying as escalation. There is no notion of "you must pass through Approve before Steer"; the doctrine table and arrow ladder describe a **rank ordering with a ceiling check**, not a sequential transition graph with mandatory intermediate hops.
- I independently re-derived the full 6×6 rank matrix outside the shipped test suite (my probe script, §6, item 9) and confirmed zero mismatches against `requested ≤ granted` for all 36 pairs, with `explicitAuthorization: true` supplied so escalation is the only possible deny path being tested. Every downgrade, lateral, and legal upgrade is allowed; every rank-exceeding request is denied.
- The two gated modes (Control, Emergency) additionally require a **separate, per-request** authorization attestation even when the ceiling already covers them — i.e., holding a Control-or-higher grant does not exempt a *later* request into Control from the gate. This is the doctrine's "fully audited" requirement expressed correctly; confirmed by test and by my own probe.

**Conclusion:** there is no illegal-transition gap here because the module was never meant to model transitions — it models a ceiling. Grading it against `#assertEdge` would be applying the wrong mental model. If a future adoption/wiring layer *also* needs to enforce "no skipping intermediate modes within a single session's mode history," that is explicitly out of this evaluator's stated scope (B5: it reads no session state) and belongs to whatever wires this evaluator into `TransitionEngine` — flagged as N2 (below), continuing the first review's own note on this exact point.

## 3. TOCTOU / check-then-act — PASS, independently re-verified with a fresh probe

This module performs no I/O of any kind (grepped for `Date.now|Math.random|readFile|writeFile|require(|process.|fetch(|setTimeout|setInterval|fs.|crypto.` — zero matches) and reads no external mutable state; it is a pure function over its argument object. The relevant TOCTOU surface, per this session's recurring pattern, is therefore purely **within the argument object**: could a hostile getter on one property change what a later-read property returns, and could that let escalation or the authorization gate be bypassed?

I wrote and ran a standalone 9-part probe script (not part of the shipped suite, deleted after use) against the built module directly:

1. A request with `requestedMode: "Emergency"`, a `grantedMode` getter that returns the insufficient `"Observe"`, and a `riskClass` getter armed to short-circuit the gate if reached: denies `DENY_ACCESS_ESCALATION`; the `riskClass` getter *is* invoked (extraction reads all four supplied fields eagerly, up front, in one contained block) but its value is never consulted because escalation is checked first and returns before the authorization branch runs. No bypass.
2. Independently confirmed each of `requestedMode`/`grantedMode` is read **exactly once** even when a later-read sibling's getter fires — no re-read amplification, no window for a getter to influence an already-captured value.
3. Ten case/whitespace/unicode mode-string variants (`"observe"`, `"OBSERVE"`, padded, trailing newline, zero-width-space variant, etc.) — all denied `DENY_ACCESS_MODE_UNKNOWN` (or `MALFORMED` for the null-byte case); none coerced to a nearby valid mode.
4. `Object.prototype` pollution with `requestedMode`/`grantedMode` — an empty object `{}` still denies `MALFORMED` (own-property requirement holds; inherited values are never honoured).
5. A `riskClass` object with throwing `valueOf`/`toString` — does not throw; denies `DENY_ACCESS_AUTHORIZATION_REQUIRED`. This is because `risk-registry.ownEntry`'s `typeof key === "string"` check short-circuits before any coercion is attempted on a non-string `riskClass` (see §4).
6. A `riskClass` Proxy with throwing `get`/`getOwnPropertyDescriptor` traps — same result, same reason; does not throw.
7. An array `grantedMode` (`["Emergency"]`) — denies `MALFORMED` (non-string rejected before indexing).
8. A numeric-string `requestedMode` (`"5"`) — denies `DENY_ACCESS_MODE_UNKNOWN` (no numeric coercion path; exact string match only).
9. Full 36-pair ladder-matrix re-derivation (§2) — zero mismatches.

**Conclusion: genuinely inert to TOCTOU**, for the same structural reason the first review gave — each of the four consulted properties is read exactly once into a local variable inside a single contained `try/catch`, and every subsequent decision operates only on those locals, never re-reading `input.*`. I did not take that claim on faith; the probe above confirms it operationally, including cases the first review's own script did not enumerate (prototype-pollution on an empty object, numeric-string mode smuggling, a `riskClass` Proxy with a `getOwnPropertyDescriptor` trap specifically, not just `get`).

## 4. Shape-validation completeness on the injected collaborator (`risk-registry.riskProfile`) — PASS, checked rather than assumed

This is the MOD-GOV-S3 PDP class of bug: does this module trust an injected collaborator's output shape without validating it? `evaluateAccessRequest` calls `riskProfile(riskClass)` (line 268) **outside** the initial `try/catch` extraction block, and then dereferences `profile.value.humanApproval` without a defensive shape check. On its face this looks like exactly the pattern that took four rounds to close in the PDP. I traced it through rather than assuming either "it's fine because it's internal" or "it's a bug because it's unguarded":

- `riskProfile` (`src/control/risk-registry.mjs:179-183`) is `ownEntry(RISK_CLASSES, riskClass)` — `ownEntry` is `typeof key === "string" && Object.hasOwn(table, key) ? table[key] : undefined`. The `typeof` check short-circuits *before* any property access on a non-string `riskClass`, so a hostile object/Proxy/getter passed as `riskClass` is never touched by this function at all — confirmed by probe items 5–6 above (no throw, even with throwing `valueOf`/`toString`/`get`/`getOwnPropertyDescriptor`).
- For a valid string key, `RISK_CLASSES` is a `Object.freeze`d literal table fully owned by this same module family (not populated from any external/dynamic source), so `riskProfile` can only ever return `{ ok:false, code }` or `{ ok:true, value: <frozen literal with a real .humanApproval boolean> }` — there is no code path that returns `{ ok:true, value: undefined }` or a malformed `value`.
- Consequently `profile.value.humanApproval` can never throw for any input `evaluateAccessRequest` could possibly pass it (a string, or `undefined`, or any hostile non-string).

**This is a different situation from the PDP, not a smaller version of the same bug.** The PDP's shape-validation gap involved an injected resolver whose output shape genuinely varied at runtime (an actually pluggable collaborator). `risk-registry.mjs` is a static, frozen, hand-authored table with no external population path — its output shape is a closed invariant, not a runtime variable. The missing `try/catch` around the `riskProfile` call is not incorrect today, but it is a **latent fragility**: if `risk-registry.mjs` ever grows a non-literal/dynamic source for `RISK_CLASSES` (e.g., loaded from config or a plugin), this call site would need to be revisited, since `evaluateAccessRequest`'s own contract says "Never throws." Recorded as N3 below (advisory, not blocking).

## 5. Silent-fail-open — PASS, no coercion to a permissive default anywhere

Every deny path is an explicit, named code (`DENY_ACCESS_MODE_MALFORMED`, `DENY_ACCESS_MODE_UNKNOWN`, `DENY_ACCESS_ESCALATION`, `DENY_ACCESS_AUTHORIZATION_REQUIRED`). An unrecognized mode string never falls back to `"Observe"` or any other mode; `resolveModeRank` returns `UNKNOWN` via exact `indexOf` match, with no `.toLowerCase()`, `.trim()`-then-retry, or fuzzy matching anywhere in the file. The `requiresExplicitAuthorization` gate's only way to be satisfied is `profile.value.humanApproval === false` (a genuine identity check against a frozen constant, not a truthiness check) or the literal `explicitAuthorization === true` — every other value, including `1`, `"true"`, `{}`, `[]`, and absent/`undefined`, fails closed (reconfirmed by probe and by the shipped suite's own "everything-else-fail-closed" test).

## 6. Downstream consumers — one new caller found; assumption checked, no trust gap

`git grep -rn "access-mode-policy" --include="*.mjs"` at the current `main` tip returns the module itself, its test, and two additional *test* files (`tests/conformance-p0-18-candidate.test.mjs`, `tests/conformance-v020-governance.test.mjs`) that exercise it as part of larger conformance suites — plus, critically, **one real `src/` importer that did not exist when the first review was written**: `src/self-pilot/read-only-self-pilot.mjs` (commit `43ed19d`, dated after `677f149`).

That module (a separately-governed, self-certified P0-19 "candidate" orchestration — `candidate: true`, `p0_19_complete: false`, `activation: false`, its own advisory packet and cross-review already on file) calls `evaluateAccessRequest` exactly twice, at lines 298 and 300, with **hardcoded literal** requests as a self-proof, not with any live session/grant state:
```js
const observeGate = evaluateAccessRequest({ requestedMode: "Observe", grantedMode: "Observe" });
const escalationGate = evaluateAccessRequest({ requestedMode: "Control", grantedMode: "Observe" });
```
It asserts `observeGate.ok === true` and then **throws if `escalationGate.ok` is ever true** ("Escalation to Control was NOT blocked by the access-mode ladder"). This is a golden-path-plus-negative-proof pattern, not a caller relying on an unenforced guarantee: both literals are compile-time constants, there's no session/grant value flowing in from outside, and the assumption exercised (rank 0≤0 allows, rank 4>0 denies) is exactly what §2/§3 above confirm the evaluator actually does. I traced `tests/p0-19-self-pilot.test.mjs:164` ("GATE: read-only Observe is allowed but escalation to Control is denied") and confirmed the same assumption is asserted there too. **No downstream-caller trust-assumption gap.**

What *is* worth recording: the first review's B5 finding — "Importers: zero... wired to nothing" — was accurate for the commit it reviewed (`677f149`) but is no longer accurate as a literal statement about the current `main` tip. The module is still not wired into any live/session/`TransitionEngine`/gateway path (that boundary genuinely holds — no import of `state-machine.mjs`, `transition-engine.mjs`, or anything under a live/session/gateway path exists anywhere, including in `read-only-self-pilot.mjs`), but "zero importers" should be understood going forward as "zero importers *that feed it live/session state*," since a same-repo self-test harness now does import it. This doesn't change the verdict but should travel with the candidate so nobody re-asserts "zero importers, full stop" without re-checking.

## 7. Hardcoded test-ID branching — none found

`grep -inE "hardcoded|test-id|testId|TEST_ID|__test|isTest|NODE_ENV"` against `src/live/access-mode-policy.mjs` returns no matches. There is no special-casing of any identifier, environment variable, or test marker anywhere in the module.

## 8. Regression

- `npm install` (fresh `node_modules` in the isolated worktree) then `npm test`: **tests 1149 / pass 1146 / fail 0 / skipped 3.**
- `node --test tests/access-mode-policy.test.mjs` directly: **tests 28 / pass 28 / fail 0.**
- `git hash-object src/live/access-mode-policy.mjs` = `5d96eec7af6e717218a81ea5563e09c6b18d191b`, matching the pin in `tests/conformance-v020-governance.test.mjs` — confirmed byte-identical to the reviewed commit.

---

## Findings by severity

**CRITICAL / HIGH: none.**

**LOW / advisory (non-blocking):**

- **N1 (reconfirmed from first review) — risk-class waiver breadth for gated modes.** A caller-supplied `riskClass` with `humanApproval === false` (R0/R1/R2) waives the explicit-authorization attestation for Control/Emergency. Pairing e.g. R0 with Emergency is semantically odd but harmless for an unwired pure evaluator; the future adoption/wiring layer must constrain which risk classes may legitimately accompany a gated-mode request. Same as the first review's N2; independently reconfirmed, not re-derived from scratch.
- **N2 (reconfirmed, re-scoped) — this evaluator is a ceiling check, not a transition graph; that's correct for its stated scope, but a future wiring layer that needs "no skipping mandatory intermediate modes within one session" must add that check itself, since this module deliberately reads no session/current-mode state (B5).** See §2 for the full reasoning on why this isn't a gap in the evaluator itself.
- **N3 (new) — `riskProfile(riskClass)` is called outside the initial `try/catch`, relying on an implicit invariant (that `RISK_CLASSES` stays a static frozen literal) rather than a defensive shape check.** Not exploitable today (§4) — confirmed by direct probing with hostile `riskClass` values (throwing `valueOf`/`toString`/`get`/`getOwnPropertyDescriptor`), none of which reach a throw. Recorded so that if `risk-registry.mjs` ever grows a dynamic/pluggable source for `RISK_CLASSES`, this call site is revisited before that change ships, to keep faith with the module's own "Never throws" contract.
- **N4 (new) — the B5 "wired to nothing" / "zero importers" claim in the first review is stale against the current `main` tip, though the safety property it was protecting still holds.** `src/self-pilot/read-only-self-pilot.mjs` (landed after the first review) now imports and calls `evaluateAccessRequest` twice, with hardcoded literal requests as a self-proof (no live session/grant state flows in). No trust-assumption gap found in that caller (§6). Recommendation: future reviews of this module should re-run the importer grep against the *current* tip rather than cite the first review's "zero importers" number, since that number is a point-in-time fact, not an invariant the module itself enforces.

---

## Advisory status fields

```yaml
truth_status: verified_true            # every claim reproduced first-hand in a fresh isolated worktree; TOCTOU and shape-validation checks independently re-derived, not copied from the first review
authority_status: advisory_only
implementation_status: existing        # S2 code exists on main (merged prior to this review) as reviewed
risk_class: low                        # pure, additive evaluator; N3/N4 are latent/documentation-class notes, not exploitable defects
verdict: APPROVE_WITH_NOTES
blocking_findings: 0
advisory_notes: 4                      # N1 (reconfirmed), N2 (reconfirmed/re-scoped), N3 (new, latent), N4 (new, stale-claim correction)
self_certification:
  agent_id: claude-rev-sec-live-s2-002
  peer_agent_id: claude-immune-rev-live-s2-01
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

> Independent review verdict is advisory. This record recommends APPROVE_WITH_NOTES; it authorizes no merge, push, wiring, or activation, and it carries no authority over the merge that has already occurred. N3 and N4 should travel with the candidate so a future maintainer does not mistake either for an active exploit, and so "zero importers" is re-checked against the tip in force at the time, not cited from this or the first review indefinitely.
