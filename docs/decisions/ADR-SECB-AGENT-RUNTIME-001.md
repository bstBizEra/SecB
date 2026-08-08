# ADR-SECB-AGENT-RUNTIME-001 — SecB Provider-Neutral CLI Agent Registry, Runtime Adapter, MCP Gateway, Governed Process Supervision, Model Routing, Telemetry, Evidence and Credential Isolation Architecture v1.0

**Status:** APPROVED  
**Decision Date:** 2026-07-25  
**Authority:** HUMAN-OPERATOR-001 (Engineering Authority)  
**Successor Work Item:** SECB-AGENT-RUNTIME-P0-001

---

## 1. Executive Disposition

SecB registers each CLI as an **Agent Runtime Provider**, not merely as a "model." SecB remains the governance, orchestration, evidence, and control plane, while Codex, Claude Code, Gemini CLI, Kimi CLI, and future harnesses remain replaceable execution engines.

```
SecB Orchestrator ──► 5-Layer Registry ──► Runtime Adapter ──► CLI Models (Codex/Claude/Gemini/Kimi)
       │                                                                │
       └──────────────────◄ MCP Gateway / Evidence Ledger ──────────────┘
```

---

## 2. The 5 Registry Layers

SecB explicitly separates provider, model, runtime, agent identity, and session:

| Registry Layer | Represents | Example |
|---|---|---|
| **1. Provider Registry** | Vendor / AI Service | `openai`, `anthropic`, `google`, `moonshot` |
| **2. Model Registry** | Reasoning model & specs | `claude-opus-4-6`, `codex-gpt-4o`, `gemini-3.6-pro`, `kimi-k1.5` |
| **3. Runtime Registry** | Installed executable / CLI harness | `codex`, `claude`, `gemini`, `kimi` |
| **4. Agent Registry** | Governed SecB worker identity | `codex-implementer-01`, `gemini-scout-01`, `claude-reviewer-01` |
| **5. Session Registry** | Active execution instance | PID, worktree path, work package ID, start/end timestamps |

---

## 3. Runtime Lifecycle State Machine

Executable harnesses discovered on the host move through a strict onboarding lifecycle:

```
DISCOVERED
  │
  ▼ (inspect capabilities & version)
INSPECTED
  │
  ▼ (run conformance tests)
CONFORMANCE_PENDING
  │
  ▼ (human operator approval)
APPROVAL_PENDING ──► ACTIVE ──► DEGRADED / QUARANTINED / RETIRED
```

A discovered CLI executable SHALL NOT automatically become an active governed agent without passing conformance tests and receiving operator approval.

---

## 4. Universal `AgentRuntimeAdapter` Interface

All CLI harnesses must be wrapped in a standardized adapter:

```typescript
interface AgentRuntimeAdapter {
  detect(): Promise<RuntimeInstallation[]>;
  inspectCapabilities(): Promise<CapabilityManifest>;
  authenticate(): Promise<AuthStatus>;
  launch(spec: LaunchSpec): Promise<RuntimeSession>;
  send(sessionId: string, message: AgentMessage): Promise<void>;
  cancel(sessionId: string): Promise<void>;
  pause?(sessionId: string): Promise<void>;
  resume?(sessionId: string): Promise<void>;
  collectEvents(sessionId: string): AsyncIterable<RuntimeEvent>;
  terminate(sessionId: string): Promise<ExitReceipt>;
}
```

---

## 5. Model Routing & Selection Policy

SecB routes work packages to agents based on `ModelPolicy` scoring rather than hard-coded vendor bindings:

- **Implementation (ENGIN):** Best available coding runtime (Codex, Claude Code, Gemini CLI).
- **Review (REV):** Independent vendor model (e.g. Claude Code for code written by Codex).
- **Research (RESEARCH):** Large-context or web-capable runtime (Gemini CLI, Kimi CLI).
- **Verification (QA):** Deterministic test execution scripts and CI.

---

## 6. Credential Broker Boundary

- API keys and tokens are **never** stored in prompts, agent records, or git-committed MCP configs.
- The SecB **Credential Broker** injects short-lived, bounded credentials into authorized CLI worker processes at launch time.
- Having a logged-in CLI harness does **not** grant repository mutation rights — authority is governed by SecB Work Package leases.
