# Work Package Contract

**Document ID:** SECB-WORK-CONTRACT-001
**Version:** 1.0.0-draft
**Status:** DRAFT / NOT EFFECTIVE

## Mandatory Fields

- Work Package ID, project, objective, profile, and risk class;
- problem statement, desired outcome, scope, and explicit non-scope;
- dependencies and authoritative baseline;
- acceptance criteria and proof methods;
- required artifacts and evidence obligations;
- assigned roles and independence constraints;
- allowed repositories, paths, workspaces, environments, commands, models, tools, MCP methods, skills, networks, and data;
- declared write set and prohibited write set;
- schedule, budget, execution window, and expiry;
- checkpoint, rollback, recovery, integration, and activation rules;
- human approval requirements; and
- status, version, signatures, and reason codes.

## Quality Rule

Acceptance criteria must be testable or independently assessable. Statements such as “improve quality,” “make robust,” or “finish implementation” are insufficient without measurable outcomes.

## Mutation Rule

A Work Package that authorizes mutation must bind to a concrete baseline and isolated workspace lease. A plan alone is not mutation authority.

## Local Candidate Instance

The R0 read-only self-pilot candidate is recorded in [`candidates/wp-p0-19-read-only-self-pilot.work-package.yaml`](candidates/wp-p0-19-read-only-self-pilot.work-package.yaml). It is `DRAFT / NOT AUTHORIZED`; its empty write set and pending assignments prevent execution.
