// P0-19 READ-ONLY SELF-PILOT — deterministic fixture inputs (CANDIDATE).
//
// AMD-002 advise-and-proceed clause 3: this is candidate scaffolding on a
// branch, NOT P0-19 completion and NOT activation. Every value below is a
// FIXTURE — a self-contained, in-memory governance object the read-only
// self-pilot composes the ratified primitives over. Nothing here reads a real
// project, spawns a runtime, touches a remote, or mints authority beyond the
// operator-authored grant fixtures the pilot is handed.
//
// The fixtures model the SECB-PILOT-P0-001 pilot team and scope: a registered
// Project Contract, an operator-authorized Work Package (its authority grants
// are fixture inputs, NOT self-issued), a registered read-only runtime
// identity, a Context Receipt intent, a durable session, a workspace-lease
// intent, the read-only observations, the captured evidence, and the
// (non-effective) outcome receipt. Times are fixed ISO-8601 strings so a
// re-run over these fixtures produces a byte-identical trace.

// Fixed pilot clock. A single frozen instant keeps the whole trace
// deterministic and replayable.
export const PILOT_NOW_ISO = "2026-07-20T10:00:00.000Z";
export const PILOT_NOW_MS = Date.parse(PILOT_NOW_ISO);

const PROJECT_ID = "prj_secb_local";
const WORK_PACKAGE_ID = "wp_secb_p0_19_read_only_self_pilot_001";
const BASELINE = "385ac65943f2a5b158c8ec20a5fd947f06cd2987";
const SESSION_ID = "ses_secb_p0_19_self_pilot";
const PRODUCER_INSTANCE_ID = "inst_secb_ro_self_pilot_producer";

// Governance actors that hold the fixture WP authority grants. Distinct from
// the read-only runtime producer identity (separation of duties is a fixture
// property, not something the pilot invents).
const ENGIN = "actor_engin_selfpilot";
const REV = "actor_rev_selfpilot";
const GOV = "actor_gov_selfpilot";

const GRANT_WINDOW = Object.freeze({
  validFrom: "2026-07-01T00:00:00.000Z",
  validUntil: "2026-12-31T00:00:00.000Z",
  status: "ACTIVE"
});

// Operator-authored authority grants for the WP transitions. These are the
// FIXTURE authority the pilot is handed — the pilot never mints or widens a
// grant. `driveGov` toggles whether the GOV (REVIEWED->AUTHORIZED) grant is
// present, so a caller can build a fixture whose WP CANNOT reach AUTHORIZED
// and prove the chain halts (deny-by-default) at the Work Package gate.
export function buildAuthorityGrants({ driveGov = true } = {}) {
  const base = {
    projectId: PROJECT_ID,
    workPackageId: WORK_PACKAGE_ID,
    workPackageVersion: 1,
    ...GRANT_WINDOW
  };
  const grants = [
    { ...base, grantId: "g_e_selfpilot", decisionId: "d_e_selfpilot", actorId: ENGIN, roles: ["ENGIN"], allowedTransitions: ["WorkPackage:DRAFT->PLANNED"] },
    { ...base, grantId: "g_r_selfpilot", decisionId: "d_r_selfpilot", actorId: REV, roles: ["REV"], allowedTransitions: ["WorkPackage:PLANNED->REVIEWED"] }
  ];
  if (driveGov) {
    grants.push({ ...base, grantId: "g_g_selfpilot", decisionId: "d_g_selfpilot", actorId: GOV, roles: ["GOV"], allowedTransitions: ["WorkPackage:REVIEWED->AUTHORIZED"] });
  }
  return grants;
}

// The transition drive plan: [requestedState, actorId, authorityRef]. Each
// hop is authorized by the real WorkPackageContractService against the grants
// above; there is no self-authorization anywhere in this list.
export function transitionPlan() {
  return [
    ["PLANNED", ENGIN, "g_e_selfpilot"],
    ["REVIEWED", REV, "g_r_selfpilot"],
    ["AUTHORIZED", GOV, "g_g_selfpilot"]
  ];
}

