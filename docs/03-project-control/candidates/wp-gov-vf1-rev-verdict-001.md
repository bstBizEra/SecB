# WP-GOV-VF1 — independent review verdict

**Record ID:** `WP-GOV-VF1-REV-001`
**Record status:** `TRANSCRIBED — NOT AUTHORED BY THE REVIEWER`
**Reviewer:** Codex identity, acting as REV, distinct from the producer
**Reviewed commit:** `5d97c4cb66547b08fcc811cae08aae8a6c905f50`
**Base:** `8be8c9953716c06cadfc6a581fe248e819747380`
**Pull request carrying that exact commit:** `#137`
**Verdict:** `APPROVE_WITH_NOTES` — 0 blocking findings

## Why this file exists

`SECB-ASSURANCE-REV-TRACEABILITY-001` found that nine of ten open pull requests
carry independent review evidence that cannot be located from the pull request
itself, because the verdict lives as a commit inside the branch it approves.

This verdict was worse than that: **it lived nowhere in the repository at all.**
It was returned in session, relayed by the operator, and quoted in a pull-request
comment. Searching this tree for `WP-GOV-VF1-REV-001` returned only the packets
that *requested* the review — a request is not a verdict, and a reconciler that
counts it as one produces a false positive. That happened during the
reconciliation and is recorded there.

Filing it makes `#137` the one open pull request whose approval can be found by
reading the repository.

## Transcription limitation, stated first because it bounds everything below

**The producer transcribed this.** The reviewer did not write this file, did not
review this file, and has not confirmed it. It is a second-hand record of a
first-hand review, written by the party the review was about.

That is a weaker artefact than the reviewer committing its own verdict, which is
what every other reviewed branch in this repository did. It is filed in this
weaker form because the alternative — leaving it unfiled — is what the
reconciliation just identified as the defect. **If the reviewer files its own
copy, this file should be superseded by it rather than kept alongside.**

## What the reviewer reproduced independently

Re-run rather than read from the producer's records:

| Check | Result |
|---|---|
| `npm run validate` | exit 0 |
| add an optional property to `decision-record` | exit 1, `schema.properties.exact` |
| promote that property to required | exit 1, `schema.required.exact` |
| remove `bound_action` from `skill-promotion` required | exit 1, `schema.required.exact` |
| `AC-VF1-06` | 7/7 pass → drift injected → 7/7 fail → revert → 7/7 pass, worktree clean |
| full suite, target and base | 1342 passed / 1 failed / 3 skipped, identical both sides |

The single failure is pre-existing on `main` and is not from this change.

## The question the producer could not answer

Whether the maintenance cost this imposes on every future contract change is
acceptable on `main`. The reviewer's answer:

> Acceptable, with conditions. A governed contract schema is a wire and
> authority boundary, so an intentional shape change should fail validation
> until the expected shape is explicitly declared in the same authorized and
> reviewed change.
>
> Conditions: a re-pin is acknowledgement that a contract changed, not proof
> that the change is safe or authorized; migration, compatibility and authority
> implications still require review; the target SHA stays frozen.

**That last condition is what made `#136` unmergeable and caused `#137` to
exist.** It is also the rule under which nine of ten open pull requests are
stale.

## Non-blocking findings

**`REV-VF1-N01` (MEDIUM) — the producer understated the maintenance cost by a
factor of eight.** "One line per deliberate contract change" is wrong: editing
`tools/validate-foundation.mjs` also invalidates seven byte-identity guards, so
the true fan-out is the validator pin plus seven re-pins. The producer asked the
reviewer to judge whether a cost was acceptable while stating that cost wrong.

Status: **open, deliberately.** The sentence still stands in a comment on the
approved commit. The accurate figure is in the `WP-GOV-VF1` work package. See
the disposition note below.

**`REV-VF1-N02` (LOW) — provenance text.** The re-pinned guards' comments say the
pinned blob is the post-`MOD-MEM-S2` blob; it is the post-`WP-GOV-VF1` blob.
Three of the seven also carry a comment fragment spliced mid-sentence.

Status: **corrected at `7a975f0`, which is not merged and not reviewed.** See
below.

**A weak probe in the producer's own evidence.** Removing `integrity` from
`skill-candidate`'s required set is caught by the *existing* `schema.identity`
guard, not by the new exact-set pin. Fail-closed either way, but it does not
exercise what this change adds. The producer had listed it as evidence that the
new assertions work.

## Residual risk recorded by the reviewer

Updating the expected arrays alongside a schema can mechanically make validation
green. Exact property and required sets do not detect changes to types, enums,
formats, or nested constraints. **This is a drift tripwire, not an authorization
verifier**, and should not be cited as one.

## Authority

```
technical_acceptance:  granted, for the exact target only
governance_acceptance: NOT granted
merge_authority:       NOT granted
```

The producer wrote both the change and the pins that vouch for it, and does not
merge it.

## Disposition of `REV-VF1-N02`, 2026-08-04

The correction at `7a975f0` is **withdrawn from review** and pull request `#136`
is closed. Reasons, in order of weight:

1. It costs an independent review round to correct comment text that the
   reviewer itself rated LOW.
2. Its content is measured to change no executable logic and no pinned hash —
   0 files differ after stripping comments and string literals, 0 pinned hashes
   differ, with both controls firing. The reproduction is in
   `wp-gov-vf1-rev-round2-001.handoff.yaml`.
3. Nine of ten open pull requests are already stale under the frozen-SHA rule.
   Adding a tenth round for comment text spends reviewer attention where it is
   worth least.

**The finding is not closed and is not being treated as closed.** The guards on
`main` still carry provenance text naming the wrong work package. That is
recorded here as open, and the fix exists at `7a975f0` on
`fix/validate-foundation-exact-pins` for whoever next has an authorized reason
to touch those seven files. `WP-GOV-VF2` already lists six of the seven in its
`allowed_paths` and is currently `WITHDRAWN`; reviving it is the natural carrier.

`REV-VF1-N01` stays open on the same basis and for a stronger reason: correcting
it changes `tools/validate-foundation.mjs` itself, which invalidates all seven
pins and forces a full re-pin round for one sentence.
