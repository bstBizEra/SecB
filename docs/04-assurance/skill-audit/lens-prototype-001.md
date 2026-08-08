# AC-AUDIT-03 lens prototype — result

**Document ID:** `SECB-AUDIT-LENS-PROTO-001`
**Status:** `PROTOTYPE RESULT — one run, not a rate`
**Work package:** `WP-SK-AUDIT-01` (AUTHORIZED 2026-08-03)
**Run at:** 2026-08-03, seed held by the producer, corpus mutated in memory only

## The question this answered

Before building the autonomous layer, one thing had to be checked: **can agent
lenses find anything the deterministic checks cannot?** If not, the layer is cost
without benefit and the honest move is to record that and stop.

Three lenses audited a corpus with nine planted mutations. None knew anything had
been planted, none could read the repository, and none saw the deterministic
checks' verdicts — a lens shown the answers restates them, and its agreement then
reads as corroboration when it is an echo.

## Result

| lens | frame | in-slice planted | caught |
|---|---|---|---|
| `authority` | the manifest is the spec | 3 | **3** |
| `content` | the declared mutation class is the spec | 2 | **2**, both with an exact line |
| `sibling` | **no spec — each package against its 24 siblings** | 5 | **5**, each quantified |

`content` cited `data-architecture-governance:58` and
`architecture-roadmap-work-packages:11`. Both resolve. Both are exactly where the
mutation was planted.

## The finding that answers the question

`content` reported something that was **not planted and is not in the corpus's
defect history**:

> `graphify` `SKILL.md:94` — `python -m graphify hook install`, which installs
> git hooks and a merge driver. Other lines force graph rebuilds and start a
> network-bound MCP server. Verdict **UNDECIDABLE**, because the package declares
> no mutation class, so there is no ceiling to exceed.

Verified against the real file: line 94 is that command, under a heading
`## Git Hooks & Merge Driver`.

What the deterministic checks say about `graphify`, in full:

- `governance.ungoverned-package` — VIOLATION, "contains no manifest.yaml"
- `evals.missing-eval-coverage` — NO_EVIDENCE, "makes no evaluation claim"

**The deterministic layer knows the package is ungoverned. The autonomous layer
knows what the ungoverned package tells an agent to do** — and that it is the
highest-privilege content in the corpus. That gap is not a tuning problem; the
deterministic checks compute structure, and no amount of structural computation
reaches "this file instructs installing a git hook".

`sibling` independently flagged `graphify` as anomalous (4896 bytes against a
~2470 median, headings sharing zero tokens with the corpus vocabulary) but could
not say why it mattered, having been given no prose. Two lenses converging from
different evidence on the same package, one able to explain it, is the design
working.

## What else the lenses did that the checks structurally cannot

**`authority` refused to convert a real observation into a violation.** It found
the planted `skill_id` collision and returned UNDECIDABLE:

> "The pack states no uniqueness requirement for `skill_id`, so I cannot settle
> from this slice whether the shared id is a defect. One manifest fact would
> settle it."

The deterministic check has uniqueness baked in and reports VIOLATION. The lens
had no such rule and declined to invent one — **and named the missing rule.** A
deterministic check cannot say "the rule I am applying is not in the evidence you
gave me."

**`sibling` found a defect in the calibration harness.** It flagged
`architecture-review-conformance` as the sharpest anomaly in the corpus: full
six-file governed layout *including manifest.yaml*, yet `governed: false`. That
combination cannot arise from a real missing manifest — the planting was
detectable because it was unrealistic. The mutation now removes the file as well;
recorded in `calibration.mjs` at the mutation.

That is the prototype auditing its own instrument, which is the behaviour the
whole design is trying to buy.

## What this does NOT establish

**One run is an anecdote, not a rate.** Agents are not deterministic. A detection
rate needs N runs; nothing here licenses "the lenses catch X%".

**A perfect in-slice score is partly a property of the slice.** Each lens was
scored only against mutations its evidence could reveal, because grading a lens on
evidence deliberately withheld measures the slice. That is the right correction
and it also means the denominators are small: 3, 2 and 5.

**The producer wrote both the mutations and the lens briefs.** The lenses were
blind to what was planted; they were not blind to a mind that chose both. The
`graphify` finding is the strongest evidence against this mattering — it was not
planted by anyone.

**No adversarial pairing was run.** Contest, the second half of the autonomous
layer, is unbuilt. These are three independent readings, not a contested one.

## Disposition

The autonomous layer earns its place. It found a real, verified, previously
unreported fact about the corpus that the deterministic layer cannot reach, and
it corrected its own calibration harness while doing so.

Building it out is a separate authorization. This record establishes the premise;
it does not authorize the work.
