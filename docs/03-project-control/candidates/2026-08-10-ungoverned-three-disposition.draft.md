# The last three audit violations are not skills missing manifests

**Status:** DRAFT / ADVISORY — prepared under `SECB-AGENTS-AMD-002` §3
**Prepared by:** Claude (worker agent), 2026-08-10, at `main` `803469c`
**Decision required from:** the operator, or whoever owns `.agents/`
**Authority of this document:** none. It recommends and does not move anything.

## The finding

After pack 0.3.0, the skill audit reports **3 violations**, all of one class:

```
governance.ungoverned-package  graphify
governance.ungoverned-package  secb-project-registry
governance.ungoverned-package  worktree
```

These are also the entirety of `validate_pack.py`'s 12 errors.

The obvious reading — *three skills are missing their manifests* — is wrong, and
acting on it would make the corpus worse. Evidence:

### 1. None of the three has a single mandatory section

A governed package carries seven, in order. What these three actually carry:

| Package | Sections |
|---|---|
| `graphify` | Supported File Extensions & Grammars (36 Types) · Core Command Reference · MCP Server Integration · PR Triage & Community Conflict Analysis · Git Hooks & Merge Driver · Environment Variables Reference |
| `secb-project-registry` | Core Principle · Recommended Composition & Reference Architecture · Governance & Adoption Rules |
| `worktree` | Overview · Key Components & Architecture · Governed Operational Rules |

Not one of *Authority boundary · Required inputs · Workflow · Required outputs ·
Evidence and reasoning discipline · Completion gate · Supporting files*. This is
not a package that lost its manifest. It is a different genre of document —
`graphify`'s is a CLI reference, down to the environment-variable table.

### 2. They arrived through a different door

```
graphify               3f6f0f1  feat(graphify): research and integrate Graphify-Labs/graphify AST knowledge…
secb-project-registry  1718f2b  feat(mcp): front declared upstream MCP servers behind the SecB server
worktree               1718f2b  (same commit)
```

Both are **tool-integration** commits, not skills-pack commits. The pack's own
`source-traceability.md` and `skill-catalog.md` mention none of the three.

### 3. So the audit is right and its finding is being misread

`governance.ungoverned-package` fires correctly: these directories sit inside
`.agents/skills/` and carry no manifest. What the finding means is *there is
something here the pack's governance does not cover*, and the answer to that is
not always "govern it".

## Options

| # | Option | Effect |
|---|---|---|
| A | Move the three out of `.agents/skills/` to a tool-documentation location | Audit → 0 violations; pack validator → 0 errors; nothing is invented |
| B | Author manifests, evals and the seven sections for each | Audit → 0 violations, and three documents rewritten into a genre they are not, by an agent inferring intent from as little as 32 lines |
| C | Leave them and record the exception | Honest, but the audit reports 3 violations forever and readers learn to ignore it |

**Recommendation: A.** It is the only option that removes the finding by fixing
what caused it. B manufactures governance declarations for tools whose purpose
would be guessed — precisely the failure the audit exists to catch, committed in
the act of satisfying the audit. C trains readers to discount a working check.

This document does not move them, because where tool documentation belongs is a
decision about the repository's shape rather than a defect to repair.

## A consequence the decision needs to know about

`src/audit/calibration.mjs` carries exactly one repair arm,
`repair-ungoverned-package`, and it repairs **these three**. The harness's own
tests refuse a detection-only calibration: *"a detection-only calibration cannot
tell a working check from one that always fires"*.

So option A or B removes the last real defect the repair arm can act on, and the
calibration will need a new one in the same change. This is stated in the arm's
own comment and is correct pressure rather than a bug — *a calibration that can
always find something to repair is calibrating against a corpus nobody is
fixing* — but it means the disposition is a two-part change, not a `git mv`.

Whoever takes it should expect to answer: **what does a repair arm repair once
the corpus is clean?** The honest options are a real remaining defect elsewhere,
or a redesign in which the harness plants a defect and then repairs it within one
run. The second is stronger and is not what the harness does today.


## Correction and measurement, 2026-08-11

The section above said the calibration "will need a new one in the same change"
and left that sounding like bookkeeping. It was not, and the error ran in the
direction that made the recommendation look cheaper than it is.

**Measured, not assumed.** The obvious substitute for a repair arm is `spurious`
— violations in packages nothing was planted in. Stubbing a check to fire on
every package yields **spurious 0**, on a clean baseline as readily as a dirty
one, because `score()` receives a baseline computed with the SAME check set and
subtracts that check's noise from itself. The repair arm is structurally the only
thing that catches a check that always fires, and no amount of corpus cleanliness
changes that.

**So the harness was made corpus-independent instead.** A repair arm may now
declare `breaks(p)` — the world as it looks before the repair — and `plant()`
returns a `baselineCorpus` built from it. The repair is scored against that
rather than against the corpus as shipped, so the arm no longer waits for the
corpus to be broken. This is what killed the two previous repair arms: their
defects were fixed and they silently became no-ops.

**Verified by simulating the move.** With `graphify`, `secb-project-registry` and
`worktree` removed from `.agents/skills/`:

| | |
|---|---|
| audit violations | **0** |
| `skill-audit-calibration.test.mjs` | **0 failures** — the harness no longer needs them |
| remaining failures | **3**, all corpus-shape tripwires |

The three that remain are by design, and whoever performs the move must update
them in the same commit:

1. `the real corpus is the shape recorded in corpus-expectation.mjs` — whose own
   comment reads *"UPDATE THIS DELIBERATELY, IN THE SAME COMMIT AS THE CORPUS
   CHANGE. If updating it feels like clearing a nuisance failure, that is the
   tripwire working."*
2. `real-corpus counts are recorded, and every zero is accompanied by proof the
   check can fire`
3. `governance.ungoverned-package finds exactly the packages that lack a manifest`
   — which names the three.

A second, quieter dependency was found and removed while measuring: the test
`a class with nowhere to plant throws instead of vanishing from the key` picked an
ungoverned package **out of the real corpus**, so it silently required the corpus
to contain one. It now constructs its own. A test depending on a defect it does
not describe is the harder kind to find, because nothing about it mentions the
defect.

**Net effect on the recommendation: unchanged, and now costed.** Option A is a
three-part change — move the directories, regenerate the pack manifest, update
the three tripwires — with no redesign required, because the redesign is done.

## What this document does not do

It moves nothing, authors no manifest, and changes no check. It records why the
last three violations survived pack 0.3.0 and why closing them the obvious way
would be a defect.
