# MOD-MEM S3 — Independent Cross-Provider Review

- record_id: MOD-MEM-S3-CROSSREV-001
- status: CANDIDATE REVIEW (advisory only; operator ratification still required before merge)
- reviewer: `claude-immune-crossrev-mem-s3-01` (BST-SA Immune worker, independent cross-provider reviewer)
- role: immune / security-governance-risk (advisory; no execution or approval authority)
- producer under review: `claude-motor-mem-s3-01`
- review target commit: `9653118cbe9023dd47d5856229b89c5544223de1`
  (`bst/mod-mem-s3-candidate-provider`, subject line `[MOD-MEM-S3] Memory CandidateSource provider + deterministic compaction floor (pure, unwired)`)
- review target tree: `8cceb6cd7132ce9d0344243ee6b5decacf125dd6`
- candidate base: main @ `942d09f`
- review branch: `claude/rev/mem-s3-crossrev` (cut from `9653118`; NOT pushed)
- method: **independent re-derivation** — the candidate was checked out fresh in an
  isolated worktree, `npm ci` from scratch, the full suite + `validate-foundation`
  re-run, and every load-bearing claim re-proved with a **novel out-of-tree
  adversarial harness** written by the reviewer (not the producer's tests).
- date: 2026-07-21T21:01:21Z (server clock)

## 0. Verdict

**APPROVE_WITH_NOTES.**

The code is correct, pure, unwired, descriptor-trap-safe, and reconciles its
accounting exactly. Every one of the producer's five disclosed deviations is
adjudicated **AGREE**. The "notes" are non-code staging items (a re-fold onto the
now-advanced main) plus one honest-observation call-out; none is a code defect and
none blocks correctness. No REWORK is required.

This is an advisory review verdict only. It confers no merge, wiring, activation,
or promotion authority. MOD-MEM S3 remains a CANDIDATE awaiting operator ratification.

## 1. Scope reviewed

- `src/services/memory-candidate-provider.mjs` (472 lines, the only new source)
- `tests/memory-candidate-provider.test.mjs` (30 producer tests, re-run + read)
- `docs/…/mod-mem-s3-candidate-provider-producer-verification-001.md` (producer claims — verified, not trusted)
- Compared against the R2 template `src/services/knowledge-candidate-provider.mjs`
  and the receiving port `src/services/candidate-source-port.mjs` (both present on main).
- Confirmed true candidate delta vs its own base `942d09f` is exactly **5 files**
  (MANIFEST.json +3, producer-verification doc +197, tracker +1,
  memory-candidate-provider.mjs +472, test +433) — no other source, schema,
  validator, or contract file touched.

## 2. Novel adversarial harness (reviewer-authored, out-of-tree)

Independent harness (16 probes, NOT the producer's suite) run against the candidate
module. Result: **16 passed, 0 failed.** Probes and outcomes:

| probe | what it adversarially proves | result |
|---|---|---|
| P1a | a counting Proxy shows each string field is `[[Get]]`-read **≤1×** and `getOwnPropertyDescriptor` is invoked **0×** | PASS (gopd=0) |
| P1b | a `classification` getter returning `INTERNAL` then `RESTRICTED` cannot split guard-from-use (read exactly once) | PASS (reads=1) |
| P1c | a `statement` getter that mutates a sibling cannot corrupt the already-snapshotted `content_hash` dedup key | PASS |
| P1d | a Proxy whose `get` throws on a real field is contained to `MEMORY_MALFORMED`/`DENY_SNAPSHOT_MALFORMED`, never a throw | PASS |
| P1e | a **benign** accessor is executed exactly once and its value accepted (no descriptor pre-classification) | PASS (n=1) |
| P1f | `__proto__` / `constructor` / `prototype` as own **data** keys are rejected (unknown-field / snapshot), never accepted | PASS |
| P1g | a Symbol own key on the nested `provenance` object rejects structurally | PASS |
| P1h | a Proxy on nested `provenance` is not descriptor-probed (`getOwnPropertyDescriptor` 0×) | PASS |
| P1i | a tampered `evidence_refs` `Symbol.iterator` is rejected **without being invoked** | PASS (iterator never ran) |
| P1j | `NaN` / `±Infinity` confidence → `DENY_FIELD_TYPE` | PASS |
| P1k | a Proxy-over-array `records` with a lying `length` trap is contained (no throw/escape; invariant holds) | PASS |
| P2 | full accounting reconciliation on a hostile 6-record mixed batch | PASS |
| P2b | budget boundaries: exact-fit admits, over-by-one truncates | PASS |
| P3 | out-of-window record **INCLUDED** with `current:false`; window boundaries half-open | PASS |
| P4 | `content_hash` carried verbatim (no invented hash); output deep-frozen | PASS |
| P5 | dedup keys off `content_hash` **alone** (differing statements, same hash → dedup) | PASS |

## 3. Per-probe findings (by severity)

### Probe 1 — Atomic-snapshot / descriptor-trap discipline (CRUX). Severity: none (PASS)

Direct source read confirms the discipline, and my harness proves it empirically:

- `snapshotOwn()` (src line 206) takes a **single `Reflect.ownKeys` presence
  snapshot**, structurally rejects a non-plain object, a custom prototype
  (`proto !== Object.prototype && proto !== null` → `DENY_SNAPSHOT_MALFORMED`),
  any **Symbol** own key, and any own key outside the closed `RECORD_KEYS` set
  (`DENY_UNKNOWN_FIELD`). It then does **one `[[Get]]` per allowed key**
  (`snap[key] = own.has(key) ? obj[key] : MISSING`).
- **No `Object.getOwnPropertyDescriptor` anywhere** in the module — confirmed by
  source read and by P1a/P1h counting a Proxy trap that fired **0 times**. A hostile
  `getOwnPropertyDescriptor` trap is therefore never even reachable.
- **No TOCTOU / value-shift**: every downstream check reads from the null-proto
  `snap` (and a frozen `costView`), never the raw record a second time. The token
  estimator receives the **frozen `costView`**, not the raw record. P1b/P1c prove a
  value-shifting or sibling-mutating accessor cannot influence the decision or
  corrupt the dedup key.
- **Containment, not escape**: every hostile path (throwing accessor, Proxy trap,
  poisoned iterator, cyclic value) is caught by the `projectRecord` try/catch and
  folded to a deterministic `MEMORY_MALFORMED` typed exclusion (P1d, P1i). Nothing
  throws out of the provider; nothing silently disappears.
- Nested `provenance` and the `evidence_refs`/`records` arrays use the same
  single-read snapshot (`snapshotArray` reads `length` once and checks
  `Symbol.iterator` identity **without invoking it**) — P1i confirms the hostile
  iterator never ran.

Honest guarantee (matches house standard and the producer's §3 disclosure): a
**benign accessor executes exactly once** (P1e) — the module does not descriptor-probe
to pre-classify accessors, precisely because that would reintroduce the per-field
`getOwnPropertyDescriptor` this discipline forbids. A single read cannot split
check-from-use, so no attacker-controlled accessor executes **to any exploitable
effect**. This is the correct, disclosed posture — not a defect.

**Crux result: PASS.** This alone would have forced REWORK on failure; it does not fail.

### Probe 2 — Compaction-floor determinism + typed accounting. Severity: none (PASS)

- Dedup keys off the record's **own** `content_hash`, validated `^[a-f0-9]{64}$`
  (src line 149, 322) — no invented hash. First occurrence wins; later same-hash
  records → `DEDUP_DUPLICATE` with `detail.duplicate_of` naming the winner (P5).
- Budget stage is a **hard tail cut** (once `budgetExhausted`, every later record is
  `BUDGET_EXCEEDED` — no bin-packing), deterministic and order-stable. Boundaries
  (exact-fit admits, over-by-one truncates) verified in P2b; `token_budget: 0` and
  negatives/floats are rejected at query validation.
- **Reconciliation** (P2, hostile 6-record batch, budget 20 @ cost 10):
  `requested=6, included=2, excluded=4`, `tokens_used=20`. Per-reason buckets
  `{MEMORY_MALFORMED:1, MEMORY_PROJECT_MISMATCH:1, DEDUP_DUPLICATE:1, BUDGET_EXCEEDED:1}`
  sum to `excluded=4`. Invariant `included + excluded === requested` holds; every
  exclusion carries `{ref, stage:"memory-provider", reason}` (+ typed `code`/`detail`).
  **Counts reconcile exactly.**

### Probe 3 — `current` semantics. Severity: none (PASS)

`current = valid_from ≤ now < valid_until` computed at the single server instant
(src line 347). Out-of-window records are **INCLUDED with `current:false`** (not
dropped) — the provider maps honestly and defers the currency judgment to
MOD-CONTEXT, exactly per assessment §4. Half-open boundary confirmed: `now ==
valid_until` → `current:false`; `now == valid_from` → `current:true` (P3).

### Probe 4 — Purity + UNWIRED + no-schema. Severity: none (PASS)

- **Zero importers**: independent `grep` of `src/` and `tools/` for
  `memory-candidate-provider` returns only the module itself. Nothing wires it.
- **No ambient reads**: sole import is the governed `reserved-delimiters.mjs`; the
  only inputs are the caller's records and the injected `now()`. No fs/network/
  process/ledger/authority/clock-of-record. Output deep-frozen with a WeakSet cycle
  guard (P4 confirms freeze depth: result, `sources`, entries, `provenance`).
- **No schema added**: `validate-foundation.mjs` `schemas.count` = **20** (7 canonical
  + 13 governed), status PASS. `contract-validator.mjs` and `validate-foundation.mjs`
  are **byte-identical** to base (candidate diff touches neither). The suite's own
  byte-identity guard ("files read but not modified are unchanged vs main")
  **passed without repinning** — confirming no guard needed re-pinning.

### Probe 5 — Reuse compliance. Severity: none (PASS)

The module imports `findReservedDelimiter` from the governed
`src/contracts/reserved-delimiters.mjs` (GOV-P011-08) rather than inlining the
delimiter list (which the MOD-KNOW template did). The imported module is
**byte-identical** between the candidate and current main (`git diff` empty). This
is a strictly positive, reuse-compliant divergence.

### Regression (independent re-run). Severity: none (PASS)

- Full suite (`npm test` = `validate` + `node --test tests/*.test.mjs`) in my
  from-scratch worktree: **tests 1279 / pass 1276 / fail 0 / skipped 3** — exactly
  the producer's claimed totals.
- `node tools/validate-foundation.mjs` → **exit 0**, all checks PASS, `schemas.count`
  = 20.
- New file `tests/memory-candidate-provider.test.mjs` carries **30** tests (matches
  the producer's "30 tests" claim), all green.

## 4. Adjudication of the producer's five disclosed deviations

1. **Descriptor-trap-safe atomic snapshot over RAW records** (module consumes raw
   caller records, unlike the service-injected MOD-KNOW template). **AGREE.** Verified
   by source read + P1a–P1k. Correct, honest, house-standard.
2. **`current` computed + out-of-window INCLUDED with `current:false`** (honest
   divergence from the knowledge provider, which excludes superseded refs).
   **AGREE.** Verified by P3; matches assessment §4 "provider maps, port judges."
3. **Deterministic compaction floor** (own-`content_hash` dedup + token-budget hard
   tail truncation, typed subtractive accounting, no invented hash). **AGREE.**
   Verified by P2/P2b/P5; reconciliation exact.
4. **Shared `findReservedDelimiter` import** instead of inlining the delimiter list.
   **AGREE.** Byte-identical governed reuse; a positive divergence.
5. **Single-snapshot / no per-field `getOwnPropertyDescriptor`** (TOCTOU-free single
   `[[Get]]`). **AGREE.** Proven empirically (gopd=0, each field ≤1 read) in P1a/P1b/P1h.

## 5. Notes (non-blocking; staging-owner action)

- **Re-fold required onto advanced main.** The candidate's base is `942d09f`; main
  has since advanced to the MOD-INTEG completion merge. The appended
  `module-completion-tracker-001.md` line and the `MANIFEST.json` union will conflict
  with the MOD-INTEG completion line now on main. This is **expected staging-owner
  re-fold work, not a code issue**, exactly as the dispatch anticipated. After
  re-fold, re-run the suite so the byte-identity guard re-pins cleanly (it currently
  passes as-is).
- **Honest observation (not a defect):** `verified` is structurally `true` for every
  INCLUDED entry, because a record with empty/blank `evidence_refs` is rejected
  upstream as `MEMORY_MALFORMED` before it can reach an entry. The producer discloses
  this in §4; the value is honest (evidence-backed admission), never fabricated. A
  future MOD-CONTEXT consumer should not read `verified:false` from this provider as
  meaningful — it never emits one.
- **MANIFEST for this review doc** is added in this same review commit.

## 6. Residual risks

- **Low / disclosed:** the `verified`-always-true-for-included property above.
- **Low / structural:** the token estimator is a length heuristic, not a real
  tokenizer (disclosed, and a non-goal per assessment §5); an injected estimator that
  throws or returns a non-positive-safe-integer denies the whole query
  (`DENY_ESTIMATOR_FAULT`) — fail-closed, verified.
- **None** on the crux (descriptor-trap / TOCTOU), accounting, purity, or unwiring.

## 7. Separation-of-duties attestation

I am an **independent Immune reviewer**, distinct from the producer
(`claude-motor-mem-s3-01`). I re-derived every claim from scratch in my own isolated
worktree with a fresh `npm ci`, re-ran the full suite and validator myself, and
wrote my own novel out-of-tree adversarial harness rather than rubber-stamping the
producer's tests. I did **not** merge, push to any shared branch, wire, or activate
anything. This verdict is **advisory**; it does not authorize execution, merge, or
promotion. Restricted execution remains blocked and operator ratification is
required. Neither agent can self-authorize; I self-certify advisory completeness only.

## 8. Self-certification

```yaml
self_certification:
  agent_id: claude-immune-crossrev-mem-s3-01
  peer_agent_id: claude-motor-mem-s3-01
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

> Both can self-certify. Neither can self-authorize.
