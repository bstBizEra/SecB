# Independent Review: MOD-CONTEXT S1 mintReceiptDocument (REV-001)

- review_id: MOD-CONTEXT-S1-REV-001
- status: CANDIDATE (advisory review; operator ratification required — no push, no merge)
- reviewer: claude-immune-rev-modcontext-s1 (BST-SA immune agent, independent identity)
- producer_reviewed: claude motor agent (`[MOD-CONTEXT-S1]`)
- target_branch: `bst/mod-context-s1-mint` @ `ebb543f52808d3df02f38e43701e3bb9f2cfb7d9`
- base: `main` @ `f04dee6cfafaae0213d92dc0da13300b14707f5e`
- review_branch: `claude/rev/mod-context-s1` (created FROM the target tip `ebb543f`)
- surface_under_review: `src/services/context-federation-service.mjs` (LIVE P0-10 R2 Context Receipt boundary — R2 gate waived 2026-07-19), new export `mintReceiptDocument`; new `tests/context-receipt-mint.test.mjs`; MANIFEST +1
- gap_context: MOD-CONTEXT gap assessment G1 (verifier-not-minter); S1 is R2-adjacent — the verdict question is behavior preservation of the live R2 issue/verify/consume/compact/revoke surface
- governance: BST-SA advisory contract (worker, not authority); operator-only merge
- date: 2026-07-20T00:00:00Z
- method: first-hand. Fresh worktree; `npm ci`; validator + full suite measured directly at `ebb543f`; every extracted function body compared byte-for-byte against the pre-S1 inline code at `f04dee6`; mint attacked with an independent adversarial harness (`adv_review.mjs`, run in-tree, deleted after) using fresh candidate pools — duplicates, prototype-key refs, cross-project, over-ceiling, empty-survivor, scope-widening. No producer fixture or measurement taken on trust.

---

## Verdict

**APPROVE_WITH_NOTES.**

The change is a behavior-preserving refactor plus a pure, fail-closed candidate
constructor. All three extractions (`sealBody`, `survivorSet`, `assertIdCharset`)
are **verbatim** moves of the pre-S1 inline code — every deny code, message, and
check order across `issueReceipt`, `verifyReceipt`, `consumeReceipt`,
`compactReceipt`, `revokeReceipt`, and `#resolveHead` is unchanged. The new
`mintReceiptDocument` creates a **candidate document only**: it runs the same
subtractive retrieval and computes the same canonical seal the service verifies,
touches no service state, does no I/O, deep-freezes its output, and adds no new
ALLOW. It cannot be coerced into over-claiming sources or widening scope. Every
producer claim (445/440/0-fail/5-skip, existing tests unmodified, byte-identical
seal) reproduced exactly. The notes below are informational (correct layering,
one pre-existing schema observation, one surface-area observation); none is a
blocker and none requires a change before merge.

---

## Scope 1 — Behavior preservation (verbatim extraction, hunk-by-hunk)

Diffed `f04dee6..ebb543f -- src/services/context-federation-service.mjs`. Only
three logic hunks plus the new mint block; no other line changed.

| # | Extraction | Old (f04dee6, inline) | New (ebb543f, module-level) | Result | Severity |
|---|---|---|---|---|---|
| B-1 | `sealBody(document)` | `#seal`: `const { content_hash, ...body } = document; return fingerprint(body);` | identical body, free function | **VERBATIM**. `#seal` used no `this` → move to module scope is semantics-preserving | PASS |
| B-2 | `survivorSet(includedRefs)` | issueReceipt inline `const surviving = [...new Set(retrieval.included)].sort();` | `(refs) => [...new Set(refs)].sort()`, called `survivorSet(retrieval.included)` | **VERBATIM** expression | PASS |
| B-3 | `assertIdCharset(document)` | issueReceipt inline loop over `["receipt_id","project_id","work_package_id","session_id"]`, `findReservedDelimiter`, `deny("DENY_ID_CHARSET", …)` | identical fields/guard/deny code+message | **VERBATIM** | PASS |
| B-4 | Call-site switches | `this.#seal(X)` at issueReceipt (L106), `#resolveHead` (L163), compactReceipt (L202); inline id-loop; inline surviving | `sealBody(X)`, `assertIdCharset(document)`, `survivorSet(retrieval.included)` | All argument-equivalent; no reorder | PASS |
| B-5 | Deny code/message/order across whole surface | `issueReceipt` / `verifyReceipt` / `consumeReceipt` / `compactReceipt` / `revokeReceipt` / `#resolveHead` / `getReceipt` / `#checkIdempotency` | unchanged | Every DENY_* code, message string, and evaluation order identical (diff touches only B-1..B-4 spots) | PASS |
| B-6 | Existing test file parity | `tests/context-federation.test.mjs` | — | `git diff f04dee6 ebb543f -- tests/context-federation.test.mjs` is **empty**; existing suite unmodified as claimed | PASS |