// A read-only, schema-valid Project Contract fixture in the ACTIVE (effective)
// state. The pilot validates it against the real project-contract schema and
// fail-closes unless it is effective.
export function projectContract() {
  return {
    project_id: PROJECT_ID,
    version: 1,
    profile_id: "profile_internal_tooling",
    status: "ACTIVE",
    owners: ["secb-operator"],
    repositories: ["C:/laragon/www/SecB"],
    risk_class: "R0",
    evidence_destination: "PENDING_LOCAL_GOVERNED_LEDGER",
    valid_from: "2026-07-01T00:00:00.000Z",
    valid_until: "2026-12-31T00:00:00.000Z",
    approvals: ["operator-fixture-approval"]
  };
}

// The read-only Work Package draft. R0, no declared write set (read-only), a
// self-attestation evidence obligation, allowed_paths bounded to the repo.
export function workPackageDraft() {
  return {
    work_package_id: WORK_PACKAGE_ID,
    version: 1,
    project_id: PROJECT_ID,
    objective: "Prove the governed evidence chain read-only over SecB fixtures",
    risk_class: "R0",
    status: "DRAFT",
    baseline: BASELINE,
    scope: ["Observe repository identity, context, event, evidence, replay read-only"],
    non_scope: ["Any repository, filesystem, configuration, or runtime mutation"],
    acceptance_criteria: ["The full governed chain composes and gates read-only"],
    roles: { producer: PRODUCER_INSTANCE_ID, reviewer: REV, qa: GOV },
    allowed_paths: ["docs", "src", "tests"],
    prohibited_paths: ["out", "dist"],
    evidence_obligations: ["self:observation-normalized"],
    valid_until: "2026-08-01T00:00:00.000Z"
  };
}

// The read-only runtime identity registered in the RuntimeRegistry. Permitted
// role ENGIN, A0 authority ceiling, no write tooling — an observer.
export function agentRegistration() {
  return {
    provider_id: "anthropic",
    runtime_product_id: "claude-code",
    runtime_deployment_id: "claude-code-local",
    agent_profile_id: "claude-code-read-only-observer",
    agent_instance_id: PRODUCER_INSTANCE_ID,
    runtime_version: "1.0.0",
    deployment_location: "local",
    owner: "secb-operator",
    permitted_roles: ["ENGIN"],
    authority_ceiling: "A0",
    approved_models: ["claude-fable-5"],
    approved_tools: ["read", "grep", "glob"],
    approved_mcp_methods: [],
    approved_skills: [],
    repository_scopes: ["secb"],
    environment_scopes: ["local"],
    max_data_classification: "INTERNAL",
    delegation_rights: [],
    evidence_obligations: ["context-receipt", "event-envelope"],
    workload_identity_ref: "",
    evaluation_status: "CANDIDATE",
    lifecycle_state: "PENDING"
  };
}

// Subtractive-retrieval candidate pool for the Context Receipt. All survive
// the read-only retrieval pipeline; the survivor set is the receipt's sealed
// source_references.
export function candidateSources() {
  return [
    { ref: "docs-governance-baseline", projectId: PROJECT_ID, classification: "INTERNAL", current: true, verified: true, resolvable: true, relevance: 3 },
    { ref: "src-primitive-contracts", projectId: PROJECT_ID, classification: "INTERNAL", current: true, verified: true, resolvable: true, relevance: 2 }
  ];
}

// Context Receipt mint intent (the MINT_KEYS the federation service accepts).
// authority_scope is a strict subset of the WP allowed_paths; the federation
// service denies any widening.
export function receiptIntent() {
  return {
    receipt_id: "rc_secb_p0_19_self_pilot",
    project_id: PROJECT_ID,
    objective_id: "obj_secb_p0_self_pilot_conformance",
    work_package_id: WORK_PACKAGE_ID,
    session_id: SESSION_ID,
    assigned_role: "READ_ONLY_PRODUCER",
    authority_scope: ["docs", "src"],
    baseline_version: BASELINE,
    acceptance_criteria: ["Observe read-only; produce an independently reviewable trace"],
    allowed_tools: ["read", "grep", "glob"],
    allowed_skills: [],
    evidence_obligations: ["self:observation-normalized"],
    freshness_timestamp: PILOT_NOW_ISO,
    classificationCeiling: "INTERNAL"
  };
}

// Durable session fixture (server-derived in production; a fixture here).
export function durableSession() {
  return {
    session_id: SESSION_ID,
    project_id: PROJECT_ID,
    work_package_id: WORK_PACKAGE_ID,
    actor_id: PRODUCER_INSTANCE_ID,
    access_mode: "Observe",
    opened_at: PILOT_NOW_ISO
  };
}

