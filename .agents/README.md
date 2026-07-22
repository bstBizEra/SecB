# SecB Architecture Skills Pack v0.1

**Status:** CANDIDATE / NOT EFFECTIVE / PROPOSAL-ONLY  
**Generated:** 2026-07-22  
**Skills:** 22

This repository-ready pack provides bounded architecture skills for OpenAI Codex, Claude Code, and other clients compatible with the open Agent Skills format.

## Governing boundary

```text
Skill output
→ Architecture candidate
→ Independent review
→ Authorized decision
→ Separately authorized implementation
```

A skill in this pack may analyze, model, recommend, document, review, or prepare work packages. It does **not** confer architecture approval, mutation authority, integration authority, deployment authority, or production activation.

## Pack structure

```text
skills/<skill-name>/SKILL.md       Portable skill instructions
skills/<skill-name>/manifest.yaml  SecB governance metadata
skills/<skill-name>/agents/openai.yaml  Optional Codex metadata
skills/<skill-name>/references/    Detailed workflow reference
skills/<skill-name>/assets/        Output template
evals/                              Cross-pack evaluation plan
schemas/                            Machine-readable artifact contracts
scripts/                            Pack validation and manifest tooling
install/                            Windows and Unix installation helpers
docs/                               Governance, catalog, sources, installation
```

## Validate

```bash
python scripts/validate_pack.py
```

## Install

- Codex repository scope: copy or link skills into `.agents/skills/`.
- Claude Code project scope: copy or link skills into `.claude/skills/`.
- Run the included installers from the pack root for a controlled copy.

Read `docs/installation.md` and `docs/governance.md` before deployment.
