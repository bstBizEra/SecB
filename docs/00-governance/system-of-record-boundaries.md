# System-of-Record Boundaries

| Information | Authoritative system |
|---|---|
| Project, module and goal authorization | SecB |
| Agent identity, role and harness assignment | SecB Registry |
| Workflow state and transition | SecB durable runtime |
| Backlog/task collaboration | Jira, Plane, Gitea/GitHub Issues, or declared PM system |
| Source code and version | Git provider |
| Build/test/security raw output | Originating tool plus sealed evidence reference |
| Evidence acceptance | SecB Evidence Ledger |
| Decisions and exceptions | SecB Decision Ledger |
| Knowledge claims | SecB Knowledge Ledger |
| Skills and versions | SecB SkillsHub |
| Live metrics and traces | Observability platform with SecB projection |
| Business outcome | Domain system plus SecB Outcome Receipt |
| Secrets | Credential Broker or approved secret manager |

SecB stores references and governed projections where another system is authoritative. It must avoid uncontrolled dual writes.
