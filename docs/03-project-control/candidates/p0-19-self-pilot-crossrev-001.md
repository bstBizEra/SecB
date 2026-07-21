# P0-19 Read-Only Self-Pilot — Immune Cross-Review Record

**Document ID:** SECB-P0-19-SELFPILOT-CROSSREV-001
**Status:** ADVISORY / CROSS-REVIEW COMPLETE / NOT AN AUTHORITY
**Reviewer:** claude-immune-crossrev-p0-19-selfpilot-01 (BST-SA immune worker)
**Target branch:** `bst/p0-19-self-pilot-candidate`
**Target commit:** `43ed19d`
**Base:** main @ `385ac65943f2a5b158c8ec20a5fd947f06cd2987` (== current main tip)
**Reviews:** [`p0-19-self-pilot-candidate-001.md`](p0-19-self-pilot-candidate-001.md) +
[`../../../src/self-pilot/read-only-self-pilot.mjs`](../../../src/self-pilot/read-only-self-pilot.mjs) +
[`../../../src/self-pilot/fixtures.mjs`](../../../src/self-pilot/fixtures.mjs) +
[`../../../tests/p0-19-self-pilot.test.mjs`](../../../tests/p0-19-self-pilot.test.mjs)
**Intended-boundary sources:** [self-pilot spec](../self-pilot.md) · [ADR-0004](../../adr/0004-read-only-self-pilot.md) · [P0 backlog](../../09-delivery/backlog-p0.md)

> This is an **advisory immune cross-review**. It certifies review completeness
> only. It does **not** approve execution, does **not** complete P0-19, does
> **not** render the P0-20 governance verdict, and is **not** activation. All
> authority remains SEC/GOV-gated and operator-owned.

## Verdict: APPROVE_WITH_NOTES

The candidate is a structurally sound, genuinely read-only composition of the
ratified primitives. **All four authority-critical checks PASS.** One
must-fix-before-merge integrity defect (orphaned test glob) prevents an
unconditional APPROVE_FOR_MERGE but does not compromise the artifact's
structural safety.

## Advisory status fields

| Field | Value |
|---|---|
| `truth_status` | `verified_true` — every ruling below was reproduced first-hand (git blob hashes, adversarial probes, suite runs), not taken from the producer packet. |
| `authority_status` | `advisory_only` — this record recommends; it authorizes nothing. |
| `implementation_status` | `candidate` — sound read-only orchestration on a branch; live/production wiring remains `missing`/`blocked` (per producer packet, confirmed). |
| `risk_class` | `medium` — the artifact composes R0–R4 primitives read-only, mutates none, and invents no authority; residual risk is the un-gated test glob (finding I-1). |

## Authority-critical rulings (strictest bar)

### 1. GOV slot is structurally UNFILLABLE — PASS

Rebuilt first-hand with a hostile probe. The module exports exactly four
symbols — `GOV_DECISION_SLOT`, `READ_ONLY_SELF_PILOT_STEPS`, `SelfPilotError`,
`runReadOnlySelfPilot` — **none of which set a verdict**. There is no
verdict-setter anywhere. Attacks attempted and all defeated:

- Mutating `trace.gov_decision.verdict / rendered_by / effective` → no-op; stays
  `null / null / false` (trace is deep-frozen).
- Flipping `trace.p0_20_verdict_rendered` / `trace.p0_19_complete` → no-op; stays `false`.
- Mutating `trace.chain.gov_decision.verdict` → no-op; stays `null`.
- Poisoning the shared exported `GOV_DECISION_SLOT` constant, then re-running →
  next run's verdict still `null` (frozen constant not mutable, not re-derived).
- Hostile fixtures injecting `gov_verdict` / `p0_20_verdict` / `outcome_status:APPLIED`
  → verdict still `null`, authority still `HUMAN_GOV_REQUIRED`, outcome
  `effective` hardcoded `false` (line 391, not fixture-derived).

A completed green run leaves `gov_decision.verdict=null`, `rendered_by=null`,
`p0_20_verdict_rendered=false`. **Rendering a verdict is structurally impossible.**

### 2. Genuinely READ-ONLY / fail-closed — PASS

- **Zero `node:` imports** in the orchestration module (verified; all imports
  are relative to ratified `src/**` primitives).
- Static guard test forbids `child_process | node:net/http/https/dgram/tls |
  spawn/exec*/fetch/require` in both self-pilot sources; reproduced clean.
- Omitting the injected ledgers denies `DENY_CONFIG`; partial/garbage ledgers
  deny `DENY_CONFIG` — **no silent real-store fallback**. The module opens no
  path, socket, or process itself.
- All writes land only in the caller-injected ephemeral temp dir (`events.jsonl`,
  `seals.ndjson`, `leases.jsonl`), under the OS temp root; no unexpected file
  created in cwd. Attempt to make it mutate a real path fails closed.

