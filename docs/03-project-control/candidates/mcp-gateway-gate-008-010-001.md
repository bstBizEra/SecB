# MCP Gateway Core — Independent Gate Review (rework-008..010 lineage)

- record_id: `mcp-gateway-gate-008-010-001`
- reviewer_identity: `claude-immune-gate-gw-008-010`
- role: BST-SA immune (advisory gate review, isolated worktree, first-hand verification)
- producer_lane: Codex (`codex-motor`)
- review_target_branch: `producer/codex/mcp/p0a-gateway-core-rework-009`
- pinned_tip: `79b4a2b1a71299ccbd3ed0bd3aacee413e768f00`
- base_main: `f04dee6cfafaae0213d92dc0da13300b14707f5e`
- review_branch: `claude/rev/gateway-gate-008-010` (cut FROM the pinned tip)
- reviewed_at: 2026-07-20
- risk_class: R2 / mutation_class: M3

## Verdict

`GATE_CLOSED_READY_FOR_OPERATOR_MERGE`

No blocking findings. The stacked lineage is fail-closed, disclosed, and adversarially verified first-hand. Two non-blocking observations (one LOW residual, one INFORMATIONAL scope correction) are recorded below with recommendations, neither of which gates merge.

## Lineage actually present at the pinned tip

Diff `f04dee6..79b4a2b` touches exactly five files: `MANIFEST.json`, the two rework-009/010 producer handoff yamls, `src/gateway/mcp-gateway-core.mjs`, and `tests/mcp-gateway-core-adversarial.test.mjs`.

Commits over base main:
- `007da0e` [REWORK-009] Retain capacity until settlement (removes the `audit_ms*4` abandonment timer in `#holdCapacity`).
- `9fce024` [REWORK-009] settlement-accounting handoff.
- `7bb7a44` [REWORK-010] Gate canonical request bytes before overflow (preflight byte-gate in `invoke`).
- `eea546d` / `d1e6b4b` / `79b4a2b` [REWORK-010] handoff pin + two ancestry-pin corrections.

INFORMATIONAL — scope correction: the rework-008 commits (`0ebd2eb`, `24ad742`) are NOT ancestors of the pinned tip (`git merge-base --is-ancestor` returns false for both). The task framing attributed the "payload-bounds hardening" to rework-008; at this pinned tip the payload byte-bound is delivered by rework-010, not 008. No behavioral gap results — the byte-gate is present and verified (Scope 3 below). The effective request bound is `DEFAULT_LIMITS.max_request_bytes = 64 KiB` (configurable), not a 128-byte limit; adversarial tests inject explicit small limits.

## Reproduced totals (measured vs claimed)

