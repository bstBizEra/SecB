# Live Operations

SecB synchronizes three observation channels:

1. structured semantic events from the harness;
2. independent host telemetry for process, Git, files and tests;
3. PTY/ConPTY terminal stream as supporting operational record.

## Required views

- agent and harness fleet;
- project/workflow graph;
- conversation and semantic timeline;
- live terminal;
- code diff and write-set status;
- tool, MCP and A2A activity;
- tests, evidence and exit gates;
- cost, latency and resource use;
- incidents, findings and intervention controls;
- synchronized replay.

## Human access modes

`Observe → Annotate → Approve → Steer → Control → Emergency`

Observation is default. Writable terminal control and emergency intervention require explicit authorization and are fully audited.
