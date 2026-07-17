# SkillsHub Lifecycle

**Document ID:** SECB-SKILL-001
**Version:** 1.0.0-draft
**Status:** DRAFT / NOT EFFECTIVE

## Skill Package

A skill may contain instructions, workflow, schemas, code/scripts, tool configuration, model requirements, MCP dependencies, examples, tests, evaluations, security policy, evidence, licence, provenance, and compatibility metadata.

## Lifecycle

```text
Observed Technique
→ Experience Record
→ Knowledge Candidate
→ Skill Candidate
→ Sandbox
→ Evaluation
→ Security and Supply-Chain Review
→ Independent REV and QA
→ Human Promotion Decision
→ Restricted Publication
→ Monitored Consumption
→ Update / Deprecate / Revoke / Quarantine
```

## Publication Gates

- immutable source and version;
- ownership and licence accepted;
- dependency and secret scan passed;
- input/output contracts validate;
- baseline failure or need demonstrated;
- skill-enabled evaluation passes;
- adversarial and rationalization tests pass;
- cross-runtime/model compatibility documented;
- cost, latency, and context budgets accepted;
- project/data/role scope defined;
- rollback and revocation tested;
- independent review and human approval complete.

## Distribution Rule

Agents receive only versions authorized for the current Agent Instance, role, project, Work Package, environment, data class, and runtime.
