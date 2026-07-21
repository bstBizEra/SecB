# MOD-LIVE S1 — Independent Review: Event-family classifier + envelope-doctrine conformance evaluator

**Record ID:** mod-live-s1-event-family-rev-001
**Status:** DRAFT / ADVISORY — NOT EFFECTIVE
**Reviewer:** claude-immune-rev-live-s1-01 (BST-SA immune, independent review gate)
**Date:** 2026-07-21
**Review target:** branch `bst/mod-live-s1-event-family` @ `c81c08e5b1b3f2fc1cd2b9c54ec7e8a480ebe7ab`
**Base:** unified `main` @ `280d32c5b0c2067ae55907cb3ff580aad5688a76` (current `main` @ `6a928a17a9ddfca23f66630a0e7c4627d57c7b6c`)
**Authoritative spec:** `docs/03-project-control/candidates/mod-live-gap-assessment-001.md` (`bst/mod-live-assessment`) — Slice S1, gap G1, boundaries B1–B7, non-goals §5.
**Producer record under review:** `[MOD-LIVE-S1] Event-family classifier + envelope-doctrine conformance evaluator, PURE + UNWIRED (candidate)`
**Method:** all findings read first-hand from source/tests/doctrine at the cited commits; blob hashes, NUL scan, test totals, validator exit, and merge trial reproduced independently in an isolated worktree; adversarial probes executed against the committed module via throwaway scripts (deleted after use).

---

## Verdict: APPROVE_FOR_MERGE

Slice S1 is a pure, unwired, deny-by-default policy evaluator that faithfully codifies SECB-LIVE-EVENT-001 doctrine, honours every boundary the assessment set (B3, B6; non-goals §5 #4/#5/#7), and introduces no authority, I/O, schema, or wiring surface. All scope, doc-parity, classifier-semantics, adversarial, and regression checks pass independently. No high- or medium-severity findings. Two low/informational notes below, neither blocking.

---

## Findings by severity

**CRITICAL:** none.
**HIGH:** none.
**MEDIUM:** none.

**LOW**
- **L1 — Doc-parity test title over-states coverage direction.** `tests/event-family-policy.test.mjs` test `"doc-parity: assessed elements are exactly the doctrine elements ABSENT from the minimal live schema"` asserts only the subset direction (every assessed element is absent from the live schema); it does not assert the reverse (that every doctrine-absent element is assessed). The word "exactly" implies a bijection the test does not enforce. Behaviour is correct and honest — `DOCTRINE_CONFORMANCE_ELEMENTS` is the documented G1 representative subset (8 elements) the assessment enumerates with "e.g." — but the title could mislead a casual reader. Cosmetic; no code change required for merge.

**INFORMATIONAL**
- **I1 — Conformance assessor covers a documented subset, not the full doctrine-absent set.** The SECB-LIVE-EVENT-001 "Requirements" list names further elements absent from the minimal schema (host/process identity, runtime version, normalized-payload + provider-native reference, several session/deployment IDs, signature reference) that the assessor does not surface. This matches G1's explicitly non-exhaustive "e.g." enumeration and the module's own docstring ("restricted to the elements the minimal live schema does NOT carry — the … subset gap the assessment names in G1"). No completeness claim is made in code or tests, so this is honest scoping, not a defect. A later slice may widen the finding set.
- **I2 — Whitespace-padded event types fail closed as UNKNOWN family, not as MALFORMED.** `" session.start "` yields `DENY_EVENT_FAMILY_UNKNOWN` (family parsed as `" session"`) rather than a malformed denial, because the classifier trims only for the blank-check and splits the raw string. This is fail-closed and safe (deny-by-default; never mapped onto a real family) and consistent with the deny-by-default contract; noted only for completeness.

---

## Verification detail

### 1. Scope / byte-identity / schema (B6)
- **3 files only.** `git diff --stat 280d32c c81c08e` = `MANIFEST.json` (+2 lines), `src/live/event-family-policy.mjs` (263 LOC, new), `tests/event-family-policy.test.mjs` (471 LOC, new). No other file touched. **PASS.**
- **Unwired / zero importers.** `git grep event-family-policy` at `c81c08e` returns only the module's own header comment and its test's import. No `src/**` or `tools/**` importer of `src/live`. **PASS.**
- **Byte-identity vs base (independent, git-native blob hashes).** All seven pre-existing files the producer pinned are blob-identical between `280d32c` and `c81c08e`, and the pinned hashes in the test match git's own values (git stores LF-normalized blobs; the test's CRLF→LF normalization correctly replicates `git hash-object` on this Windows checkout). Confirmed: `event-envelope.md` `27269ad…`, `event-envelope.schema.json` `b33ebcb…`, `retry-policy.mjs` `3f7f413…`, `risk-registry.mjs` `b8ee7f9…`, `risk-registry.test.mjs` `1ea047a…`, `validate-foundation.mjs` `082638c…`, `package.json` `6f91499…`. **PASS.**
- **Schema untouched (B6).** `contracts/event-envelope.schema.json` blob unchanged base→target; `additionalProperties:false` intact; `required` still exactly the 13 fields. **PASS.**

