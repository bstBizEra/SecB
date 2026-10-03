# MOD-UI Gap Assessment 001

**Record ID:** MOD-UI-GAP-ASSESSMENT-001
**Status:** DRAFT / ADVISORY / NOT EFFECTIVE
**Module:** MOD-UI Command Center UI
**Assessment baseline:** `main` at `adfeb8e511d71b0e3acdabe7761095f86ea3a8c2`
**Assessment tree:** `4f2a91b3ff3d4ad4c32875544e72e39087867111`
**Agent:** Codex `/root`, Cortex assessment lane
**Timestamp:** 2026-07-21, Asia/Vientiane

## Decision

`PARTIAL_SUBSTRATE_PRESENT / THREE_BOUNDED_SLICES_RECOMMENDED`

MOD-UI is not missing. P0-17 already delivered a secure observer-only static report, classification-floored event and evidence projections, a zero-network CLI generator, an end-to-end HostRuntimeAgent-to-report test, and the display-plane half of V-011. MOD-WORK also delivered a separate goal-rollup projection under `src/ui/`.

The delivered pieces are useful Phase 2 foundations, but they do not yet form the catalogued Command Center: there is no canonical multi-source snapshot, no unified workflow/fleet/goal/operations composition, no accessibility contract, and no replay inspection surface. Intervention controls remain intentionally absent and are not authorized by this assessment.

## Phase and ownership alignment

- Phase 2 calls for an Agent Command Center whose authorized sessions are observable, recoverable, scoped, and fail closed.
- The module catalog assigns MOD-UI human control surfaces and dashboards at High priority.
- The allocation assigns Antigravity to prototypes, Codex to production, and QA/DOMAIN to independent challenge.
- Lane D may prototype in parallel but may not bypass canonical contracts defined by the control, execution, and assurance lanes.
- P0-17 is the backlog anchor. Its operator disposition authorized only the static observer report and excluded an authenticated server, terminal, diff, replay, and intervention chassis.

## Existing substrate disposition

| Capability | Evidence on baseline | Disposition |
|---|---|---|
| Event/evidence projection | `src/ui/report-projections.mjs` | delivered; deterministic, frozen, classification floored |
| Static HTML report | `src/ui/ops-report-generator.mjs` | delivered; verify-before-read, fail-visible, zero network |
| Operator CLI | `tools/generate-ops-report.mjs` | delivered; explicit refresh, nonzero integrity-failure exit |
| V-011 display plane | `tests/conformance-stubs.test.mjs` | delivered partial; storage-plane redaction remains skipped |
| Host-to-report integration | `tests/p0-12-p0-17-integration.test.mjs` | delivered |
| Goal hierarchy projection | `src/ui/goal-rollup-projection.mjs` | delivered by MOD-WORK; not composed into the report |
| Live event-family policy | MOD-LIVE S1 on `main` | delivered and unwired; UI adoption not assessed here |
| Access-mode policy | not on assessed baseline | subsequently ratified by MOD-LIVE; successor must bind exact merged object |

## Gap map

### UI-G1 - canonical Command Center snapshot is missing

There is no versioned, frozen read model that composes event, evidence, goal, runtime, workspace, and operations projections into one project-scoped snapshot. The current report opens two ledger files directly, while the goal projection is a separate factory. A future Command Center needs an injected projection boundary so the UI never becomes an authority resolver or a second implementation of backend policy.

### UI-G2 - project and session scope are incomplete

The report shows flat event and evidence tables. It does not expose a canonical project/session selector, prove that all supplied projections share one project scope, or bind a snapshot to one coherent source set. Cross-project mixing must fail closed before rendering, not rely on a human noticing identifiers in rows.

### UI-G3 - freshness and source coherence are partial

P0-17 honestly displays generation time, counts, and ledger head hashes, but it cannot prove an atomic cross-ledger cut. No snapshot-level source manifest records each projection's version, scope, observed-at time, integrity reference, or degraded state. A multi-source UI must display incoherence rather than merge mismatched observations into a green view.

### UI-G4 - dashboard composition is missing

The catalogued workflow, fleet, diff, evidence, and health views do not exist as one surface. Goal rollups are not rendered. KPI/scorecard work belongs to MOD-OPS and must be consumed after ratification rather than duplicated. Workspace state belongs to MOD-WSPACE, and replay data belongs to MOD-LIVE.

### UI-G5 - accessibility and presentation contract are partial

The static HTML is intentionally small and safely escaped, but it has no documented accessibility acceptance floor. The document lacks an explicit language attribute, table captions and scoped headers, skip navigation, landmark structure, and tested keyboard/screen-reader semantics. Accessibility belongs in the production slice and requires independent QA/DOMAIN challenge.

### UI-G6 - replay inspection is missing

There is no read-only replay timeline, checkpoint/resume comparison, or drift visualization. MOD-UI must consume a verified replay projection from MOD-LIVE/MOD-RUNTIME; it must not reconstruct replay or checkpoint authority from raw events.

### UI-G7 - intervention remains intentionally absent

No approve, retry, steer, terminate, emergency, terminal-input, or mutation affordance exists. This is a preserved safety property. Any future control surface is R3/R4, must use server-derived identity and live authority, and requires a separate work package, SEC assurance, Human GOV, and an authenticated backend. No disabled or hidden control chassis should be introduced in the read-only slices.