| Metric | Producer claim | First-hand measured @ `79b4a2b` | Result |
|---|---|---|---|
| Focused (`mcp-gateway-core.test.mjs` + adversarial) | 51 total / 51 pass / 0 fail / 0 skip (010) | 51 / 51 / 0 / 0 | MATCH |
| Full suite (`node --test tests/*.test.mjs`) | 435 / 430 / 0 fail / 5 skip @ `007da0e` (009) | 436 / 431 / 0 fail / 5 skip | CONSISTENT (+1 test = 010's added regression) |
| Foundation validator | PASS | PASS, exit 0 | MATCH |
| MANIFEST unique paths | 282 expected @ 009 | 283 @ pinned tip (010 added its yaml) | CONSISTENT |

`npm ci`: 6 packages, clean. The 5 skips are pre-existing conformance-plane cases (V-002, V-010, V-011, V-014, V-016) blocked on P0-08/P0-10/P0-11 — unrelated to the gateway core.

## Scope 2 — Regression: ratified main deny paths hold

Diff-driven enumeration of removed/changed assertions and deny codes:

- Source: the ONLY source removal is the abandonment `setTimeout` in `#holdCapacity`. This removed an auto-RECLAIM (a permit-enabling behavior), not a deny. The ONLY source addition is the preflight byte-gate emitting the pre-existing `DENY_REQUEST_INVALID` earlier in precedence. No `deny()` call site was removed; no new deny code was introduced.
- Secret screening (FU-1..3 / A-FIND-2): `SECRET_VALUE`, `AWS_SECRET_VALUE`/`AWS_SECRET_FIELD`, `isSecretLikeKey`, ASCII output-key gate — all structurally untouched by the diff. Full suite (which exercises them) passes with 0 fail.
- SoD checks, deny-by-default allowlist, non-read denial, unknown/invalid capability, fail-closed audit/clock/policy/revocation — untouched by the diff; all green in the full suite.
- Bounded-overflow evidence statuses (`EVIDENCE_RECORDING_TIMEOUT_UNCONFIRMED`, `EVIDENCE_NOT_RECORDED_BACKPRESSURE`, `EVIDENCE_CANDIDATE_RECORDED_NOT_ACCEPTED`, `EVIDENCE_RECORDING_FAILED`) — preserved; re-run first-hand (Scope 3).

Conclusion: no prior deny path is weakened. The changed behaviors either strengthen a deny (capacity retention) or route to a more precise existing deny (`DENY_REQUEST_INVALID`).

## Scope 3 — New behaviors, adversarially verified (first-hand)

Independent harness run against the pinned-tip source (not the producer's tests):

1. Payload bounds — ordering proof: saturated (capacity full) + oversized `purpose`+`params` (~1 MB each) under a 512-byte limit → `DENY_REQUEST_INVALID`, `evidence_status` absent, `invocationLog` call count = 0, and `#overflowEvidenceBusy` NOT consumed (a subsequent compact overflow still records evidence and returns `EVIDENCE_CANDIDATE_RECORDED_NOT_ACCEPTED`). Oversized requests are rejected before ANY logger / retention / capacity / overflow-flag mutation. CONFIRMED.
2. Byte boundary is exclusive (`>` not `>=`): the largest padding still returning `DENY_CONCURRENCY_LIMIT` sits exactly at the limit; the first `DENY_REQUEST_INVALID` is limit+1. CONFIRMED.
3. Multi-byte unicode is byte-based (UTF-8), not char-based: 60 identical JS chars — ASCII (60 bytes) passes the gate (`DENY_CONCURRENCY_LIMIT`), CJK `働`×60 (180 bytes) rejected (`DENY_REQUEST_INVALID`). CONFIRMED via `byteLength = TextEncoder.encode(canonicalJson(...))`.
4. Settlement accounting / GATE2-BLOCKING-001 wedge behavior: a hung adapter holds capacity; after 120 ms (>> the removed `audit_ms*4 = 80 ms` bound) a fresh call STILL returns `DENY_CONCURRENCY_LIMIT` with `adapterCalls` frozen at 1 (no auto-reclaim, no second adapter start); actual settlement releases the slot and the next call succeeds (`adapterCalls = 2`). The removed timer was a PERMIT-after-elapsed-time that could admit work beyond `max_concurrency`; its removal is a fail-closed strengthening. CONFIRMED.
5. 009 wedge-variant hunt (does capacity retention re-introduce the ratified lane wedge?): NO. The severe GATE2-BLOCKING-001 consequence was the SHARED overflow-audit lane wedging shut. The retained `#overflowEvidenceBusy` busy-flag design was re-run first-hand: with the first overflow's evidence audit hung, 64 later overflow calls return bounded `EVIDENCE_NOT_RECORDED_BACKPRESSURE` with `loggerCalls` frozen at 1 (no queue), all inside 100–250 ms race bounds; only after the hung evidence settles does a new record appear. The lane does not wedge; only the one hung reservation's slot is retained (disclosed residual MCP-R9/R10-INDEFINITE-ACTIVE-WORK). CONFIRMED.
6. Request-bytes gating before overflow lane / canonicalization: the byte-gate uses a deterministic `canonicalJson` (sorted-structure, prototype-null, dangerous-key rejecting) before `TextEncoder`. In the non-saturated path the gate and the actual-use envelope are the SAME clone (line 562 re-checks the used `requestEnvelope`), so there is no gate-vs-use divergence on the mainline. CONFIRMED.

## Scope 4 — Composition risk (three rounds stacked)

Deny-code precedence: the byte/validity preflight now runs BEFORE the concurrency check, so a saturated + oversized/malformed request resolves to `DENY_REQUEST_INVALID` (logger-free) instead of the pre-010 `DENY_CONCURRENCY_LIMIT`. Verified first-hand: saturated + a throwing-getter context → `DENY_REQUEST_INVALID` with zero logger calls. This precedence change breaks no ratified test (full suite 0 fail) and is strictly more protective (a malformed/oversized request no longer reaches the evidence logger). The byte-gate's short-circuit is gated on `capacityInUse >= max_concurrency`, so capacity-available flows are unaffected (available+valid → success; available+oversized → normal-path `DENY_REQUEST_INVALID`). No interaction between the 009 capacity-retention and the 010 byte-gate produces a wedge variant or a weakened decision.

## Findings by severity

- BLOCKING: none.
- HIGH: none.
- MEDIUM: none.
- LOW — TOCTOU getter-divergence in the overflow-evidence lane. The 010 byte-gate clones and byte-checks the request, but the overflow lane (`#denyConcurrencyAudited`) then calls `snapshotContext(requestContext)` against the LIVE object rather than the already byte-bounded clone. A request context whose fields are exotic mutating getters can present a small value to the preflight gate and a large value to the subsequent snapshot; first-hand probe: gate passes, then the evidence entry logs a 20 KB `purpose` despite a 500-byte limit. Scope is logging-input size ONLY — no authorization decision is affected (still `DENY_CONCURRENCY_LIMIT`), no adapter is reached, receipt attribution remains clone-derived (the ratified "adapter cannot mutate receipt attribution" invariant is intact). This is PRE-EXISTING (pre-010, the overflow lane always logged unbounded); 010 strictly improves the common plain-object case. Under the stated trust model (pure in-process policy core invoked by a trusted harness) this is non-blocking. Recommendation (advisory, non-gating): derive the overflow-lane snapshot from the byte-checked clone so the bound is TOCTOU-free.
- INFORMATIONAL — rework-008 is not in the pinned lineage (see "Lineage actually present"); payload bounds are delivered by rework-010. No gap.

## Residuals acknowledged (producer-disclosed, accepted as external controls)

MCP-R9/R10-INDEFINITE-ACTIVE-WORK (a never-settling clock/adapter/audit/evidence callback retains its one slot until settlement; cancellation/worker isolation is external), MCP-R9/R10-OVERFLOW-EVIDENCE-SLOT (one in-memory evidence callback may remain pending; later calls stay bounded), and the N-3 boundary set (project/repo/branch binding, human authority/lease freshness, egress, credential handles, durable evidence acceptance, DLP/data-class, activation). These are availability/integration residuals, not authorization bypasses, and are correctly external.

## Advisory fields

- truth_status: verified_true
- authority_status: advisory_only (execution_requires_operator)
- implementation_status: existing (candidate at pinned tip; not merged, not activated)
- risk_class: medium (R2 change surface; no blocking security finding; one LOW logging-bound residual)

## Self-certification

```yaml
self_certification:
  agent_id: claude-immune-gate-gw-008-010
  peer_agent_id: codex-motor
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

> Advisory gate review only. No push, no merge, no activation authorized. Operator authority governs merge.
