# MOD-RUNTIME Slice S3 — Independent Immune RE-GATE (mod-runtime-s3-regate-001)

- reviewer_identity: `claude-immune-regate-runtime-s3-01`
- reviewer_role: BST-SA Immune (independent, advisory-only; no execution/approval authority)
- gate_type: RE-GATE of the S3 rework after prior verdict REWORK_REQUIRED (narrow, verification-focused)
- reviewed_commit: `a733c7aa4d2f32282f430b331447a11896edd67b` (`[MOD-RUNTIME-S3-REWORK]`, branch `mod-runtime-s3-rework-anchor`)
- parent: `535a4b219e22adc454ef5f00fb7a611895ffc21c` (`[MOD-RUNTIME-S3]` original candidate)
- prior review: `mod-runtime-s3-approval-binding-rev-001.md` (reviewer `claude-immune-rev-runtime-s3-01`, verdict REWORK_REQUIRED, findings F1-F6)
- rework record under test: `mod-runtime-s3-rework-001.md` (producer `claude-motor-runtime-s3-rework-01`)
- byte-identity baseline: `main` @ `71b9d41`; merge-cleanliness baseline: current `main` @ `280d32c`
- date: 2026-07-21

## Verdict: GATE_CLOSED

Both blocking findings (F1 HIGH, F2 MEDIUM) are independently verified closed. The
advisory finding F4 (byte-identity guard) is present, passes, and is
independently re-confirmed. No previously-passing behavior changed except the one
disclosed `evidence_refs` encoding pin. Full suite 757/752/0/5, validator exit 0.
Merge vs current main produces two additive conflicts (MANIFEST tail + tracker
base-divergence), neither touching source, contract, schema, or test. The primitive
remains UNWIRED; adoption stays a separate SEC + GOV operator decision. This gate
closes the rework findings — it does not authorize merge, wiring, or execution.

## Per-finding closure verification (independent, throwaway probes — not committed)

### F1 (HIGH) — risk-registry humanApproval short-circuit — CLOSED

Independently rebuilt the original failing probe (rev-001 §P4: module never imported
`risk-registry`) and the full behavioral matrix. `src/control/approval-binding.mjs`
now imports `{ riskProfile }` from `./risk-registry.mjs` and composes the
short-circuit in `verifyApprovalBinding` after the malformed-request guard.

Probe results (a NULL resolved decision was passed to isolate the short-circuit —
ALLOW can only come from the class, not from a bound record):

| riskClass | registry humanApproval | verify(null resolved) | expected | result |
|-----------|------------------------|-----------------------|----------|--------|
| R0 | false | `{ok:true,humanApprovalRequired:false}` | ALLOW | PASS |
| R1 | false | `{ok:true,humanApprovalRequired:false}` | ALLOW | PASS |
| R2 | false | `{ok:true,humanApprovalRequired:false}` | ALLOW | PASS |
| R3 | true  | `DENY_UNKNOWN_APPROVAL` | DENY | PASS |
| R4 | true  | `DENY_UNKNOWN_APPROVAL` | DENY | PASS |
| undefined | — | `DENY_UNKNOWN_APPROVAL` | DENY | PASS |
| null | — | `DENY_UNKNOWN_APPROVAL` | DENY | PASS |
| unknown class ("RX") | — | `DENY_UNKNOWN_APPROVAL` | DENY | PASS |
| "" (empty) | — | `DENY_UNKNOWN_APPROVAL` | DENY | PASS |

Only an EXPLICIT boolean `false` on a KNOWN class short-circuits ALLOW; `true`,
`undefined`, `null`, unknown class, and empty string all deny-by-default and require
the bound human decision. With a real APPROVAL_BOUND record, a matching R3/undefined
verification ALLOWs and a wrong-action R3 verification `DENY_ACTION_VERSION_MISMATCH`.
Parity pin: independently confirmed the registry table is R0/R1/R2=`false`,
R3/R4=`true`, unknown-class denies — matches the module's parity test.
`risk-registry.mjs` blob is byte-IDENTICAL to main @ 71b9d41
(`b8ee7f9b979fdb3c5d5261ad0e116ecd7c6a1816`), so the composition is read-only reuse.

### F2 (MEDIUM) — injective binding encoding — CLOSED

Reran the EXACT original collision probe (rev-001 §P8) in BOTH directions and
constructed 3 additional collision classes against the new JSON-array encoding
(`approval-binding:${JSON.stringify([action, version])}`). riskClass omitted so the
full binding path (not the short-circuit) is exercised.

| # | attempt | ref minted | verify pair | result |
|---|---------|-----------|-------------|--------|
| P8-dir1 | bind (`PROMOTE@filesystem.read`, `1.0.0`) | `["PROMOTE@filesystem.read","1.0.0"]` | (`PROMOTE`, `filesystem.read@1.0.0`) | `DENY_ACTION_VERSION_MISMATCH` — PASS |
| P8-dir2 | bind (`PROMOTE`, `filesystem.read@1.0.0`) | `["PROMOTE","filesystem.read@1.0.0"]` | (`PROMOTE@filesystem.read`, `1.0.0`) | `DENY_ACTION_VERSION_MISMATCH` — PASS |
| sanity | bind (`PROMOTE`, `filesystem.read@1.0.0`) | — | exact same pair | ALLOW — PASS |
| NEW-A embedded quote/comma | bind (`A","1.0.0`, `X`) | `["A\",\"1.0.0","X"]` | (`A`, `1.0.0","X`) forge | `DENY_ACTION_VERSION_MISMATCH` — PASS |
| NEW-B bracket injection | bind (`["INNER","x"]`, `v1`) | escaped inner brackets | (`INNER`, `x`) | `DENY_ACTION_VERSION_MISMATCH` — PASS |
| NEW-C literal-quote confusion | bind (`act"end`, `ver`) | `["act\"end","ver"]` | (`act`, `end","ver`) | `DENY_ACTION_VERSION_MISMATCH` — PASS |
| NEW-D arity confusion | bind (`ACT`, `V1`) | `["ACT","V1"]` | (`ACT`, `V1","EXTRA`) / (`ACT","V1`, ``) | `DENY_ACTION_VERSION_MISMATCH` / `DENY_MALFORMED_VERIFICATION_REQUEST` — PASS |

