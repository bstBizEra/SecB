# Live Operations Architecture

**Document ID:** SECB-LIVE-OPS-ARCH-001
**Version:** 1.0.0-draft
**Status:** DRAFT / NOT EFFECTIVE

## Three Synchronized Channels

1. **Structured semantic events:** conversations, plans, tool calls, approvals, delegations, and results.
2. **Execution telemetry:** commands, processes, tests, Git, file changes, network, and resources.
3. **Terminal/desktop streams:** what the operator could see, as a supporting fallback record.

## Reference Flow

```text
Browser Operations Console
→ SecB WebSocket / API Gateway
→ Policy Enforcement and Session Gateway
→ Durable Workflow Runtime
→ Runtime Adapter Gateway
→ Host Runtime Agent
→ PTY / ConPTY / Container / SSH / Runtime API

In parallel:
Runtime + Host Observations
→ Event Normalizer
→ OpenTelemetry + Event Ledger
→ Evidence and Replay Store
→ Live UI Projections
```

## Host Runtime Agent

The host agent provides:

- Windows ConPTY / PowerShell / WSL support;
- Linux/macOS PTY support;
- process supervision;
- runtime adapter management;
- Git and filesystem observation;
- workspace and namespace enforcement;
- resource and network telemetry;
- evidence production;
- outbound mTLS connection and revocable workload identity.

## Authority Rule

SecB owns workflow state and intervention authority. Runtime-native events and terminal output are observations. No browser connects directly to a host shell.
