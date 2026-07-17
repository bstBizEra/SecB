# SecB Read-Only Self-Pilot

**Document ID:** SECB-PILOT-P0-001
**Version:** 1.0.0-draft
**Status:** DRAFT / NOT AUTHORIZED

## Objective

Prove the complete governance and evidence chain against SecB’s own repository without granting mutation authority.

## Pilot Team

- SARCHI: plan and objective framing;
- ARCHI: contract and architecture assessment;
- one read-only runtime as analyst/producer;
- independent REV runtime;
- independent QA runtime;
- human GOV authority.

## Pilot Scope

1. Register SecB project and repository.
2. Seal baseline repository identity and commit.
3. Issue a read-only Work Package.
4. Generate and hash Context Receipts.
5. Observe structured runtime and host events.
6. Produce an architecture/conformance finding pack.
7. Hand off through structured envelopes.
8. Perform independent REV and QA.
9. Verify evidence integrity and replay.
10. Issue human governance disposition.
11. Generate one restricted learning candidate; do not publish a skill.

## Mandatory Negative Cases

Attempt and prove denial of:

- mutation from a read-only session;
- access to an unrelated project;
- caller-declared authority;
- reviewer self-assignment by the producer;
- replay of an approval token;
- evidence tampering;
- stale Context Receipt use;
- hidden-chain-of-thought capture;
- direct raw transcript promotion to knowledge; and
- direct candidate publication to SkillsHub.

## Exit Rule

P0 passes only when all applicable gates and verification cases are `PASS`, evidence is accepted, independence is verified, and human GOV records `PASS_FOR_P0_CONTROLLED_ACTIVATION`.
