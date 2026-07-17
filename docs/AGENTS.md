# Documentation-Specific Agent Instructions

**Scope:** `docs/**`
**Parent:** [`../AGENTS.md`](../AGENTS.md)
**Version:** 1.0.0-draft

## Purpose

This directory is SecB’s controlled architecture and operating-model baseline. Documentation changes may alter governance meaning and therefore require the same discipline as code changes.

## Rules

- Use one authoritative definition for each contract or concept; link to it elsewhere.
- Preserve document IDs, version, status, owner, approval state, and last-updated date.
- Mark all unapproved material `DRAFT / NOT EFFECTIVE`.
- Distinguish normative requirements from examples and recommendations.
- Use explicit IDs for states, gates, findings, evidence, decisions, and ADRs.
- Record migration impact when changing schemas or state transitions.
- Do not state that a control is implemented, tested, conformant, or operational without accepted evidence.
- Keep templates synchronized with their governing documents.
- Add an ADR for decisions that materially affect architecture, authority, security, lifecycle, system-of-record boundaries, or interoperability.
- Validate internal links, YAML syntax, and manifest hashes before completion.

## Review Requirement

Documentation that changes authority, risk, separation of duties, evidence acceptance, memory admission, skill promotion, MCP/A2A permissions, release gates, or privacy controls requires independent REV and QA; R3/R4 changes also require SEC and human GOV.
