# Project Contract

**Document ID:** SECB-PROJECT-CONTRACT-001
**Version:** 1.0.0-draft
**Status:** DRAFT / NOT EFFECTIVE

## Purpose

A Project Contract establishes the authoritative boundary within which agents, humans, tools, models, and integrations may operate.

## Mandatory Fields

- Project ID, namespace, name, description, and profile;
- business, technical, security, domain, and governance owners;
- repositories, providers, default branches, and protected refs;
- environments and activation restrictions;
- security classification and data categories;
- applicable policies and legal/regulatory obligations;
- approved providers, runtime deployments, models, agents, roles, and authority ceilings;
- approved tools, commands, MCP servers/methods, A2A relationships, and skills;
- evidence destination and retention;
- memory, knowledge, and cross-project publication permissions;
- release and integration authorities;
- data residency, network, credential, and secret rules;
- risk tolerance and required exit gates;
- effective date, expiry, version, approvals, and revocation conditions.

## Activation Rule

A Project Contract is effective only when:

- schema validation passes;
- required owners and signatures exist;
- repositories and environments are resolved;
- role conflicts are clear;
- evidence and retention destinations are reachable;
- policies compile and deny unknown operations;
- independent REV and QA have accepted the contract; and
- human GOV issues an effective activation decision.

Registration without effectiveness does not authorize work.

## Local Candidate Instance

The local Phase 0 candidate is recorded in [`candidates/secb-local.project-contract.yaml`](candidates/secb-local.project-contract.yaml). It is `DRAFT / NOT EFFECTIVE` and grants no authority.