### UI-G8 - deployment and configuration surface is absent

There is no Command Center application runtime, authentication configuration, routing configuration, or deployment unit. This assessment does not create one. Any server or hosted UI must load governed configuration rather than hard-code authority, project, classification, host, or credential values.

## Boundary rulings

1. MOD-UI renders verified projections; it does not read raw authority streams once the composition boundary exists.
2. MOD-LIVE owns event-family, access-mode, replay, and intervention policy semantics.
3. MOD-RUNTIME owns checkpoint, retry, and approval-binding semantics.
4. MOD-WSPACE owns lease, namespace, worktree, and write-set semantics.
5. MOD-OPS owns KPI definitions, scorecards, cadence, incidents, capacity, and cost semantics.
6. MOD-UI may withhold display content but cannot claim storage redaction or evidence acceptance.
7. A report or dashboard is not evidence, authority, approval, or an activation record.

## Recommended bounded slices

### S1 - Command Center snapshot composer (R2, unwired)

Create a pure `src/ui/command-center-snapshot.mjs` candidate with injected, already-verified projection inputs. It should:

- require one exact project scope and reject mixed scopes;
- atomically snapshot every consulted top-level field before evaluation;
- preserve source version, observed-at, integrity reference, and degraded/unavailable status;
- deep-freeze output and mark external data untrusted;
- never import ledgers, services, network modules, authority engines, or filesystem writers;
- include no control/action fields.

Independent review must probe poisoned getters, iterators, prototype keys, mixed projects, stale sources, missing sections, and mutation after construction.

### S2 - accessible static Command Center renderer (R2)

Evolve the P0-17 static renderer to consume the S1 snapshot without weakening its zero-network, universal-escaping, CSP, no-interactivity, deterministic-output, and report-is-not-evidence properties. Add goal and ratified OPS sections only through their projections. Define and test an accessibility floor covering document language, landmarks, headings, captions, scoped headers, keyboard reading order, withheld/degraded announcements, and no color-only status meaning.

### S3 - read-only replay inspection (R2 after dependencies)

After MOD-LIVE's replay assembler and the required MOD-RUNTIME scope hardening are ratified, render a read-only replay view bound to exact project/session/checkpoint/source references. Unknown, stale, drifted, cross-project, or unverified inputs must produce a visible deny/degraded view. This slice provides no resume button, retry action, or dispatcher.

## Deferred operator-gated work

- authenticated local or hosted Command Center server;
- live streaming or subscriptions;
- terminal input or interactive diff application;
- approve, retry, steer, terminate, emergency, or activation controls;
- configuration, deployment, remote exposure, or external identity integration;
- claiming V-011 storage-plane completion.

## Verification reproduced

- Fresh-worktree dependency condition reproduced: missing dependency initially caused `ERR_MODULE_NOT_FOUND` for `ajv`; `npm ci --offline --ignore-scripts` restored 6 lockfile packages with 0 vulnerabilities.
- Targeted UI and integration set: 38 total, 33 pass, 0 fail, 5 documented skips.
- Foundation validator: PASS, 356 unique manifest paths on the assessed baseline.
- Import scan: UI projections are consumed by tests and the MCP read plane; the goal rollup remains separately consumed and is not composed into the report.

## Change rationale

- Reason: the tracker described MOD-UI as missing even though P0-17 and MOD-WORK left production-grade UI substrate on `main`.
- Benefit of the old phase: the static report structurally removed network and actuation attack classes while proving classification withholding and ledger-integrity visibility.
- Expected outcome of the new phase: compose those proven read-only pieces into an accessible, project-scoped Command Center without importing authority or intervention semantics into the UI.

## Governance and cross-links

- [Module tracker](module-completion-tracker-001.md)
- [P0-17 planning packet](p0-17-planning-001.cortex-advisory.yaml)
- [P0-17 governance disposition](p0-17-gov-disposition.yaml)
- [Implementation roadmap](../../09-delivery/implementation-roadmap.md)
- [P0 backlog](../../09-delivery/backlog-p0.md)
- [Module allocation](../../14-delivery/01-module-allocation.md)
- [Module catalog](../../10-platform/03-module-catalog.md)
- [Live operations architecture](../../05-live-operations/live-operations-architecture.md)
- [Repository overview](../../../README.md)
- [Repository rules](../../../AGENTS.md)
- [Canonical inventory](../../../MANIFEST.json)

## Integration hold

The required patch helper could create this new record but could not update existing files in the current Windows sandbox. Therefore the root MANIFEST entry and canonical tracker append are intentionally deferred to the staging owner as a mechanical union fold. This candidate is not integration-ready until that fold is complete and revalidated.

## Provenance

- Source: first-hand repository inspection, Git history, live module coordination, foundation validation, targeted Node test execution, and import-surface scan.
- Timestamp: 2026-07-21, Asia/Vientiane.
- Agent ID: Codex `/root`.
- Authority: advisory assessment only; no implementation, integration, deployment, promotion, or activation authority.

> DRAFT / NOT EFFECTIVE. Proceed only through bounded producer, independent review, QA/DOMAIN, and Human GOV gates appropriate to each slice.
