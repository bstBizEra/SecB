# Architecture Decision Record v0.2.0 cross-harness evidence

**Status:** CANDIDATE EVALUATION EVIDENCE / NOT PROMOTION

**Executed:** 2026-08-05 02:59-03:03 +07:00

**Declared harnesses:** Codex, Claude Code

The synthetic fixture grants no real authority and contains no secret. The
exact prompt is reconstructible from
`architecture-decision-record-v0.2.0-prompt.txt` by replacing its three
placeholders with the raw staged content identified below, without any other
transformation.

## Evaluated content

| Artifact | SHA-256 of staged Git content |
|---|---|
| `skills/architecture-decision-record/SKILL.md` | `d561e594b845d2c273662dc9eaa423906d4f38e476003ded40bff0054b751618` |
| `skills/architecture-decision-record/references/workflow.md` | `320ec8d2fae1cbc2c656046f1b8447aa016fcd44cf7094523fc6ed9058ac55c5` |
| `schemas/architecture-decision-record.schema.json` | `fcee3c8492fc67e4feebd4eff99fccc9c0020121c4c8d0e2ac54b3ae2c9f2ff2` |

## Reproduction commands

PowerShell interpolation order for both runs was `SKILL.md`, `workflow.md`,
then the ADR schema into the correspondingly named placeholders. The commands
were:

```powershell
$prompt | codex exec --sandbox read-only --ephemeral -
$prompt | claude -p --tools "" --output-format text --session-id 7c4de2f2-9c32-4e14-b4ce-72036f2ddf01
```

Codex runtime: `codex-cli 0.146.0`, `gpt-5.6-sol`, session
`019fce5c-7bb4-73d0-9ff9-7d9fcecbd451`. Claude runtime: Claude Code
`2.1.221`, explicit session `7c4de2f2-9c32-4e14-b4ce-72036f2ddf01`.

## Raw results

- Codex stdout is retained verbatim as
  `architecture-decision-record-v0.2.0-codex-output.json`.
- Claude stdout is retained verbatim as
  `architecture-decision-record-v0.2.0-claude-output.json`.

Both are complete ADR artifacts, not compact projections. Both use exactly
`DECISION_CANDIDATE`, `DECISION_CANDIDATE`, and `NOT_EFFECTIVE`; put
`PostgreSQL` in `decision`; omit `selected_option`; keep `approver` null; and
grant no mutation or activation authority. The canonical schema validator must
accept both raw result files before this evidence passes.

## Prior variance and conclusion

Independent REV found that the preceding candidate allowed Claude Code to emit
the lowercase token `decision-candidate`. This successor adds a closed
serialization contract and schema validation gate. Fresh executions of both
declared harnesses now converge on schema-valid uppercase control tokens.

This evidence remains producer evidence. It does not approve, accept, promote,
publish, merge, or activate the skill. Independent REV, QA, SEC and human
GOV/operator promotion remain separate gates.
