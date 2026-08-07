# MOD-WSPACE Lease-Primitive — Independent Immune Review 001

**Record ID:** MOD-WSPACE-LEASE-REV-001 / mod-wspace-lease-primitive-rev-001
**Status:** ADVISORY — reviewer verdict, not an authorization
**Reviewer:** claude-immune-rev-wspace-lease-01 (BST-SA immune, isolated worktree)
**Date:** 2026-07-21
**Review target:** branch `bst/mod-wspace-s2-lease` @ `5610d48ad40ee10da3e283625b8a7da61faec38a`
**Base:** `main` @ `332b7ab` (branch point); current `main` @ `e4b092d`
**Authoritative spec:** `bst/mod-wspace-assessment:docs/03-project-control/candidates/mod-wspace-gap-assessment-001.md`
**Method:** all evidence read and executed first-hand in an isolated worktree (`npm ci`, full `npm test`, validator, 37 bespoke adversarial probes, byte-identity blob comparison, scratch merge). No push, no merge.

---

## Verdict

**APPROVE_WITH_NOTES**

The code is a clean, fail-closed, deep-frozen pure primitive that is a strict subset of the assessment's pre-authorized additive scope and violates no boundary (B2/B4/B5). Two record-correctness notes and one low-severity defense-in-depth note apply; none blocks merge. The **numbering mismatch requires a tracker/record correction** (see Ruling).

---

## Findings by severity

