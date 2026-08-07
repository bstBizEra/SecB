# Second Independent Review: MOD-EVID-S1 register+seal (REV-002)

- review_id: MOD-EVID-S1-REGSEAL-REV-002
- status: CANDIDATE (advisory review; operator ratification still required)
- reviewer: claude-immune (BST-SA immune role, independent identity from the first
  reviewer `claude-immune-rev-modevid-s1`; no shared session state, no prior
  findings taken on trust)
- peer_agent_id: null (no Codex-immune counterpart engaged for this pass)
- prior_review: `docs/03-project-control/candidates/mod-evid-s1-rev-001.md`
  (REV-001, APPROVE_WITH_NOTES, 2026-07-20) — read for scope orientation only;
  every claim in it was independently re-derived from source, not assumed.
- base_reviewed: `origin/main` @ `cc582e3` (2026-07-21), isolated detached-HEAD
  worktree at `.claude/worktrees/immune-mod-evid-s1-regseal-review`, `npm ci`
  run fresh in that worktree.
- scope: `src/services/evidence-envelope-service.mjs` — `registerEnvelope()`
  (lines 111-163) and `sealEnvelope()` (lines 165-227) ONLY — the LIVE S1
  register+seal path. `#rehydrate()` and the S2/S3 ladder additions do not
  exist on `origin/main` (confirmed: this file has no `#rehydrate` method on
  this branch) — the 5-round rehydration saga referenced in the task mandate
  lives on a branch not yet merged to main, and is explicitly out of scope
  here. S2 (`requestVerification`/`recordVerification`/`acceptEvidence`) and
  S3 (`resolveAccepted`) were read for context only, not re-audited.
- governance: CLAUDE.md BST-SA advisory contract + user CLAUDE.md (non-main
  branch, no push, no merge, advisory-only worker role)
- date: 2026-07-21

## Verdict

**APPROVE_WITH_NOTES.**

