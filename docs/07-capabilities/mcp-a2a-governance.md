# MCP and A2A Governance

**Document ID:** SECB-FEDERATION-001
**Version:** 1.0.0-draft
**Status:** DRAFT / NOT EFFECTIVE

## MCP Control Plane

Every MCP server is registered with owner, identity, version, methods/resources/prompts, data classification, credentials, network destinations, evaluation status, and lifecycle state.

Invocation flow:

```text
Agent request
→ Identity and session verification
→ Project/work/role policy
→ Data and network policy
→ Method-level authorization
→ Bounded credential issuance
→ Request validation
→ Invocation
→ Response validation/redaction
→ Event, cost, and evidence record
```

## A2A Gateway

Every delegation declares source, destination, objective, scope, inputs, expected output, acceptance criteria, authority ceiling, tools, skills, data, budget, due condition, evidence obligations, and escalation route.

## Non-Escalation and Trust

- A delegate cannot receive more authority than the delegator possesses.
- Transport-level identity does not replace SecB authorization.
- MCP/A2A content is untrusted input until validated.
- Permanent credentials are prohibited in agent context.
- External results may be evidence candidates but are not automatically accepted evidence.
