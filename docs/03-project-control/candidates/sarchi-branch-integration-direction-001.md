# SARCHI decision — reverse the integration direction for this branch

**Document ID:** `SECB-SARCHI-BRANCH-INTEGRATION-001`
**Status:** `DECIDED — architecture call, within SARCHI's remit. Authorizes no work and signs nothing.`
**Decided by:** Claude Code acting as SARCHI, 2026-08-03, at operator request
**Baseline:** `e163374`; `origin/main` at `8be8c99`
**Effect on the queue:** withdraws `WP-GOV-VF2` as unnecessary. Removes one item; adds none.

## The decision

**Stop merging `origin/main` into `feat/secb-ruflo-command-center`. Extract the
branch's work as narrow pull requests against `main` instead.**

## What made the merge expensive

The merge is resolved and works — `b1a85c6`, validate exit 0, 1822 of 1844 tests
passing. The 17 failures are byte-identity guards, and they are correct: merging
changes five files that main pins byte-for-byte.

It has to. Merging two contract registries edits the registry; merging two schema
allowlists edits the validator. No resolution avoids it.

So the merge requires one authorization covering five guarded files at once, which
is what `WP-GOV-VF2` requests.

## What makes extraction cheap

**The branch's own work touches none of those five files.**

| Component | Files | Guarded files touched |
|---|---|---|
| Skill audit (`src/audit/**`, `tools/secb-skill-audit*`, `tests/skill-audit*`) | 14 | **0** |
| CodeGraph (`tools/secb-graph.mjs`, `build-graphify-data.mjs`, `src/plugins/`) | 9 | **0** |
| Memory consolidation (`src/memory/`) | 1 | **0** |
| Dashboard | 19 | **0** |

Every one of those files is NEW. They are not pinned because they did not exist
when the guards were written. The five guarded files change only when main's
edits and ours meet in the same file — which happens on merge, and not on
extraction.

**The pattern is already proven.** PR #136 extracted one narrow change against
main, is `MERGEABLE` and `CLEAN`, and needed exactly one authorization scoped to
one file.

## Verified, not assumed

The audit was copied onto a clean checkout of `origin/main` and run:

```
validate                exit 0
secb-skill-audit        exit 0
22 packages, 22 governed, 0 without a manifest, 132 files
VIOLATION 68 · NO_EVIDENCE 48 · UNDECIDABLE 177
```

It runs unchanged and produces real findings against main's corpus on the first
attempt.

## What extraction costs, stated plainly

It is not free, and both costs surfaced in the same test run.

**The tests pin this branch's corpus.** They assert 25 packages, 22 governed and
3 ungoverned; main has 22 / 22 / 0, because `graphify`, `worktree` and
`secb-project-registry` exist only here. Every ground-truth assertion needs
re-deriving against whichever corpus the audit is pointed at. That is
straightforward but it is real work, and it must not be done by loosening the
assertions.

**The calibration is corpus-specific, and it said so immediately.** On main's
corpus the first run reported:

```
drop-identity-field | detection | governance.identity-fields | 1 | 0 | 0%
STRIKE from claimed coverage: governance.identity-fields
```

A class that scores 100% here scores 0% there. That is the calibration gate doing
exactly what it exists for, on the first corpus it had not been tuned against —
and it is a genuine limitation of the audit rather than a porting artefact. It
must be understood before the audit is claimed to cover anything on main.

## Consequences

- **`WP-GOV-VF2` is withdrawn.** It authorizes guard re-pinning for a merge that
  should not happen. If a merge is later wanted for another reason, it can be
  re-raised on that reason.
- **`b1a85c6` is retained**, not deleted. It is the record that the merge is
  possible and what it costs, which is why the alternative can be chosen
  knowingly.
- **The branch stops being a thing to land** and becomes a place work is
  extracted from. Nothing forces it to converge with main.
- **Extraction order follows dependency, not value.** The audit first: it is
  self-contained, verified running on main, and has a proven PR pattern ahead of
  it. CodeGraph second — it depends on `graphify`, whose capability record is
  complete but unaccepted. Memory and dashboard after.

## What this decision does NOT do

- It authorizes no work. Each extraction is a separate PR needing its own review,
  by someone who is not its producer.
- It does not resolve the three items still in the operator's queue. It removes a
  fourth that should not have been there.
- It does not claim the audit is ready for main. Its tests fail there today and
  its calibration reports an uncovered class. Extracting it means fixing both
  honestly, not shipping around them.
- It expresses no view on `WP-SK-R2`'s authorization gap, `WP-MEM-J1`, or the
  `graphify` capability record. Those are GOV decisions and remain open.

## Authority

SARCHI is a worker role. This is an architecture call about integration
direction, which is within it. It is recorded rather than merely acted on so a
reviewer can disagree with the direction rather than only with its consequences.

The producer of the work being extracted is the same agent making this call. That
does not make the call invalid — choosing an integration route is not accepting
evidence — but it is why every extraction still requires an independent reviewer,
and why this record cannot be read as clearing any of it.
