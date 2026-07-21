# Atomic-Snapshot Re-Gate 001 — Immune gate over the hand-folded hardening commit

**Reviewer identity:** `claude-immune-regate-atomic-snapshot-01`
**Role:** immune (advisory only)
**Target commit:** `cc63e9a07554e60fbadff1105bc3ccc205140a4f` (`[ATOMIC-SNAPSHOT-HARDENING] Fold onto post-#41/#42/#43 main: N2+L1+F3 closure`)
**Parent / merge-base:** `c85de6dab78882496b8622508aadb1112894cf05` (current `main` tip; carries PR #41 + #42 + #43)
**Scope pin:** review pinned to commit tip `cc63e9a`.
**Date:** 2026-07-21

## Purpose

Independent Immune gate over a HAND-FOLDED integration commit. This is not a
re-review of the fix content (that was gated by `atomic-snapshot-hardening-001.md`);
it verifies that the *fold itself* introduced no error and that the two residuals
(N2 event-family, F3 lease) plus L1 are genuinely closed on the **combined** post
#41/#42/#43 tree.

## Verdict

**GATE_CLOSED**

---

## 1. Fold integrity — `truth_status: verified_true`

`git diff c85de6d cc63e9a` touches **exactly** six paths, no collateral:

| Path | Kind |
|------|------|
| `src/live/event-family-policy.mjs` | source (N2/L1) |
| `tests/event-family-policy.test.mjs` | test |
| `src/control/workspace-lease-policy.mjs` | source (F3) |
| `tests/workspace-lease-policy.test.mjs` | test |
| `docs/03-project-control/candidates/atomic-snapshot-hardening-001.md` | hardening record |
| `MANIFEST.json` | +1 line (appends the hardening record) |

- **event-family is the `Reflect.ownKeys` version, not the superseded PR #41 per-field
  descriptor version.** The diff **removes** the old two-pass
  `DOCTRINE_CONFORMANCE_ELEMENTS.map(spec => Object.getOwnPropertyDescriptor(...))`
  loop + `descriptor.get.call(envelope)`, and **adds** a single
  `const ownKeys = new Set(Reflect.ownKeys(envelope))` snapshot. On `cc63e9a` there
  are 3 `getOwnPropertyDescriptor` occurrences and ALL are in comments; **zero** in
  executable code. `Reflect.ownKeys` present at the snapshot line (278).
- **Lease `writeSet` uses a single `snapshotArray` at mint.** `normalizeLeaseFields`
  computes `writeSetSnapshot = snapshotArray(writeSet)` once and routes it into BOTH
  the self-containment check (`candidatePaths === allowedPaths === writeSetSnapshot`)
  AND the stored/normalized field. `freezeLease` spreads that same snapshot.
- `classifyEventType` is untouched by the diff.

## 2. N2 CLOSED — rebuilt attack on THIS tree — `truth_status: verified_true`

Empirical harness executed against the module as it stands on `cc63e9a`
(`assessEnvelopeConformance`), a Proxy envelope (passes `isPlainAssessableObject`,
which admits any non-array object incl. Proxy), instrumented trap counters:

| Direction | ownKeys trap calls | getOwnPropertyDescriptor trap calls | get trap calls | Outcome |
|-----------|-------------------:|------------------------------------:|---------------:|---------|
| **Suppression** (descriptor trap fabricates a truly-absent sibling `trace_id`) | **1** | **0** | 7 | sibling still reported ABSENT — descriptor lie ignored |
| **Fabrication** (hostile `ownKeys` drops `span_id`; `get` returns `undefined` for `sequence`) | **1** | **0** | 7 | findings = `[span_id, sequence]`, exactly consistent with the single-snapshot semantics |

- `getOwnPropertyDescriptor` trap fired **0** times across BOTH directions — the
  per-field descriptor amplification vector no longer exists.
- `ownKeys` trap fired **exactly once** per assessment.
- A mid-assessment inject/delete of a sibling via the descriptor trap **cannot change
  findings** versus the single `Reflect.ownKeys` snapshot. The one documented residual
  (a hostile `ownKeys` trap dropping a key on its single call) behaves exactly as the
  hardening record states: a single contained call, not per-field amplification, and
  its result is authoritatively the snapshot.

## 3. L1 CLOSED — `truth_status: verified_true`

The in-source doc comment no longer overclaims. It explicitly narrows the earlier
"descriptor reads mean no side effect can occur here" claim to hold "true only for
plain objects and only for the getter vector," and enumerates PLAIN-object
(side-effect-free) vs PROXY (two contained trap surfaces: one `ownKeys`, per-field
`get`) honestly. Matches `atomic-snapshot-hardening-001.md` §L1.

## 4. F3 CLOSED — `truth_status: verified_true`

Empirical harness: an array with a value-varying index-0 getter (1st read
`safe/path.txt`, 2nd read `../evil/escape`) and a locked `length: 1` passed to `mintLease`.

- Index getter fired **exactly once** (`reads === 1`).
- Stored `writeSet` = `["safe/path.txt"]` — the validated first value. The traversal
  second value never entered: **stored === validated**.
- `snapshotArray` reads `length` once, rejects a tampered `Symbol.iterator` without
  invoking it, copies each index once into a fresh own-data array.
- Scalar-field accessor discipline still holds on all three lease entry points
  (`mintLease`, `evaluateLease`, `renewLease` all route through `readFields` +
  `normalizeLeaseFields`).

## 5. No collateral regression — `truth_status: verified_true`

Behavioral spot-checks on `cc63e9a`:

- **Event non-hostile:** empty `{}` → 8 absent findings; fully-populated → 0 findings,
  `ok:true`; partial (`span_id: undefined`) → `[span_id]` absent. As documented.
- **`classifyEventType`:** unchanged (not in diff; `typeof === "function"`).
- **Lease expiry fail-closed:** missing `now` → `DENY_LEASE_MALFORMED`; `NaN` now →
  malformed; expired → `DENY_LEASE_EXPIRED`; valid → `ok:true`.
- **Precedence / no widening:** request outside lease set →
  `DENY_LEASE_WRITE_SET_EXCEEDED`.
- **Renew:** time extension only — `renewLease` sources `writeSet` from the original
  lease (`normalized.writeSet`), never from options; a bogus `writeSet` option is
  ignored (stays `["src/a.txt"]`), `issuedAt` advances, `expiresAt = renewedAt + ttl`.
  No scope change.

## 6. Regression / validator / mergeability — `truth_status: verified_true`

- **Full suite (`npm test`):** tests **961**, pass **956**, fail **0**, cancelled 0,
  skipped **5**, todo 0. Matches expected 961/956/0/5. Includes the F3 element-level
  regressions and the N2 tests, plus the byte-identity guard (files read-but-unmodified
  unchanged vs main).
- **`npm run validate`:** exit **0**.
- **Mergeability:** `merge-base(cc63e9a, main) == c85de6d == current main tip`; `main`
  is an ancestor of `cc63e9a` → **fast-forward mergeable**, direct descendant. Main tip
  carries #41 (merge `7d8bfbf`), #42 (`c85de6d`), #43 (`85146b7`).

---

## Advisory status fields

- `truth_status`: verified_true
- `authority_status`: advisory_only
- `implementation_status`: existing
- `risk_class`: low

## Residual-boundary note (carried, not re-litigated)

The hardening record already records two truthful residual boundaries — a hostile
single-call `ownKeys` trap and the per-field value-channel `get` trap. This gate
confirms both are single contained invocations, NOT per-field amplification, and that
neither expands blast radius. Both modules remain PURE + UNWIRED (no live blast radius
today). No new residual identified by this gate.

## Authority

This is an advisory Immune gate. It does not authorize merge, does not declare
production, and does not self-authorize execution. Merge remains an operator action.

```yaml
self_certification:
  agent_id: claude-immune-regate-atomic-snapshot-01
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```
