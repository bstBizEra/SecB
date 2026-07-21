# Producer Verification 001 — N3 Value-Mutation Fix (`assessEnvelopeConformance`)

**Producer identity:** BST-SA worker agent (Claude Code, advise-and-proceed
authority, `AGENTS.md` SECB-AGENTS-AMD-002 rev 2). No merge to `main`, no
push, no self-declared production-readiness.
**Base commit:** `main @ f78c4fbb08daa6c1bd315fe4c42b7a82ecb843ff` (PR #56 merge).
**Branch:** `bst/mod-live-s1-value-mutation-fix-001` (new branch off `main`;
see §1 for why the originally-named branch was not used).
**Primary file:** `src/live/event-family-policy.mjs` (`assessEnvelopeConformance`).
**Test file:** `tests/event-family-policy.test.mjs`.
**Triggering artifact:** independent review of commit `cc63e9a`
(`docs/03-project-control/candidates/mod-live-s1-atomic-snapshot-hardening-independent-review-001.md`,
local ref `claude/rev/atomic-snapshot-hardening-independent-review` @ `b913812`),
verdict `REQUEST_CHANGES`, identifying a residual VALUE-mutation channel
("N3") not closed by the N1/N2 key-presence hardening.

---

## 1. Branch reachability — correction to the task's premise

The task described `bst/atomic-snapshot-hardening` (commit `cc63e9a`) as "not
yet merged to main." That is **no longer accurate** at the time this work
was performed:

- `git merge-base --is-ancestor cc63e9a main` → **true**. `cc63e9a` is
  reachable from `main`'s history (`main @ f78c4fb`'s log for
  `src/live/event-family-policy.mjs` shows `cc63e9a -> 4445cc3 -> c81c08e`,
  in that order).
- The LOCAL branch ref literally named `bst/atomic-snapshot-hardening`
  (tip `3f9b892`) is a **different, earlier, superseded lineage** — the
  pre-fold "hardening branch" that commit `cc63e9a`'s own message says it was
  folded FROM ("Source: hardening branch 3f9b892"). It does **not** contain
  `cc63e9a` and is not the current frontier of this work.
- Conclusion: `main`'s current `event-family-policy.mjs` already carries the
  N1+N2 fix (verbatim `Reflect.ownKeys` structural snapshot, the exact code
  the independent review examined). There was nothing live to check out from
  the named branch; the real frontier is `main` itself.

Per the task's own fallback instruction, this fix was built as a **new
branch off `main`**: `bst/mod-live-s1-value-mutation-fix-001`, based at
`f78c4fbb08daa6c1bd315fe4c42b7a82ecb843ff` (the `main` tip at the time this
work started; `main` continued to advance in the background afterward via
unrelated concurrent workstreams — a moving ref, not a defect in this work).

## 2. Root cause (N3)

`assessEnvelopeConformance` decided key PRESENCE from one upfront
`Reflect.ownKeys(envelope)` structural snapshot (correct, and this is what
closes N1/N2). But each field's **value** was still read fresh,
one field at a time, in the fixed public order of
`DOCTRINE_CONFORMANCE_ELEMENTS` (`trace_id, span_id, sequence,
prior_event_hash, fact_classification, content_capture_level,
redaction_status, evidence_candidate`), with the finding decided immediately
on that read. An EARLIER field's getter — no Proxy required, a plain
accessor property suffices — could mutate a LATER, already-present-or-absent
sibling's stored VALUE before that sibling's own turn, fabricating or
suppressing its finding. Re-ordering the loop, or splitting "read all values"
from "decide" into two passes over the same live `envelope[key]` reads, does
**not** close this: whichever field is read last in any fixed sequence of
`[[Get]]` calls remains open to every earlier read's side effect, regardless
of which pass consumes the result (verified by direct trace-through of both
the original code and a naive "split loop" variant before settling on the
actual fix below).

## 3. The fix

Presence is **unchanged**: decided solely from the single upfront
`Reflect.ownKeys(envelope)` Set; nothing below can add to or remove from it.

Values are now captured in a genuinely decoupled two-phase read:

- **Phase 1 — descriptor snapshot.** For every doctrine field the
  `Reflect.ownKeys` Set says is present, capture its raw property
  **descriptor** (`Object.getOwnPropertyDescriptor`), not its value, before
  invoking any field's getter. For a plain (non-Proxy) object this executes
  **zero** user code — retrieving a descriptor never invokes an accessor's
  `get` function, it only returns a reference to it (or the already-resolved
  `.value` for a data property). Every sibling's descriptor is therefore an
  inert, detached snapshot object before any getter anywhere has run.
  If a field's descriptor comes back `undefined` despite `Reflect.ownKeys`
  having just confirmed it present, that is a structural inconsistency (see
  §6) and the whole assessment fails closed.