**Ruling: behavior-preserving. No deny path altered; the R2 surface is intact.**

## Scope 2 — Mint soundness (independent adversarial harness)

Fresh candidate pool distinct from the producer's fixtures: duplicate survivor
`a`, prototype-key ref `__proto__`, cross-project `leak`, over-ceiling
`RESTRICTED` `hot`. Outcomes reproduced first-hand:

| # | Attack | Input | Observed | Verdict | Severity |
|---|---|---|---|---|---|
| M-1 | Round-trip through the live gate | mint(adversarial pool) → issueReceipt → consumeReceipt | survivors `["__proto__","a","b"]`; issue `ISSUED`; consume `ALLOW` | Minted doc accepted verbatim | PASS |
| M-2 | Duplicate over-claim | two identical `a` candidates | `source_references` collapses to a single `a` (Set-dedup in `survivorSet`) | No duplicate over-claim | PASS |
| M-3 | Cross-project smuggling | `leak` @ projectId `OTHER` | excluded (stage project-scope); absent from `source_references` | Cannot smuggle foreign source | PASS |
| M-4 | Classification over-ceiling | `hot` @ `RESTRICTED`, ceiling INTERNAL | excluded (stage authority-filter) | Cannot exceed ceiling | PASS |
| M-5 | Direct source_references injection | mintInput with `source_references:[…,"hot"]` | `DENY_MALFORMED_REQUEST` (unknown key — `source_references` is not a MINT_KEY; mint derives it, caller cannot supply it) | **Over-claim structurally impossible** | PASS |
| M-6 | Empty survivor set | all candidates excluded | `DENY_CONTRACT_INVALID` (ContractValidationError, schema minItems) | Fail-closed, no empty-source receipt | PASS |
| M-7 | Scope widening at mint | `authority_scope:["src/services","secrets"]` | mint returns the doc (mint is NOT the scope gate); `issueReceipt` denies `DENY_SCOPE_WIDENING` | Gate holds at issuance — see Note N-1 | PASS |
| M-8 | Determinism / order-invariance | reversed candidate order | identical `content_hash` and identical `source_references` | Deterministic (stage-6 relevance sort is stable; survivor set sorted) | PASS |
| M-9 | Prototype-key ref survives | `__proto__` as a source ref | ends in `source_references` as a plain array element; `Object.prototype` unpolluted afterward | No prototype pollution | PASS |
| M-10 | Prototype-key identity field | `receipt_id:"__proto__"` | accepted (no reserved delimiter; schema permits) — see Note N-2 | Pre-existing schema behavior | INFO |
| M-11 | Seal parity | mint hash vs independent `canonicalFingerprint(body)` | equal | Mint seal == service seal (single source of truth) | PASS |

**Over-claim / scope-widening hunt: none reachable.** `source_references` is
server-derived (`survivorSet(retrieval.included)`); the caller has no channel to
set it (M-5), duplicates collapse (M-2), and out-of-scope/over-ceiling candidates
are removed by the shared `runRetrieval` (M-3/M-4). Empty result fails closed
(M-6). The minted document confers **no authority** — it is a candidate that
still traverses the full `issueReceipt` gate (M-1, M-7).

## Scope 3 — Purity (no state, no I/O)

| # | Check | Method | Result | Severity |
|---|---|---|---|---|
| P-1 | No service-state mutation | fresh service, 25 mints, then `consumeReceipt`/`getReceipt` for the minted id | `DENY_UNKNOWN_RECEIPT` on both — nothing was created | PASS |
| P-2 | Structural isolation | code read | `mintReceiptDocument` is a module-level function taking **no service instance**; it cannot reach `#receipts`/`#idempotency`/`#wp`. No `#`-field access exists in its body | PASS |
| P-3 | No I/O | code path read | Body calls only `runRetrieval` (pure), `structuredClone`, `sealBody`→`canonicalFingerprint` (pure), `validateContract` (pure), `assertIdCharset`, `deepFreeze`. No fs/net/clock/`this.#now`. `runRetrieval` itself reads no external state | PASS |
| P-4 | Immutable output | mutate returned doc | `source_references.push(...)` throws (deep-frozen); assignment to fields throws | Frozen — cannot be mutated to over-claim post-mint | PASS |
| P-5 | No caller aliasing | code read | `authority_scope`, `acceptance_criteria`, `allowed_tools`, `allowed_skills`, `evidence_obligations`, `exclusions` all `structuredClone`d before freeze — no shared reference to caller input | PASS |

