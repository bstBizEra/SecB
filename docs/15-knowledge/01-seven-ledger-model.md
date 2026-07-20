# Seven-Ledger Organizational Brain

1. **Work Ledger** — portfolios, products, modules, goals, work packages and state.
2. **Event Ledger** — append-only runtime, tool, Git, human and transition events.
3. **Evidence Ledger** — verified observations, provenance, integrity and acceptance.
4. **Decision Ledger** — options, rationale, authority, effective dates and supersession.
5. **Knowledge Ledger** — bounded claims, scope, confidence, temporal validity and contradictions.
6. **Capability Ledger** — agents, harnesses, models, tools, MCP servers, skills and evaluations.
7. **Outcome Ledger** — technical, business, cost, adoption, incident and benefit outcomes.

## Storage pattern

- PostgreSQL for authoritative entities and state.
- Append-only event store for operational history.
- Object storage for artifacts, recordings and evidence packages.
- Knowledge graph for relationships and temporal claims.
- Search/vector indexes as retrieval projections.
- Analytics warehouse for portfolio, quality, cost and outcomes.