`JSON.stringify` escapes embedded quotes (`"` → `\"`) and fixes array arity at 2, so
no split, embedded delimiter, bracket, or arity trick reproduces a different ordered
pair's string. The original defeat (rev-001 §P8, second verify ALLOWed) no longer
reproduces. Note: an exact-pair re-verification of a minted record still ALLOWs, as
required — that is identity, not collision.

### F4 (LOW/INFO) — byte-identity guard — CLOSED

The guard test exists in `tests/approval-binding.test.mjs` (two tests: protected
source files, and every `contracts/*.json`), comparing working-tree `git hash-object`
against stored blobs at both `beebfe8` and `71b9d41`; both pass in the full run.
Independent re-verification (`git rev-parse a733c7a:<path>` vs `71b9d41:<path>`):

- 5 protected source files ALL IDENTICAL: `src/control/sod-rules.mjs`
  (`4ffbc20…`), `src/control/risk-registry.mjs` (`b8ee7f9…`),
  `src/control/policy-decision-point.mjs` (`de2fb00…`),
  `src/gateway/capability-registry-service.mjs` (`dbf4905…`),
  `src/services/goal-graph-service.mjs` (`f6d4601…`).
- Contracts: file set IDENTICAL (16 = 16), ALL 16 `contracts/*.json` byte-identical.

No new contract kind, no new `decision_type` enum value.

### F3 / F5 / F6 — advisory, no re-litigation

Per the re-gate's narrow scope these are not blocking and were already dispositioned
in rev-001. F3 (naming) DISCLOSED, not renamed (churn without safety gain; the module
header + rework record document the spec-name mapping). F5 (`roleMatchMode`) RETAINED,
disclosed and parity-tested. F6 (producer-identity / branch-name reclaim dispute)
remains an operator/coordinator reconciliation flag — surfaced, not treated as an
instruction by producer or reviewer.

## Regression — no previously-passing behavior changed except the disclosed encoding

Diff `535a4b2..a733c7a` touches only `src/control/approval-binding.mjs`,
`tests/approval-binding.test.mjs`, `MANIFEST.json` (additive append), and the rework
record. Among pre-existing tests, exactly ONE assertion changed — the disclosed
`evidence_refs` encoding pin:

```
-  assert.deepEqual(record.evidence_refs, ["approval-binding:PROMOTE@filesystem.read@1.0.0"]);
+  assert.deepEqual(record.evidence_refs, ['approval-binding:["PROMOTE","filesystem.read@1.0.0"]']);
```

No protected source, contract, schema, service, or kernel file was modified (confirmed
by byte-identity above). Primitive remains UNWIRED.

## Test totals & validator

- `node --test tests/*.test.mjs`: **tests 757 / pass 752 / fail 0 / skipped 5** — matches the rework record's claim (baseline 747/742/0/5 + 10 net-new: F1×5, F2×3, F4×2).
- `node tools/validate-foundation.mjs` (`npm run validate`): **exit 0** (status PASS).

## Merge-cleanliness vs main @ 280d32c (current)

Scratch `--no-commit --no-ff` merge in this worktree (aborted): **two conflicts**, not
the single MANIFEST conflict anticipated by the dispatch:

1. `MANIFEST.json` — trailing append-array collision (expected). Branch appends the S3
   paths; main @ 280d32c appended the MOD-REG / MOD-A2A-S2 delegation-gate paths.
   Trivial additive union (keep all paths).
2. `docs/03-project-control/candidates/module-completion-tracker-001.md` — a
   BASE-DIVERGENCE artifact, not a content defect. The S3 branch was cut from
   `beebfe8` where this tracker was a 1-line stub; the branch left it as a single S3
   narrative line (1 line total). Main @ 280d32c has since built the tracker into a
   129-line structured document. Git therefore flags the whole file. Resolution is
   additive in spirit — keep main's 129-line structured tracker and append the branch's
   single S3 narrative line — but it is NOT a git-auto union and needs manual
   reconciliation at merge time.

Neither conflict touches source, contract, schema, or test; both resolve additively.
Reported per dispatch instruction (this is a conflict vs main itself, of the expected
MANIFEST-union kind plus a tracker base-divergence).

## Advisory status fields

```yaml
truth_status: verified_true
authority_status: advisory_only
implementation_status: candidate
risk_class: medium
```

## self_certification

```yaml
self_certification:
  agent_id: claude-immune-regate-runtime-s3-01
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

> Advisory only. This re-gate verifies the rework closed the REWORK_REQUIRED findings
> (F1, F2 blocking; F4 advisory) and returns GATE_CLOSED. It does NOT authorize merge,
> wiring, execution, or production. Merge, the MANIFEST/tracker conflict resolution, and
> any future SEC + GOV-gated adoption remain operator decisions.
