# Installation

## Controlled repository installation

### Codex

From the target repository root, copy skills into:

```text
.agents/skills/
```

Run:

```powershell
powershell -ExecutionPolicy Bypass -File <pack>\install\install-codex.ps1 -TargetRepo <repo>
```

or:

```bash
bash <pack>/install/install-codex.sh <repo>
```

### Claude Code

Copy skills into:

```text
.claude/skills/
```

Run the matching Claude installer.

## Deployment rules

- Review and validate the pack before copying.
- Install into a branch or controlled workspace, not directly into a protected baseline.
- Do not overwrite same-named skills without comparison and approval.
- Re-run `python scripts/validate_pack.py` after installation.
- Record package SHA-256 and source commit in the SkillsHub candidate record.
