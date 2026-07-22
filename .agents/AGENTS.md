# AGENTS.md — SecB Architecture Skills Pack

## Status

This pack is a candidate artifact. It is not effective governance and is not authorization to modify any registered project.

## Mandatory rules

1. Treat every skill output as a candidate until independently reviewed and accepted by the assigned authority.
2. Never infer authority from repository access, user identity, runtime product, model provider, or prior approvals.
3. Separate verified facts, reported facts, assumptions, hypotheses, inferences, recommendations, decisions, and policies.
4. Cite external factual claims and identify source versions or access dates where the information can change.
5. Do not request, accept, repeat, or store reusable secrets in skill content, chat, artifacts, logs, or evidence.
6. Do not mutate target repositories during architecture analysis unless a separate, explicit authorization exists.
7. Producer, independent reviewer, QA verifier, evidence acceptor, and governance decision authority must remain distinct where required by risk.
8. Skills may route to other skills but may not grant those skills wider scope or authority.
9. Direct evidence takes precedence over producer summaries.
10. Any ambiguity in scope, authority, evidence, or irreversible impact must be recorded and escalated rather than silently assumed.

## Completion

A skill run is complete only when required outputs, evidence references, limitations, unresolved items, and the next-role handoff are present.
