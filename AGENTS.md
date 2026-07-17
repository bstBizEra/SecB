# SecB Local Build Rules

**Document ID:** SECB-AGENTS-LOCAL-001
**Version:** 0.3.0-alpha.0
**Effective scope:** Local repository development only
**External publication authority:** Not granted

## Mission

Build SecB as a governed agent work and learning control plane. SecB assigns and verifies authority; it is not a super-agent and runtime product names never imply authority.

## Working rules

1. Follow the implementation sequence in `docs/SECB-OPERATING-MODEL-P0-001.md`.
2. Use bounded slices with explicit acceptance checks and a clean Git baseline.
3. Keep verified facts, assumptions, recommendations, decisions, and policies distinct.
4. Treat events, evidence, knowledge, memory, skills, and authority as separate objects.
5. Do not configure, push, publish, deploy, or activate a remote without explicit user authorization.
6. Do not claim completion until checks run after the final change and their exact results are reported.
7. Preserve separation between producer verification, independent review, QA, and governance acceptance.
8. Unknown identity, scope, transition, evidence, or authority fails closed.

## Current bootstrap boundary

The Phase 0 artifacts are implementation candidates. They define future operational controls but do not self-authorize production, remote publication, mutation outside this repository, knowledge promotion, or skill publication.
