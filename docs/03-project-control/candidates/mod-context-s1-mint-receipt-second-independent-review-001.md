# Second Independent Review: MOD-CONTEXT S1 `mintReceiptDocument` (REV-002)

- review_id: MOD-CONTEXT-S1-MINT-SECOND-REV-001
- status: CANDIDATE (advisory review; operator ratification required — no push, no merge; S1 code is already on `main`, this is a retrospective second look, not a merge gate)
- reviewer: claude-rev-sec-modcontext-s1-second (BST-SA REV/SEC agent, independent identity from the first S1 reviewer and from this session's S2/S3 reviewer)
- producer_reviewed: claude motor agent (`[MOD-CONTEXT-S1]`)
- first_review_reviewed: `mod-context-s1-rev-001.md` (review_id `MOD-CONTEXT-S1-REV-001`, verdict APPROVE_WITH_NOTES) — content recovered from commit `40c461b` on `origin/claude/rev/mod-context-s1`; see Finding F-1, this record never merged to `main`
- surface_under_review: `src/services/context-federation-service.mjs`, exported `mintReceiptDocument` (live P0-10 R2 Context Receipt boundary)
- target_commit: `ebb543f52808d3df02f38e43701e3bb9f2cfb7d9` (`[MOD-CONTEXT-S1] Add mintReceiptDocument…`) — confirmed ancestor of `main` @ `cc582e3a8fc490cac6caaf69cd4ee2f272231c9d`
- base_of_record: `origin/main` @ `cc582e3a8fc490cac6caaf69cd4ee2f272231c9d` (fetched fresh; detached HEAD; isolated worktree `.claude/worktrees/rev-mod-context-s1-mint`, never a live branch)
- prior_related_work_this_session: MOD-CONTEXT S2 (`candidate-source-port.mjs`) and S3 (lifecycle facets + shape-convergence crosswalk) already given an independent second look this session (clean; one disclosed, non-exploitable provider-identity/`kind`-spoofing observation at the S2 port layer — see §6)
- governance: BST-SA advisory contract (worker, not authority); AMD-002 advise-and-proceed; operator-only merge/ratify
- date: 2026-07-22
- method: first-hand. Fresh `git fetch origin main`; isolated detached-HEAD worktree; `npm ci`; full suite and the module's own test file run directly; every claim in the first S1 review re-derived independently by reading `context-federation-service.mjs`, `canonical-fingerprint.mjs`, `context-retrieval-policy.mjs`, `contract-validator.mjs`, `reserved-delimiters.mjs`, `contracts/context-receipt.schema.json`, and `tests/context-receipt-mint.test.mjs` in full; three ad-hoc adversarial probes run directly against the built module (not the producer's fixtures) to test malformed-entry handling the first review's harness did not cover.

---

## Verdict

**APPROVE_WITH_NOTES.**

Independently re-derived: `mintReceiptDocument` is a pure, side-effect-free, fail-closed candidate-document constructor that shares its seal (`sealBody` → `canonicalFingerprint`) and its survivor-set logic (`survivorSet`) verbatim with the live `issueReceipt`/`#resolveHead` gates — not merely "reviewed as equivalent" but literally the same function objects, so drift between mint's seal and the service's re-verification is structurally impossible, not just tested-and-currently-true. Every deny path traced from mint through to `issueReceipt`, `#resolveHead` (verify/consume), and `compactReceipt` is fail-closed. No TOCTOU: minting reads no external or mutable state — it is a pure function of its arguments, and every value that eventually matters (seal, survivor set, scope) is independently recomputed by the service at issuance and at every resolve, never trusted from the minted candidate. No new ALLOW is introduced.

Two non-blocking notes below (F-1 documentation/provenance gap, F-2 a null-entry crash-not-deny robustness gap) — neither is a security bypass, neither requires a change before continued reliance on this surface, both are recommended fast-follow cleanups.

---

## 1. Receipt integrity / binding — verified at the S1 level, not borrowed from S2/S3

This session's earlier S2/S3 review found the mint→issue substitution boundary clean via `verifyChain()`-style re-verification *at the S2/S3 layer*. Tracing the same question one layer down, into S1's own code:

