# AC-AUDIT-01 calibration

Planted 9 mutation(s) across 9 class(es).

| class | arm | targets | planted | caught | rate |
|---|---|---|---|---|---|
| remove-manifest | detection | `governance.ungoverned-package` | 1 | 1 | 100% |
| collide-skill-id | detection | `governance.duplicate-identity` | 1 | 1 | 100% |
| drop-identity-field | detection | `governance.identity-fields` | 1 | 1 | 100% |
| inject-depth-three | detection | `governance.unreadable-manifest` | 1 | 1 | 100% |
| drop-section | detection | `declaration.structural-conformance` | 1 | 1 | 100% |
| instruct-write | detection | `declaration.mutation-class-exceeded` | 1 | 1 | 100% |
| claim-prohibited-authority | detection | `declaration.authority-boundary-consistency` | 1 | 1 | 100% |
| repair-eval-suite-path | repair | `evals.missing-eval-coverage` | 1 | 1 | 100% |
| repair-expectation-uniqueness | repair | `evals.expectation-diversity` | 1 | 1 | 100% |

Spurious violations in unplanted packages: 0

Every planted class was caught. This licenses the checks named here and no others.

This licenses the checks named above against the mutation classes named above,
and nothing else. It is not evidence that the corpus is sound.
