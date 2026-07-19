# Harness Registry

A Harness Profile represents a runtime product and deployment, not authority.

## Required profile fields

- harness ID, provider and product name;
- version and deployment identity;
- supported operating systems;
- models and context limits;
- tool, shell, filesystem, Git, MCP and A2A capabilities;
- event and telemetry interfaces;
- pause, resume, cancellation and permission interfaces;
- sandbox and worktree support;
- credential injection methods;
- known limitations and unsupported controls;
- evaluation status and approved risk classes;
- adapter owner and review date.

## Initial harnesses

| Harness | Initial use | Required adapter evidence |
|---|---|---|
| Codex | Engineering, tests, refactoring, automation | Structured events, Git/file changes, command results, token/cost |
| Claude Code | Architecture, review, research synthesis, policy analysis | Streamed events/hooks, tool permissions, OTel or equivalent |
| Antigravity | Visual orchestration, multi-agent interaction, UI prototypes | Official event/SDK interface or host-observed fallback |
| Generic CLI | Limited compatibility mode | PTY, process, Git/file and evidence capture |
| Local model runtime | Restricted low-risk tasks | Model provenance, resource limits and tool isolation |