### 3. Byte-identity of ALL composed primitives — PASS

`git diff --name-only 385ac65 43ed19d -- src` returns **only** `src/self-pilot/**`.
Independently compared `git rev-parse 385ac65:<f>` vs `43ed19d:<f>` for all 17
composed primitives (services/registry/host/ledger/control/live/contracts) —
**all IDENTICAL**. The blob hashes also exactly match the test's `PINNED_BLOBS`
table, so the in-repo byte-identity guard is itself honest.

### 4. Real gates, not faked — PASS

Every deny code originates in a ratified, byte-identical primitive, not a pilot
stub:

- `DENY_LEASE_WRITE_SET_EXCEEDED` → `src/control/workspace-lease-policy.mjs`
- `DENY_ACCESS_ESCALATION` → `src/live/access-mode-policy.mjs`
- `DENY_VERIFIER_IS_PRODUCER` → `src/services/evidence-envelope-service.mjs`
- unauthorized-WP halt + later steps SKIPPED → real `work-package-service`
  `resolveEffective` (GOV grant withheld via `driveGov:false`).

The pilot's own `SelfPilotError` codes (`DENY_*_NOT_BLOCKED`) are **meta-assertions
that fail closed if a real gate did not fire** — they strengthen the gates and
invent none. The pilot references the real codes only in a comment and in one
negative-proof string comparison.

## Quality / integrity findings

### I-1 (must-fix-before-merge) — Orphaned test glob: the 15 tests DO NOT run under `npm test`

`package.json` `test` script is `node --test tests/*.test.mjs`. That glob matches
only files **directly** in `tests/`; the self-pilot tests live in
`tests/` and are therefore **excluded**. Reproduced:

- `npm test` totals = **tests 1098 / pass 1093 / fail 0 / skipped 5** — the exact
  pre-candidate baseline, unchanged despite +15 tests; zero self-pilot test names
  appear in the run.
- `node --test tests/*.test.mjs` = **15 / 15 pass**.

**Do the 15 run under `npm test`? NO.** For the most authority-sensitive artifact
in the repo, safety-regression tests that never gate CI (the byte-identity guard,
the GOV-slot-never-filled test, the no-mutation test) are an inert guarantee — a
future change could silently break read-only or the byte-identity pin with no
gate catching it (the OPS-S2 lesson). **Ruling: must-fix-before-merge, not
REWORK_REQUIRED.** The candidate's safety is *structural* (deep-freeze, no
verdict-setter, no `node:` imports) and does not depend on the tests running, the
tests exist and pass, and the fix is mechanical: extend the glob to
`tests/**/*.test.mjs` in `package.json` (or relocate the file to `tests/`). Merge
should not land until this is corrected so the tests gate the suite.

### I-2 (low) — Packet does not disclose the test-exclusion

The producer packet cites "passing tests (15/15)" as backing for
`truth_status: verified_true`. True when run explicitly, but the packet does not
disclose that those tests are outside the `npm test` glob. Not dishonest (the
tests pass), but it implies CI coverage that does not yet exist. Recommend a one
-line disclosure alongside the I-1 fix.

### Packet honesty — PASS

The packet leads with a PLAIN STATEMENT that the candidate is **not** P0-19
completion, **not** the P0-20 verdict, and **not** activation; the "What remains
GATED" table marks every remaining item `execution_requires_operator` or
`blocked`; `self_certification` is `advisory_only` with `execution_authority:false`
and `approval_authority:false`. No overclaim (subject to I-2). Matches the
ratified intent: self-pilot.md ("prove the chain … without granting mutation
authority"; Exit Rule reserves `PASS_FOR_P0_CONTROLLED_ACTIVATION` for human GOV)
and ADR-0004 (Proposed / Not Effective).

### Scope / unwired — PASS

Change set is exactly `src/self-pilot/**`, `tests/**`, one candidate
doc, and 4 `MANIFEST.json` additions. The pilot is imported **only by its own
test** — nothing in a live/production path references it. The returned trace is
deep-frozen.

### Regression — PASS

- Full `npm test`: **1098 / 1093 / 0 / 5** (baseline preserved — itself a
  consequence of finding I-1).
- `npm run validate`: **exit 0**, status PASS, 746 checks, 0 non-PASS.
- Merge vs main: base == main tip (`385ac65`), `git merge-tree` **0 conflicts** —
  clean.

## Recommendation

Recommend the operator and independent REV/QA treat this candidate as a sound
read-only composition proof and, **before merge**, require the I-1 test-glob fix
so the 15 safety-regression tests gate the suite. All still-gated items (live
wiring, durable evidence destination, independent REV/QA execution, the P0-20
verdict, activation) remain separately governed and operator-owned. **Recommend
improvements only; do not execute them.**

```yaml
self_certification:
  agent_id: claude-immune-crossrev-p0-19-selfpilot-01
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```
