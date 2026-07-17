# SecB Documentation Control Center

**Version:** 0.2.0-alpha.0
**Status:** PHASE_0_CONTROL_CANDIDATE

## Canonical documents

- [Operating Model](SECB-OPERATING-MODEL-001.md) — universal lifecycle, roles, reasoning discipline, ledgers, and system boundaries.
- [Phase 0 Implementation Control](SECB-OPERATING-MODEL-P0-001.md) — bounded deliverables, validation, and exit gates.
- [ADR-0001](adr/0001-control-plane-and-bootstrap.md) — control-plane identity and constitution-first bootstrap decision.
- [`contracts/`](../contracts/) — machine-readable contract schemas.
- [`src/control/`](../src/control/) — fail-closed state-transition enforcement.
- [`src/contracts/`](../src/contracts/) — executable JSON Schema validation.

## Current disposition

This repository is local-only. Phase 0 artifacts are reviewable implementation candidates. They do not grant remote publication, deployment, production activation, or self-approval authority.

## Source basis

The controlling design source is the user-provided “SecB System Design — Deep Architecture Assessment,” verified by the digest recorded in [`source/ASSESSMENT.sha256`](source/ASSESSMENT.sha256).
