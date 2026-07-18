import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { AuthorityEngine } from "../src/control/authority-engine.mjs";
import { canonicalFingerprint } from "../src/contracts/canonical-fingerprint.mjs";
import { TransitionEngine } from "../src/control/state-machine.mjs";
import { DecisionLedger, KnowledgeLedger, OutcomeLedger } from "../src/ledger/temporal-ledgers.mjs";
import { SkillResolver } from "../src/registry/skill-resolver.mjs";
import { WorkPackageContractService, WorkPackageServiceError } from "../src/services/work-package-service.mjs";

// V-item conformance stubs — BLOCKED pending Codex P0-08/P0-09 and other P0 deliverables.
// Each stub documents what it will test and which dependency unblocks it.
// When a dependency lands, replace the skip with the actual test.

test("V-002 project scope: approved repository enforced", { skip: "MECHANISM DELIVERED (projectResolver binding, unit-tested with the resolution shape of ProjectContractService.resolveEffective); executable conformance with the real P0-08 service unblocks on the merged tree" }, () => {
  // Positive: work package scoped to approved repository proceeds
  // Negative: work package referencing unapproved repository rejected
  // Post-merge: wire projectResolver = (id) => projectService.resolveEffective({ projectId: id })
});

test("V-004 context: context receipt federation and retrieval", { skip: "BLOCKED: P0-10 R2 gated on P0-09 merge (see p0-10-gov-disposition.yaml)" }, () => {
  // Executable plan (frozen per GOV-P010-01..07 disposition):
  // Positive: drive a work package to AUTHORIZED via WorkPackageContractService
  //   (V-009 pattern), issueReceipt bound to (project, wp version, baseline,
  //   session), consumeReceipt within validity returns the sealed document;
  //   after compactReceipt, the chain head consumes and the SUPERSEDED parent
  //   denies with a chain-head pointer.
  // Negative: consume after valid_until passes (advance injected now());
  //   consume a never-issued receipt_id; consume with wrong session_id;
  //   consume after a newer wp version reaches AUTHORIZED (supersession);
  //   tampered document fails hash recompute — all typed NONE, fail closed.
});

// V-005 unblocked: the Role/SoD engine (AuthorityEngine) has been delivered
// since the foundation commits; the stub's blocker was stale.
test("V-005 SoD: role assignment independence validated", () => {
  const window = {
    projectId: "prj_v005",
    workPackageId: "wp_v005",
    validFrom: "2026-07-01T00:00:00Z",
    validUntil: "2026-12-31T00:00:00Z",
    status: "ACTIVE"
  };
  const grant = (id, actorId, roles, allowedTransitions) =>
    ({ ...window, grantId: id, decisionId: `d_${id}`, actorId, roles, allowedTransitions });

  // Positive: independent actors holding producer/reviewer/QA roles coexist
  const engine = new AuthorityEngine({
    grants: [
      grant("g_engin", "engin", ["ENGIN"], ["WorkPackage:READY->RUNNING"]),
      grant("g_rev", "rev", ["REV"], ["WorkPackage:SELF_VERIFIED->REVIEW"]),
      grant("g_qa", "qa", ["QA"], ["WorkPackage:REVIEW->QA"])
    ],
    now: () => new Date("2026-07-18T10:00:00Z")
  });
  const allowed = engine.authorize({
    objectType: "WorkPackage", currentState: "SELF_VERIFIED", requestedState: "REVIEW",
    actorId: "rev", authorityRef: "g_rev",
    projectId: "prj_v005", workPackageId: "wp_v005",
    producerActorId: "engin"
  });
  assert.equal(allowed.allowed, true);
  assert.equal(allowed.role, "REV");

  // Negative: one actor holding conflicting roles in the same scope is
  // rejected at configuration time, before any transition is attempted
  assert.throws(
    () => new AuthorityEngine({
      grants: [grant("g_dual", "dual", ["ENGIN", "REV"], ["WorkPackage:READY->RUNNING"])],
      now: () => new Date("2026-07-18T10:00:00Z")
    }),
    (error) => error.name === "AuthorityConfigurationError" && error.code === "SOD_ROLE_CONFLICT"
  );

  // Negative: dynamic SoD — a reviewer who produced the work is denied
  const sod = engine.authorize({
    objectType: "WorkPackage", currentState: "SELF_VERIFIED", requestedState: "REVIEW",
    actorId: "rev", authorityRef: "g_rev",
    projectId: "prj_v005", workPackageId: "wp_v005",
    producerActorId: "rev"
  });
  assert.equal(sod.allowed, false);
  assert.equal(sod.code, "DENY_SOD");
});

