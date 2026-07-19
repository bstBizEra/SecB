# Dynamic Team Topology

## Team compiler inputs

- risk class;
- reversibility;
- data sensitivity;
- architecture uncertainty;
- number of dependencies;
- write-set overlap;
- production impact;
- regulatory or financial consequence;
- evidence and review requirements;
- available qualified harnesses.

## Team patterns

### Advisory

`RESEARCH/SARCHI → Evidence check`

### Normal delivery

`ARCHI → ENGIN → REV → QA`

### Producer-assurance parallelism

```text
ENGIN implementation
├── QA prepares acceptance tests
├── SEC prepares abuse cases
├── REV maps requirements
└── DOCS prepares documentation changes
```

### Competitive variants

```text
Frozen contract
├── ENGIN-A candidate
└── ENGIN-B candidate
→ independent benchmark
→ INTEGRATOR selection/synthesis
→ REV/QA
```

### High-risk release

`DOMAIN + SARCHI + ARCHI + ENGIN + REV + QA + SEC + OPS + GOV`

Team size is constrained by marginal value. Additional agents require a defined responsibility, input, output and handoff.
