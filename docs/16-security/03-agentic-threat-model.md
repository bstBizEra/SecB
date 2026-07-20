# Agentic Threat Model

Mandatory threat families:

- prompt injection through documents, tools or MCP results;
- memory and knowledge poisoning;
- compromised or malicious skill package;
- agent or harness impersonation;
- authority escalation through A2A delegation;
- reviewer collusion or shared-context contamination;
- false or replayed evidence and approvals;
- cross-project context leakage;
- stale knowledge and ghost-state retrieval;
- tool-result spoofing;
- credential leakage and lease reuse;
- workspace escape and undeclared writes;
- cost exhaustion and runaway retries;
- compromised host/runtime adapter;
- hidden release or integration path.

Controls include signed identities, scoped context, method-level permissions, least-privilege credentials, write-set reconciliation, independent corroboration, immutable evidence, replay protection, bounded retries, quarantine and human governance.
