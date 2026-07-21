# Atomic-Snapshot Hardening 001 — N2 / L1 / F3 closure (fail-closed extraction discipline)

**Record ID:** atomic-snapshot-hardening-001
**Status:** DRAFT / ADVISORY — NOT EFFECTIVE (advisory-only; no wiring, no production declaration)
**Producer:** claude-motor-atomic-snapshot-hardening-01 (BST-SA motor, isolated worktree)
**Date:** 2026-07-21
**Base:** `main` @ `9648eb1` (Merge pull request #40 from bstBizEra/bst/mod-live-s2-staged)
**Branch:** `bst/atomic-snapshot-hardening`
**Class:** two atomic-snapshot residuals in the same fail-closed-extraction discipline class, both on PURE + UNWIRED modules (zero live blast radius today).

This record closes three review residuals produced against not-yet-merged fix
branches:

- **N2** and **L1** — from `mod-live-s1-toctou-fix-rev-001` (review of branch
  `bst/mod-live-s1-toctou-fix-001`, the N1 fix staged for PR #41).
- **F3** — from `mod-wspace-lease-primitive-rev-001` (review of branch
  `bst/mod-wspace-s2-lease`, the lease primitive staged for PR #42).

---

## Closure map

### N2 (MEDIUM) — `assessEnvelopeConformance` snapshot not atomic for a Proxy envelope

**Finding.** Per-field presence probing (`Object.hasOwn` at base `9648eb1`; the
eight sequential `Object.getOwnPropertyDescriptor` calls in the PR-#41 N1 fix)
runs Proxy trap code once per doctrine element in the public
`DOCTRINE_CONFORMANCE_ELEMENTS` order. A `getOwnPropertyDescriptor` (or `has`)
trap keyed on an earlier field can inject or delete a LATER field before that
field is captured — reproducing both suppression (fabricated presence) and
fabrication (fabricated absence).

**Fix (snapshot approach).** In `src/live/event-family-policy.mjs`,
`assessEnvelopeConformance` now takes ONE structural snapshot of the own-key set
via a single `Reflect.ownKeys(envelope)` call into a plain `Set`, and decides
key-presence ONLY from that captured set. No per-field existence probe is
issued, so no descriptor/`has` trap can run in element order and mutate a
sibling before capture. Each present field's value is then taken with ONE
contained read (`envelope[element]`); key-presence is already fixed, so a value
read cannot change any sibling's presence decision.

**Empirical basis (throwaway `node` probes, deleted after use).**
- `Reflect.ownKeys(proxy)` does NOT invoke a `getOwnPropertyDescriptor` trap
  (observed trap invocation count = 0 for an extensible target with configurable
  keys) — so injection/deletion via that trap can no longer occur during the
  snapshot.
- The `ownKeys` trap fires EXACTLY ONCE for the snapshot.
- A throwing `getOwnPropertyDescriptor` trap is now fully inert (never called),
  so it neither denies nor perturbs findings.

**Status:** closed. `truth_status: verified_true` (injection, deletion, and
single-invocation reproduced first-hand against the committed module).

### L1 (LOW, doc-accuracy) — the fix comment overclaimed closure

**Finding.** The N1 fix comment stated a descriptor read means "no side effect
can occur here" — true only for plain objects and only for the getter vector,
false for a Proxy (a `getOwnPropertyDescriptor` trap is itself a side-effecting
operation).

**Fix.** The `assessEnvelopeConformance` doc comment now states exactly what is
and is not guaranteed:
- PLAIN object: `Reflect.ownKeys` runs no user code — the snapshot is genuinely
  atomic and side-effect-free; the exported element order cannot
  cross-contaminate any presence decision.
- PROXY: exactly two contained trap surfaces remain — a single `ownKeys` trap
  invocation, and one `get` read per present field — NEITHER able to change a
  sibling's key-presence. A `getOwnPropertyDescriptor` trap is never invoked and
  is fully inert.

**Status:** closed. `truth_status: verified_true`.

### F3 (LOW, defense-in-depth) — mint-time `writeSet` array-element read is 2–3×

**Finding.** In `src/control/workspace-lease-policy.mjs`, a mint-time
caller-supplied `writeSet` element was read 2–3× (twice inside
`evaluateWriteSet`'s self-check as both `candidatePaths` and `allowedPaths`, plus
once in `freezeLease`'s spread). A value-varying INDEX getter could make the
stored frozen set differ from the exact value the self-check validated
(rev-001 probe 4e: stored `["src"]` while `"src/control/narrow.mjs"` was the
checked candidate; reads = 3).

**Fix (snapshot approach).** `normalizeLeaseFields` now snapshots the caller's
`writeSet` ONCE via a bounded single-pass `snapshotArray` (the WSPACE-S1
discipline: reads `length` once, rejects a tampered `Symbol.iterator` without
invoking it, copies each index exactly once). The SAME plain snapshot is used for
BOTH the `evaluateWriteSet` self-check AND the stored frozen set (`freezeLease`
spreads `normalized.writeSet`), so stored === validated always. A throwing index
getter is contained to `DENY_LEASE_MALFORMED` at this boundary rather than
propagating.

**Status:** closed. `truth_status: verified_true` (element read exactly once at
mint; stored set equal to first-read snapshot).

---

## Snapshot approach per residual (summary)

| Residual | Module | Primitive | Guarantee |
|----------|--------|-----------|-----------|
| N2 | `event-family-policy.mjs` | single `Reflect.ownKeys` -> plain `Set` | key-presence fixed atomically; no per-field descriptor/`has` probe |
| L1 | `event-family-policy.mjs` (comment) | — | claim narrowed to exactly what holds for plain vs Proxy inputs |
| F3 | `workspace-lease-policy.mjs` | single-pass `snapshotArray` at mint | stored `writeSet` === validated `writeSet`; each index read once |

---

## Residual-boundary honesty note

The hardening closes the cross-field key-level TOCTOU class. Two residual
boundaries remain and are recorded truthfully rather than overclaimed as absent:

1. **N2 — hostile `ownKeys` trap.** The own-key snapshot is a single
   `Reflect.ownKeys(envelope)` call. If a Proxy's `ownKeys` trap is itself
   hostile (mutates state on that ONE invocation), that mutation is a single,
   contained call — not a per-field amplification. This is the intended,
   documented boundary: one trap call, one snapshot.

2. **N2 — value-channel per-field `get`.** Key-presence is fixed by the
   structural snapshot, so a `get` trap CANNOT fabricate or suppress a SIBLING's
   key-presence. It governs only its own field's value: a hostile `get` trap for
   field X, on its single contained read, could in principle return `null`/a
   deleted value for X, flipping X's own presence — but this is X's own
   single-read boundary (WSPACE-S1 discipline), not cross-field manipulation, and
   a throwing `get` trap is contained to the malformed denial. Closing this
   value-channel entirely would require reading values without invoking any `get`
   trap, which is not possible for a Proxy; it is therefore an accepted, contained
   single-read boundary, not a class-level residual.

3. **F3 — none beyond the WSPACE-S1 single-read discipline.** The mint-time
   `writeSet` is snapshotted once; stored === validated is now structural. The
   `writeSet` is caller-self-declared (no external authority to widen against),
   and `evaluateLease` re-validates the stored plain frozen set fail-closed at
   evaluate time.

---

## Scope, behavior preservation, and boundaries

- **Files changed:** `src/live/event-family-policy.mjs`,
  `tests/event-family-policy.test.mjs`, `src/control/workspace-lease-policy.mjs`
  (materialized — see fold note), `tests/workspace-lease-policy.test.mjs`
  (materialized), `MANIFEST.json` (three additive entries), and this record.
- **No behavior change for non-hostile inputs.** All plain-object and
  legitimate-Proxy paths are byte-for-byte equivalent in outcome; the full
  pre-existing lease suite passes unmodified.
- **One necessary existing-test change (disclosed).** In
  `tests/event-family-policy.test.mjs`, the test previously asserting "a throwing
  Proxy `getOwnPropertyDescriptor` trap yields the malformed denial" is REWRITTEN
  to assert the new, strictly-stronger guarantee: that trap is now NEVER invoked
  (inert) and cannot deny, mutate, or perturb findings, while "never throws" is
  preserved. This is unavoidable: the N2 fix eliminates the exact per-field
  descriptor probe that test encoded, so the descriptor trap can no longer run at
  all. It is a strengthening, not a weakening — no fail-closed guarantee is
  removed (a throwing GET trap still denies; a malformed envelope still denies).
- **No wiring.** Both modules remain PURE + UNWIRED; no consumer, no schema, no
  ledger, no gateway edit. Deep-frozen outputs preserved.
- **Byte-identity of unaffected guarded files preserved.** `write-set-policy.mjs`
  and `mcp-gateway-core.mjs` are byte-identical to `332b7ab` (== `9648eb1` for
  both blobs, verified), so the lease suite's byte-identity guard holds; the
  event-family suite's `280d32c` pins are untouched.

---

## Fold-sequencing note (operator/coordinator action required)

This branch is produced FROM `main` @ `9648eb1`, which PREDATES both:

- **PR #41** (event-family TOCTOU N1 fix, `bst/mod-live-s1-toctou-fix-001`) — at
  `9648eb1`, `event-family-policy.mjs` still carries the ORIGINAL single-loop
  `Object.hasOwn` assessor. This hardening REPLACES that assessor with the
  `Reflect.ownKeys` structural snapshot, which closes N1 AND N2 AND L1 together
  and therefore SUPERSEDES the PR-#41 Pass-1 descriptor approach. When folding
  onto a `main` state that already carries PR #41, take THIS branch's
  `assessEnvelopeConformance` and the rewritten/added N2 tests as the winning
  version for the conflicting region.

- **PR #42** (lease primitive, `bst/mod-wspace-s2-lease`) — at `9648eb1`,
  `src/control/workspace-lease-policy.mjs` and `tests/workspace-lease-policy.test.mjs`
  DO NOT EXIST. This branch MATERIALIZES them from `bst/mod-wspace-s2-lease` @
  `5610d48` in their F3-hardened form. When folding onto a `main` state that
  already carries PR #42, take THIS branch's F3-hardened lease module + test (and
  DE-DUPLICATE the three `MANIFEST.json` entries added here against PR #42's own
  lease/manifest entries, or the `manifest.unique` validator check will fail).

Produced against `9648eb1` cleanly regardless; the operator/coordinator
sequences the fold. This record neither merges, pushes, nor activates anything.

---

## Verification

- `npm run validate` — exit `0` (`status: PASS`).
- `npm test` — `tests 924 / pass 919 / fail 0 / skipped 5` (baseline at `9648eb1`
  was `894 / 889 / 0 / 5`). The lease suite is materialized as 27 tests (25
  pre-existing pass unmodified + 2 new F3 element-level regressions); the
  event-family suite goes 26 -> 29 (one rewritten hostile-input test + three new
  N2 regressions: injection, deletion, single `ownKeys` invocation).

---

## Advisory status fields

```yaml
truth_status: verified_true          # N2/L1/F3 closures reproduced first-hand at branch tip
authority_status: advisory_only      # motor worker; no push, no merge, no wiring
implementation_status: candidate     # hardening on PURE + UNWIRED modules; awaits operator fold + governance
risk_class: low                      # zero live blast radius (no consumers); defense-in-depth on additive policy primitives
```

## self_certification

```yaml
self_certification:
  agent_id: claude-motor-atomic-snapshot-hardening-01
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

> Advisory hardening on PURE + UNWIRED modules. Recommends the N2/L1/F3
> closures for operator/governance review and sequenced fold; it does not merge,
> push, wire, or authorize activation, and carries no authority to weaken any
> gate. The discipline must be correct before this pattern is reused or wired.
