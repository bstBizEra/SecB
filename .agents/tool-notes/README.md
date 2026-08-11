# Tool notes

Documentation of external tools integrated into SecB. **Not skills**, and not
governed by the SecB Architecture Skills Pack.

## Why these live outside `skills/`

They were filed under `.agents/skills/` by the commits that integrated the tools
they describe — `3f6f0f1` (Graphify AST) and `1718f2b` (upstream MCP servers) —
rather than through the skills-pack route. The pack's governance then measured
them as if they were governed skills, producing the audit's only remaining
violations and every one of `validate_pack.py`'s errors.

The finding is recorded in
[`2026-08-10-ungoverned-three-disposition.draft.md`](../../docs/03-project-control/candidates/2026-08-10-ungoverned-three-disposition.draft.md).
Its substance: not one of the three carried a single mandatory section, and
`graphify`'s is a CLI reference down to the environment-variable table. They were
never skills that mislaid a manifest. Authoring manifests for them would have
meant an agent inferring a skill's authority boundary, required inputs and
completion gate from as little as 32 lines — manufacturing governance
declarations for something whose purpose it guessed, which is the failure the
audit exists to catch, committed in the act of satisfying the audit.

## What applies here

- `.agents/MANIFEST.sha256` still covers these files: they are pack content and
  their integrity is still checked.
- The skill audit does not read them. Its corpus root is `.agents/skills`.
- `validate_pack.py`'s per-skill conformance loop does not read them either.
- Nothing here confers authority, and nothing here is a skill. A document in this
  directory that starts declaring a workflow, an authority boundary and a
  completion gate has become a skill candidate and belongs in `skills/`, through
  the route in [`../AGENTS.md`](../AGENTS.md).
