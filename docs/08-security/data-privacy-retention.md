# Data, Privacy, and Retention

**Document ID:** SECB-SEC-DATA-001
**Version:** 1.0.0-draft
**Status:** DRAFT / NOT EFFECTIVE

## Capture Levels

| Level | Content |
|---|---|
| C0 | Minimal metadata only |
| C1 | Tool, command, status, and policy events |
| C2 | User-visible conversation and deliberate rationale summaries |
| C3 | Terminal or desktop stream under explicit policy |
| C4 | Full approved content capture for exceptional regulated/audit use |

## Prohibitions

- Do not capture or reconstruct hidden model chain-of-thought.
- Do not persist raw secrets, private keys, tokens, credential files, or unrestricted environment variables.
- Do not copy data across projects or regions without authorization.
- Do not retain data longer than the approved purpose requires.

## Required Controls

- classification and purpose before collection;
- data minimization;
- secret and personal-data redaction before durable storage;
- encryption in transit and at rest;
- separate access policy for live observation and replay;
- immutable audit of replay access;
- project/tenant residency and retention;
- legal hold and deletion workflow;
- redaction manifest preserving proof that content was removed;
- breach and incident response.