// Workspace-lease intent. The lease writeSet is a read-only observation scope,
// exercised purely to prove the lease gate composes: a requested set contained
// by the lease is allowed, an over-reaching set denies. No worktree/branch is
// ever materialized (the primitive is filesystem-free by construction).
export function leaseIntent() {
  return {
    leaseId: "lease_secb_p0_19_self_pilot",
    sessionId: SESSION_ID,
    actorId: PRODUCER_INSTANCE_ID,
    writeSet: ["workspace/self-pilot/observation"],
    ttlMs: 3_600_000,
    // Probe sets used to prove the gate both ways.
    containedRequest: ["workspace/self-pilot/observation/git-status"],
    overReachingRequest: ["workspace/self-pilot/observation", "src/index.mjs"]
  };
}

// The read-only observations the Host Runtime Agent normalizes into events.
// Each is a read-only observed fact; the domain maps to a known
// SECB-LIVE-EVENT-001 family (git/file/test).
export function observations() {
  return [
    { domain: "git", detail: { branch: "main", commit: BASELINE, status: "clean" }, idempotencyKey: "obs_git_baseline" },
    { domain: "file", detail: { path: "docs/03-project-control/self-pilot.md", read_only: true }, idempotencyKey: "obs_file_spec" },
    { domain: "test", detail: { suite: "foundation-validation", observed: "read-only" }, idempotencyKey: "obs_test_scan" }
  ];
}

// Captured evidence envelopes (verification_status CAPTURED). The pilot
// registers and seals these; the independent REV/QA verify/accept ladder is a
// SLOT the pilot never fills.
export function evidenceEnvelopes() {
  return [
    {
      evidence_id: "ev_secb_p0_19_baseline_identity",
      version: 1,
      project_id: PROJECT_ID,
      work_package_id: WORK_PACKAGE_ID,
      session_id: SESSION_ID,
      actor_id: PRODUCER_INSTANCE_ID,
      evidence_type: "baseline-identity-observation",
      source: "host-runtime-agent",
      observed_at: PILOT_NOW_ISO,
      procedure: "Observe repository identity, branch, and commit read-only",
      result: "branch=main; commit=385ac65; working tree observed clean",
      exit_status: 0,
      limitations: ["read-only observation; in-memory fixture ledger"],
      verification_status: "CAPTURED",
      classification: "INTERNAL",
      retention_policy: "phase0-bootstrap"
    }
  ];
}

// The (non-effective) outcome receipt fixture. No GOV verdict is rendered by
// the pilot, so the outcome is explicitly INVALIDATED with reversion_required
// false (nothing was mutated). decision_ref points at the still-pending GOV
// decision slot.
export function outcomeReceipt() {
  return {
    outcome_id: "out_secb_p0_19_self_pilot",
    version: 1,
    project_id: PROJECT_ID,
    work_package_id: WORK_PACKAGE_ID,
    session_id: SESSION_ID,
    actor_id: PRODUCER_INSTANCE_ID,
    decision_ref: "gov_decision_slot_PENDING_OPERATOR",
    knowledge_refs: [],
    skill_refs: [],
    outcome_status: "INVALIDATED",
    details: "Read-only self-pilot candidate; no GOV verdict rendered; outcome is not effective and constitutes neither P0-19 completion nor activation.",
    evidence_refs: ["ev_secb_p0_19_baseline_identity"],
    observed_at: PILOT_NOW_ISO,
    reversion_required: false
  };
}

// The full default fixture bundle for a green end-to-end run.
export function buildSelfPilotFixtures({ driveGov = true } = {}) {
  return {
    ids: Object.freeze({
      projectId: PROJECT_ID,
      workPackageId: WORK_PACKAGE_ID,
      baseline: BASELINE,
      sessionId: SESSION_ID,
      producerInstanceId: PRODUCER_INSTANCE_ID,
      engin: ENGIN,
      rev: REV,
      gov: GOV
    }),
    grants: buildAuthorityGrants({ driveGov }),
    transitionPlan: transitionPlan(),
    projectContract: projectContract(),
    workPackageDraft: workPackageDraft(),
    agentRegistration: agentRegistration(),
    candidateSources: candidateSources(),
    receiptIntent: receiptIntent(),
    durableSession: durableSession(),
    leaseIntent: leaseIntent(),
    observations: observations(),
    evidenceEnvelopes: evidenceEnvelopes(),
    outcomeReceipt: outcomeReceipt()
  };
}
