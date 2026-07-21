# P0-18 Conformance Harness — Immune Cross-Review 001

**Document ID:** SECB-P0-18-CONFORMANCE-CROSSREV-001
**Status:** CROSS-REVIEW / ADVISORY — NOT SIGN-OFF, NOT THE P0-20 VERDICT
**Reviewer:** `claude-immune-crossrev-p0-18-conformance-01` (BST-SA Immune, advisory)
**Review target:** branch `bst/p0-18-conformance-candidate` @ `5f97176`
(`5f9717677ac729dd2b3f58bc6b24d95b7c0a3540`)
**Base:** main @ `4abfff2` (`4abfff2259fdf85025448706f888e6ac45cc79c6`)
**Producer under review:** `claude-motor-p0-18-conformance-01`
**Governance mode:** AMD-002 advise-and-proceed (cross-review packet on a branch)

---

## Verdict

**APPROVE_FOR_MERGE**

The candidate converts four previously-BLOCKED conformance stubs (V-002, V-010,
V-014, V-016-partial) into live positive/negative/adversarial cases that compose
the **real ratified primitives** read-only over fixtures. Every asserted deny
code is the actual code the real primitive emits; every positive genuinely
allows through the real primitive; every adversarial genuinely fails closed. The
new file is at the `tests/` root and runs inside the full-suite glob. The
still-blocked halves remain honest stubs with the real blocking dependency
named. No `src/` primitive is modified. The advisory packet does not over-claim
and explicitly disclaims P0-18 sign-off and the P0-20 verdict.

No blocking findings. Two informational notes only.

---

## Explicit rulings (task-mandated)

### R1 — REAL DENY CODES, NOT FAKED — **PASS**

Every negative/adversarial deny code asserted in
`tests/conformance-p0-18-candidate.test.mjs` was traced to the real primitive
source and confirmed as a genuine emission (not a string the test invented, not
a canned stub return):

| Deny code | Emitting primitive | Traced at |
|---|---|---|
| `DENY_PROJECT_UNKNOWN` | `project-contract-service.mjs` | L176/179 |
| `DENY_INITIAL_STATE` | `project-contract-service.mjs` | L98 |
| `DENY_DECISION_REUSE` | `project-contract-service.mjs` | L271 |
| `DENY_CONTRACT_REVOKED` | `project-contract-service.mjs` | L151 |
| `DENY_ACCESS_ESCALATION` | `access-mode-policy.mjs` | L254-256 (ladder rank check) |
| `DENY_ACCESS_MODE_MALFORMED` | `access-mode-policy.mjs` | L168/171/174/222/233/243 |
| `DENY_ACCESS_MODE_UNKNOWN` | `access-mode-policy.mjs` | L180 (indexOf −1, no coercion) |
| `DENY_ACCESS_AUTHORIZATION_REQUIRED` | `access-mode-policy.mjs` | L274 (doctrine gate) |
| `DENY_UNKNOWN_CAPABILITY` | `mcp-gateway-core.mjs` | L610 (deny-by-default allowlist) |
| `DENY_NON_READ` | `mcp-gateway-core.mjs` | L616 (access !== "read") |
| `DENY_CONTEXT` | `mcp-gateway-core.mjs` | L601 (blank required field) |
| `DENY_RESULT_INVALID` | `mcp-gateway-core.mjs` | L749 (`cloneJson rejectSecrets`) |
| `DENY_REVOKED` | `mcp-gateway-core.mjs` | L665 (pre-dispatch kill switch) |
| `DENY_REQUEST_INVALID` | `mcp-gateway-core.mjs` | L539/570 (param normalization) |
| `DENY_UNKNOWN_CHECKPOINT` / `DENY_UNKNOWN_SESSION` | `checkpoint-ledger.mjs` | L70/85 |
| `DENY_INVALID_CHECKPOINT_ID` / `DENY_INVALID_SESSION_ID` | `checkpoint-ledger.mjs` | L66/81 |
| `LEDGER_INTEGRITY_FAILURE` | `durable-ledger.mjs` | L94 (`#verifyRecords` hash chain) |

The gateway's positive path is genuine: the candidate's `capabilityRegistry`
carries `access:"read"` entries; `snapshotCapabilities` sets `snapshot_valid`
(gateway L157); the read capability dispatches and returns
`content_disposition:"data_untrusted"` from the real receipt builder (L784). The
injected callbacks (`authorize`, `invocationLog`, `revocationCheck`,
`resultValidator`, `now`) are the primitives' **required** dependency seams
(clock/oracle/audit-sink), not fakes of the deny logic — the secret-leak
rejection comes from the built-in `cloneJson({rejectSecrets:true})`, not from
`resultValidator` (which is left `() => true` in the leak case).

### R2 — POSITIVE allows / ADVERSARIAL fails-closed (independent rebuild) — **PASS**

I independently authored six attacks against the real primitives using vectors
the candidate does **not** use, and every one failed closed with the correct real
code:

| My attack (novel vector) | Result |
|---|---|
| Hostile throwing getter on `grantedMode` (candidate hit `requestedMode`) | `DENY_ACCESS_MODE_MALFORMED` |
| Escalation `Steer`-grant → `Emergency`-request (unused pair) | `DENY_ACCESS_ESCALATION` |
| `constructor.prototype` pollution in gateway params (not `__proto__`) | `DENY_REQUEST_INVALID` |
| Fresh `__proto__` pollution; global prototype checked after | `DENY_REQUEST_INVALID`; global proto **clean** |
| AWS access-key + secret-key shape in adapter result (not the candidate's GH token) | `DENY_RESULT_INVALID` |
| Decision-reuse across submit→approve (single shared decisionId) | `DENY_DECISION_REUSE` |
| Tamper a **different** persisted field (`sequence_at_checkpoint`, candidate tampered `state_snapshot_ref`) | `LEDGER_INTEGRITY_FAILURE` |

Conclusion: the fail-closed behaviour is a property of the real primitives, not
of the specific assertions the candidate happens to make.

### R3 — NO FAKED COVERAGE / HONESTY — **PASS**

- Base main @ `4abfff2` had **5** skip stubs (V-002, V-010, V-011, V-014, V-016).
- Candidate retains **2** honest skips: V-011 storage-plane
  redaction-before-append (`skip: "BLOCKED: P0-08 security policy surface …"`)
  and V-016 **drift comparator** (`skip: "BLOCKED: checkpoint-ledger non-goal #3
  …"`). Both name the real absent dependency.
- V-002/V-010/V-014 skip stubs were **removed** (converted to comments pointing
  at the live cases) — not silently marked covered while still empty.
- V-016 is split honestly: the resume-point half is live; the drift half stays a
  skip. The candidate's own header (L21-25) and the packet §4 both state the
  drift comparator is genuinely absent on main.
- No V-020 test claims coverage anywhere in `tests/`; the packet marks V-020
  ⛔ blocked / activation-dependent / out-of-scope. No over-claim.
- The packet coverage matrix (§2/§3) matches what the tests actually assert,
  deny-code for deny-code.

### R4 — IN-GLOB & RUNS (the self-pilot lesson) — **PASS**

- Test script is `npm run validate && node --test tests/*.test.mjs` — a
  single-level glob that only matches files **directly** under `tests/`.
- The new file is `tests/conformance-p0-18-candidate.test.mjs` (tests/ root,
  git-tracked at that path) — inside the glob, unlike the P0-19 self-pilot file
  that originally landed in a subdir.
- Confirmed by running the **full** suite (not isolation): all 5 new tests
  (V-002, V-010, V-014, V-016-partial, byte-identity guard) appear with ✔ in the
  full-suite output.

### R5 — Byte-identity — **PASS**

- All 8 `PINNED_BLOBS` entries equal `git rev-parse 4abfff2:<file>` (verified
  independently, not by trusting the test).
- `git diff --name-only 4abfff2 5f97176` touches **zero** `src/` files.
- The byte-identity guard test is live and green in the full suite, so any future
  drift of a composed primitive would fail the build.

### R6 — Packet honesty — **PASS**

Packet explicitly disclaims (§0): it does NOT render the P0-20 governance verdict
and does NOT constitute P0-18 sign-off. Baseline/candidate totals in the packet
(1113/1108/0/5 → 1115/1113/0/2) match my measured runs exactly. Schema count
(17 = 7 canonical + 10 governed) matches. `self_certification` block present with
`execution_authority: false`, `approval_authority: false`.

---

## Scope, regression, and gate results (measured)

| Check | Result |
|---|---|
| Files changed `4abfff2..5f97176` | exactly 4: `MANIFEST.json`, candidate doc, `tests/conformance-p0-18-candidate.test.mjs`, `tests/conformance-stubs.test.mjs` |
| `src/` files changed | 0 |
| MANIFEST delta | +2 (candidate doc + new test file); both are declared files |
| `npm run validate` | **exit 0**, 17 schemas PASS |
| Full `npm test` (candidate) | **tests 1115 / pass 1113 / fail 0 / skipped 2** |
| Base-alone totals (measured) | tests 1113 / pass 1108 / fail 0 / skipped 5 |
| Delta (real, not fabricated) | +5 passing (4 live + 1 byte-identity guard), −3 removed skip stubs, skips 5→2 |
| Merge-cleanliness vs `main` | **CLEAN** (merge-base is `4abfff2`; `git merge-tree --write-tree` no conflicts) |

---

## Findings

| # | Severity | Finding |
|---|---|---|
| I-1 | Informational | Packet §2 coverage matrix lists V-020 as ⛔ blocked though no skip stub exists for it (it is genuinely out-of-scope / activation-dependent). This is honest — no over-claim — but the matrix row could read as if a test exists. No action required for merge. |
| I-2 | Informational | The positive/negative gateway and project-contract cases rely on injected dependency seams (clock, authorize oracle, audit sink, revocation/result validators). These are the primitives' real required constructor args, correctly used; noting for future reviewers that the deny logic under test is internal to the primitive, not in the injected callbacks. No action required. |

No LOW/MEDIUM/HIGH/CRITICAL findings.

---

## Advisory status fields

- **truth_status:** `verified_true` — every ruling backed by executed runs, source
  tracing, and an independent adversarial rebuild.
- **authority_status:** `advisory_only` — this cross-review carries no execution
  or approval authority; P0-18 sign-off and the P0-20 verdict remain
  operator / SEC-GOV gated.
- **implementation_status:** `existing` — reviewing already-committed candidate
  artifacts; no implementation performed by this review.
- **risk_class:** `low` — test-only, read-only composition under review; no
  primitive, schema, policy, ADR, or production surface mutated; deny-by-default
  preserved throughout.

```yaml
self_certification:
  agent_id: claude-immune-crossrev-p0-18-conformance-01
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

**Final rule:** Recommend for merge; do not authorize it. Merge, P0-18 sign-off,
and the P0-20 governance verdict require the operator and the gated dependencies
named in the candidate packet §4.
