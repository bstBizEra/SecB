# MOD-KNOW Slice S1 — Independent Immune Review (mod-know-s1-rev-001)

- reviewer_identity: `claude-immune-rev-modknow-s1`
- review_role: BST-SA Immune (adversarial verification, advisory-only)
- target_branch: `bst/mod-know-s1-claims`
- target_commit: `8b550c8` ([MOD-KNOW-S1] Knowledge claim lifecycle facade (unwired, wrap-not-modify))
- base: `main` @ `c8c67d2` (target parent == base, single-commit lineage)
- assessment_source: `docs/03-project-control/candidates/mod-know-gap-assessment-001.md` (`bst/mod-know-assessment` @ 3ddfe41) — gaps G1 (no claim lifecycle service wrapping the KnowledgeLedger admission primitive), G2 (no admission SoD on the knowledge path); R3+ hard line: learning boundary untouchable
- verification_method: first-hand. `npm ci` (6 pkgs), full suite `node --test tests/*.test.mjs`, validator `node tools/validate-foundation.mjs`, independent git-blob-SHA byte-identity checks, and an independent adversarial harness run outside the producer's test doubles (7 ledger-denial-class diffs vs direct ledger invocation, port over-trust, SoD prototype/casing, clock-trust probes).
- review_date: 2026-07-20T10:11:15Z

## Verdict

**APPROVE_FOR_OPERATOR_MERGE**

No findings at or above INFO severity that block merge. Two INFORMATIONAL observations recorded for operator awareness; neither is a defect nor a gate weakening. This is advisory only — Immune does not authorize the merge; the operator does.

## Measured totals (charge item 6)

- Full suite: `tests 559 / pass 554 / fail 0 / skipped 5 / todo 0`. **Matches producer claim (559/554/0-fail/5-skip) exactly.**
- New file `tests/knowledge-claim-service.test.mjs` in isolation: `23 pass / 0 fail / 0 skip`. Matches "tests (23)" claim. The 5 skips are pre-existing elsewhere in the suite, not in the new file.
- Validator `node tools/validate-foundation.mjs`: exit `0` (all checks PASS, including `manifest.file.*` existence for the two added source paths).

## Scope verification (charge item 1)

- Diff `c8c67d2..8b550c8` = **exactly 3 files**: `MANIFEST.json` (+2 entries, -1 line reflow), new `src/services/knowledge-claim-service.mjs` (324 lines), new `tests/knowledge-claim-service.test.mjs` (472 lines). No other artifacts, no stray files, no reverts, no relocation.
- Single commit; `8b550c8^ == c8c67d2` (== base). Clean lineage.
- **Byte-identity, verified independently of the producer's in-suite GUARD test** via git blob SHA at both base and target:
  - `src/ledger/temporal-ledgers.mjs`: `c1e6579b3879cb9abe2a2fd7d50a53cb220d24fe` at base == target. IDENTICAL — KnowledgeLedger, its learning boundary (`ACCEPTED_EVIDENCE_STATUSES` = VERIFIED/ACCEPTED), `appendClaim`, `resolveClaim`, and `assertWindow` untouched.
  - `src/control/sod-rules.mjs`: `4ffbc2019aae88178ecf0e5e6d2aa6b1e4aa9530` at base == target. IDENTICAL — `checkPairwiseDistinct` and all kernel SoD primitives untouched.
  - This blob-SHA cross-check is the authoritative confirmation of the R3+ hard line; the producer's own GUARD test (`git show main:<path>`, LF-normalized) is corroborating and non-circular in this repo state.

## Passthrough integrity — the verdict question (charge item 2)

