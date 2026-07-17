# ADR-0004: Begin with a Read-Only SecB Self-Pilot

- **Status:** Proposed / Not Effective
- **Date:** 2026-07-17
- **Decision:** The first conformance pilot observes and assesses SecB’s own repository without mutation authority.
- **Rationale:** Identity, context, event, evidence, replay, review, QA, and governance can be tested before introducing write risk.
- **Consequences:** Slower initial feature delivery; stronger proof that the governance kernel works before bounded mutation.
