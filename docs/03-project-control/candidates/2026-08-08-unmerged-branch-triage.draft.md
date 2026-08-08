# Unmerged Branch Triage

## Document Control

| Field | Value |
|---|---|
| Artifact ID | SECB-ADV-BRANCH-TRIAGE-001 |
| Version | 1.0.0-draft |
| Status | DRAFT / NOT EFFECTIVE — advisory only |
| Date | 2026-08-08 |
| Author | Claude (Motor Agent), read-only survey against `main` @ `3b14f8f` |

Nothing was merged, deleted or modified to produce this. Every number below is a
measurement, including the merge costs, which come from `git merge-tree` trials
that never touched the working tree.

---

## 1. The split that matters is not fresh-versus-stale

140 branches are unmerged. Sorted by age they look like a backlog. Sorted by what
they carry they are two different problems:

| | Branches | Avg files |
|---|---|---|
| **Records only** — verdicts, reviews, assessments, trackers | **61** | 3.2 |
| **Code** — `src/`, `tests/`, `tools/`, `contracts/` | 79 | 18.7 |

Ancestry collapses 140 to **98 independent tips** (38 carrying code, 60 records
only). The collapse is concentrated: the three `codex/wp-mem-*` tips absorb 48
branches between them. Outside that cluster the branches are genuinely
independent, so there is no second wp-mem-style reduction waiting to be found.

---

## 2. The records-only branches are a live governance risk, not backlog

Earlier today an amendment was authored numbered `SECB-AGENTS-AMD-003`, merged,
and pushed as effective. That number was already held by a delegated-merge
policy candidate which had passed REV, QA and SEC and was awaiting only human
GOV. The collision was possible for exactly one reason: **the incumbent's review
records lived on unmerged branches, so `main` did not know the number was
taken.**

61 branches currently hold governance evidence outside `main`. Every one of them
is a fact about review state that is invisible to anyone reasoning from the
mainline — which is where every agent and every gate reasons from. The AMD-003
collision is what that costs, once. It is not a one-off shape.

---

## 3. What a records sweep would cost, measured

Of the 61, **54** touch only `docs/03-project-control/candidates/` plus the two
manifests. Trial-merging each into `main` @ `3b14f8f`:

| Outcome | Count |
|---|---|
| Merges clean, no conflict at all | 18 |
| Conflicts **only** in `MANIFEST.json` — the union resolution used four times today | 31 |
| Conflicts elsewhere | **5** |

49 of 54 are mechanical. And the 5 that are not all collide on the **same single
file**: `docs/03-project-control/candidates/module-completion-tracker-001.md`.

- `bst/mod-a2a-assessment`
- `bst/mod-runtime-a2a-merge-readiness-001`
- `bst/mod-runtime-assessment`
- `claude/qa/mod-reg-001`
- `codex/mod-mem-tracker-correction-002`

That is a shared status tracker several lanes edited independently. It is a
semantic conflict — which lane's view of module status is current — and it is
the only judgement call in the entire records set. Everything else is union.

The remaining 7 records-only branches touch wider documentation (`AGENTS.md`,
`docs/adr/`, `.agents/`, governance authorizations) and want individual handling.

---

## 4. The code branches are not part of this

79 branches carry code, averaging 18.7 files. They are not sweepable and this
document does not propose treating them as one decision. Two are already
documented separately:

- `codex/wp-mem-*` — in flight, last aggregate verdict `HOLD_RETURN_FOR_REWORK`,
  see `2026-08-08-wp-mem-integration-map.draft.md`. Do not integrate.
- `claude/design/fail-learn-wp1-001` — landed at `134e00f`.

20 of the 98 tips are 14 days old or younger; 78 are older. Age is a weak signal
here: `bst/integration-rehearsal-20260719` is 20 days old and swallows 4 other
branches, while several 3-day-old tips carry a single file.

---

## 5. Recommendation

1. **Sweep the 49 mechanical records-only branches.** They add review evidence
   and no code. The MANIFEST conflicts resolve by union with the check already in
   place — `manifest.complete` will refuse the merge if any inventory entry is
   missed, so the sweep cannot quietly drop a record.
2. **Decide `module-completion-tracker-001.md` first**, then take the 5 branches
   that depend on it. Sweeping them before that decision would pick a winner by
   merge order rather than by judgement.
3. **Handle the 7 wider-documentation branches individually.**
4. **Leave the 79 code branches out of any sweep.** They need their producing
   lanes.

The first item is the one that closes the AMD-003 failure mode rather than
waiting for it to happen again with a different identifier.

---

## 6. Status fields

```yaml
truth_status: verified_true      # branch sets, file counts and merge outcomes
                                 # measured, not estimated
authority_status: advisory_only
implementation_status: candidate
risk_class: medium               # the risk is invisibility of review state,
                                 # already realised once today
```