- **Phase 2 — value resolution + decision.** Each field's value is resolved
  strictly from its OWN captured descriptor (`.value` for a data property;
  a direct call to the captured `.get` reference — never `envelope[key]`
  again — for an accessor), and its finding decided immediately. Because
  every OTHER field's descriptor was already captured in Phase 1, invoking
  one field's getter here can mutate the live `envelope` all it wants; it
  cannot change what Phase 1 already captured for any sibling.

This is a genuine decoupling (Phase 1 completes, with zero code execution
for plain objects, before Phase 2 invokes anything), not a superficial
reordering — the distinction the task explicitly asked to avoid.

## 4. Independent reproduction of the reviewer's four PoCs (own harness, not copied assertions)

All four reproduced in `tests/event-family-policy.test.mjs` (section
"4a. N3 value-mutation regressions"), run against this fix, all green:

- **PoC A** (plain-getter suppression): `trace_id`'s getter forges
  `span_id = "FORGED-..."` before `span_id`'s own read. **Result: still
  correctly `MISSING_SPAN_ID`** — fixed (previously silently suppressed).
- **PoC B** (plain-getter fabrication): mirror of A, forges `span_id = null`
  when it was genuinely supplied. **Result: no spurious `MISSING_SPAN_ID`**
  — fixed (previously fabricated).
- **PoC C** (Proxy `get`-trap, honest `ownKeys`/`getOwnPropertyDescriptor`
  traps, isolating the `get`-trap vector exactly as the review did): same
  suppression construction via a trap instead of a plain getter. **Result:
  still correctly `MISSING_SPAN_ID`** — fixed.
- **PoC D** (control — plain getter, inject `span_id` + delete
  `evidence_candidate`): **Result:** injected `span_id` still correctly
  reports `MISSING_SPAN_ID` (N1 injection closure, unchanged) **and** the
  deleted-but-snapshot-present `evidence_candidate` now correctly does
  **NOT** report `MISSING_EVIDENCE_CANDIDATE_FLAG` — this is the specific
  N3 gap PoC D demonstrated on the prior revision, now closed.

A fifth "control" test confirms non-adversarial fully-conformant and minimal
envelopes are unaffected (same findings as before this fix).

## 5. N1 / N2 re-confirmed closed (own reproduction, not just re-running old tests)

- **N1** (plain getter injects/deletes a sibling KEY): re-verified via PoC D
  above and the pre-existing N1-era assertions in the doc-parity/behavior
  sections — all pass unchanged.
- **N2** (Proxy `getOwnPropertyDescriptor`-trap side effect during a
  per-field PRESENCE decision): key presence is still decided **exclusively**
  from the single, immutable `Reflect.ownKeys` Set; nothing a descriptor
  trap does — inject, delete, throw — can add to or remove from that Set.
  Re-verified with an updated "INJECT" regression test (descriptor trap
  injects `evidence_candidate` as a side effect; the injected key is still
  never looked up at all, because the `ownKeys` gate excludes it
  unconditionally) and a new boundary test for the DELETE case (see §6).

## 6. A new, honestly-scoped boundary this fix introduces — full disclosure

Closing N3 with descriptors necessarily means the code **now calls**
`Object.getOwnPropertyDescriptor` once per present doctrine field (bounded,
gated by the immutable `ownKeys` Set) — the prior revision's "zero
descriptor calls, ever" property no longer holds verbatim. This was
deliberately traded off: it is the mechanism that closes N3.

Consequence, found and closed while building this fix (not by the
reviewer): a **hostile `getOwnPropertyDescriptor` Proxy trap** could, as a
side effect of being invoked for one field, delete a **different,
not-yet-queried** sibling's underlying data on the target — before that
sibling's own descriptor call. Its own descriptor call then legitimately
returns `undefined`, even though `Reflect.ownKeys` had just confirmed it
present moments earlier. Silently treating that as "absent" would fabricate
a false `MISSING_*` finding for a field that genuinely was present — a real,
if narrower, cousin of N3, operating through the descriptor trap instead of
the `get` trap/getter channel, and not demonstrated by the independent
review (which deliberately used **honest** `getOwnPropertyDescriptor` traps
in PoC C to isolate the `get`-trap vector).