**Ruling: pure and side-effect-free.** Minting produces a candidate value only.

## Scope 4 — Single-file export choice (import-cycle / surface — note only)

`mintReceiptDocument` is exported from `context-federation-service.mjs` alongside
the class. It imports **no new module** — only the four the file already imports
(`canonical-fingerprint`, `reserved-delimiters`, `contract-validator`,
`context-retrieval-policy`). **Import-cycle risk: none** — a module cannot form a
cycle with itself, and no new edge is added to the import graph.

Surface trade-off: co-location adds one pure, fail-closed, frozen-output function
to the module's public API. A separate module would have had to re-import
`runRetrieval` plus the three contract helpers **and** either export the
currently module-private helpers (`CLASS_ORDER`, `deny`, `deepFreeze`,
`MINT_KEYS`) — widening surface — or duplicate them, which reintroduces the exact
seal/logic drift S1 exists to eliminate. **Co-location is the lower-surface,
lower-drift choice here; no action recommended.** (INFO)

## Scope 5 — Measured totals (first-hand, at `ebb543f`)

- `node tools/validate-foundation.mjs` → **exit 0** (measured).
- `node --test tests/*.test.mjs` → **tests 445 / pass 440 / fail 0 / skipped 5** (measured; exit 0). Matches the producer claim exactly.
- New file `tests/context-receipt-mint.test.mjs` → **10 / 10 pass / 0 skip** (MINT-01..10). Base suite is 435/430/0/5; the delta is exactly +10 pass, so the 5 skips are pre-existing and unrelated.
- Change set (measured `git diff --name-status f04dee6 ebb543f`): `M src/services/context-federation-service.mjs`, `A tests/context-receipt-mint.test.mjs`, `M MANIFEST.json` (+1: the new test). No other file touched; `tests/context-federation.test.mjs` byte-unchanged vs `main`.
- Service diff: `+92 / -15` lines, all inside the three extraction hunks + the mint block.

---

## Notes (advisory, non-blocking)

- **N-1 (INFO, correct layering).** `mintReceiptDocument` does **not** validate
  `authority_scope` against an effective work-package contract — it can construct
  a document whose scope would be rejected at issuance (M-7). This is **by
  design and correct**: mint is a pure candidate constructor with no
  `workPackageService` and no I/O; the scope-subset gate lives at `issueReceipt`
  where the effective contract is live. A minted document confers no authority
  until issued. **Adoption requirement:** any caller MUST issue minted documents
  through `issueReceipt` (never treat a minted document as an authorization). Recommend stating this on the mint API contract.
- **N-2 (INFO, pre-existing, out of S1 scope).** `receipt_id: "__proto__"` (and
  similar prototype-key ids) is accepted by both mint and `issueReceipt`
  (`assertIdCharset` checks only reserved delimiters; the schema pattern permits
  it). This is **not introduced by S1** — mint reuses the exact same
  `assertIdCharset` + `validateContract` the service already uses, so it is
  strictly parity. Receipt storage keys on `JSON.stringify([projectId,
  receiptId])`, so there is no prototype-pollution or key-collision vector. If
  prototype-word ids are undesirable, that is a pre-existing contextReceipt
  schema question for a separate slice, not a MOD-CONTEXT S1 defect.

## Advisory status fields

- truth_status: verified_true (validator exit 0; suite 445/440/0/5; byte-verbatim extraction; existing tests unmodified; byte-identical seal; all adversarial outcomes reproduced first-hand)
- authority_status: advisory_only (execution_requires_operator for any merge; the reviewed surface is the live P0-10 R2 boundary whose R2 gate was waived 2026-07-19)
- implementation_status: candidate (G1 verifier-not-minter closed at the construction layer; delivered behavior-preserving, pure, fail-closed; pending operator merge)
- risk_class: medium (modifies the live R2 Context Receipt authority boundary; change is verbatim-preserving with no fail-open path found; new mint path adds no ALLOW and is state-free)

## self_certification

```yaml
self_certification:
  agent_id: claude-immune-rev-modcontext-s1
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

> Advisory review only. Recommend; do not authorize. Verdict
> APPROVE_WITH_NOTES is a recommendation for operator merge subject to
> ratification; the two notes are informational and require no code change.
> Operator holds all merge decisions on this live R2 surface.