// V-009 unblocked by P0-09 Work Package service (see p0-09-gov-disposition.yaml).
test("V-009 approval: bound approval on work package acceptance", () => {
  const window = {
    projectId: "prj_v009",
    workPackageId: "wp_v009",
    validFrom: "2026-07-01T00:00:00Z",
    validUntil: "2026-12-31T00:00:00Z",
    status: "ACTIVE"
  };
  const makeService = () => new WorkPackageContractService({
    grants: [
      { ...window, grantId: "g_engin", decisionId: "d_engin", actorId: "engin", roles: ["ENGIN"], allowedTransitions: ["WorkPackage:DRAFT->PLANNED", "WorkPackage:AUTHORIZED->READY", "WorkPackage:READY->RUNNING", "WorkPackage:RUNNING->SELF_VERIFIED"] },
      { ...window, grantId: "g_rev", decisionId: "d_rev", actorId: "rev", roles: ["REV"], allowedTransitions: ["WorkPackage:PLANNED->REVIEWED", "WorkPackage:SELF_VERIFIED->REVIEW"] },
      { ...window, grantId: "g_qa", decisionId: "d_qa", actorId: "qa", roles: ["QA"], allowedTransitions: ["WorkPackage:REVIEW->QA"] },
      { ...window, grantId: "g_gov", decisionId: "d_gov", actorId: "gov", roles: ["GOV"], allowedTransitions: ["WorkPackage:REVIEWED->AUTHORIZED", "WorkPackage:QA->GOV_DECISION", "WorkPackage:GOV_DECISION->ACCEPTED"] }
    ],
    now: () => new Date("2026-07-18T10:00:00Z")
  });
  const drive = (service, throughState) => {
    service.createWorkPackage({
      work_package_id: "wp_v009",
      version: 1,
      project_id: "prj_v009",
      objective: "V-009 bound approval conformance",
      risk_class: "R2",
      status: "DRAFT",
      baseline: "90c84a67e36a25941bc0983a0e687745919eca8c",
      scope: ["src/"],
      non_scope: ["production"],
      acceptance_criteria: ["approval is bound"],
      roles: { producer: "engin" },
      allowed_paths: ["C:/laragon/www/SecB"],
      prohibited_paths: ["outside"],
      evidence_obligations: ["self:tests", "review-report", "qa-report"],
      valid_until: "2026-08-01T00:00:00Z"
    }, { idempotencyKey: "v009_create", actorId: "engin", authorityRef: "g_engin" });
    const steps = [
      ["PLANNED", "engin", "g_engin", null],
      ["REVIEWED", "rev", "g_rev", null],
      ["AUTHORIZED", "gov", "g_gov", null],
      ["READY", "engin", "g_engin", null],
      ["RUNNING", "engin", "g_engin", null],
      ["SELF_VERIFIED", "engin", "g_engin", "self:tests"],
      ["REVIEW", "rev", "g_rev", "review-report"],
      ["QA", "qa", "g_qa", "qa-report"],
      ["GOV_DECISION", "gov", "g_gov", null],
      ["ACCEPTED", "gov", "g_gov", null]
    ];
    let last = null;
    for (const [state, actorId, authorityRef, obligation] of steps) {
      last = service.submitTransition({
        projectId: "prj_v009",
        workPackageId: "wp_v009",
        version: 1,
        requestedState: state,
        actorId,
        authorityRef,
        policyDecision: "ALLOW",
        evidence: [obligation ? { ref: `ev_${state}`, obligation } : { ref: `ev_${state}` }],
        idempotencyKey: `v009_${state}`,
        reasonCode: "V009"
      });
      if (state === throughState) return { service, last };
    }
    return { service, last };
  };

  // Positive: independent GOV approver accepts with all obligations evidenced
  const accepted = drive(makeService(), "ACCEPTED").last;
  assert.equal(accepted.state, "ACCEPTED");
  assert.equal(accepted.authorityDecisionId, "d_gov");

  // Negative: the executor cannot approve its own work package
  const { service: sodService } = drive(makeService(), "QA");
  assert.throws(
    () => sodService.submitTransition({
      projectId: "prj_v009",
      workPackageId: "wp_v009",
      version: 1,
      requestedState: "GOV_DECISION",
      actorId: "engin",
      authorityRef: "g_gov",
      policyDecision: "ALLOW",
      evidence: [{ ref: "ev_self_approve" }],
      idempotencyKey: "v009_self_approve",
      reasonCode: "V009"
    }),
    (error) => error instanceof WorkPackageServiceError && error.code === "DENY_SOD"
  );

  // Negative: approval without the required evidence chain is rejected
  const { service: bareService } = drive(makeService(), "SELF_VERIFIED");
  bareService.submitTransition({
    projectId: "prj_v009", workPackageId: "wp_v009", version: 1,
    requestedState: "REVIEW", actorId: "rev", authorityRef: "g_rev",
    policyDecision: "ALLOW", evidence: [{ ref: "ev_rev_bare" }],
    idempotencyKey: "v009_rev_bare", reasonCode: "V009"
  });
  bareService.submitTransition({
    projectId: "prj_v009", workPackageId: "wp_v009", version: 1,
    requestedState: "QA", actorId: "qa", authorityRef: "g_qa",
    policyDecision: "ALLOW", evidence: [{ ref: "ev_qa_bare" }],
    idempotencyKey: "v009_qa_bare", reasonCode: "V009"
  });
  assert.throws(
    () => bareService.submitTransition({
      projectId: "prj_v009", workPackageId: "wp_v009", version: 1,
      requestedState: "GOV_DECISION", actorId: "gov", authorityRef: "g_gov",
      policyDecision: "ALLOW", evidence: [{ ref: "ev_gov_bare" }],
      idempotencyKey: "v009_gov_bare", reasonCode: "V009"
    }),
    (error) => error instanceof WorkPackageServiceError && error.code === "DENY_EVIDENCE_INSUFFICIENT"
  );
});