**Resolution:** this fix treats any `ownKeys`-vs-descriptor inconsistency as
proof the input is unstable under read and **denies the whole assessment**
(`DENY_EVENT_ENVELOPE_MALFORMED`) rather than fabricating a finding — the
same fail-closed posture this module already takes for every other hostile
signal. Verified with a dedicated test
("N2/N3 boundary: a getOwnPropertyDescriptor trap that DELETES a
not-yet-read sibling's data fails CLOSED"). No finding is ever fabricated by
this path; the cost is a denial instead of a (correct) finding for a
maximally adversarial input, which is an acceptable, disclosed, and narrow
trade given the module remains PURE + UNWIRED (no live blast radius today).

This boundary is not fully closed in the sense of "the correct findings are
always produced" for this one adversarial construction — it is closed in
the sense of "no wrong finding is ever silently fabricated." Flagging this
explicitly rather than presenting the fix as unconditionally complete.

## 7. Test counts

| | Module file alone (`node --test tests/event-family-policy.test.mjs`) | Full suite (`npm test`) |
|---|---|---|
| Before (`main @ f78c4fb`) | 29/29 pass | 1081 tests, 1076 pass, 0 fail, 5 skipped |
| After (this branch) | 34/34 pass (+5 new: PoC A, B, C, D, control) | 1086 tests, 1080 pass, **1 fail**, 5 skipped |

`npm run validate` passes cleanly on this branch (no FAIL entries; grep
hits on "fail" are unrelated filenames such as
`docs/12-execution/04-failure-to-capability-loop.md`).

## 8. Hardcoded test-ID branching

Grepped `src/live/event-family-policy.mjs` and
`tests/event-family-policy.test.mjs` for `test-id`, `testId`, `TEST_ID`,
`__test`, `NODE_ENV`, `process.env` (case-insensitive). **None found.**

## 9. The one new full-suite failure — disclosed, not silenced

`tests/replay-assembler.test.mjs`'s own byte-identity guard
("byte-identity: every pre-existing file read for this slice is unchanged
vs main @ c52db71") pins `src/live/event-family-policy.mjs` to a blob hash
from when the MOD-LIVE-S3 replay-assembler slice was authored. This fix
**intentionally modifies that file**, so the pin now legitimately fails:

```
src/live/event-family-policy.mjs blob-identical to main @ c52db71
+ actual:   47ebc9bb7e5190c6f0f78232884379b3c284248d
- expected: 75b30a38fc1b4948f9ce586b4b3a7b3e0168ec38
```

This is confirmed to be a **real trip for a real reason** — not the
historical-commit-vs-moving-`main`-ref false positive the independent
review already explained for `tools/validate-foundation.mjs` on a different
guard. It is a direct, correct consequence of this fix changing a file that
another slice's byte-identity guard pins as a read-but-not-modified
dependency. Repinning `replay-assembler.test.mjs`'s guard is **out of scope
for this fix** (it belongs to the MOD-LIVE-S3 slice's own governance, not
this one) and has been left untouched; whoever integrates this branch with
`replay-assembler`'s lineage will need to repin that one hash. No other
pinned-blob guard (in `event-family-policy.test.mjs` itself, pinned to
`main @ 280d32c`) was tripped.

## 10. What was not fully verified

- The descriptor-trap "delete a not-yet-queried sibling" boundary (§6) is
  verified only for the specific construction demonstrated in this fix's own
  test; a fully exhaustive search of every conceivable multi-trap
  combination (`ownKeys` + `getOwnPropertyDescriptor` + `get` all hostile
  simultaneously, with shared mutable closure state across getters rather
  than direct object-field reassignment) was not attempted and is disclosed
  as out of scope — reasoned to be a fundamentally different, likely
  unfixable-in-general class (no JS primitive reads N properties from a
  fully hostile object atomically), rather than a gap in this specific fix.
- `npm run validate`'s docs-link and manifest checks were run and pass; the
  new record file was registered in `MANIFEST.json` following the existing
  convention (matching how `cc63e9a` registered
  `atomic-snapshot-hardening-001.md`). It was not added to `docs/MANIFEST.json`
  (a separate, smaller, curated bootstrap-docs manifest) because none of the
  sibling `candidates/*-rev-*.md` records are listed there either.
- This record is advisory/producer verification only. It does not authorize
  merge to `main`, does not declare production-readiness, and does not
  self-certify execution authority — operator/governance review remains
  required before any merge or fold.

```yaml
self_certification:
  agent_id: claude-producer-secb-mod-live-s1-value-mutation-fix-001
  peer_agent_id: claude-rev-sec-atomic-snapshot-01
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```
