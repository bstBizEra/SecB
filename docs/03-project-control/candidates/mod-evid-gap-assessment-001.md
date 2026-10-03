# MOD-EVID Gap Assessment 001

**Record ID:** MOD-EVID-ASSESS-001
**Module:** MOD-EVID — Evidence and Assurance
**Catalog scope:** "Evidence envelopes, validators and acceptance"
**Base:** unified `main` @ `f04dee6`
**Planner identity:** claude-cortex-modevid-assess-01 (BST-SA cortex, module-loop planner)
**Governance:** AMD-002 advise-and-proceed. Advisory only — no push, no merge, no execution authority.
**Status:** DRAFT — advisory candidate for operator/Immune review.

Directive lineage: this record answers the MOD-EVID row (queue #7, "QUEUED — partial") of
the module completion tracker (`docs/03-project-control/candidates/module-completion-tracker-001.md`).
Read-only assessment of actual code and docs at `main` @ `f04dee6`.

---

## 1. Inventory (what exists today)

| # | Surface | Path | What it does | Lifecycle role |
|---|---------|------|--------------|----------------|
| I1 | Evidence envelope schema | `contracts/evidence-envelope.schema.json` | Closed draft-2020 object, 18 required fields; `verification_status` enum `CAPTURED / SEALED / VERIFICATION_PENDING / VERIFIED / ACCEPTED / REJECTED / SUPERSEDED / QUARANTINED`; `content_hash` `^[a-f0-9]{64}$`; `classification` + `retention_policy` required | Registration shape (structure only) |
| I2 | Contract validator | `src/contracts/contract-validator.mjs` | ajv-2020 `validateContract("evidenceEnvelope", …)`; strict, `additionalProperties:false` | Schema gate |
| I3 | Evidence state machine | `src/control/state-machine.mjs` (`STATE_MACHINES.Evidence`, lines 46-56) | Encodes the ladder `CAPTURED→SEALED→VERIFICATION_PENDING→VERIFIED→ACCEPTED` with `REJECTED/SUPERSEDED/QUARANTINED` terminals. Generic `TransitionEngine` can drive it | Ladder definition (data only) |
| I4 | Authority role map | `src/control/authority-engine.mjs` (`"Evidence:*->SEALED": "EVIDENCE_PRODUCER"`) | Only the `->SEALED` edge is role-mapped; VERIFY/ACCEPT edges are unmapped | Partial authority gate |
| I5 | Evidence ledger | `src/ledger/governed-ledgers.mjs` (`EvidenceLedger.appendEvidence`) | Schema-validates then appends the envelope to a hash-chained durable ledger, keyed by `evidence_id` + idempotencyKey | Durable seal / integrity |
| I6 | Durable ledger primitive | `src/ledger/durable-ledger.mjs` | sha-256 hash chain (`previousHash`, `sequence`, `recordHash`), append-only, lockfile, idempotency + duplicate-id guards, `verify()` | Hash/chain verification primitive |
| I7 | Temporal ledgers | `src/ledger/temporal-ledgers.mjs` (line ~130) | Knowledge derivation admits evidence only when `verification_status ∈ {VERIFIED, ACCEPTED}`, resolved via an **injected lookup**; trusts the field, asserts ref identity | Downstream consumer of accepted evidence |
| I8 | Work-package evidence binding | `src/services/work-package-service.mjs` (P0-09) | Evidence attached to WP transitions as `{ref, obligation}`; typed-obligation stage lock + `#assertObligationsSatisfied` enforce role-stage + independence over the **WP** ladder | Per-service evidence practice |
| I9 | SoD kernel primitive | `src/control/sod-rules.mjs` | Canonical roles incl. `EVIDENCE_PRODUCER / EVIDENCE_VERIFIER / EVIDENCE_ACCEPTOR`; `CONFLICTING_ROLE_PAIRS` incl. `[EVIDENCE_PRODUCER, EVIDENCE_ACCEPTOR]`; `AUTHORIZE_TIME_LADDER.EVIDENCE_ACCEPTOR` excludes producer/reviewer/qa/evidenceVerifier; `checkPairwiseDistinct` | Reusable acceptance-SoD primitive |
| I10 | Canonical fingerprint | `src/contracts/canonical-fingerprint.mjs` | Deterministic sha-256 over sorted-key canonical JSON | `content_hash` / self-verification primitive |
| I11 | Decision record schema | `contracts/decision-record.schema.json` | `evidence_refs` = array of free strings, `minItems:1` | Evidence→decision linkage (unbound) |
| I12 | Gateway evidence status | `src/gateway/mcp-gateway-core.mjs` (`deny(code, evidenceStatus)`) | Optional `evidence_status` field on hardened deny records; invocation-ledger pattern | Tangential (gateway signalling) |
| I13 | Assurance docs | `docs/04-assurance/evidence-and-provenance.md`, `verification-matrix.md` (V-005 SoD, V-008 evidence), `exit-gates.md` | Evidence classes, canonical envelope, integrity controls, acceptance rule; verification matrix is DRAFT / NOT RUN | Doctrine (not effective) |
| I14 | Evidence→knowledge doctrine | `docs/15-knowledge/02-evidence-knowledge-skill.md` | Observed→candidate→verification→accepted ladder; prohibits auto-promotion | Doctrine |
| I15 | Failure-evidence template | `docs/templates/failure-evidence-envelope.yaml` (v0.1) | `schema_version 0.1`, `classification F-EVID`, `integrity_sha256` — template only, no schema/kind in code | Missing first-class kind |

**Reuse-ready primitives** (P0 bar can compose from these without new crypto/storage):
`DurableLedger` (hash chain), `sod-rules` (acceptance SoD), `canonicalFingerprint` (content hash),
`validateContract` (schema gate), `STATE_MACHINES.Evidence` (ladder), `TransitionEngine` (edge legality).

---

## 2. Gap table (evidence-backed)

| ID | Gap | Status | Evidence | Risk if unclosed |
|----|-----|--------|----------|------------------|
| G1 | **Unified evidence-envelope SERVICE** (register/verify/accept as code) | `missing` | No module owns the lifecycle. `EvidenceLedger.appendEvidence` (governed-ledgers.mjs:48-52) appends only; WP-service binds refs; temporal-ledgers consumes status. No `register→verify→accept` code path exists | Evidence acceptance stays practice + per-service logic; no single deny-by-default boundary |
| G2 | **verification-status ladder enforcement** | `partial` | Ladder is data (`STATE_MACHINES.Evidence` 46-56) but nothing enforces it for evidence records: `appendEvidence` writes whatever `verification_status` the envelope carries — an `ACCEPTED` envelope with no prior `VERIFIED` is accepted. Authority map covers only `->SEALED` (authority-engine.mjs:21); `->VERIFIED` / `->ACCEPTED` are unmapped | Reproduces the 013-class defect: fields left at `VERIFICATION_PENDING` (or forged straight to `ACCEPTED`) with no ladder history |
| G3 | **Acceptance SoD (verifier/acceptor distinct from producer)** | `partial` | Primitive exists (`sod-rules.mjs`: `EVIDENCE_ACCEPTOR` ladder + `[EVIDENCE_PRODUCER, EVIDENCE_ACCEPTOR]` pair) but **no evidence service consumes it**. WP-service enforces independence for WP obligations, not for envelope acceptance. `EVIDENCE_VERIFIER` is in no conflicting pair | A producer can self-verify / self-accept its own evidence envelope |
| G4 | **Failure-evidence envelope as first-class kind** | `missing` | `docs/templates/failure-evidence-envelope.yaml` v0.1 only; no `failure-evidence.schema.json`, not in `contract-validator` schemaPaths, not in `validate-foundation` expectedSchemas | Failure evidence cannot be registered/validated; failure→capability loop lacks a sealed artifact |
| G5 | **Evidence→decision linkage** | `partial` | `decision-record.schema.json` `evidence_refs` are free strings bound to nothing; WP refs likewise. `temporal-ledgers` resolves via injected lookup + status check but does not verify the ref resolves to a **sealed, ladder-complete** Evidence ledger entry | Decisions can cite refs that never sealed/verified; claim-to-source binding is nominal |
| G6 | **Retention/classification enforcement** | `missing` (defer R3+) | Schema requires `classification` + `retention_policy`, but no code reads/enforces them | Retention & data-class controls are declarative only — out of P0 envelope-lifecycle bar |

Status legend: `existing / partial / missing / blocked / candidate`.

---

## 3. Producer plan (≤3 slices)

P0 bar = **envelope lifecycle**: schema-valid registration (`CAPTURED`), hash/chain verification
(`SEALED`), SoD-gated verify/accept, deny-by-default. NOT storage backends, NOT crypto beyond the
existing sha-256 patterns. Every slice reuses I6/I9/I10/I2/I3.

### Slice S1 — EvidenceEnvelopeService: register + seal (P0 core)
- **Files:** new `src/services/evidence-envelope-service.mjs`; new `tests/evidence-envelope-service.test.mjs`.
- **Behavior:** `register(envelope, {idempotencyKey})` → `validateContract("evidenceEnvelope")`;
  require entry state `CAPTURED`; recompute `content_hash` via `canonicalFingerprint` over the sealed
  payload subset and **deny on mismatch** (self-verification, closes V-008 changed-payload case);
  seal by appending to an injected `EvidenceLedger` (hash chain = SEAL), advancing `CAPTURED→SEALED`
  via `STATE_MACHINES.Evidence`. Deny-by-default on malformed / duplicate `evidence_id` / bad status.
- **Checks:** positive register+seal; hash-mismatch deny; duplicate-id deny; non-`CAPTURED` initial
  deny; schema-invalid deny. Reuses I2/I3/I6/I10.
- **Size:** ~180-240 LOC + ~150 LOC tests. **R-class: R2** (additive isolated service; no existing-authority change).

### Slice S2 — verify + accept ladder with SoD (P0 core)
- **Files:** extend `src/services/evidence-envelope-service.mjs`; extend its test;
  minimal edits to `src/control/authority-engine.mjs` (add `Evidence:*->VERIFIED` →
  `EVIDENCE_VERIFIER`, `Evidence:*->ACCEPTED` → `EVIDENCE_ACCEPTOR`) and `src/control/sod-rules.mjs`
  (add `[EVIDENCE_PRODUCER, EVIDENCE_VERIFIER]` and `[EVIDENCE_VERIFIER, EVIDENCE_ACCEPTOR]` pairs).
- **Behavior:** `verify(evidenceId, verifierActor)` `SEALED→VERIFICATION_PENDING→VERIFIED`;
  `accept(evidenceId, acceptorActor)` `VERIFIED→ACCEPTED`. Each edge gated by the authority role map
  + `sod-rules.checkProhibitedActors(EVIDENCE_ACCEPTOR, …)` over recorded producer/verifier history
  + `checkPairwiseDistinct([producer, verifier, acceptor])`. Deny ladder skips and self-verify/self-accept.
- **Checks:** producer-self-verify deny; verifier-self-accept deny; ladder-skip deny
  (`SEALED→ACCEPTED` rejected); happy 3-distinct-actor path.
- **Size:** ~200 LOC + ~180 LOC tests. **R-class: R4** — mutates kernel authority role map and SoD
  conflicting-pairs (changes evidence-acceptance authority semantics). Requires Immune review + operator ratify.

### Slice S3 — accepted-evidence resolver + decision/temporal binding (P0-adjacent tail)
- **Files:** extend `src/services/evidence-envelope-service.mjs` with `resolveAccepted(ref)`; new
  `tests/evidence-decision-linkage.test.mjs`. No schema change.
- **Behavior:** expose `resolveAccepted(ref)` returning the sealed record only when it is
  ladder-complete and `verification_status ∈ {VERIFIED, ACCEPTED}` — the exact lookup shape
  `temporal-ledgers.mjs:~130` already consumes (asserts identity, returns bound envelope). Provides
  a binding point so decision-record / WP `evidence_refs` can be validated against sealed evidence.
- **Checks:** unbound/unsealed ref deny; non-accepted ref deny; temporal-ledger knowledge-derivation
  integration (accepted ref admits, pending ref denies).
- **Size:** ~150 LOC + ~130 LOC tests. **R-class: R3** — changes evidence-acceptance linkage
  semantics consumed by existing temporal-ledgers/decision path.

**Sequencing:** S1 → S2 → S3. S1+S2 satisfy the P0 envelope-lifecycle bar; S3 is the linkage tail.
Failure-evidence schema (G4) and retention/classification enforcement (G6) are **out of these three slices**.

---

## 4. Non-goals

- No storage backend, object store, or DB — reuse the file-backed `DurableLedger` hash chain only.
- No new crypto — sha-256 via `canonicalFingerprint` / `DurableLedger` only; no signatures/Merkle in P0.
- No `failure-evidence.schema.json` and no new evidence kinds in this pass (G4 → R3+ follow-up).
- No retention/classification enforcement engine (G6 → R3+); schema fields remain declarative.
- No change to WP-service P0-09 obligation logic (I8) — evidence-envelope lifecycle is a distinct surface.
- No modification of ADR-0015 R5, operator queue, or production declaration. No execution.

---

## 5. R-class flags (summary)

| Slice / item | R-class | Why | Gate |
|--------------|---------|-----|------|
| S1 register+seal | R2 | Additive isolated service; composes existing primitives | Independent REV |
| S2 verify+accept ladder | R4 | Mutates `authority-engine` role map + `sod-rules` conflicting-pairs (evidence-acceptance authority semantics) | Immune review + operator ratify |
| S3 resolver + linkage | R3 | Changes acceptance-linkage semantics for existing temporal-ledgers/decision consumers | Immune review |
| G4 failure-evidence schema | R3+ | New first-class kind + validator wiring | Deferred follow-up |
| G6 retention/classification | R3+ | New enforcement surface | Deferred follow-up |

---

## 6. Advisory status fields

```yaml
advisory:
  truth_status: verified_true          # inventory & gaps read from code/docs at f04dee6
  authority_status: advisory_only
  implementation_status: partial       # module partial; lifecycle service missing
  risk_class: high                     # S2 touches kernel authority/SoD (R4)
  scope: envelope_lifecycle_only
  base_commit: f04dee6
  gap_counts:
    total: 6
    missing: 2      # G1, G4
    partial: 3      # G2, G3, G5
    deferred: 1     # G6
  slice_count: 3
  r_class_flags: [R2, R4, R3]
```

```yaml
self_certification:
  agent_id: claude-cortex-modevid-assess-01
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

**Provenance.** Source — read-only assessment of `main` @ `f04dee6` (files cited inline).
Agent ID — claude-cortex-modevid-assess-01. Timestamp — 2026-07-20 (UTC+7 worktree session).
Recommend improvements only; do not execute them.