I read every catch/branch in the facade and then empirically drove each ledger-denial class **through the facade against the REAL KnowledgeLedger** and diffed the surfaced `code`+`message` against a **direct** `ledger.appendClaim()` invocation on a fresh ledger. To force the facade to reach the ledger (i.e. NOT let the facade's stage-4 evidence port pre-empt), the harness injected a deliberately permissive port returning `{ ok: true, envelope: <garbage> }` for every ref.

Result — **ALL VERBATIM** (facade code+message byte-identical to the ledger's own `LedgerError`; the facade adds only an *additive* `source: "knowledge-ledger"` marker, changing nothing about code or reason):

| Ledger denial class | facade surfaced | == direct ledger |
|---|---|---|
| `DENY_EVIDENCE_CHAIN` (status not VERIFIED/ACCEPTED) | `...not verified/accepted: ev_cap (CAPTURED)` | VERBATIM |
| `DENY_EVIDENCE_CHAIN` (identity mismatch) | `...mismatched envelope for: ev_mis` | VERBATIM |
| `DENY_EVIDENCE_CHAIN` (no-resolve at ledger lookup) | `...does not resolve: ev_ghost` | VERBATIM |
| `DENY_INVALID_TEMPORAL_WINDOW` | `...valid_from earlier than valid_until` | VERBATIM |
| `DENY_SEQUENCE_CONFLICT` | `Expected sequence 0, observed 1` | VERBATIM |
| `DENY_DUPLICATE_ENTRY_ID` | `Duplicate entry ID: kc1` | VERBATIM |
| `DENY_IDEMPOTENCY_CONFLICT` | `Idempotency key was reused...` | VERBATIM |

Mechanism confirmed by code + the DurableLedger contract (`src/ledger/durable-ledger.mjs`): every ledger denial is a `LedgerError` carrying a non-empty `.code`; `append()` **always throws** on denial and only *returns* a record on success (or a `{replayed:true}` object on benign idempotent replay). The facade's stage-7 catch (`knowledge-claim-service.mjs:234-239`) re-surfaces `error.code`/`error.message` verbatim whenever `.code` is a non-empty string, and falls back to `DENY_LEDGER_UNAVAILABLE` **only** for code-less throws — i.e. genuine crashes (verified: a `throw new Error("disk full")` ledger → `DENY_LEDGER_UNAVAILABLE`), never a ledger denial. **No path pre-empts, re-codes, softens, or swallows a ledger denial.**

- No softening to ALLOW is structurally possible: the sole `decision: "ALLOW"` return (`:241`) is guarded behind a non-throwing `appendClaim`; any ledger throw routes to `deny(...)`.
- The claim is passed as `structuredClone(request.claim)` with the **same** `expectedSequence` and `idempotencyKey` — no field mutation, so the ledger evaluates exactly the caller's claim.
- Stage-3 contract pre-validation uses the SAME `validateContract("knowledgeClaim", ...)` the ledger runs as its first line, so a contract-invalid claim is denied earlier with the identical validator code (`DENY_CONTRACT_INVALID` fallback, or the validator's own code). This is a benign double-gate producing an identical outcome — not a softening. Window-invalid claims (schema-valid, `valid_from >= valid_until`) correctly slip past stage-3 and are denied by the ledger's own `assertWindow` at stage-7, surfaced verbatim (confirmed).

## Evidence-port honesty (charge item 3)

- **Port deny → `DENY_EVIDENCE_UNRESOLVED` with the port's own denial preserved.** The facade's own stricter front gate (resolvability) is honestly coded as the facade's code, and the port's `{code, reason}` is preserved verbatim under a frozen `port_denial` detail (`:178-184`). It never masquerades as a ledger passthrough. This is an *additive* deny gate on top of the ledger, never a subtractive one — it can only make admission stricter, never weaker.
- **Port over-trust cannot bypass the learning boundary — verified empirically.** With a port returning `{ ok:true, envelope:{ evidence_id:"GARBAGE-…", junk:true } }` for every ref, all three ledger `DENY_EVIDENCE_CHAIN` classes (CAPTURED status, identity mismatch, no-resolve) **still DENY**, because the facade never forwards the port's envelope to the ledger — the ledger re-checks with its *own* injected `evidenceLookup` (`temporal-ledgers.mjs:120-133`). The port envelope is inspected only for `ok===true && isPlainObject(envelope)` and then discarded. Over-trusting the port is therefore harmless: the ledger is the authoritative learning-boundary gate and the facade layers a second gate in front, exactly as claimed.

## SoD — admission separation of duties (charge item 4)

- **proposer == approver → `DENY_ADMISSION_SOD`**, no audit, no append (producer test + inspection). Confirmed.
- All non-distinct pairings denied: proposer==approver; reviewer==proposer; reviewer==approver (producer test, 3 scenarios). Reviewer is optional and only enters the distinctness set when present and non-blank (`:194-196`).
- **Config-only kernel reuse**: the facade calls `sodRules.checkPairwiseDistinct(actors, { code: "DENY_ADMISSION_SOD" })` supplying only the actor set + deny code; `sod-rules.mjs` is byte-identical to main (above). No wrapper behavior added.
- **Prototype-key tricks resisted**: proposer==approver=="__proto__" → `DENY_ADMISSION_SOD`; =="constructor" → `DENY_ADMISSION_SOD`. The kernel primitive keys a `Map` by actorId string, which is immune to prototype pollution (Map does not consult the object prototype chain). [harness]
- **Casing** — see INFO-1: `agent-a` vs `Agent-A` are treated as distinct (exact-string). Defensible for canonical actor IDs; noted, not a defect.

## Audit-first, clock trust, frozen outputs, unwired (charge item 5)

- **Audit-first**: `auditWriter` is invoked strictly before the delegated `appendClaim` (producer order-capture test asserts `["audit","append"]`). A throwing audit writer → `DENY_AUDIT_UNAVAILABLE` with **zero ledger rows** (no un-audited append). Note: on a ledger-side denial after a successful audit (e.g. evidence-chain), the admission *attempt* is audited but the claim is not admitted — this is audit-first by design (records the attempt), not a leak.
- **Clock trust (no caller timestamps)**: the enforcement instant is server-derived only. `proposed_at` is stamped from the injected `now()` via `Date.prototype.getTime.call(now())` (`:106-114`, `:216`); `resolveClaim` receives `{ at: instant.iso }` from the same clock, never a caller value. `getClaim`/`listClaims` are closed envelopes (`GET_KEYS`=[claim_id], `LIST_KEYS`=[project_id]); a caller-supplied `at` → `DENY_MALFORMED_REQUEST` (verified). A NaN/throwing clock → `DENY_CLOCK_UNAVAILABLE` on all three entry points. A caller cannot inject an enforcement instant.
- **Frozen outputs**: all ALLOW/DENY results are `deepFreeze`d; `getClaim`/`listClaims` mark every returned claim `data_untrusted: true` and `structuredClone` the payload (read-only; no mutation, no pruning). Producer tests assert deep-freeze on results, claim, and the claims array.
- **Resolution passthrough**: `resolveClaim` returns objects (not throws) for denials; `getClaim` surfaces `DENY_UNKNOWN_CLAIM` / `DENY_TEMPORAL_BOUNDARY` verbatim (code+reason) with the additive `source` marker (harness diff: VERBATIM). `DENY_INVALID_INSTANT` is unreachable by a caller (facade owns the instant).
- **Unwired (no importer)**: grep across `src/` and `tools/` finds no importer of `knowledge-claim-service` other than its own test; not referenced in `src/index.mjs`. The `knowledgeClaim` contract is the pre-existing registered schema (`contract-validator.mjs:16`) — no schema fork, no extension.

## Findings

| id | severity | finding | disposition |
|---|---|---|---|
| INFO-1 | informational | SoD actor comparison is exact-string; `agent-a` vs `Agent-A` count as distinct actors. | Not a defect. Actor IDs are canonical identifiers; case-folding would be a kernel-behavior change (out of S1 scope, would violate the R3+ byte-identity line). Operator awareness only. |
| INFO-2 | informational | On a ledger-side denial that occurs after stage-6, the admission audit entry is already written (audit-first), so an audited-but-not-admitted attempt is recorded. | Intended audit-first semantics; the audit records the *attempt*, the ledger row is absent. No append occurs. No action. |

No LOW/MEDIUM/HIGH/CRITICAL findings.

## Adversarial outcomes summary

- 7/7 ledger-denial classes: verbatim passthrough vs direct ledger invocation.
- Port over-trust (garbage envelope, ok:true): learning boundary held — ledger re-check denied all 3 evidence-chain classes.
- SoD prototype-key (`__proto__`, `constructor`) self-approval: denied.
- Clock injection via `getClaim({at})`: rejected (`DENY_MALFORMED_REQUEST`).
- Code-less ledger throw: `DENY_LEDGER_UNAVAILABLE` (correct fallback, distinct from any real denial code).
- Byte-identity of kernel+ledger: confirmed by independent blob SHA.

## Advisory fields

- truth_status: verified_true
- authority_status: advisory_only
- implementation_status: candidate
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
