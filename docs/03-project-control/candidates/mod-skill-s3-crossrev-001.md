# MOD-SKILL S3 — Governed Revocation Primitive — Independent Cross-Review 001

**Record ID:** MOD-SKILL-S3-CROSSREV-001
**Reviewer identity:** `claude-immune-crossrev-skill-s3-01` (BST-SA immune, independent cross-provider reviewer, worker only — advisory)
**Producer under review:** `claude-motor-skill-s3-01`
**Module / Slice:** MOD-SKILL (SkillsHub) — Slice 3 (IMM-SKILL-V1), **components 1+2 ONLY**
**Branch under review:** `bst/mod-skill-s3-revoke-primitive`
**Exact commit reviewed:** `4cbec288ca105a8a239404f8dfc7ad25c25d8ba2`
**Base:** `main` @ `0aa13f8cd68be265bc3c2e3227fdd649daaba55b` (confirmed == `origin/main` tip at review time)
**New-file blob:** `src/ledger/skill-revocation-ledger.mjs` @ `7bd6203c28e2f5536e3f4e43d2ca9882a6a4ed92`
**Review branch (record committed here, NOT pushed):** `claude/rev/skill-s3-crossrev`
**Recorded:** 2026-07-22
**Method:** RE-DERIVED from source at the exact SHA in an isolated from-scratch worktree; `npm ci`; independent out-of-tree adversarial harness (novel inputs, not the producer's tests); full `npm test` + `node tools/validate-foundation.mjs` re-run.

---

## VERDICT: APPROVE_WITH_NOTES

The primitive is correct, faithful to the `CapabilityRegistryService.revoke` mirror, reuses the N-5 SoD
math verbatim (zero local reimplementation), holds the scope line perfectly (resolver byte-identical,
zero importers, exactly one new source file), is terminal-forever, TOCTOU-safe, and descriptor-trap
safe. Full suite green with no repin. **No probe failed; no scope violation; no SoD collapse admitted a
revocation.** The verdict is APPROVE_WITH_NOTES (not APPROVE_FOR_MERGE) solely because of two disclosed,
non-blocking wiring-time obligations (N1, N2 below) that a future operator-gated component-3 consumer
MUST honor — neither is a defect in this unwired candidate.

---

## Probe results (re-derived, by priority)

### Probe 1 — SCOPE LINE (automatic REWORK if violated): **PASS**
- `src/registry/skill-resolver.mjs` is **byte-identical** to `0aa13f8` — git object hash
  `9802452e6abeb85f10fc43602850c46611689337` on both base and reviewed tip; the resolver diff is **0
  lines**. Its static-REVOCATION poison check is therefore definitionally untouched.
- The new module **never imports or calls** the resolver or `resolveEffective` (source read + a suite
  guard both confirm; `grep` for resolver/`resolveEffective` in the new file: none).
- The **full branch diff vs `0aa13f8` is clean**: exactly 5 files change —
  `MANIFEST.json` (append-only +3 entries), `module-completion-tracker-001.md` (append-only +1 log
  line), the producer verification doc (new), `src/ledger/skill-revocation-ledger.mjs` (new, the ONLY
  src change), and `tests/skill-revocation-ledger.test.mjs` (new). **No existing src or test file is
  modified.** No existing live deny behavior is altered.

### Probe 2 — SoD reuse fidelity + adversarial N-5 collapse: **PASS**
- `approval-binding.mjs` (`bb6275d5…`) and `risk-registry.mjs` (`b8ee7f9b…`) are **byte-identical** vs
  main. The new module contains **no** pairwise-distinctness / self-approval / role-matching logic of
  its own (source-confirmed); every SoD outcome is returned verbatim from `evaluateApprovalBinding`.
- Independent out-of-tree harness (`s3rev-crossrev-h.mjs`) drove `revoke()` with hostile bundles.
  **Every collapse denied with the correct code; none allowed a revocation:**
  | Collapse input | Result |
  |---|---|
  | producer == independent reviewer | `DENY_SELF_APPROVAL` |
  | independent == governance | `DENY_SOD_VIOLATION` |
  | governance == producer | `DENY_SOD_VIOLATION` |
  | missing governance role | `DENY_APPROVALS` |
  | empty approvals `[]` | `DENY_APPROVALS` |
  | duplicated actor under different roles | `DENY_SOD_VIOLATION` |
  | forged role strings (`REV`/`GOV` in strict mode) | `DENY_APPROVALS` |
  | approvals as non-array | `DENY_APPROVALS` |
  | approvals as a throwing getter (hostile) | contained → `DENY_REVOKE_MALFORMED`, never allowed |
- **Component-2 tightening verified against the HUMAN_PROMOTION pattern, not capability-registry's lone
  governance shape:** revocation requires the FULL N-5 bundle (independent-review + governance,
  pairwise-distinct from the producer and each other), is bound to the exact `REVOKE_SKILL@<objectVersion>`
  via `boundAction`/`boundObjectVersion`, then RE-VERIFIED via `verifyApprovalBinding` before any write
  (mint + verify are two independent calls). No path reaches a write without a governed GOVERNANCE
  decision binding.

### Probe 3 — Mirror fidelity vs `CapabilityRegistryService.revoke`: **PASS (one disclosed divergence, N2)**
- **Audit-first:** structural — the durable append **is** the write-before-effect; the ledger record IS
  the state (no separate in-memory status that flips first). Stronger than the mirror's two-step
  audit-then-mutate-Map: there is no window in which an effect exists without a durable record.
- **Throwing writer → fail-closed:** a throwing `appendFileSync` propagates out of `DurableLedger.append`
  (lock released via `finally`), so `revoke()` yields NO `ok:true` state. Fail-closed holds. **Divergence
  (N2):** it surfaces as the raw fs error rather than the mirror's named `DENY_AUDIT_UNAVAILABLE`, because
  this ledger has no separate injected audit sink. Informational, not a defect.
- **Blank-reason deny:** `DENY_REVOCATION_INVALID` — matches the mirror exactly.
- **Clock-unavailable:** no ambient clock is read; the caller supplies `decidedAt`, validated by the
  reused `decisionRecord` contract and by `DurableLedger.validateEntry` (`DENY_INVALID_TIMESTAMP`).
  Invalid/blank `decidedAt` fails closed (harness-confirmed). Purity preserved (differs from the mirror's
  `DENY_CLOCK_UNAVAILABLE` code, same fail-closed effect).
- **Unknown-skill:** N/A on the write path (unwired, no manifest store — see N1); `resolveRevoked()`
  emits `DENY_UNKNOWN_SKILL` on the read side.
- **PUBLISHED→REVOKED / `known_bad_versions` recorded:** confirmed; records `[version]` for single,
  de-duplicated `knownVersions` for allVersions.
- **REVOKED terminal-forever:** confirmed by harness — re-revoke of the same version →
  `DENY_ALREADY_REVOKED`; an overlapping allVersions revoke → `DENY_ALREADY_REVOKED`; a prior allVersions
  revoke blocks ANY later revoke (incl. an undeclared version); there is **no** un-revoke / restore /
  republish method; idempotent replay returns `replayed:true` and writes **exactly one** record (no
  resurrection, verified by counting ledger lines).

### Probe 4 — DurableLedger discipline / TOCTOU: **PASS**
- `durable-ledger.mjs` is **byte-identical** vs main (`6be08fc14ff31a7c871c5e86888af42285d40529`);
  hash-chain / idempotency / OCC inherited unmodified.
- The already-revoked gate runs INSIDE the lock via `preWriteCheck(records, entry)`; `#detectAlreadyRevoked`
  **never calls `this.read()`** (source-confirmed — it scans only the passed-in, lock-held, freshly
  read-and-verified `records` snapshot). PROBE1-style harness: overriding a second instance's public
  `read()` to **throw** still yields `DENY_ALREADY_REVOKED` (gate unaffected); overriding `read()` to
  **lie** (`return []`) cannot force a duplicate revoke (`ok:true` never observed — append's internal
  private `#readRecords` + OCC/terminal gate fail closed).

### Probe 5 — Atomic-snapshot / descriptor-trap: **PASS**
- Input is captured once via `snapshotRequest` → `structuredClone`. A hostile `Proxy` is rejected
  wholesale (structuredClone throws `DataCloneError`) → `DENY_REVOKE_MALFORMED` **before any trap fires**.
  Instrumented Proxy trap counts on a full revoke attempt: **getOwnPropertyDescriptor = 0, ownKeys = 0,
  get = 0.** No per-field `getOwnPropertyDescriptor` probe exists in the module. A throwing plain-object
  getter is likewise contained to `DENY_REVOKE_MALFORMED`; cyclic input is handled deterministically.
  All hostile inputs resolve to deterministic deny codes; none leak to validation or the hash chain.

### Probe 6 — Caller-declared `knownVersions` (disclosure #2): **ACCEPTABLE (unwired limitation) — see NOTE N1**
Ruling: **acceptable disclosed limitation for an unwired candidate primitive, NOT a defect at this
stage**, with a mandatory wiring-time obligation. Rationale: the primitive holds no manifest store and
must stay resolver-free, so for an allVersions revoke it records exactly the caller-declared set. A
malicious/mistaken caller CAN under-declare (`allVersions:true` while omitting a live version), so the
recorded `known_bad_versions` may be incomplete. Containment today: (a) the module is **unwired — no live
consumer**, so an incomplete `known_bad_versions` has zero runtime effect; (b) `all_versions:true` is
also recorded, and it makes the gate **terminal for the whole skill** — my harness confirmed a prior
allVersions revoke blocks even an *undeclared* version's later revoke, so no version can slip a *second*
governed revoke through. The residual is purely on the recorded denylist detail. **N1 obligation:** the
future component-3 consumer MUST source the version set from the manifest store (not trust caller
`knownVersions`) AND treat `all_versions:true` as "deny all," never enumerate `known_bad_versions` as the
sole denylist.

### Probe 7 — No schema + purity + unwired: **PASS**
- `schemas.count` still **20** (7 canonical + 13 governed; validator output confirms). `contract-validator.mjs`
  (`src/contracts/…`) and `validate-foundation.mjs` **byte-identical** vs main; all byte-identity guards
  pass **without repin**.
- `decisionRecord` contract reuse is faithful (`decision_type: "GOVERNANCE"`, exact-action/version bind
  carried through `evidence_refs`; re-verified before write).
- **Zero importers:** `git grep SkillRevocationLedger` over `src/`+`tests/` returns only the module's own
  file and its test.
- **No ambient side-effects:** grep of the new module for `Date.now`/`process.`/`fetch`/`node:fs|net|http`/
  dynamic import/`globalThis`/`Math.random` → none; all fs/crypto flow through the injected `filePath` on
  the `DurableLedger` base. Outputs `Object.freeze`d (result, `knownBadVersions`, `decisionRecord`);
  harness confirmed deep-frozen.

### Probe 8 — Regression (independently re-run in from-scratch worktree): **PASS**
- `npm test` → **tests 1325, pass 1322, fail 0, skipped 3, cancelled 0** (exit 0) — exactly matches the
  producer's claim (1325 / 1322 / 0 / 3).
- `node tools/validate-foundation.mjs` → **exit 0**.
- Independent adversarial harness (`s3rev-crossrev-h.mjs`) → **46 / 46 pass, 0 fail**.

---

## Disclosure adjudications

1. **Base-SHA wrinkle — ACCEPTED.** Branch base `0aa13f8` is confirmed **== `origin/main` tip** at review
   time (`git merge-base --is-ancestor` + empty `0aa13f8..origin/main`). The new test's byte-identity
   guard pins `0aa13f8`; a pre-existing unrelated guard pins an older SHA (`71b9d41`) and still passes
   because its guarded files are unchanged across that range — **no repin was needed**. Benign. (Local
   `main` is stale/behind at `cc582e3`; that is a local-checkout artifact, not a branch problem.)
2. **Component-3 temptation / `knownVersions` — ACCEPTED with obligation N1.** The producer explicitly
   resisted reaching into a resolver/manifest store to enumerate versions and instead had the caller
   declare them, keeping the primitive pure and resolver-free. Correct scope discipline; the disclosed
   trust-the-caller cost is bounded as adjudicated in Probe 6. Obligation carried to component-3 wiring.
3. **Header-wording test fixes — ACCEPTED / no cross-cutting risk.** The full branch diff modifies **no
   existing test or source file** (only 2 new files + 3 append-only doc/manifest lines). Any header/
   wording assertions are therefore confined to the producer's own new test file; nothing pre-existing
   was rewritten to make the suite pass.

---

## Residual risks
- **R-1 (low, wiring-time):** caller-declared `knownVersions` under-declaration — see N1. No live impact
  while unwired; MUST be closed by the component-3 consumer.
- **R-2 (informational):** throwing-writer deny surfaces as a raw fs error, not `DENY_AUDIT_UNAVAILABLE`
  (N2). Fail-closed effect is preserved and arguably stronger (single atomic durable write).
- **R-3 (process, merge-time):** re-confirm `origin/main` has not advanced past `0aa13f8` when the
  operator merges; if it has, a re-fold + suite re-run is required before merge. At review time no re-fold
  is needed.

## Re-fold assessment
**Not needed against the current remote tip** — `origin/main == 0aa13f8`, the exact branch base. Standard
merge-time re-confirmation applies (R-3).

## SoD attestation
This review reused the delivered N-5 SoD primitive (`approval-binding.mjs`) as the sole authority for
separation-of-duties outcomes and independently drove every documented collapse to a deny with the
correct code; no collapse admitted a revocation. The reviewer holds **no** approval or execution
authority and did not merge, push, wire, or activate anything. This record is advisory only.

## Advisory fields
```yaml
truth_status: verified_true
authority_status: advisory_only
implementation_status: candidate
risk_class: high
```

## Self-certification
```yaml
self_certification:
  agent_id: claude-immune-crossrev-skill-s3-01
  peer_agent_id: claude-motor-skill-s3-01
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```
