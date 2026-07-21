# MOD-WSPACE Lease-Primitive — SECOND Independent Review 001

**Record ID:** MOD-WSPACE-LEASE-SECOND-REV-001 / mod-wspace-lease-second-independent-review-001
**Status:** ADVISORY — reviewer verdict, not an authorization
**Reviewer:** claude-rev-wspace-lease-second-01 (BST-SA immune/REV role, independent — no relationship to the producer or to the first reviewer of record `c2666b9`)
**Date:** 2026-07-21
**Review target:** `main` @ `c85de6d` (merge of PR #42, `bst/mod-wspace-lease-staged`); source commit `5610d48` "[MOD-WSPACE-S2] Workspace-lease lifecycle primitive (PURE, UNWIRED, ledger-free)"; prior review commit `c2666b9` "[MOD-WSPACE-LEASE-REV] Immune review: APPROVE_WITH_NOTES + numbering ruling"
**This review's base:** current `main` @ `c52db71` (post `#41`/`#42`/`#43`/`#44`; includes the later `ATOMIC-SNAPSHOT-HARDENING` commits `3f9b892`/`cc63e9a` that closed the first reviewer's F3 finding in-place on `main`)
**Method:** independent, adversarial, first-hand. Fresh isolated worktree at `C:/Users/ounkh/SecB-worktrees/mod-wspace-lease-second-review-001` on new branch `bst/mod-wspace-lease-second-review-001`, `npm ci`, full `npm test`, targeted lease-file run, `node tools/validate-foundation.mjs`, hand-written novel adversarial probes (not shipped with the candidate) exercising TOCTOU, identity/provenance, renewal edge cases, and Proxy-invariant behavior. No push, no merge, no modification of `main` or any existing branch.

---

## Verdict

**APPROVE_FOR_MERGE** (already-merged status reconfirmed; no changes requested)

After first-hand adversarial review — including deliberately trying to reproduce the exact bug classes this project's prior second-opinion reviews have found (hardcoded test-ID branching, schema/validator no-ops, SoD/identity gaps, case-normalization gaps, cross-field TOCTOU à la MOD-LIVE S1's N1, silent-skip-instead-of-deny, and lease-specific expiry/renewal/spoofing edge cases) — I could not break this primitive. I confirm the first reviewer's findings are accurate and, notably, find that the one substantive issue they raised (F3, LOW) was **already fixed on `main` by a later, unrelated commit** (`ATOMIC-SNAPSHOT-HARDENING`, `3f9b892`/`cc63e9a`) before I even started. I did not find any HIGH, MEDIUM, or new LOW-severity bug the first reviewer missed. One documentation-adjacent observation (not a defect) is noted below for completeness.

---

## 1. Test verification (first-hand)

Run from an isolated worktree of current `main` (`c52db71`), not the original candidate branch (already merged/deleted its remote ref):