- `sealBody(document)` (`context-federation-service.mjs:57-60`) computes `canonicalFingerprint` over the **entire document body** (all 15 non-seal fields: `receipt_id`, `version`, `project_id`, `objective_id`, `work_package_id`, `session_id`, `assigned_role`, `authority_scope`, `baseline_version`, `acceptance_criteria`, `allowed_tools`, `allowed_skills`, `evidence_obligations`, `freshness_timestamp`, `source_references`), with `content_hash` itself excluded from what is hashed.
- `mintReceiptDocument` sets `content_hash: sealBody(body)` (line 121) at construction — this is the SAME `sealBody` free function `issueReceipt` (line 195) and `#resolveHead` (line 252) call to independently **recompute and compare** the seal, both at issuance and at every subsequent verify/consume. This is not "S1 trusts S2/S3 to check it later" — the recomputation-and-compare discipline is native to S1's own `issueReceipt`/`#resolveHead`, which predate S1 (S1 only extracted `sealBody` out of an inline expression, verbatim, per the first review's B-1 hunk table — behavior unchanged).
- Consequence: a receipt minted for content A cannot later be presented as content B. Any single-field mutation (including `content_hash` itself) changes the canonical fingerprint over the body, and `issueReceipt`/`#resolveHead` deny `DENY_FINGERPRINT_MISMATCH` on any mismatch between the stored/asserted `content_hash` and the live recomputation.
- **Directly reproduced, not just read.** `tests/context-receipt-mint.test.mjs` MINT-07 already exercises exactly this: it mutates *every single sealed field in turn, including `content_hash` itself*, and asserts `DENY_FINGERPRINT_MISMATCH` on each. MINT-08 goes further — a correctly *resealed* tamper (i.e., an attacker who recomputes the hash after changing a field) still hits the correct downstream semantic deny (`DENY_NOT_INITIAL_VERSION`, `DENY_SOURCE_MISMATCH` ×3, `DENY_SCOPE_WIDENING`, `DENY_BASELINE_MISMATCH`) — so resealing does not let a caller manufacture a receipt for different content than what actually survived retrieval. Ran both first-hand at `cc582e3`; both pass (10/10 in the file — see §4).

**Finding: no receipt-substitution gap. The binding is structural (cryptographic seal over the full body, recomputed independently at every gate) and is native to S1, not delegated to or dependent on S2/S3.**

## 2. TOCTOU / check-then-act

`mintReceiptDocument` takes only its argument object; it holds no reference to a service instance (`#wp`, `#receipts`, `#idempotency` are all private fields of `ContextFederationService`, structurally unreachable from a module-level function), performs no I/O (no `fs`, no network, no clock read — confirmed by code inspection: the only calls inside `mintReceiptDocument` are `runRetrieval` (pure), `structuredClone`, `sealBody`/`canonicalFingerprint` (pure), `validateContract` (pure schema check), `assertIdCharset`, and `deepFreeze`), and mutates nothing. `runRetrieval` (`context-retrieval-policy.mjs`) is likewise pure over its `candidates` argument — no external state read.

Because mint reads no external/mutable state, there is no read-then-act gap *inside* mint. The service-level design also structurally forecloses the adjacent risk (a stale mint output being trusted later): `issueReceipt` does not trust `document.source_references` from the minted candidate — it independently re-runs `runRetrieval` against whatever `candidateSources` the caller supplies **at issuance** and requires an exact survivor-set match (`DENY_SOURCE_MISMATCH` otherwise, line 216-222). If the candidate pool drifted between mint-time and issue-time, the mismatch denies; it never silently issues against a stale mint snapshot.

**Finding: no TOCTOU class defect in S1's own logic** — the recurring MOD-LIVE/MOD-WSPACE/MOD-RUNTIME-S1/MOD-EVID bug shape (act on a stale external read) does not reproduce here because mint has no external read to begin with, and the one adjacent risk (stale candidate pool) is closed by re-verification at issuance, not by trusting mint.

## 3. Silent-fail-open

Re-derived the fail-closed posture of `mintReceiptDocument`'s own input handling, then went further than the first review's harness (which used well-formed candidate objects with individually-wrong field values — dup/proto-key/cross-project/over-ceiling/empty/scope-widen) by probing malformed candidate array elements directly against the built module:

