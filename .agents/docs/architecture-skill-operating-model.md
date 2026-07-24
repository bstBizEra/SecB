# Architecture Skill Operating Model

```text
Intent
→ Intake and framing
→ Current-state discovery
→ Context and boundaries
→ Stakeholders and capabilities
→ Quality attribute scenarios
→ Options and trade-offs
→ Domain, data, integration, event, security, agent, runtime, and deployment design
→ C4 and arc42 communication
→ ADRs
→ Roadmap and work packages
→ Independent review and conformance
→ Fitness functions
→ Evidence and handoff
```

## Skill-composition rules

1. Start with intake unless an effective architecture brief already exists.
2. Run current-state discovery before modernization or replacement decisions.
3. Establish context, boundaries, and quality scenarios before technology selection.
4. Run threat modeling for R2+ work and any AI, credential, memory, MCP, A2A, or cross-project boundary.
5. Use C4 for software structure views; supplement it for state, process, domain, data, and security concerns.
6. Record significant choices in ADRs after options analysis.
7. Run review and conformance in an independent session.
8. Convert accepted architecture constraints into fitness functions where deterministic checks are possible.
9. End each role transition with an evidence-backed handoff.
