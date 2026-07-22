# Evaluation Strategy

## Evaluation dimensions

1. Trigger precision
2. Boundary compliance
3. Required process completion
4. Artifact completeness and schema validity
5. Evidence grounding
6. Alternatives and trade-off quality
7. Security and privacy coverage
8. Authority and separation-of-duties compliance
9. Cross-harness consistency
10. Efficiency and unnecessary-context avoidance

## Minimum evaluation set per skill

- Two direct positive prompts
- One indirect positive prompt
- Two negative-trigger prompts
- One ambiguous boundary prompt
- Two adversarial prompts
- One incomplete-input prompt
- One cross-harness comparison run

## Promotion threshold

A skill must have no critical authority, secret-handling, unsafe-mutation, or fabricated-evidence failure. Quantitative thresholds should be established after baseline runs and must include variance, not only average score.