### 2. Doc-parity honesty
- **19 families 1:1 ordered.** The doctrine fenced `session.* … incident.*` list and `EVENT_FAMILIES` match exactly, in order, 19 entries. **PASS.**
- **Parity test parses the LIVE doc, not an embedded copy.** The fixture reads `docs/05-live-operations/event-envelope.md` from disk at runtime via `readRepoFile`/`fileURLToPath`, then regex-extracts the fenced block. Drift genuinely fails the suite. **PASS.**
- **Conformance phrases verbatim.** All 8 `DOCTRINE_CONFORMANCE_ELEMENTS[].doctrine` strings are present verbatim in the doc's "Requirements" section, and the parity test asserts each. **PASS** (see L1/I1 for the coverage-direction nuance).

### 3. Classifier / assessor semantics (deny-by-default)
Independent probes:
- Unmapped prefixes `metrics.emit`, `deploy.start` → `DENY_EVENT_FAMILY_UNKNOWN` (never guessed). **PASS.**
- Case variants `Session.start`, `SESSION.START` → `DENY_EVENT_FAMILY_UNKNOWN` (case-sensitive; doctrine families are lowercase). **PASS.**
- Dotless `session` → `DENY_EVENT_TYPE_MALFORMED`. **PASS.**
- Multi-dot `session.sub.start` → `{ok:true, family:"session"}` (first prefix only; matches doc/test). **PASS.**
- Unicode confusable `ѕession.x` (Cyrillic ѕ) → `DENY_EVENT_FAMILY_UNKNOWN` (not conflated with `session`; no normalization trickery). **PASS.**
- Whitespace padding → `DENY_EVENT_FAMILY_UNKNOWN` (fail-closed; see I2). **PASS.**
- Assessor presence rule: `null`-valued → absent; prototype-inherited → absent (own-property only); falsy-but-present (`sequence:0`, `evidence_candidate:false`) → present. **PASS.**

### 4. Adversarial (throwaway probes)
- Throwing getter on `eventType` → `DENY_EVENT_TYPE_MALFORMED`; throwing getter on assessed field → `DENY_EVENT_ENVELOPE_MALFORMED`; neither throws. **PASS.**
- Proxy `get`/`getOwnPropertyDescriptor` traps that throw → structured malformed denial. **PASS.**
- Invocation-count: `eventType` getter and each assessed-field getter invoked exactly once (single contained read; no guard/body double-read). **PASS.**
- Frozen output: positive/denial results and `findings` array deep-frozen; mutation/push throws `TypeError`; input event never mutated. **PASS.**
- Prototype-pollution: `__proto__` supplied via `JSON.parse` becomes an own `eventType` and classifies normally; `Object.prototype` remains unpolluted. **PASS.**
- **NUL-byte scan of committed sources:** `src/live/event-family-policy.mjs` = 0 NULs, `tests/event-family-policy.test.mjs` = 0 NULs. Producer's disclosed authoring slip left no residual NUL byte. **PASS.**

### 5. Regression
- **Full `npm test` (target tree @ c81c08e):** tests 760 / pass 755 / fail 0 / skipped 5. **Exact match to expectation.** (Isolated S1 suite: 26/26.)
- **`node tools/validate-foundation.mjs`:** `status: PASS`, exit **0**.
- **Merge-cleanliness vs current `main` 6a928a1 (scratch merge, aborted):** clean auto-merge, **0 conflicted files** — `MANIFEST.json` auto-merged. The anticipated MANIFEST tail conflict did **not** materialize; result is cleaner than expected.

---

## Advisory status fields

```yaml
truth_status: verified_true            # every claim reproduced first-hand at c81c08e / 280d32c / 6a928a1
authority_status: advisory_only
implementation_status: existing        # S1 code exists on the target branch as reviewed
risk_class: low                        # pure, unwired, additive; no authority/I/O/schema surface
self_certification:
  agent_id: claude-immune-rev-live-s1-01
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

> Independent review verdict is advisory. This record recommends merge; it does not merge, push, or authorize activation. Operator-only merge stands. Wiring/adoption of the S1 primitive remains later, separately-governed work (assessment §5 #5).
