# Module Allocation Across Harnesses

Harness allocation is an initial delivery strategy, not permanent ownership.

| Module | Lead role/harness | Independent challenge | Notes |
|---|---|---|---|
| Governance Kernel | ARCHI — Claude Code | REV/SEC — independent session + GOV | Policy and authority semantics |
| Canonical Schemas/Registry | ENGIN — Codex | Claude REV + QA | Deterministic validation |
| Work and Goal Graph | ARCHI — Claude Code; ENGIN — Codex | QA/DOMAIN | Universal project support |
| Durable Runtime | ENGIN — Codex | Claude REV + QA/OPS | State, retries, checkpoints |
| Workspace Orchestrator | ENGIN — Codex | SEC + QA | Worktree, namespace and leases |
| Live Operations Backend | ENGIN — Codex | OPS/SEC | Events, streaming and replay |
| Live Operations UX | Prototype — Antigravity; production — Codex | QA/DOMAIN | Human control and accessibility |
| Evidence Service | ARCHI — Claude; ENGIN — Codex | Independent QA/SEC | Integrity and acceptance |
| Context Federation | ARCHI — Claude; ENGIN — Codex | KNOW/SEC | Minimum sufficient context |
| Memory Gateway | ARCHI — Claude; ENGIN — Codex | KNOW/QA | Temporal and scoped memory |
| Knowledge Service | KNOW/ARCHI — Claude | DOMAIN/REV | Claims and contradictions |
| SkillsHub | SKILL/ARCHI — Claude; ENGIN — Codex | QA/SEC | Intake, eval, promotion |
| MCP Gateway | ENGIN — Codex | SEC/REV | Method permissions and credentials |
| A2A Gateway | ARCHI — Claude; ENGIN — Codex | SEC/QA | Delegation non-escalation |
| Integration Queue | ENGIN/INTEGRATOR — Codex | QA/SEC + GOV | Serialized protected merge |
| Operations/FinOps | OPS/FINOPS — Codex analytics | GOV/DOMAIN | Cost, capacity and incidents |
| Documentation System | DOCS — Claude | Codex validators | Links, schemas and traceability |

## Workstream split

### Lane A — Control foundation

Governance, identity, canonical schemas, project/module registries and role engine.

### Lane B — Execution foundation

Durable runtime, workspaces, adapter SDK and event envelope.

### Lane C — Assurance foundation

Evidence service, validators, review/QA workflows and exit gates.

### Lane D — Human operations

Command Center UI, live monitoring, replay and intervention.

### Lane E — Organizational learning

Context, memory, knowledge, outcome and skill pipelines.

### Lane F — Federation and scale

MCP, A2A, integration queue, portfolio intelligence and cross-project governance.

Lanes A–C define the P0 critical path. D and E may prototype in parallel but may not bypass canonical contracts.
