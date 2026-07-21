// P0-19 READ-ONLY SELF-PILOT ORCHESTRATION (CANDIDATE — AMD-002 clause 3).
//
// STATUS: candidate implementation on a branch. This module does NOT
// constitute P0-19 completion, does NOT render the P0-20 governance verdict,
// and is NOT activation. See
// docs/03-project-control/candidates/p0-19-self-pilot-candidate-001.md.
//
// WHAT IT IS: a PURE ORCHESTRATION that runs SecB's governed evidence chain in
// READ-ONLY mode over FIXTURE inputs and emits a deep-frozen, replayable trace.
// It COMPOSES the ratified primitives — it modifies none of them (a byte-
// identity guard test pins every composed source file), invents no authority,
// mutates no real project, spawns nothing, and touches no remote. It appends
// only to the CALLER-INJECTED, fixture-backed ledger instances (never a durable
// production store); the module itself performs no filesystem, process, or
// network I/O and is wired into no live/production path.
//
// EVERY STEP IS DENY-BY-DEFAULT AND FAIL-CLOSED: each hop is gated by the REAL
// primitive that owns that boundary (schema validator, Work Package authority
// engine, runtime registry, context federation, workspace-lease policy, host
// runtime agent, evidence envelope SoD ladder, access-mode ladder, event-family
// classifier, replay assembler). If any gate denies, the chain HALTS and the
// remaining steps are recorded SKIPPED. The GOV decision is an EMPTY,
// OPERATOR-ONLY SLOT the pilot never fills.

import { canonicalFingerprint as fingerprint } from "../contracts/canonical-fingerprint.mjs";
import { validateContract } from "../contracts/contract-validator.mjs";
import { WorkPackageContractService } from "../services/work-package-service.mjs";
import { ContextFederationService, mintReceiptDocument } from "../services/context-federation-service.mjs";
import { EvidenceEnvelopeService } from "../services/evidence-envelope-service.mjs";
import { RuntimeRegistry } from "../registry/runtime-registry.mjs";
import { HostRuntimeAgent } from "../host/host-runtime-agent.mjs";
import { mintLease, evaluateLease } from "../control/workspace-lease-policy.mjs";
import { classifyEventType } from "../live/event-family-policy.mjs";
import { evaluateAccessRequest } from "../live/access-mode-policy.mjs";
import { assembleReplayPackage } from "../live/replay-assembler.mjs";

// The twelve chain steps, in order. The trace records a status for each.
export const READ_ONLY_SELF_PILOT_STEPS = Object.freeze([
  "PROJECT_CONTRACT",
  "WORK_PACKAGE",
  "AGENT_IDENTITY",
  "CONTEXT_RECEIPT",
  "DURABLE_SESSION",
  "RUNTIME_ADAPTER",
  "WORKSPACE_LEASE",
  "OBSERVED_EXECUTION",
  "EVENT_AND_EVIDENCE",
  "INDEPENDENT_REVIEW_SLOTS",
  "GOV_DECISION_SLOT",
  "OUTCOME_RECEIPT"
]);

// The GOV decision is a permanently-empty, operator-only slot. The pilot has
// no code path that fills `verdict` or `rendered_by`; the frozen object is the
// single source of truth and is embedded verbatim in every trace. A read-only
// self-pilot cannot self-render a governance verdict — that authority is
// HUMAN_GOV_REQUIRED and out of scope for this candidate.
export const GOV_DECISION_SLOT = Object.freeze({
  slot: "GOV_DECISION",
  status: "PENDING_OPERATOR",
  authority: "HUMAN_GOV_REQUIRED",
  rendered_by: null,
  verdict: null,
  effective: false,
  note: "Operator-only. The read-only self-pilot never fills this slot; the P0-20 governance verdict remains SEC/GOV-gated."
});

export class SelfPilotError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "SelfPilotError";
    this.code = code;
  }
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

// Seal a contract body the repo-wide way: sha-256 canonical fingerprint over
// the object with `content_hash` excluded.
function sealed(body) {
  return { ...body, content_hash: fingerprint(body) };
}

// A typed-NONE result (verifyReceipt / resolveEffective / evaluate*) is turned
// into a halt by throwing; a thrown primitive error already halts. Either way
// the chain fails closed.
function assertAllow(result, code, message) {
  if (!result || result.code !== "ALLOW") {
    throw new SelfPilotError(code, `${message}: ${result?.code ?? "no result"}${result?.reason ? ` (${result.reason})` : ""}`);
  }
  return result;
}

