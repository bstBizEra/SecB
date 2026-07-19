# Risk and Mutation Classes

## Risk classes

| Risk | Description |
|---|---|
| R0 | Read-only advisory; no sensitive data or mutation |
| R1 | Low-risk documentation or reversible internal work |
| R2 | Normal code/data change in non-production scope |
| R3 | Security, privacy, finance, regulated or sensitive data impact |
| R4 | Production, irreversible, public, safety-critical or material regulatory impact |

## Mutation classes

| Class | Capability |
|---|---|
| M0 | Observe only |
| M1 | Draft artifacts outside authoritative systems |
| M2 | Isolated non-production mutation |
| M3 | Integration candidate creation |
| M4 | Restricted environment activation |
| M5 | Production/irreversible mutation |

Risk determines the minimum roles, independence, evidence, credential and human-approval requirements. An agent may not self-upgrade risk or mutation authority.