- `npm ci`: clean install, 6 packages.
- `npm test` (full suite): **tests 961 / pass 956 / fail 0 / skipped 5 / cancelled 0**. (This is higher than the 868/863/0/5 the first reviewer recorded at `5610d48`, because current `main` has since absorbed PR #43 and #44 — including the `ATOMIC-SNAPSHOT-HARDENING` slice — on top of #42.)
- `node --test tests/workspace-lease-policy.test.mjs` in isolation: **27/27 pass, 0 fail**, confirming the lease module's own suite is green and its exact count.
- `node tools/validate-foundation.mjs`: **status PASS** (schema set-equality, manifest uniqueness, mandatory identity fields all pass; no findings related to this module).

## 2. PURE claim — verified true

`grep`'d `src/control/workspace-lease-policy.mjs` for `Date.`, `Math.random`, `require(`, `process.`, `fs.`, `child_process`, `setTimeout`/`setInterval`: the only hits are two comment lines explicitly stating the module *never* calls `Date.now`/`Date.parse`. The only `import` in the file is `evaluateWriteSet` from the sibling `write-set-policy.mjs`, which is itself pure (verified by reading it in full — no I/O, no clock, no randomness). All three exported functions (`mintLease`, `evaluateLease`, `renewLease`) take every time value (`issuedAt`, `now`, `renewedAt`) as a caller-injected parameter. **PURE is genuinely true.**

## 3. UNWIRED claim — verified true

`grep -rn "workspace-lease-policy"` across the full working tree (excluding `node_modules`) returns exactly three hits, all inside `tests/workspace-lease-policy.test.mjs` itself (its own import line, a doc comment, and a fixture path string) plus the two `MANIFEST.json` listing lines for the module and its test file. **Zero importers anywhere in `src/`, `tools/`, or any other service.** `mcp-gateway-core.mjs` still consumes `workspace_lease_id` as an opaque string (confirmed by the shipped byte-identity guard test, which I re-ran and also independently re-verified is still true against current `main`). **UNWIRED is genuinely true.**

## 4. Ledger-free / statelessness — verified genuinely stateless, tradeoff correctly disclosed

The module holds **no state whatsoever**: no module-level mutable variable, no `Map`/`Set`/cache, nothing that persists across calls. The only module-level bindings are frozen constants (`WORKSPACE_LEASE_DENY_CODES`, two `Symbol`s, one captured intrinsic reference). Every exported function is a pure function of its arguments — confirmed by minting the identical input twice and observing two independent, deep-equal-but-not-reference-equal lease objects with no cross-call interaction.

Because there is no ledger and no state, there is also **no lease-uniqueness enforcement, no conflict detection between two "active" leases, and no provenance/identity verification of `actorId`/`sessionId`** — a hand-crafted object shaped like a lease record (never actually minted by `mintLease`) is accepted at face value by `evaluateLease`/`renewLease`. I verified this is a **disclosed, deliberate design tradeoff**, not an unexamined gap: the gap assessment's own §4 S3 description and non-goal §5 #5 state explicitly that "single-writer/lease-conflict enforcement... needs a lease-granting authority this plan does not build," and the commit message repeats that renewal "does NOT itself gate on prior expiry... a grant-authority decision this pure primitive does not hold." The first reviewer's B2/B5 boundary checks implicitly rely on this but do not spell out the "any caller can renew a hand-forged lease under any actorId" consequence in so many words. I consider this a **correctly-disclosed, non-blocking design property** (consistent with the module's stated purpose as a caller-persisted, ledger-free primitive whose adoption/wiring is explicitly deferred to a separately-governed R3 step) rather than a new finding — flagging it here only so the record states it explicitly for whoever eventually designs the wiring/ledger step.

## 5. Bug-class sweep (the project's recurring findings)

| Class | Result |
|---|---|
| Hardcoded test-ID / environment branching | None found — grep for suspicious literals, env checks, `NODE_ENV`, test-only branches: clean. |
| Schema/validation no-op conditional | N/A — this slice adds no schema (by design, disclosed scope divergence from assessment S3); nothing to no-op. |
| SoD / duplicate-identity gap in lease-holder identity | Confirmed absent by design (see §4) — not a gap unique to this candidate but an inherent property of "ledger-free," correctly disclosed. |
| Case-sensitivity / normalization gap in lease-key comparison | The lease's own `writeSet` containment reuses `evaluateWriteSet`'s prohibited-path case-folding (irrelevant here since a lease always passes `prohibitedPaths: []`) and case-sensitive allowed-path prefix matching — case-sensitive-only matching is the **safe (stricter) direction** on a case-insensitive filesystem (a case mismatch can only cause an over-strict deny, never a false allow); confirmed with a live probe (`c:/control/x` denied as absolute; duplicate-case entries in a `writeSet`, e.g. `["src/control","Src/control"]`, mint fine but grant no more than either alone would, since containment is exact-prefix). No exploitable gap. |
| Cross-field TOCTOU (MOD-LIVE S1 N1-style) | Actively probed: (a) a getter on an *earlier*-read field (`actorId`) that mutates a *later*-read sibling (`issuedAt`) on the same source object mid-extraction — result was a coherent, single fail-closed `DENY_LEASE_MALFORMED`, never a mixed/incoherent lease; (b) a `Proxy`-wrapped *already-frozen* lease record with a value-varying `get` trap on `writeSet` — the JS engine itself enforces the frozen-target invariant (a non-configurable/non-writable property's trap value must match the target), so the attempt throws and is contained to `DENY_LEASE_MALFORMED` by the existing try/catch; read-count confirmed exactly 1. No TOCTOU gap found. |
| Silent-skip-instead-of-fail-closed | None found — every malformed path (blank/null-byte/non-string identity fields, non-integer/negative/overflowing timestamps, non-array `writeSet`/`requestedWriteSet`, sparse arrays with holes, `null` vs `undefined` for optional `ttl` in `renewLease`) denies with a structured code; nothing coerces to a permissive default. Specifically verified `ttl: null` in `renewLease` options is **not** silently treated as "omitted → carry original ttl forward" (only literal `undefined` triggers that fallback) — `null` correctly denies as malformed. |
| Lease expiry/renewal edge cases | `now === expiresAt` denies `EXPIRED` (confirmed, `>=` semantics); `renewedAt === original.issuedAt` allowed (monotonic non-strict, confirmed); `renewedAt === original.expiresAt` (renewing exactly at the moment of expiry) **allowed** — confirmed as the disclosed, deliberate design ("renewal does not gate on prior expiry"), not a bug; zero/negative/fractional/`Infinity`/`NaN`/`bigint`/string `ttl` all deny at both mint and renew; `issuedAt + ttl` and `renewedAt + ttl` safe-integer overflow both deny; a lapsed lease renewed far past its original expiry mints a new, correctly-live candidate at the new anchor (again, disclosed design — a "renewal" of an expired lease is a grant-authority decision this primitive does not hold, by design). No lease-holder-identity-spoofing gap beyond the already-disclosed lack of provenance binding (§4). |

## 6. Confirmation of the first reviewer's F3 finding and its resolution

The first review (`c2666b9`) flagged **F3 (LOW)**: a caller-supplied `writeSet` array element could be read multiple times across `evaluateWriteSet`'s self-check and `freezeLease`'s spread, so a value-varying index getter could make the *stored* set differ from the *validated* set (probe 4e). I confirmed this finding was accurate by reading the code at `5610d48` and diffing it against current `main`. I also confirmed it is **no longer present on `main`**: a later, unrelated commit set — `[ATOMIC-SNAPSHOT-HARDENING] Close N2/L1 (event-family) and F3 (workspace-lease)` (`3f9b892`) folded onto main as `cc63e9a`, and re-gated at `1ebf389` — added a local `snapshotArray` twin inside `workspace-lease-policy.mjs` that single-reads each `writeSet` index once and reuses that same snapshot for both the self-containment check and the frozen stored record. The shipped test suite now includes two dedicated F3-regression tests (`F3 regression: a value-varying writeSet INDEX getter is read once...` and `...each writeSet index is read exactly once at mint...`), both of which pass. I independently re-ran the exact style of probe (index getter returning different values on each read) via my own adversarial script and confirmed `reads === 1` and `stored === validated`. **F3 is closed.**

## 7. Novel probes this review ran that the shipped suite does not cover

None of the following are shipped in `tests/workspace-lease-policy.test.mjs`; all were run standalone in the isolated worktree and all passed (no bug found):

1. Chained renewal (5 sequential renewals) never drifts `writeSet`.
2. `options.writeSet` passed to `renewLease` (an attempt to widen scope through an undocumented/ignored option) is silently and correctly ignored — the renewed lease keeps exactly the original `writeSet`.
3. `now: -0` treated as epoch 0 (not malformed) — `Number.isSafeInteger(-0)` is `true` in JS; behaves identically to `0`.
4. `requestedWriteSet` as a sparse array (holes) denies (`DENY_LEASE_WRITE_SET_EXCEEDED` / `DENY_WRITE_SET_MALFORMED` detail) rather than silently skipping the holes.
5. `leaseId` supplied as an object with a custom `toString()` (not a real string) is rejected as malformed — no implicit string coercion.
6. A `Proxy` around `requestedWriteSet` with a throwing `has` trap only (get untouched) does not disrupt the single-read, index-based extraction (the implementation never uses the `in` operator or iterator protocol on this array).
7. Path-prefix confusion check: a lease `writeSet` containing both `"src/control"` and `"src/controlled"` does not let a request for `"src/controlled-evil/x"` slip through via string-prefix (as opposed to path-segment-prefix) confusion — correctly denied.
8. Unicode NFD-normalized path denied while the NFC-equivalent path is allowed (deliberate `normalize("NFC") !== canonical` fail-closed check in `write-set-policy.mjs`) — confirmed as a hardening property, not a bug.
9. `renewLease` on a hand-forged (never-minted) lease-shaped plain object succeeds and carries forward whatever `actorId` it was given — documents, but does not newly discover, the disclosed lack of provenance binding (§4).

## 8. Scope/boundary re-verification (independently reproduced, not merely trusted)

- **3-file scope, zero importers:** reproduced (§3).
- **Byte-identity of `write-set-policy.mjs` and `mcp-gateway-core.mjs`:** the shipped byte-identity test still passes against `main`; I additionally confirmed `mcp-gateway-core.mjs` still contains the literal string `workspace_lease_id` and is not otherwise touched.
- **No schema/ledger/validator edits:** confirmed — `grep` for `workspace-lease` in `contract-validator.mjs` and `tools/validate-foundation.mjs` returns nothing; the schema/ledger half of assessment S3 remains genuinely undelivered, consistent with the first reviewer's numbering ruling.
- **Numbering ruling:** I re-read the assessment (`mod-wspace-gap-assessment-001`) and confirm the first reviewer's ruling is correct: the assessment's real S2 (overlap-class evaluator, `overlap-policy.mjs`) is a different, still-undelivered slice, and this candidate is a strict subset of assessment-S3 (lease record), not "S2" as its own commit/branch name claims. I found no reason to disturb that ruling.

## 9. What I looked for and did not find

- No hidden clock/random dependency (§2).
- No hidden persistence/global mutable state (§4).
- No wiring anywhere outside its own files (§3).
- No new TOCTOU, no new expiry/renewal edge-case gap, no new identity/spoofing gap beyond what is already disclosed as an explicit design tradeoff (§4, §5).
- No prototype-pollution vector (tested `__proto__`-valued path strings and object keys — they are treated as ordinary string/property values, never smuggled).
- No regression versus the first reviewer's 37/37 probes — all still pass on current `main`, and the one issue they raised (F3) is independently confirmed fixed.

## Advisory status fields

```yaml
truth_status: verified_true          # all evidence read/executed first-hand on current main (c52db71) in an isolated worktree; 961/956/0/5; lease-file 27/27; validator PASS
authority_status: advisory_only      # second independent reviewer verdict; no push, no merge, no authorization implied
implementation_status: existing      # this primitive is already merged to main; this record reviews it, it does not propose new work
risk_class: low                      # confirms R2 pure additive policy primitive; no authority semantics, no wiring, no I/O
```

## self_certification

```yaml
self_certification:
  agent_id: claude-rev-wspace-lease-second-01
  peer_agent_id: claude-immune-rev-wspace-lease-01   # the first reviewer, for provenance only — not a joint approval
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

---

*Provenance — source: independent second-opinion review of `main`@`c85de6d` (candidate `bst/mod-wspace-lease-staged`@`5610d48`) against `mod-wspace-gap-assessment-001` and the first review `mod-wspace-lease-primitive-rev-001`@`c2666b9`. No relationship to the producer or the first reviewer. Timestamp: 2026-07-21. Agent ID: claude-rev-wspace-lease-second-01. Cross-links: `mod-wspace-gap-assessment-001` (G2/S3), `mod-wspace-lease-primitive-rev-001` (first review, F3 finding and numbering ruling), `MANIFEST.json`, `ATOMIC-SNAPSHOT-HARDENING` commits (`3f9b892`/`cc63e9a`/`1ebf389`, F3 closure).*
