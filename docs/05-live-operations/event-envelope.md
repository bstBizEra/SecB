# Canonical Live Event Envelope

**Document ID:** SECB-LIVE-EVENT-001
**Version:** 1.0.0-draft
**Status:** DRAFT / NOT EFFECTIVE

## Event Families

```text
session.*
workflow.*
conversation.*
agent.*
subagent.*
delegation.*
tool.*
command.*
terminal.*
file.*
git.*
test.*
security.*
policy.*
approval.*
evidence.*
checkpoint.*
cost.*
incident.*
```

## Requirements

Every event contains:

- schema version, event ID/type, server timestamp, and sequence;
- project, project session, agent session, work package, agent instance, and runtime deployment IDs;
- trace and span identifiers;
- source channel, host/process identity, and runtime version;
- data classification and content-capture level;
- normalized payload plus provider-native reference;
- payload hash, prior-event hash, and signature reference;
- observed fact/provider assertion/inference classification;
- redaction status and evidence-candidate flag.

## Ordering and Correlation

- Sequence is authoritative within a session stream.
- Distributed operations propagate W3C-compatible trace identifiers.
- Late or duplicate events are retained but marked and reconciled.
- Provider and host events may corroborate or contradict each other; contradictions become findings rather than silent overwrites.
