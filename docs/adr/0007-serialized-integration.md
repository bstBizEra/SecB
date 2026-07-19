# ADR-0003 — Serialized Integration

## Status

Accepted for v0.1 design baseline.

## Decision

SecB permits parallel investigation, implementation and assurance. Protected-branch integration remains serialized through immutable candidates, merge simulation, composite verification, independent assurance and a controlled integration identity.

## Consequences

- Parallel speed is retained without last-writer-wins governance.
- Integration queue capacity becomes a measurable bottleneck.
- Candidates require reproducible baselines and evidence.
- Shared migrations, lockfiles and release manifests remain single-writer.
