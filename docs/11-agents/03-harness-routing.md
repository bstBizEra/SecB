# Harness Routing

## Routing factors

SecB routes by capability, evidence quality, risk, data policy, cost and availability—not by brand preference.

```text
Work requirements
+ Risk class
+ Data classification
+ Required tools
+ Context size
+ Latency/cost budget
+ Evidence interfaces
+ Independence requirement
→ Harness and model assignment
```

## Default routing matrix

| Work type | Primary | Checker / secondary |
|---|---|---|
| Architecture and operating model | Claude Code | Codex or independent Claude session |
| Repository implementation | Codex | Claude Code REV + independent QA |
| Test and deterministic validation | Codex | Separate QA session |
| Broad codebase review | Claude Code | Codex deterministic checks |
| Security/threat analysis | Claude Code or security-specialized harness | Independent SEC/QA |
| UI/workflow prototype | Antigravity | Codex production implementation + QA |
| Research and evidence synthesis | Claude Code | Independent source/evidence reviewer |
| Integration queue automation | Codex | QA/SEC and human integration authority |
| Documentation normalization | Claude Code | DOCS validator and link/schema checks |

## Fallback order

1. Approved native structured adapter.
2. Approved CLI or batch structured output.
3. OpenTelemetry and lifecycle hooks.
4. Host-observed process, Git and file events.
5. PTY/terminal capture as supporting compatibility mode.

A fallback may reduce the maximum approved risk class.