test("V-010 terminal: observer role in project-scoped session", { skip: "BLOCKED: P0-08 Project Contract service" }, () => {
  // Positive: read-only observer session within project scope
  // Negative: observer attempting mutation blocked
});

test("V-011 redaction: data classification enforcement on events", { skip: "BLOCKED: P0-08 security policy surface" }, () => {
  // Positive: RESTRICTED data redacted before ledger append
  // Negative: unredacted RESTRICTED data rejected at envelope validation
});

// Audit note 2026-07-18: wave-001 recorded P0-14 as delivered, but only the
// Event and Evidence ledgers existed then. P0-14 temporal ledgers delivered
// 2026-07-19 (src/ledger/temporal-ledgers.mjs) — V-012/V-017/V-018 unblocked.
// V-013 remains blocked on the skill resolver.
const temporalHarness = () => {
  const dir = mkdtempSync(join(tmpdir(), "secb-v-temporal-"));
  const decisions = new DecisionLedger({ filePath: join(dir, "d.ndjson") });
  const knowledge = new KnowledgeLedger({
    filePath: join(dir, "k.ndjson"),
    evidenceLookup: (ref) => (ref === "ev_ok" ? { evidence_id: "ev_ok", verification_status: "ACCEPTED" } : ref === "ev_raw" ? { evidence_id: "ev_raw", verification_status: "CAPTURED" } : null)
  });
  const outcomes = new OutcomeLedger({
    filePath: join(dir, "o.ndjson"),
    decisionLookup: (ref) => decisions.read().find((r) => r.entry.entryId === ref) ?? null
  });
  const base = {
    version: 1,
    project_id: "prj_v", work_package_id: "wp_v", session_id: "ses_v", actor_id: "actor_v"
  };
  return { decisions, knowledge, outcomes, base, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
};

test("V-012 memory: memory record temporal boundary", () => {
  const h = temporalHarness();
  try {
    h.knowledge.appendClaim({
      ...h.base, claim_id: "kc_v012", statement: "fact", derivation: "from ev_ok",
      truth_status: "verified_true", evidence_refs: ["ev_ok"],
      claimed_at: "2026-07-19T00:00:00Z", valid_from: "2026-07-19T00:00:00Z",
      valid_until: "2026-08-01T00:00:00Z", retention_policy: "short"
    }, { expectedSequence: 0, idempotencyKey: "v012_1" });
    // Positive: within the temporal claim window the record resolves
    assert.equal(h.knowledge.resolveClaim("kc_v012", { at: "2026-07-20T00:00:00Z" }).code, "ALLOW");
    // Negative: beyond the retention window the record fails closed
    assert.equal(h.knowledge.resolveClaim("kc_v012", { at: "2026-09-01T00:00:00Z" }).code, "DENY_TEMPORAL_BOUNDARY");
  } finally { h.cleanup(); }
});

// V-013 unblocked 2026-07-19: P0-14 delivered and the skill resolver
// implements the SECB-SKILL-001 distribution rule. Publication requires a
// HUMAN_PROMOTION entry that RESOLVES in the governed DecisionLedger —
// self-declared promotion entries are forgeries and are refused
// (IMM-P014-R2-01).
test("V-013 skill: skill lifecycle through SkillsHub", () => {
  const dir = mkdtempSync(join(tmpdir(), "secb-v013-"));
  const promotions = new DecisionLedger({ filePath: join(dir, "d.ndjson") });
  promotions.appendDecision({
    decision_id: "d_promo", version: 1,
    project_id: "prj_v013", work_package_id: "wp_v013", session_id: "ses_v013",
    actor_id: "human-gov", decision_type: "GOVERNANCE", outcome: "PROMOTE_SKILL",
    rationale: "Skill promotion after independent review", authority_ref: "grant_gov",
    evidence_refs: ["ev_skill_eval"], decided_at: "2026-07-19T00:00:00Z",
    valid_from: "2026-07-19T00:00:00Z", valid_until: "2026-12-31T00:00:00Z"
  }, { expectedSequence: 0, idempotencyKey: "v013_promo" });
  // strongest lookup contract: resolveEffective at a trusted instant, so
  // reverted or expired promotion decisions deny registration
  const resolver = new SkillResolver({
    decisionLookup: (ref) => promotions.resolveEffective(ref, { at: "2026-07-19T12:00:00Z" }).decision
  });
  const manifest = (overrides = {}) => ({
    skill_id: "SKILL-V013",
    version: "1.0.0",
    name: "V-013 conformance skill",
    status: "PUBLISHED",
    owner: "stem-lane",
    source: { repository: "C:/laragon/www/SecB", commit_sha: "a".repeat(40), licence: "internal" },
    purpose: "conformance",
    supported_runtimes: ["claude-code"],
    project_scopes: ["prj_v013"],
    max_data_classification: "INTERNAL",
    evidence_refs: ["ev_skill_1"],
    approval_history: [
      { decision_id: "d_promo", decision_type: "HUMAN_PROMOTION", approved_by: "human-gov", approved_at: "2026-07-19T00:00:00Z" }
    ],
    revocation_conditions: ["regression"],
    ...overrides
  });

  // Positive: a published, human-promoted skill resolves in scope
  resolver.registerSkill(manifest());
  const resolved = resolver.resolveSkill("SKILL-V013", "1.0.0", {
    projectId: "prj_v013", runtime: "claude-code", dataClassification: "INTERNAL"
  });
  assert.equal(resolved.code, "ALLOW");
  assert.equal(resolved.skill.skill_id, "SKILL-V013");

  // Negative: unpublished lifecycle states are blocked at invocation
  resolver.registerSkill(manifest({ skill_id: "SKILL-V013-CAND", status: "CANDIDATE", approval_history: [] }));
  assert.equal(
    resolver.resolveSkill("SKILL-V013-CAND", "1.0.0", { projectId: "prj_v013", runtime: "claude-code", dataClassification: "INTERNAL" }).code,
    "DENY_NOT_PUBLISHED"
  );
  // Negative: publication without human promotion is refused at registration
  assert.throws(
    () => resolver.registerSkill(manifest({ skill_id: "SKILL-V013-ROGUE", approval_history: [] })),
    (error) => error.name === "SkillResolverError" && error.code === "DENY_UNAPPROVED_PUBLICATION"
  );
  // Negative: a FABRICATED promotion entry (not in the decision ledger)
  // is a forgery, not a formality — refused at registration
  assert.throws(
    () => resolver.registerSkill(manifest({
      skill_id: "SKILL-V013-FORGED",
      approval_history: [{ decision_id: "d_forged_999", decision_type: "HUMAN_PROMOTION", approved_by: "attacker-as-human", approved_at: "2026-07-19T00:00:00Z" }]
    })),
    (error) => error.name === "SkillResolverError" && error.code === "DENY_UNAPPROVED_PUBLICATION"
  );
  // Negative: composite-key delimiter in identity fields is denied
  assert.throws(
    () => resolver.registerSkill(manifest({ skill_id: "a@b" })),
    (error) => error.name === "SkillResolverError" && error.code === "DENY_ID_CHARSET"
  );
  // Negative: a recorded REVOCATION entry poisons resolution even while
  // the status field still reads PUBLISHED
  resolver.registerSkill(manifest({
    skill_id: "SKILL-V013-REVOKED",
    approval_history: [
      { decision_id: "d_promo", decision_type: "HUMAN_PROMOTION", approved_by: "human-gov", approved_at: "2026-07-19T00:00:00Z" },
      { decision_id: "d_revoke", decision_type: "REVOCATION", approved_by: "human-gov", approved_at: "2026-07-19T01:00:00Z" }
    ]
  }));
  assert.equal(
    resolver.resolveSkill("SKILL-V013-REVOKED", "1.0.0", { projectId: "prj_v013", runtime: "claude-code", dataClassification: "INTERNAL" }).code,
    "DENY_REVOKED"
  );
  // Negative: out-of-scope project, runtime, and data class all deny
  assert.equal(resolver.resolveSkill("SKILL-V013", "1.0.0", { projectId: "prj_other", runtime: "claude-code", dataClassification: "INTERNAL" }).code, "DENY_PROJECT_SCOPE");
  assert.equal(resolver.resolveSkill("SKILL-V013", "1.0.0", { projectId: "prj_v013", runtime: "python-runner", dataClassification: "INTERNAL" }).code, "DENY_RUNTIME");
  assert.equal(resolver.resolveSkill("SKILL-V013", "1.0.0", { projectId: "prj_v013", runtime: "claude-code", dataClassification: "RESTRICTED" }).code, "DENY_DATA_CLASSIFICATION");
  assert.equal(resolver.resolveSkill("SKILL-GHOST", "1.0.0", { projectId: "prj_v013", runtime: "claude-code", dataClassification: "INTERNAL" }).code, "DENY_UNKNOWN_SKILL");
  assert.equal(resolver.resolveSkill("SKILL-V013", "1.0.0", {}).code, "DENY_UNBOUND_CONTEXT");
  rmSync(dir, { recursive: true, force: true });
});

test("V-014 MCP: credential-bounded MCP invocation", { skip: "BLOCKED: P0-10 Context federation + P0-11 A2A" }, () => {
  // Positive: MCP method invoked with bounded credential
  // Negative: MCP method without valid credential rejected
});

test("V-015 A2A: structured handoff non-escalation", { skip: "BLOCKED: P0-11 Handoff/A2A envelope" }, () => {
  // Positive: handoff with equal or lesser authority proceeds
  // Negative: handoff attempting authority escalation rejected
});

test("V-016 recovery: checkpoint resume and drift detection", { skip: "BLOCKED: P0-10 Checkpoint federation" }, () => {
  // Positive: verified checkpoint resumes from correct state
  // Negative: drifted checkpoint detected and denied
});

test("V-017 knowledge: temporal knowledge claim derivation", () => {
  const h = temporalHarness();
  try {
    const claimBody = (id, refs) => ({
      ...h.base, claim_id: id, statement: "derived", derivation: "chain",
      truth_status: "partially_supported", evidence_refs: refs,
      claimed_at: "2026-07-19T00:00:00Z", valid_from: "2026-07-19T00:00:00Z",
      valid_until: "2026-08-01T00:00:00Z", retention_policy: "short"
    });
    // Positive: claim derived from verified/accepted evidence
    const ok = h.knowledge.appendClaim(claimBody("kc_v017", ["ev_ok"]), { expectedSequence: 0, idempotencyKey: "v017_1" });
    assert.equal(ok.replayed, false);
    // Negative: unresolvable or unverified evidence chains are rejected
    assert.throws(
      () => h.knowledge.appendClaim(claimBody("kc_v017_b", ["ev_missing"]), { expectedSequence: 1, idempotencyKey: "v017_2" }),
      (error) => error.code === "DENY_EVIDENCE_CHAIN"
    );
    assert.throws(
      () => h.knowledge.appendClaim(claimBody("kc_v017_c", ["ev_raw"]), { expectedSequence: 1, idempotencyKey: "v017_3" }),
      (error) => error.code === "DENY_EVIDENCE_CHAIN"
    );
  } finally { h.cleanup(); }
});

test("V-018 outcome: outcome receipt validation", () => {
  const h = temporalHarness();
  try {
    h.decisions.appendDecision({
      ...h.base, decision_id: "dec_v018", decision_type: "GOVERNANCE", outcome: "ACCEPT",
      rationale: "accepted", authority_ref: "grant_gov", evidence_refs: ["ev_ok"],
      decided_at: "2026-07-19T00:00:00Z", valid_from: "2026-07-19T00:00:00Z", valid_until: "2026-12-31T00:00:00Z"
    }, { expectedSequence: 0, idempotencyKey: "v018_d" });
    const receipt = (id, status, revert) => ({
      ...h.base, outcome_id: id, decision_ref: "dec_v018", knowledge_refs: [], skill_refs: [],
      outcome_status: status, details: "observed", evidence_refs: ["ev_out"],
      observed_at: "2026-07-19T01:00:00Z", reversion_required: revert
    });
    // Positive: receipt validates the decision
    assert.equal(h.outcomes.appendOutcome(receipt("out_v018_a", "VALIDATED", false), { expectedSequence: 0, idempotencyKey: "v018_1" }).reversionRequired, false);
    // Negative: invalidation triggers the reversion obligation
    assert.equal(h.outcomes.appendOutcome(receipt("out_v018_b", "INVALIDATED", true), { expectedSequence: 1, idempotencyKey: "v018_2" }).reversionRequired, true);
    assert.throws(
      () => h.outcomes.appendOutcome(receipt("out_v018_c", "INVALIDATED", false), { expectedSequence: 2, idempotencyKey: "v018_3" }),
      (error) => error.code === "DENY_INCONSISTENT_REVERSION"
    );
  } finally { h.cleanup(); }
});

// TransitionEngine hardening tests (TE-H1..H4) — implemented on the
// operator-authorized coordination branch (transition-engine-hardening-spec.yaml,
// operator_disposition). Codex-lane acknowledgement required before merge.

const teRequest = (overrides = {}) => ({
  objectType: "Project",
  objectId: "prj_te",
  objectVersion: 1,
  projectId: "prj_te",
  workPackageId: "wp_te",
  currentState: "DRAFT",
  requestedState: "REVIEW",
  actorId: "te-actor",
  authorityRef: "te-grant",
  policyDecision: "ALLOW",
  evidenceRefs: ["ev_te"],
  idempotencyKey: "idem_te",
  timestamp: "2026-07-18T00:00:00Z",
  reasonCode: "TE_TEST",
  ...overrides
});

const teEngine = (opts = {}) => new TransitionEngine({
  authorize: () => ({ allowed: true, decisionId: "d_te" }),
  now: () => new Date("2026-07-18T12:00:00Z"),
  ...opts
});

test("TE-H1 engine: strict scalar validation on transition envelopes", () => {
  const denyTE = (overrides, code) => assert.throws(
    () => teEngine().transition(teRequest(overrides)),
    (error) => error.name === "TransitionDeniedError" && error.code === code
  );
  denyTE({ objectId: 123 }, "DENY_MALFORMED_REQUEST");
  denyTE({ reasonCode: "   " }, "DENY_MALFORMED_REQUEST");
  denyTE({ idempotencyKey: 42 }, "DENY_MALFORMED_REQUEST");
  denyTE({ smuggled: true }, "DENY_MALFORMED_REQUEST");
  denyTE({ evidenceRefs: ["ok", "  "] }, "DENY_MALFORMED_REQUEST");
  denyTE({ timestamp: 12345 }, "DENY_MALFORMED_REQUEST");
  denyTE({ producerActorId: 5 }, "DENY_MALFORMED_REQUEST");
  denyTE({ reviewerActorId: "  " }, "DENY_MALFORMED_REQUEST");
});

test("TE-H2 engine: server-derived timestamps; claimed timestamp excluded from replay identity", () => {
  const engine = teEngine();
  const first = engine.transition(teRequest());
  assert.equal(first.timestamp, "2026-07-18T12:00:00.000Z");
  assert.equal(first.claimedTimestamp, "2026-07-18T00:00:00Z");
  // clock-drifted replay: different claimed timestamp, same everything else
  const replay = engine.transition(teRequest({ timestamp: "2020-01-01T00:00:00Z" }));
  assert.equal(replay.replayed, true);
  assert.equal(replay.transitionId, first.transitionId);
});

test("TE-H3 engine: illegal edge never exercises the authority resolver", () => {
  let resolverCalls = 0;
  const engine = new TransitionEngine({
    authorize: () => { resolverCalls += 1; return { allowed: true, decisionId: "d_te" }; },
    now: () => new Date("2026-07-18T12:00:00Z")
  });
  assert.throws(
    () => engine.transition(teRequest({ requestedState: "ACTIVE" })),
    (error) => error.code === "DENY_UNDEFINED_TRANSITION"
  );
  assert.equal(resolverCalls, 0);
});

test("TE-H4 engine: shared canonical fingerprint is order-independent and deterministic", () => {
  const payload = { b: [2, { z: 1, a: 0 }], a: "x" };
  const reordered = { a: "x", b: [2, { a: 0, z: 1 }] };
  assert.equal(canonicalFingerprint(payload), canonicalFingerprint(reordered));
  assert.match(canonicalFingerprint(payload), /^[0-9a-f]{64}$/);
  // engine transitionId is derived from the shared fingerprint of the
  // timestamp-stripped request — property order must not matter
  const engine = teEngine();
  const first = engine.transition(teRequest());
  const reorderedRequest = Object.fromEntries(Object.entries(teRequest()).reverse());
  const replay = engine.transition(reorderedRequest);
  assert.equal(replay.transitionId, first.transitionId);
  assert.equal(replay.replayed, true);
});
