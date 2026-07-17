# SecB Agentic Threat Model

**Document ID:** SECB-SEC-THREAT-001
**Version:** 1.0.0-draft
**Status:** DRAFT / NOT EFFECTIVE

## Protected Assets

Authority, project boundaries, source code, data, credentials, policies, evidence, decisions, knowledge, skills, runtime hosts, release channels, and audit history.

## Principal Threats and Controls

| Threat | Required controls |
|---|---|
| Prompt injection through documents/tools | content classification, sandbox, instruction/data separation, tool policy |
| Memory or graph poisoning | provenance, candidate status, contradiction analysis, independent approval |
| Skill supply-chain compromise | pinning, licence/security scan, sandbox, evaluation, signed publication |
| Agent impersonation | workload identity, mTLS, server-derived actor ID, attestation |
| Delegation escalation | authority intersection, non-escalation, destination policy |
| Reviewer collusion/self-review | role conflict engine, distinct identity/session, direct evidence review |
| False or tampered evidence | content hashes, signatures, host corroboration, independent verification |
| Cross-project leakage | mandatory project scope, context firewall, retrieval policy, tests |
| Stale knowledge | temporal validity, freshness, supersession, review dates |
| Tool result spoofing | source identity, response validation, corroboration |
| Approval replay | object/version/action binding, nonce, expiry, revocation |
| Excessive autonomy | bounded authority, human gates, emergency controls |
| Cost exhaustion | budgets, quotas, circuit breakers, anomaly detection |
| Compromised host/runtime | least privilege, isolation, attestation, quarantine, revocation |
| Evidence deletion or audit rewriting | append-only storage, retention locks, independent backups |

## Security Rule

A PTY, worktree, model instruction, or agent promise is not a security boundary. Controls must be enforced by identity, policy, operating-system/container isolation, credentials, network policy, immutable evidence, and human governance.
