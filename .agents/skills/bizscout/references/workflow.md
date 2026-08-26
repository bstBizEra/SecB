# BizScout — Workflow

Candidate research skill. Produces evidence-backed research packets, never approvals — a
verdict label in a BizScout packet is a research conclusion offered for independent review.

## Preconditions

- A research objective and the decision it informs are stated.
- The scope names a target entity, market, product, or segment, and a geography where relevant.
- A research mode is chosen (`SCAN`, `STANDARD`, `DEEP`); `CONTINUOUS` is a future mode and
  may not be selected.

## Sequence

| # | Step | Refuse to proceed when |
|---|---|---|
| 1 | State the research question and the decision it informs | the request is not research — implementation, deployment, or approval belongs to another role |
| 2 | Route to the sub-skills in `subskills/` that match the question | no sub-skill matches and the gap would be papered over rather than declared |
| 3 | Build a source plan from complementary tool classes in `tools/mcp-registry.yaml` | a registry entry would be used without verifying it is available in this environment |
| 4 | Discover candidate sources; treat snippets as discovery aids only | a snippet would be cited as final evidence without inspecting the source |
| 5 | Inspect primary sources and extract claims into the evidence ledger per `schemas/evidence.yaml` | a material claim would enter the ledger with no source identity |
| 6 | Verify material claims; record contradictions as first-class findings | two sources disagree and one would be picked silently |
| 7 | Analyze with the framework or quantitative method the sub-skill prescribes | a modeled estimate would be presented as a sourced value |
| 8 | Synthesize the decision packet from `assets/output-template.md` | a required output section would be omitted rather than marked absent |
| 9 | State confidence, limitations, unknowns, and the next responsible role | the packet would imply the decision is made rather than handed off |

## Mode depth

- `SCAN` — steps 1–5 with a single pass of discovery; the packet marks every unverified claim.
- `STANDARD` — the full sequence with at least two independent sources for each material claim
  where retrievable.
- `DEEP` — the full sequence plus parallel specialist sub-skill runs, cross-verification,
  contradiction analysis, and an evidence audit before synthesis.

## Claim typing

Every stated item carries one label: FACT, REPORTED_FACT, ASSUMPTION, HYPOTHESIS, INFERENCE,
RECOMMENDATION, DECISION, or POLICY. A number with no retrievable source is labeled unsupported
and stays out of the executive verdict's supporting evidence.

## Contradiction handling

When sources disagree: record both entries in the ledger, note publication and retrieval dates,
weigh primary over secondary and recent over stale, state the methodology used to weigh them,
and carry the disagreement into the packet's risks section with a confidence level per branch.

## Handoff

The packet ends by naming the next responsible role or decision point. BizScout does not act on
its own recommendation, approve it, or schedule follow-up work — those are decisions for the
reviewing role.