Independent re-derivation confirms the first review's account of S1's
register+seal path: it is sound. No seal-integrity/collision gap, no
check-then-act gap in the LIVE registration path, no silent-fail-open gap,
and no actor-identity-binding gap were found. Two new LOW, non-blocking
observations surfaced that REV-001 did not record (both about shared
infrastructure behavior, not this file's own logic) — see Notes. Nothing here
rises to REQUEST_CHANGES.

## Independent verification performed

### 1. Seal integrity / collision resistance

- `content_hash` = `sha256(canonicalize(envelope minus content_hash))` via
  `src/contracts/canonical-fingerprint.mjs`. Read the canonicalizer in full:
  recursively sorts object keys, maps arrays element-wise, then
  `JSON.stringify`s the result. SHA-256 itself is not the weak point;
  the weak point in this class of scheme is always the canonicalization step
  admitting two different JS values that serialize identically.
- Specifically hunted for a **known JSON.stringify quirk**: `JSON.stringify`
  silently drops object keys whose value is `undefined`, and collapses `NaN`/
  `Infinity`/`-Infinity` to `null`. Either could let two *distinct* envelope
  objects (one with an explicit `undefined`/`NaN` field, one without/with
  `null`) hash identically. Verified empirically (ran a probe script against
  the actual installed `ajv` in this worktree, not assumed):
  - AJV's `integer`/`number` type check rejects `NaN` and `±Infinity`
    outright (`must be integer`) — confirmed both fail schema validation
    before ever reaching `fingerprint()`.
  - AJV's `required` check treats an explicit `foo: undefined` as **missing**
    (fails `required`), and `additionalProperties: false` catches an
    undefined-valued extra key too (still an own key via `Object.keys`).
  - Net result: the schema gate (`this.#validate("evidenceEnvelope", envelope)`,
    called *before* the hash check in `registerEnvelope`) closes off every
    reachable path to this collision class. Verified clean, not assumed clean.
- Confirmed `content_hash` is computed **once**, at registration, over the
  full closed-schema envelope (17 fields minus `content_hash` itself — schema
  is `additionalProperties: false`, so this is total content binding, not
  partial). Nothing later recomputes it from scratch; `verifyChain()` instead
  compares `fingerprint(ledgerCopy) === fingerprint(memoryCopy)` for
  divergence detection between the durable chain and the frozen in-memory
  record — a different, and consistent, purpose. No mismatch in how the two
  computations are used.
- No collision or weak-binding issue found.

### 2. Registration check-then-act (the MOD-LIVE/MOD-WSPACE/MOD-RUNTIME-S1/rehydration bug class)

- That bug class needs an **await boundary** between the read and the write
  for another call to interleave. `registerEnvelope()` is fully synchronous
  (no `async`, no `await`, no promise anywhere in its body) from the
  duplicate check (`this.#records.has(key)`) straight through to the write
  (`this.#records.set(key, record)`) — a single JS macrotask, non-preemptible.
  There is no gap for a second call to land in between. Confirmed by reading
  every line of the method body, not inferred from the signature.
- `sealEnvelope()` reads `this.#ledger.read().length` (unlocked) then calls
  `this.#ledger.append(entry, { expectedSequence })`. This *looks* like a
  read-then-act gap, but `DurableLedger.append()` (`src/ledger/durable-ledger.mjs:137-197`)
  takes an `mkdirSync`-based mutex, **re-reads and re-verifies the chain after
  acquiring the lock**, and re-checks `records.length !== expectedSequence`
  against that fresh read — a stale `expectedSequence` from the outer
  unlocked read is caught and denied (`DENY_SEQUENCE_CONFLICT`) inside the
  locked section, not silently accepted. The outer read is advisory; the
  atomicity guarantee lives entirely inside `append()`. Verified by reading
  `durable-ledger.mjs` in full, not assumed from the seal-service comment.
- No check-then-act gap found in the LIVE registration or seal path.

### 3. Silent-fail-open

- Traced every input path: non-object envelope, schema-invalid envelope
  (AJV `additionalProperties:false`, all 17 fields typed/enum-constrained,
  strict mode), hash-mismatched envelope, forged `verification_status`,
  duplicate `(evidence_id, version)`, blank/non-integer `sealEnvelope` args,
  unknown evidence, illegal ladder edge, and ledger append failure — every
  one denies via `EvidenceEnvelopeServiceError` with a specific code; none
  coerce, default, or silently pass through. AJV is instantiated with
  `strict: true` and no `coerceTypes`/`useDefaults`, so it does not mutate
  the candidate object either (confirmed by reading `contract-validator.mjs`
  construction, not assumed from default AJV behavior).
- No fail-open path found.

### 4. Actor/identity binding at registration

- `record.envelope = frozenClone(envelope)` (deep-freeze via `structuredClone`
  + recursive `Object.freeze`). `.mjs` is an ES module, so it runs in strict
  mode — any later attempt to reassign `record.envelope.actor_id` throws
  `TypeError` rather than silently no-op-ing. Combined with `DENY_DUPLICATE`
  blocking any second `registerEnvelope` call for the same
  `(evidence_id, version)` key, there is **no code path** that can change who
  the registering producer (`actor_id`) is for an already-registered record.
  `sealEnvelope()` only ever reads `record.envelope.actor_id` (never writes
  it) when building the ledger entry.
- Noted (not a bug, a scope observation): nothing in S1 enforces that
  successive **versions** of the same `evidence_id` share the same
  `actor_id` — a v2 registration with a different producer than v1 is
  accepted. This is a different granularity than the MOD-WORK
  `producerActorId` bug class (which was about a single record's producer
  changing post-hoc); here each version's identity is independently locked
  at ITS OWN first registration. Whether cross-version producer continuity
  should be enforced is a product/policy question for a future slice, not an
  S1 defect — flagged as LOW-3 below, non-blocking.
- No actor-identity-binding gap found.

### 5. Seal's atomicity with its gating checks

- Edge legality (`EVIDENCE_MACHINE[record.status]?.includes(SEALED_STATE)`)
  is checked read-only, synchronously, before any ledger I/O — independently
  re-verified the ladder topology in `src/control/state-machine.mjs`:
  `CAPTURED: ["SEALED","QUARANTINED"]`, `SEALED: ["VERIFICATION_PENDING","QUARANTINED"]`
  — `SEALED` has no self-edge, so re-seal is structurally impossible, not just
  denied by convention. Also independently confirmed `CAPTURED` is the ladder's
  unique no-inbound-edge state (nothing in the machine points to it).
- "Can't seal without registering" is enforced by `#records.get()` returning
  `undefined` → `DENY_UNKNOWN_EVIDENCE`.
- Audit-before-effect: `record.status = SEALED_STATE` executes only after
  `this.#ledger.append(...)` returns successfully; any thrown error
  (`LEDGER_INTEGRITY_FAILURE`/`LEDGER_CORRUPT` → `DENY_CHAIN_BROKEN`, anything
  else → `DENY_LEDGER_APPEND`) exits before the flip. Reran the target test's
  own throwing-ledger case and independently re-derived from the source that
  no code path flips status before the append resolves.

## Test results (reproduced first-hand, isolated worktree, fresh `npm ci`)

```
npm test               -> tests 1200, pass 1197, fail 0, skipped 3
node --test tests/evidence-envelope-service.test.mjs
                       -> tests 32, pass 32, fail 0
node tools/validate-foundation.mjs
                       -> exit 0, 0 FAIL entries in the JSON report
```

## Hardcoded test-ID branching

Grepped `evidence-envelope-service.mjs` and the wider `src/**/*.mjs` tree for
literal-ID equality checks that could act as a backdoor (`evidence_id === "..."`,
`actorId === "..."`, `NODE_ENV`/`DEBUG`/`bypass`/`skipValidation` sentinels).
Every `evidence_id === X` / `actor_id === X` hit found is a legitimate,
parameterized identity comparison against a caller-supplied variable
(`ref`, `evidenceId`, `record.sourceActorId`, `record.reviewerActorId`, etc.),
not a literal magic string. The one literal-string match (`ref === "ev_ok"`
/ `"ev_raw"`) is inside `tests/conformance-stubs.test.mjs` — a test fixture
stub, not production code. No hardcoded test-ID branching found in the
reviewed service.

## Notes (non-blocking)

- **INFO-1 (carried forward from REV-001, still present).**
  `evidence-envelope-service.mjs:117` still says "18 required fields"; the
  schema (`contracts/evidence-envelope.schema.json`) has **17** (independently
  recounted). Comment-only, zero behavioral effect.
- **LOW-2 (new, ledger-infrastructure, not this file).** `DurableLedger.append()`'s
  idempotency-replay match compares `entryHash` computed over the **entire**
  candidate entry, including a freshly-generated `timestamp`. Two genuinely
  identical-content seal attempts issued at different wall-clock instants
  (e.g., a caller-level retry after a crash, replayed against a fresh service
  instance) will differ only in `timestamp` and therefore hit
  `DENY_IDEMPOTENCY_CONFLICT` instead of the intended `replayed: true` path —
  the mechanism is not exploitable (it fails closed, never accepts a wrong
  replay) but is more fragile than its name implies. This is
  `durable-ledger.mjs` shared infrastructure behavior inherited by every
  ledger-backed service, not something `evidence-envelope-service.mjs`
  introduced or can fix unilaterally. Flag for whoever owns `DurableLedger`
  next; no change requested against S1.
- **LOW-3 (new, scope/design question, not a defect).** See "Actor/identity
  binding" above: S1 does not require successive versions of one
  `evidence_id` to share `actor_id`. Each version's producer identity is
  independently immutable once registered, which satisfies the literal
  question this review was asked to answer; whether cross-version continuity
  should be a policy requirement is a separate product decision.

## Authority boundary

This review changed no production code, policy, schema, ADR, or authority
surface. It added one advisory record on a detached-HEAD worktree, committed
under a dedicated ref via `git update-ref` — not on `main`, not on any live
branch. No push, no merge. Operator/GOV holds the merge/disposition decision.
ADR-0015 R5 untouched.

## advisory_status_fields

- truth_status: verified_true
- authority_status: advisory_only
- implementation_status: existing (S1 register+seal already merged to main;
  this is a second independent look, not new work)
- risk_class: low

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