| # | Sev | Finding |
|---|-----|---------|
| F1 | MEDIUM | Dispatch label "S2" collides with the assessment's actual **S2 = overlap-class evaluator** (`overlap-policy.mjs`, undelivered). This candidate is a strict subset of the assessment's **S3 = lease record + ledger** slice. False-completion risk in module tracking. Record correction required. (governance/provenance, CLAUDE.md Rule #6) |
| F2 | LOW | Commit body says "The assessment's **S4** lease slice (its 'S3')" — the assessment has no S4; the lease slice is S3. Muddled provenance text, already in immutable history. Cosmetic. |
| F3 | LOW | Mint-time `writeSet` **array-element** atomicity is weaker than field atomicity. A caller-supplied `writeSet` element is read 2–3× (twice inside `evaluateWriteSet`'s self-check as both `candidatePaths` and `allowedPaths`, plus once in `freezeLease`'s `[...writeSet]` spread). A hostile **value-varying index getter** can make the frozen stored set differ from the exact value the self-check validated (probe 4e: stored `["src"]` while `"src/control/narrow.mjs"` was the checked candidate; reads=3). **No security impact:** the `writeSet` is caller-self-declared (no external authority to widen against — the caller could pass `["src"]` directly), and `evaluateLease` re-validates the stored set fail-closed at evaluate time (plain frozen values, no getters). The escape variant (probe 4d) is caught at mint (`DENY_LEASE_MALFORMED`). Existing test "getter returning different values per read" covers only the object-**property** level (single-read, strong), not the array-**index** level. |

**Recommended (non-blocking) hardening for F3:** snapshot `writeSet` once at the lease layer (or build `freezeLease` from the array `evaluateWriteSet` already snapshotted) so the stored set provably equals the validated set; add an element-level value-varying-getter test to the TOCTOU class.

No HIGH or CRITICAL findings. No secret exposure, no authority mutation, no gate weakening, no I/O, no wiring.

---

## Numbering ruling (mandatory)

The authoritative assessment `mod-wspace-gap-assessment-001` §4 defines exactly three slices:

- **S1** = write-set control evaluator (`write-set-policy.mjs`) — already at base; source header self-labels "Slice S1" (consistent).
- **S2** = **overlap-class evaluator** (`overlap-policy.mjs`) — **NOT delivered by this candidate; still OPEN.**
- **S3** = **workspace-lease record contract + `WorkspaceLeaseLedger` + contract-validator/validate-foundation registration + `resolveActiveLease`** — the lease slice.

This candidate delivers a pure `mintLease`/`evaluateLease`/`renewLease` lifecycle primitive — a **strict subset of assessment S3** (no schema, no ledger class, no validator edit, no `resolveActiveLease`, caller-persisted) — but is dispatched/committed as **"MOD-WSPACE-S2"**. That label is a misnomer on two counts: (1) it collides with the assessment's real S2 (overlap evaluator), and (2) it obscures that both assessment-S2 (overlap) and the remainder of assessment-S3 (schema + ledger + validator + `resolveActiveLease`) are still outstanding.

**Ruling — the record/tracker MUST call this:**

> **"S2-as-dispatched / assessment-S3-subset — workspace-lease lifecycle primitive (mint/evaluate/renew, pure, ledger-free); schema + `WorkspaceLeaseLedger` + validator registration + `resolveActiveLease` deferred."**

Tracker consequences:
- Assessment **S2 (overlap-class evaluator) remains OPEN** — do not mark delivered.
- Assessment **S3 is PARTIALLY delivered** — pure lifecycle primitive done; durable-storage/schema/validator/`resolveActiveLease` half still outstanding (R2 additive, unstarted).

This is a provenance/traceability correction only; it does **not** reflect a scope-authorization violation (see below).

---

## Scope-subset & boundary verification (producer claim independently confirmed)

- **Strict subset of pre-authorized additive scope:** assessment S3 was pre-authorized R2 (schema + validator edits + new ledger + fixtures + tests). The delivered surface is strictly narrower (3 files, no durable-storage class, no schema, no validator edit, no live wiring), so it sits inside the S3 additive envelope a fortiori. `truth_status: verified_true`.
- **B2 (no checkpoint fold-in):** no `CheckpointLedger` reference except boundary-explaining comments; no ledger import. PASS.
- **B4 (no worktree materialization):** no `fs`/`child_process`/`spawn`/filesystem; the only import is `./write-set-policy.mjs`. `writeSet` stored as declared path data. PASS.
- **B5 (gateway untouched):** `mcp-gateway-core.mjs` byte-identical (blob `ec22a296…` at both `5610d48` and `332b7ab`); still consumes `workspace_lease_id` opaquely. PASS.

---

## Checklist results (raw)

**1. Scope** — 3 declared files only: `MANIFEST.json` (M, +2 lines), `src/control/workspace-lease-policy.mjs` (A, 297 LOC), `tests/workspace-lease-policy.test.mjs` (A, 408 LOC). Zero importers in `src/` (grep) — unwired. Byte-identity self-computed: `write-set-policy.mjs` = `5f1e119c…` (identical), `mcp-gateway-core.mjs` = `ec22a296…` (identical) vs `332b7ab`. No schema/validator/ledger edits anywhere. PASS.

**2. Semantics** — mint-don't-write (no persistence/I/O; returns frozen candidate). Expiry fail-closed: `now >= expiresAt` → `DENY_LEASE_EXPIRED`; `now===expiresAt` rules **EXPIRED** (documented, `>=`); invalid `now`/`issuedAt`/`ttl` → `DENY_LEASE_MALFORMED` (never "not expired"). Precedence **MALFORMED > EXPIRED > EXCEEDED** confirmed (expired+exceeded → EXPIRED; malformed+expired → MALFORMED). `renewLease` never mutates original, never widens (options `writeSet` ignored; hostile varying getter bound to first snapshot → original set preserved), `renewedAt` monotonic (`>= issuedAt`; backward rejected; `===issuedAt` allowed). PASS.

**3. Write-set reuse** — parity-pin test imports the **live** `evaluateWriteSet` from `../src/control/write-set-policy.mjs` (same module, not a copy). Containment uses `lease.writeSet` as `allowedPaths`, `prohibitedPaths: []`; a path outside → `DENY_LEASE_WRITE_SET_EXCEEDED` with `detail: DENY_WRITE_SET_OUTSIDE_ALLOWED`. PASS.

**4. Cross-field TOCTOU** — all three entry points (mint/evaluate/renew) read each scalar field **exactly once** (`readFields` single `[[Get]]` into a plain snapshot); probe confirmed invocation-count===1 per field even with a getter on `issuedAt` mutating sibling `ttl` (no check/use divergence — normalize checks and freezes the same captured value). Value-varying getters on `now`/`renewedAt`/`writeSet`-property bound to first snapshot. **Exception (F3):** array-**element** reads are not single-read — the caller's `writeSet` element is read 2–3× across `evaluateWriteSet`'s self-check and `freezeLease`'s spread; contained fail-closed at evaluate, no escalation.

**5. Adversarial** — clock as `bigint`/string/`NaN`/`Infinity`/`-Infinity`/negative/fractional all → MALFORMED; `ttl` zero/negative/fractional/`Infinity`/`bigint`/string → MALFORMED; returned lease + nested `writeSet` deep-frozen (mutation throws); no prototype pollution (`__proto__` writeSet entry / `__proto__` input key); huge writeSet (5000) mints in ~0.6s bounded. 37/37 probes PASS.

**6. Regression** — full `npm test` on `5610d48`: **tests 868 / pass 863 / fail 0 / skipped 5** (exact match). `npm run validate` exit **0**. Merge vs `main @ e4b092d` on scratch: **CLEAN** — `MANIFEST.json` **auto-merged** (append regions disjoint); the anticipated tail conflict did **not** materialize; no `diff-filter=U` files.

---

## Advisory status fields

```yaml
truth_status: verified_true          # all evidence read/executed first-hand at 5610d48; 868/863/0/5; validator 0
authority_status: advisory_only      # reviewer verdict on a non-main branch; no push, no merge
implementation_status: candidate     # pure lifecycle primitive; a strict subset of assessment S3
risk_class: low                      # R2 pure additive policy primitive; no authority semantics, no wiring, no I/O
```

## self_certification

```yaml
self_certification:
  agent_id: claude-immune
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

---

*Provenance — source: independent review of `bst/mod-wspace-s2-lease@5610d48` against `mod-wspace-gap-assessment-001`. Timestamp: 2026-07-21. Agent ID: claude-immune-rev-wspace-lease-01. Cross-links: Roadmap (MOD-WSPACE catalog row 9), assessment `mod-wspace-gap-assessment-001` (G2/S3), `MANIFEST.json`.*