// runReadOnlySelfPilot({ fixtures, now, ledgers }) -> deep-frozen trace.
//
//   fixtures : the fixture bundle (src/self-pilot/fixtures.mjs buildSelfPilotFixtures()).
//   now      : injected clock () => Date. Deterministic for replayability.
//   ledgers  : caller-injected, fixture-backed ledger instances —
//              { eventLedger, evidenceSealLedger, workspaceLeaseLedger }.
//              The module never opens a durable path itself; the caller points
//              these at an ephemeral fixture store.
export function runReadOnlySelfPilot({ fixtures, now, ledgers } = {}) {
  if (!fixtures || typeof fixtures !== "object") {
    throw new SelfPilotError("DENY_CONFIG", "fixtures bundle is required");
  }
  if (typeof now !== "function") {
    throw new SelfPilotError("DENY_CONFIG", "now must be an injected () => Date clock");
  }
  const { eventLedger, evidenceSealLedger, workspaceLeaseLedger } = ledgers ?? {};
  for (const [name, ledger, methods] of [
    ["eventLedger", eventLedger, ["appendEvent", "verify", "read"]],
    ["evidenceSealLedger", evidenceSealLedger, ["append", "read", "verify"]],
    ["workspaceLeaseLedger", workspaceLeaseLedger, ["appendLease", "read"]]
  ]) {
    if (!ledger || methods.some((m) => typeof ledger[m] !== "function")) {
      throw new SelfPilotError("DENY_CONFIG", `${name} (fixture-backed) is required with ${methods.join(", ")}`);
    }
  }

  const { ids } = fixtures;
  const { projectId, workPackageId, baseline, sessionId, producerInstanceId } = ids;
  const nowMs = now().getTime();

  const steps = [];
  const chain = {};
  let halted = false;
  let haltedAt = null;
  let haltReason = null;

  // Run one gated step. On any throw / typed deny the chain halts; later steps
  // are recorded SKIPPED. Returns the step's produced value (or undefined).
  function step(name, primitive, gate, fn) {
    if (halted) {
      steps.push(Object.freeze({ index: steps.length + 1, step: name, primitive, gate, status: "SKIPPED", detail: null }));
      return undefined;
    }
    try {
      const detail = fn();
      steps.push(deepFreeze({ index: steps.length + 1, step: name, primitive, gate, status: "PASS", detail: detail ?? null }));
      return detail;
    } catch (err) {
      halted = true;
      haltedAt = name;
      haltReason = `${err.code ?? err.name ?? "ERROR"}: ${err.message}`;
      steps.push(deepFreeze({
        index: steps.length + 1,
        step: name,
        primitive,
        gate,
        status: "DENIED",
        detail: { code: err.code ?? null, message: err.message }
      }));
      return undefined;
    }
  }

  // ---- Step 1: Project Contract (fixture) --------------------------------
  step("PROJECT_CONTRACT", "contract-validator", "project-contract schema + effectiveness", () => {
    validateContract("project", fixtures.projectContract);
    if (fixtures.projectContract.status !== "ACTIVE") {
      throw new SelfPilotError("DENY_PROJECT_NOT_EFFECTIVE", `Project contract is ${fixtures.projectContract.status}, not ACTIVE`);
    }
    chain.project_contract = { project_id: fixtures.projectContract.project_id, version: fixtures.projectContract.version, status: fixtures.projectContract.status };
    return chain.project_contract;
  });

  // ---- Step 2: authorized Work Package (fixture) -------------------------
  const wp = step("WORK_PACKAGE", "work-package-service", "authority engine + resolveEffective", () => {
    const service = new WorkPackageContractService({
      grants: fixtures.grants,
      authoritySource: () => fixtures.grants,
      now
    });
    service.createWorkPackage(fixtures.workPackageDraft, {
      idempotencyKey: "sp_create",
      actorId: ids.engin,
      authorityRef: "g_e_selfpilot"
    });
    let seq = 0;
    for (const [state, actorId, authorityRef] of fixtures.transitionPlan) {
      service.submitTransition({
        projectId, workPackageId, version: 1,
        requestedState: state, actorId, authorityRef,
        policyDecision: "ALLOW",
        evidence: [{ ref: `sp_wp_${state.toLowerCase()}` }],
        idempotencyKey: `sp_t_${++seq}`,
        reasonCode: "SELF_PILOT"
      });
    }
    const effective = assertAllow(
      service.resolveEffective(projectId, workPackageId, { baseline }),
      "DENY_WORK_PACKAGE_NOT_EFFECTIVE",
      "Work package did not resolve effective"
    );
    chain.work_package = { work_package_id: workPackageId, version: effective.version, state: effective.state, risk_class: effective.effective.risk_class };
    return { service, effectiveState: effective.state, version: effective.version };
  });

  // ---- Step 3: registered agent identity (read-only) ---------------------
  const registry = step("AGENT_IDENTITY", "runtime-registry", "schema + resolve quarantine gate", () => {
    const reg = new RuntimeRegistry();
    reg.register(fixtures.agentRegistration);
    reg.transitionEvaluation(producerInstanceId, "APPROVED");
    reg.transitionLifecycle(producerInstanceId, "ACTIVE");
    const resolution = reg.resolve(producerInstanceId);
    if (!resolution.resolved || resolution.quarantined) {
      throw new SelfPilotError("DENY_ADAPTER_QUARANTINED", `Agent identity did not resolve: ${resolution.reason ?? "quarantined"}`);
    }
    chain.agent_identity = { agent_instance_id: producerInstanceId, permitted_roles: resolution.identity.permitted_roles, authority_ceiling: resolution.identity.authority_ceiling };
    return { registry: reg };
  });

  // ---- Step 4: context receipt (federation mint + issue, read-only) ------
  const federationState = step("CONTEXT_RECEIPT", "context-federation-service", "mint + issue (effectiveness, scope-subset, survivor-set)", () => {
    const federation = new ContextFederationService({ workPackageService: wp.service, now });
    const minted = mintReceiptDocument({ ...fixtures.receiptIntent, candidateSources: fixtures.candidateSources });
    const issued = federation.issueReceipt({
      document: minted.document,
      candidateSources: fixtures.candidateSources,
      actorId: producerInstanceId,
      authorityRef: "g_e_selfpilot",
      baseline,
      idempotencyKey: "sp_issue"
    });
    chain.context_receipt = { receipt_id: issued.receiptId, bound_wp_version: issued.boundWpVersion, content_hash: minted.document.content_hash, source_references: minted.document.source_references };
    return { federation, receiptId: issued.receiptId, receiptDocument: minted.document };
  });

  // ---- Step 5: durable session (fixture) — receipt bound to session ------
  step("DURABLE_SESSION", "context-federation-service", "verifyReceipt read-only provenance (session binding)", () => {
    const verified = assertAllow(
      federationState.federation.verifyReceipt(projectId, federationState.receiptId, {
        sessionId, actorId: producerInstanceId, baseline
      }),
      "DENY_SESSION_BINDING",
      "Context receipt is not bound to the durable session"
    );
    chain.durable_session = { session_id: sessionId, receipt_version: verified.version, binding: "VERIFIED_READ_ONLY" };
    return chain.durable_session;
  });

  // ---- Step 6: runtime adapter (EXISTING read-only facade — no spawn) ----
  const hostState = step("RUNTIME_ADAPTER", "host-runtime-agent", "registry resolve (read-only facade; no process spawn)", () => {
    const host = new HostRuntimeAgent({ registry: registry.registry, eventLedger, projectId, workPackageId, sessionId });
    const resolution = host.resolveAdapter(producerInstanceId);
    if (!resolution.resolved) {
      throw new SelfPilotError("DENY_UNRESOLVED_ADAPTER", `Runtime adapter quarantined: ${resolution.reason}`);
    }
    chain.runtime_adapter = { resolved: true, spawned: false, runtime_product_id: resolution.identity.runtime_product_id };
    return { host };
  });

  // ---- Step 7: workspace lease (mint/evaluate; no worktree) --------------
  step("WORKSPACE_LEASE", "workspace-lease-policy + workspace-lease-ledger", "mint + evaluateLease (write-set containment) + durable append", () => {
    const intent = fixtures.leaseIntent;
    const minted = mintLease({ leaseId: intent.leaseId, sessionId, actorId: producerInstanceId, writeSet: intent.writeSet, issuedAt: nowMs, ttl: intent.ttlMs });
    if (!minted.ok) throw new SelfPilotError(minted.code, `Lease mint denied: ${minted.message ?? minted.code}`);
    const lease = minted.lease;

    const leaseBody = {
      lease_id: intent.leaseId, version: 1, project_id: projectId, work_package_id: workPackageId,
      session_id: sessionId, actor_id: producerInstanceId, write_set: [...lease.writeSet],
      issued_at: new Date(lease.issuedAt).toISOString(), ttl: lease.ttl, expires_at: new Date(lease.expiresAt).toISOString()
    };
    const leaseRecord = sealed(leaseBody);
    const appended = workspaceLeaseLedger.appendLease(leaseRecord, {
      expectedSequence: workspaceLeaseLedger.read().length,
      idempotencyKey: "sp_lease",
      now: nowMs
    });
    if (!appended || appended.ok !== true) {
      throw new SelfPilotError(appended?.code ?? "DENY_LEASE_APPEND", `Lease durable append denied: ${appended?.message ?? "unknown"}`);
    }

    // Prove the gate BOTH ways: a contained request is allowed, an over-reaching
    // request is denied (DENY_LEASE_WRITE_SET_EXCEEDED via write-set-policy).
    const contained = evaluateLease(lease, { now: nowMs, requestedWriteSet: intent.containedRequest });
    if (!contained.ok) throw new SelfPilotError(contained.code, `Contained write set was wrongly denied: ${contained.message}`);
    const overReach = evaluateLease(lease, { now: nowMs, requestedWriteSet: intent.overReachingRequest });
    if (overReach.ok) throw new SelfPilotError("DENY_LEASE_OVERREACH_NOT_BLOCKED", "Over-reaching write set was NOT blocked by the lease gate");

    chain.workspace_lease = {
      lease_id: intent.leaseId, expires_at: leaseBody.expires_at, worktree_materialized: false,
      contained_request_allowed: true, over_reach_denied_code: overReach.code
    };
    return chain.workspace_lease;
  });

  // ---- Step 8: observed execution (read-only host events) ----------------
  const observedState = step("OBSERVED_EXECUTION", "host-runtime-agent + access-mode-policy + event-family-policy", "Observe-mode ladder + family classification + read-only emission", () => {
    // Access-mode gate: read-only Observe is allowed; escalation to Control denies.
    const observeGate = evaluateAccessRequest({ requestedMode: "Observe", grantedMode: "Observe" });
    if (!observeGate.ok) throw new SelfPilotError(observeGate.code, `Observe access mode wrongly denied: ${observeGate.message}`);
    const escalationGate = evaluateAccessRequest({ requestedMode: "Control", grantedMode: "Observe" });
    if (escalationGate.ok) throw new SelfPilotError("DENY_ACCESS_ESCALATION_NOT_BLOCKED", "Escalation to Control was NOT blocked by the access-mode ladder");

    const emitted = [];
    for (const obs of fixtures.observations) {
      const eventType = `${obs.domain}.observed`;
      const family = classifyEventType({ eventType });
      if (!family.ok) throw new SelfPilotError(family.code, `Event family unknown for ${eventType}: ${family.message}`);
      const { event, ledgerSequence } = hostState.host.observe(producerInstanceId, obs);
      if (event.observed_fact.read_only !== true) {
        throw new SelfPilotError("DENY_NOT_READ_ONLY", `Observation ${eventType} was not marked read_only`);
      }
      emitted.push({
        eventId: event.event_id, eventType: event.event_type, family: family.family,
        ledgerSequence, contentHash: event.content_hash, idempotencyKey: event.idempotency_key,
        source: event.source, readOnly: true
      });
    }
    chain.observed_execution = {
      event_count: emitted.length, access_mode: "Observe", escalation_denied_code: escalationGate.code,
      events: emitted.map((e) => ({ event_type: e.eventType, family: e.family, sequence: e.ledgerSequence }))
    };
    return { emitted };
  });

  // ---- Step 9: event + evidence (append to fixture ledgers) --------------
  const evidenceState = step("EVENT_AND_EVIDENCE", "governed-ledgers + evidence-envelope-service", "event chain verify + register/seal + SoD (self-verify blocked)", () => {
    // The event ledger hash chain is verified here; its head hash is derived
    // from each event's server occurred_at (an ambient timestamp inside the
    // ratified HostRuntimeAgent), so it is intentionally NOT embedded in the
    // trace — the trace records only the deterministic `verified` + `count`
    // facts, keeping the whole trace byte-identical across replays.
    const eventChain = eventLedger.verify();
    const evidence = new EvidenceEnvelopeService({ durableLedger: evidenceSealLedger, now });
    const evidenceStates = [];
    for (const envelope of fixtures.evidenceEnvelopes) {
      const sealedEnvelope = sealed(envelope);
      evidence.registerEnvelope(sealedEnvelope);
      const sealResult = evidence.sealEnvelope(envelope.evidence_id, envelope.version);
      // Open the independent-verification window (requesting is not verifying).
      evidence.requestVerification(envelope.evidence_id, envelope.version, producerInstanceId);
      // NEGATIVE PROOF: the producer cannot self-render the REV verdict (SoD).
      let selfVerifyDenied = null;
      try {
        evidence.recordVerification(envelope.evidence_id, envelope.version, producerInstanceId, "pass");
      } catch (err) {
        selfVerifyDenied = err.code ?? null;
      }
      if (selfVerifyDenied !== "DENY_VERIFIER_IS_PRODUCER") {
        throw new SelfPilotError("DENY_SELF_VERIFY_NOT_BLOCKED", `Producer self-verification was not blocked (got ${selfVerifyDenied})`);
      }
      const status = evidence.resolveAcceptedStatus(envelope.evidence_id, envelope.version);
      if (status.accepted) {
        throw new SelfPilotError("DENY_UNACCEPTED_ADVANCED", "Unaccepted evidence must not resolve as accepted");
      }
      evidenceStates.push({
        evidenceId: envelope.evidence_id, sealed: sealResult.verificationStatus === "SEALED",
        verificationStatus: status.status, accepted: status.accepted,
        selfVerifyDeniedCode: selfVerifyDenied, contentHash: sealedEnvelope.content_hash
      });
    }
    chain.event_and_evidence = {
      event_ledger: { count: eventChain.count, verified: eventChain.valid === true },
      evidence: evidenceStates.map((e) => ({ evidence_id: e.evidenceId, verification_status: e.verificationStatus, accepted: e.accepted, self_verify_denied: e.selfVerifyDeniedCode }))
    };
    return { evidenceStates };
  });

  // ---- Step 10: independent REV/QA slots (pending, not self-approved) -----
  step("INDEPENDENT_REVIEW_SLOTS", "evidence-envelope-service (SoD)", "REV/QA recorded pending; producer cannot self-approve", () => {
    chain.independent_review = {
      rev: { status: "PENDING_INDEPENDENT", assignee: null, verdict: null },
      qa: { status: "PENDING_INDEPENDENT", assignee: null, verdict: null },
      evidence_acceptance: { status: "PENDING", acceptor: null, note: "acceptor != producer != verifier (SoD); operator-assigned" }
    };
    return chain.independent_review;
  });

  // ---- Step 11: GOV decision SLOT (empty, operator-only — never filled) ---
  step("GOV_DECISION_SLOT", "operator-only", "HUMAN_GOV_REQUIRED — pilot never fills the slot", () => {
    chain.gov_decision = GOV_DECISION_SLOT;
    return GOV_DECISION_SLOT;
  });

  // ---- Step 12: outcome receipt (fixture, non-effective) -----------------
  step("OUTCOME_RECEIPT", "contract-validator", "outcome-receipt schema (non-effective candidate outcome)", () => {
    validateContract("outcomeReceipt", fixtures.outcomeReceipt);
    chain.outcome_receipt = {
      outcome_id: fixtures.outcomeReceipt.outcome_id,
      outcome_status: fixtures.outcomeReceipt.outcome_status,
      reversion_required: fixtures.outcomeReceipt.reversion_required,
      effective: false
    };
    return chain.outcome_receipt;
  });

  // ---- Replayable trace view over the observed streams -------------------
  const emitted = observedState?.emitted ?? [];
  const evidenceStates = evidenceState?.evidenceStates ?? [];
  const receiptDocument = federationState?.receiptDocument ?? null;
  const replay = assembleReplayPackage(
    {
      eventRecords: emitted.map((e) => ({
        sourceClass: "observed_fact", sequence: e.ledgerSequence,
        idempotencyKey: e.idempotencyKey, contentHash: e.contentHash, source: e.source
      })),
      evidenceRecords: evidenceStates.map((e) => ({
        sourceClass: "observed_fact", contentHash: e.contentHash, source: "host-runtime-agent"
      })),
      contextReceipts: receiptDocument
        ? [{ sourceClass: "provider_assertion", contentHash: receiptDocument.content_hash, source: "context-federation" }]
        : [],
      policyDecisions: [
        { sourceClass: "inference", source: "access-mode-policy" },
        { sourceClass: "inference", source: "workspace-lease-policy" }
      ]
    },
    { now: now().toISOString() }
  );

  return deepFreeze({
    schema: "secb.self-pilot.read-only-trace",
    schema_version: 1,
    candidate: true,
    p0_19_complete: false,
    p0_20_verdict_rendered: false,
    activation: false,
    mode: "READ_ONLY",
    read_only: true,
    authorized_execution: false,
    self_authorized: false,
    project_id: projectId,
    work_package_id: workPackageId,
    baseline,
    session_id: sessionId,
    producer_instance_id: producerInstanceId,
    halted,
    halted_at: haltedAt,
    halt_reason: haltReason,
    completed: !halted,
    steps,
    chain,
    gov_decision: GOV_DECISION_SLOT,
    replay,
    self_certification: {
      agent_id: "claude-cortex-p0-19-selfpilot-01",
      peer_agent_id: null,
      certification_scope: "advisory_only",
      execution_authority: false,
      approval_authority: false,
      ready_for_operator_review: !halted
    }
  });
}