| Probe | Input | Observed | Assessment |
|---|---|---|---|
| Non-object input | `mintReceiptDocument(null)` / `[]` | `DENY_MALFORMED_REQUEST` | fail-closed (reproduced, MINT-09) |
| Unknown top-level key | `{ ...valid, smuggled: true }` | `DENY_MALFORMED_REQUEST` (allowlist, `MINT_KEYS`) | fail-closed (reproduced, MINT-09) |
| Bad `classificationCeiling` | `"ULTRA"` | `DENY_MALFORMED_REQUEST` | fail-closed |
| Non-boolean `include_exclusions_digest` | `"yes"` | `DENY_MALFORMED_REQUEST` | fail-closed |
| Empty survivor set | all candidates excluded | `DENY_CONTRACT_INVALID` (schema `minItems`) | fail-closed |
| Missing required intent field | `session_id: undefined` | `DENY_CONTRACT_INVALID` | fail-closed |
| **`candidateSources: "not-an-array"`** (this review's own probe) | string instead of array | **uncaught `TypeError: pool.filter is not a function`** | crashes, does not silently succeed — see F-2 |
| **`candidateSources: [null]`** (this review's own probe) | a `null` array element | **uncaught `TypeError: Cannot read properties of null (reading 'projectId')`** | crashes, does not silently succeed — see F-2 |
| `candidateSources: ["str"]` / `[42]` / `[{ref:"x"}]` (this review's own probe) | non-object / incomplete-object elements | `DENY_CONTRACT_INVALID` (excluded by `runRetrieval`, empty survivor set trips the schema `minItems`) | fail-closed |

No path returns a permissive default or a document that looks issuable when the input was malformed. The two crash cases (bare non-array, `null` element) are **not silent** — they throw synchronously and produce no document, so nothing is minted and nothing downstream can be issued from them; this is fail-stop, not fail-open. But they are also not a **typed** deny (`ContextFederationError`/`DENY_*`), which is an error-handling parity gap, not a security gap — see F-2.

**Finding: no silent-fail-open. One robustness gap (crash instead of typed deny on a subset of malformed `candidateSources` shapes) — non-blocking, see F-2.**

## 4. Identity / provenance binding at mint time

`session_id`, `project_id`, `receipt_id`, `work_package_id`, `assigned_role` are all caller-supplied at mint time (from `input`), sealed into `content_hash`, and structurally required non-blank strings (schema `minLength: 1`) with a reserved-delimiter guard (`assertIdCharset`). Mint performs **no external identity check** on any of them — by design (Note N-1 in the first review, re-confirmed here): mint has no `workPackageService`, so it cannot and does not attempt to verify that a caller-asserted `session_id` genuinely belongs to the actor requesting the mint. A minted document is a candidate only; `issueReceipt` is the live gate.

Tracing this one step further than the first review did: at **issuance**, `issueReceipt` records `actorId` (a *separate* top-level field of the issue request) into the ledger and passes it to nothing that cross-checks it against `document.session_id`. At **consume/verify time**, `#resolveHead` only checks `head.sessionId !== sessionId` (string equality against whatever was baked in at mint/issue time) — there is no independent authority that authenticates a caller-supplied `sessionId` string against a real, currently-live session belonging to `actorId`. So in principle a caller who can call `mintReceiptDocument`/`issueReceipt` could bake in an arbitrary `session_id` string (e.g., one belonging to a different session) and any future `verifyReceipt`/`consumeReceipt` call presenting that same string would pass the session check.

This is **not a defect introduced by S1**: the exact same caller-supplied, unauthenticated `session_id` field already existed in `issueReceipt`'s pre-S1 inline code (a caller could hand-construct a document with any `session_id` string before mint existed) — S1 only extracted `assertIdCharset`/`sealBody` verbatim and added a construction convenience; it neither weakens nor strengthens this boundary. It reads as an accepted architectural boundary (session-identity authentication, if it exists, lives outside this service — e.g. at an agent-registration/session-issuance layer not exercised here) rather than a gap S1 created. Recorded as an observation, not a finding requiring a fast-follow on S1 itself; flagging for whichever module owns session-identity issuance to confirm the upstream binding exists.

**Finding: no NEW identity-binding gap attributable to S1.** The pre-existing session/actor decoupling is unchanged by mint and is out of MOD-CONTEXT S1's scope.

## 5. Downstream trust — does S2/S3 assume something about S1 that isn't true?

Checked what S2 (`exclusions_digest`) and S3 (lifecycle facets, shape crosswalk) each assume S1 guarantees:

- **S2's `exclusions_digest`** is `canonicalFingerprint(exclusions)` computed over the **same** `retrieval.exclusions` produced by the **same** mint call (line 145) — it is not a separately-supplied value S2 trusts from elsewhere; it is derived, in the same function invocation, from data S1's own `runRetrieval` produced. S2 does not assume mint guarantees anything beyond what mint actually does (produce a deterministic subtractive-exclusion list for this call). No unfounded trust.
- **S3's lifecycle facets** (`effective_status`, `expired`, `consumed`) are computed from the **service record** (`record.expiresAt`, `record.ledger`) populated by `issueReceipt`/`consumeReceipt`/`compactReceipt` — not from anything `mintReceiptDocument` returns. S3 makes no assumption about mint at all; it operates strictly downstream of issuance. No cross-slice trust gap here.
- **S3's shape-convergence crosswalk** documents `mintReceiptDocument({..., include_exclusions_digest: true})` (OP-4 note) as producing a **sibling**, not a sealed field — this is stated correctly and matches what S1's code actually does (`exclusions_digest` is returned alongside `document`/`exclusions`, never inside the sealed body, because the schema is a closed `additionalProperties:false` object). S3 does not claim more than S1 delivers.

**Finding: no cross-slice trust-assumption gap.** Neither S2 nor S3 assumes anything about S1's minting that isn't actually true at the S1 level.

## 6. Provider-identity-binding gap (S2) — connection to S1 checked, confirmed isolated

This session's S2/S3 review disclosed a provider-identity/`kind`-spoofing observation at the `candidate-source-port.mjs` boundary (a provider-declared `kind` — `memory`/`knowledge`/`document`/`evidence`/`operator` — is self-declared by whichever caller assembles the array, not independently attributed to a specific upstream provider; non-exploitable today because nothing aggregates multiple untrusted providers into one candidate pool). Checked whether this connects to S1's own minting logic:

- `mintReceiptDocument` calls `runRetrieval` directly on the raw `candidateSources` argument; it **never calls** `normalizeCandidateSources` (the S2 port). The port is optional/additive — "nothing existing calls this module" per its own header comment, confirmed by grep (no import of `candidate-source-port.mjs` from `context-federation-service.mjs`).
- `runRetrieval`'s seven-stage pipeline (`context-retrieval-policy.mjs`) never reads a `kind` field at all — its candidate shape is `{ref, projectId, classification, verified, current, resolvable, relevance}`. `kind` is purely an S2-port/provider concept that only matters once (if ever) an aggregator wires the port's normalized output into a shared pool.

**Finding: the provider-identity/`kind`-spoofing gap is genuinely isolated to the S2 port layer.** It has no analog in and no connection to S1's own minting logic, which doesn't consume the port or the `kind` concept at all.

---

## 7. Measured totals (first-hand, at `cc582e3`, isolated worktree)

- `npm ci` — clean install, no errors.
- `npm test` (full suite) → **1200 total / 1197 pass / 0 fail / 3 skipped**, exit 0.
- `node --test tests/context-receipt-mint.test.mjs` (module's own test file, run directly) → **10 / 10 pass / 0 fail**, exit 0 (MINT-01..MINT-10, all green).
- Hardcoded test-ID branching: grepped `src/` for `test-id`, `testId`, `TEST_ID`, `=== .test`, `NODE_ENV.*test`, case-insensitive — **no matches**. No test-only conditional branching found in production code.

---

## Findings by severity

**BLOCKER: none. HIGH: none. MEDIUM: none.**

- **F-1 (LOW, documentation/provenance gap — new in this review).** The first S1 review record (`mod-context-s1-rev-001.md`, `MOD-CONTEXT-S1-REV-001`, APPROVE_WITH_NOTES) that `mod-context-completion-rev-001.md` cites as "S1 previously reviewed … zero findings" **is not actually present on `main`**. Its commit (`40c461b`) and the follow-up tracker commit (`85febc0`) live only on `origin/claude/rev/mod-context-s1`, which was never merged; only `ebb543f` (the S1 code commit) made it into `main`'s ancestry. Confirmed via `git merge-base --is-ancestor` (code: yes; review doc: no) and `git ls-tree -r HEAD | grep mod-context-s1` (no match). Anyone auditing `main`'s `docs/03-project-control/candidates/` today can find the roll-up completion review's summary of S1 but not the underlying adversarial review record itself. Recommend the operator either fast-follow-merge the original `mod-context-s1-rev-001.md` record (as historical provenance) or note in the completion review that the citation is to an unmerged branch. Not a code defect; does not affect the correctness findings above, which were independently re-derived in this review regardless.
- **F-2 (LOW, robustness — new in this review).** `mintReceiptDocument` (and, by inspection, `issueReceipt` identically, since neither validates `candidateSources`'s shape before handing it to `runRetrieval`) throws an **uncaught, untyped `TypeError`** rather than a typed `DENY_MALFORMED_REQUEST` when `candidateSources` is a non-array value, or when an individual entry is `null`. Reproduced directly: `candidateSources: "not-an-array"` → `TypeError: pool.filter is not a function`; `candidateSources: [null]` → `TypeError: Cannot read properties of null (reading 'projectId')`. This is **fail-stop, not fail-open** — no document is minted, nothing is issuable from a crashed call — so it is not a security bypass. It is pre-existing behavior shared with `issueReceipt` (unchanged by the S1 diff), not something S1 introduced or worsened. Recommend a fast-follow: add a cheap `Array.isArray(candidateSources)` + `isPlainObject(entry)` guard at the top of `runRetrieval` (or require the S2 `normalizeCandidateSources` port for any externally-sourced candidate array) so malformed shapes produce a typed `DENY_MALFORMED_REQUEST` like every other input-validation path in this file, instead of an unhandled exception. Not a blocker for continued use of the merged S1 code.

---

## Advisory status fields

- truth_status: verified_true (full suite and module test file run first-hand at `cc582e3`; every claim in the first S1 review re-derived from source, not taken on trust; two new observations — F-1, F-2 — independently reproduced with direct probes not in either prior review's harness)
- authority_status: advisory_only (this is a non-blocking retrospective re-review; S1's code is already merged; F-1/F-2 fast-follows are execution_requires_operator like all code/doc changes in this repo)
- implementation_status: existing (mint, seal, and re-verification are live in `main`); candidate (the F-2 input-shape guard is a proposed fast-follow, not yet built); missing (the F-1 documentation gap has no remediation yet)
- risk_class: low (no exploitable defect found; F-1 is documentation-only; F-2 is a robustness/DX gap that fails stop, not open, and is pre-existing/shared with `issueReceipt` rather than S1-specific)

## Confidence

High. This review independently re-derived every claim in the first S1 review from source rather than trusting its account, ran the full suite and the module's own test file first-hand in a fresh isolated worktree, and went beyond the first review's adversarial harness with three new malformed-input probes (bare non-array `candidateSources`, a `null` array element, and non-object/incomplete elements) that surfaced F-2. The cryptographic/structural receipt-binding property (the core question this review was asked to re-verify) is not merely asserted by either review — it is directly exercised by the existing `MINT-07`/`MINT-08` tests (per-field tamper matrix, including resealed tamper against every downstream deny code) and was re-run first-hand as part of this review's measured totals.

## Authority boundary

This is an advisory retrospective review. It changes no production code, contract, schema, template, or effective operator receipt — it only adds this review record. No branch was pushed and nothing was merged; committed via an isolated detached-HEAD worktree and `git update-ref`, never touching any live branch. Operator ratification is required before F-1/F-2 fast-follows enter any build queue.

```yaml
self_certification:
  agent_id: claude-rev-sec-modcontext-s1-second
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

> Advisory review only. Recommend; do not authorize. Verdict APPROVE_WITH_NOTES
> is a recommendation, subject to operator ratification. F-1 and F-2 are
> informational/robustness notes, not blockers, and require no change to the
> merged S1 code before continued reliance on it. Operator holds all merge and
> follow-up-scheduling decisions.
