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
import { projectEvents } from "../src/ui/report-projections.mjs";
import { HandoffService, HandoffServiceError } from "../src/services/handoff-service.mjs";
import { ContextFederationService } from "../src/services/context-federation-service.mjs";
import { WorkPackageContractService, WorkPackageServiceError } from "../src/services/work-package-service.mjs";

// V-item conformance stubs — BLOCKED pending Codex P0-08/P0-09 and other P0 deliverables.
// Each stub documents what it will test and which dependency unblocks it.
// When a dependency lands, replace the skip with the actual test.

// V-002 project scope UNBLOCKED and moved to a live conformance case in
// tests/conformance-p0-18-candidate.test.mjs (P0-18 candidate): P0-08
// ProjectContractService is ratified on main @ 4abfff2, so effective-scope
// resolution is composed for real (positive approved-repo resolve; negative
// unrelated/unknown; adversarial forged-activation, decision-reuse, revoked).

// V-004 unblocked by P0-10 R2 ContextFederationService (gate waived 2026-07-19).
test("V-004 context: context receipt federation and retrieval", () => {
  const BASE = "90c84a67e36a25941bc0983a0e687745919eca8c";
  const win = { projectId: "prj_v004", workPackageId: "wp_v004", workPackageVersion: 1, validFrom: "2026-07-01T00:00:00Z", validUntil: "2026-12-31T00:00:00Z", status: "ACTIVE" };
  let nowMs = Date.parse("2026-07-18T10:00:00Z");
  const clock = () => new Date(nowMs);
  const grantSet = [
      { ...win, grantId: "g_e", decisionId: "d_e", actorId: "eng", roles: ["ENGIN"], allowedTransitions: ["WorkPackage:DRAFT->PLANNED"] },
      { ...win, grantId: "g_r", decisionId: "d_r", actorId: "rev", roles: ["REV"], allowedTransitions: ["WorkPackage:PLANNED->REVIEWED"] },
      { ...win, grantId: "g_g", decisionId: "d_g", actorId: "gov", roles: ["GOV"], allowedTransitions: ["WorkPackage:REVIEWED->AUTHORIZED"] }
  ];
  const wp = new WorkPackageContractService({
    grants: grantSet, authoritySource: () => grantSet, now: clock
  });
  wp.createWorkPackage({
    work_package_id: "wp_v004", version: 1, project_id: "prj_v004", objective: "v004", risk_class: "R2",
    status: "DRAFT", baseline: BASE, scope: ["src/"], non_scope: ["p"], acceptance_criteria: ["ok"],
    roles: { producer: "eng" }, allowed_paths: ["src/services"], prohibited_paths: ["o"], evidence_obligations: ["self:t"],
    valid_until: "2026-08-01T00:00:00Z"
  }, { idempotencyKey: "v004_c", actorId: "eng", authorityRef: "g_e" });
  let s = 0;
  for (const [st, a, g] of [["PLANNED", "eng", "g_e"], ["REVIEWED", "rev", "g_r"], ["AUTHORIZED", "gov", "g_g"]]) {
    wp.submitTransition({ projectId: "prj_v004", workPackageId: "wp_v004", version: 1, requestedState: st, actorId: a, authorityRef: g, policyDecision: "ALLOW", evidence: [{ ref: `e_${st}` }], idempotencyKey: `v004_t_${++s}`, reasonCode: "S" });
  }
  const svc = new ContextFederationService({ workPackageService: wp, now: clock });
  const src = [{ ref: "src1", projectId: "prj_v004", classification: "INTERNAL", current: true, verified: true, resolvable: true, relevance: 1 }];
  const doc = (() => {
    const base = {
      receipt_id: "v004_rc", version: 1, project_id: "prj_v004", objective_id: "o", work_package_id: "wp_v004",
      session_id: "v004_ses", assigned_role: "REV", authority_scope: ["src/services"], baseline_version: BASE,
      acceptance_criteria: ["review"], allowed_tools: [], allowed_skills: [], evidence_obligations: ["r"],
      freshness_timestamp: "2026-07-18T10:00:00Z", source_references: ["src1"]
    };
    return { ...base, content_hash: canonicalFingerprint(base) };
  })();

  // Positive: issue, then consume within validity returns the sealed document
  assert.equal(svc.issueReceipt({ document: doc, candidateSources: src, actorId: "eng", authorityRef: "g_e", baseline: BASE, idempotencyKey: "v004_i" }).state, "ISSUED");
  const consumed = svc.consumeReceipt("prj_v004", "v004_rc", { sessionId: "v004_ses", actorId: "rev", baseline: BASE });
  assert.equal(consumed.code, "ALLOW");
  assert.equal(consumed.receipt.receipt_id, "v004_rc");

  // Negative: wrong session, unknown receipt fail closed with typed NONE
  assert.equal(svc.consumeReceipt("prj_v004", "v004_rc", { sessionId: "other", actorId: "rev", baseline: BASE }).code, "DENY_SESSION_MISMATCH");
  assert.equal(svc.consumeReceipt("prj_v004", "ghost", { sessionId: "v004_ses", actorId: "rev", baseline: BASE }).code, "DENY_UNKNOWN_RECEIPT");
  // Negative: after valid_until the receipt fails closed
  nowMs = Date.parse("2026-07-20T00:00:00Z");
  assert.equal(svc.consumeReceipt("prj_v004", "v004_rc", { sessionId: "v004_ses", actorId: "rev", baseline: BASE }).code, "DENY_EXPIRED");
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
  const grantsForVersion = (version) => {
    const suffix = version === 1 ? "" : `_v${version}`;
    return [
      { ...window, workPackageVersion: version, grantId: `g_engin${suffix}`, decisionId: `d_engin${suffix}`, actorId: "engin", roles: ["ENGIN"], allowedTransitions: ["WorkPackage:DRAFT->PLANNED", "WorkPackage:AUTHORIZED->READY", "WorkPackage:READY->RUNNING", "WorkPackage:RUNNING->SELF_VERIFIED"] },
      { ...window, workPackageVersion: version, grantId: `g_rev${suffix}`, decisionId: `d_rev${suffix}`, actorId: "rev", roles: ["REV"], allowedTransitions: ["WorkPackage:PLANNED->REVIEWED", "WorkPackage:SELF_VERIFIED->REVIEW"] },
      { ...window, workPackageVersion: version, grantId: `g_qa${suffix}`, decisionId: `d_qa${suffix}`, actorId: "qa", roles: ["QA"], allowedTransitions: ["WorkPackage:REVIEW->QA"] },
      { ...window, workPackageVersion: version, grantId: `g_gov${suffix}`, decisionId: `d_gov${suffix}`, actorId: "gov", roles: ["GOV"], allowedTransitions: ["WorkPackage:REVIEWED->AUTHORIZED", "WorkPackage:QA->GOV_DECISION", "WorkPackage:GOV_DECISION->ACCEPTED"] }
    ];
  };
  const grantSet = [...grantsForVersion(1), ...grantsForVersion(2)];
  const makeService = () => new WorkPackageContractService({
    grants: grantSet,
    authoritySource: () => grantSet,
    now: () => new Date("2026-07-18T10:00:00Z")
  });
  const workPackage = (version = 1) => ({
    work_package_id: "wp_v009", version, project_id: "prj_v009",
    objective: "V-009 bound approval conformance", risk_class: "R2", status: "DRAFT",
    baseline: "6152897bf498754ee51b4546b58a644ce28d55dd", scope: ["src/"], non_scope: ["production"],
    acceptance_criteria: ["approval is bound"], roles: { producer: "engin" },
    allowed_paths: ["C:/laragon/www/SecB"], prohibited_paths: ["outside"],
    evidence_obligations: ["self:tests", "review-report", "qa-report"], valid_until: "2026-08-01T00:00:00Z"
  });
  const drive = (service, throughState) => {
    service.createWorkPackage(workPackage(), { idempotencyKey: "v009_create", actorId: "engin", authorityRef: "g_engin" });
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

  // Negative: GOV cannot manufacture missing lifecycle evidence in its decision envelope.
  assert.throws(
    () => bareService.submitTransition({
      projectId: "prj_v009", workPackageId: "wp_v009", version: 1,
      requestedState: "GOV_DECISION", actorId: "gov", authorityRef: "g_gov",
      policyDecision: "ALLOW",
      evidence: [
        { ref: "ev_gov_self", obligation: "self:tests" },
        { ref: "ev_gov_review", obligation: "review-report" },
        { ref: "ev_gov_qa", obligation: "qa-report" }
      ],
      idempotencyKey: "v009_gov_manufacture", reasonCode: "V009"
    }),
    (error) => error instanceof WorkPackageServiceError && error.code === "DENY_OBLIGATION_STAGE"
  );

  // Negative: a grant for v2 cannot authorize v1.
  const wrongVersion = makeService();
  wrongVersion.createWorkPackage(workPackage(), { idempotencyKey: "v009_wrong_create", actorId: "engin", authorityRef: "g_engin" });
  assert.throws(
    () => wrongVersion.submitTransition({
      projectId: "prj_v009", workPackageId: "wp_v009", version: 1,
      requestedState: "PLANNED", actorId: "engin", authorityRef: "g_engin_v2",
      policyDecision: "ALLOW", evidence: [{ ref: "ev_wrong_version" }],
      idempotencyKey: "v009_wrong_version", reasonCode: "V009"
    }),
    (error) => error.code === "DENY_AUTHORITY_VERSION_MISMATCH"
  );

  // Negative: once v2 governs, v1 cannot continue execution.
  const superseded = drive(makeService(), "READY").service;
  superseded.createWorkPackage(workPackage(2), { idempotencyKey: "v009_create_v2", actorId: "engin", authorityRef: "g_engin_v2" });
  for (const [state, actorId, authorityRef] of [
    ["PLANNED", "engin", "g_engin_v2"],
    ["REVIEWED", "rev", "g_rev_v2"],
    ["AUTHORIZED", "gov", "g_gov_v2"]
  ]) {
    superseded.submitTransition({
      projectId: "prj_v009", workPackageId: "wp_v009", version: 2,
      requestedState: state, actorId, authorityRef, policyDecision: "ALLOW",
      evidence: [{ ref: `ev_v2_${state}` }], idempotencyKey: `v009_v2_${state}`, reasonCode: "V009"
    });
  }
  assert.throws(
    () => superseded.submitTransition({
      projectId: "prj_v009", workPackageId: "wp_v009", version: 1,
      requestedState: "RUNNING", actorId: "engin", authorityRef: "g_engin",
      policyDecision: "ALLOW", evidence: [{ ref: "ev_superseded" }],
      idempotencyKey: "v009_superseded", reasonCode: "V009"
    }),
    (error) => error instanceof WorkPackageServiceError && error.code === "DENY_SUPERSEDED_VERSION"
  );

  // Replay: identical approval is stable; the same key on another version conflicts.
  const replayService = drive(makeService(), "GOV_DECISION").service;
  const acceptance = {
    projectId: "prj_v009", workPackageId: "wp_v009", version: 1,
    requestedState: "ACCEPTED", actorId: "gov", authorityRef: "g_gov",
    policyDecision: "ALLOW", evidence: [{ ref: "ev_accept_replay" }],
    idempotencyKey: "v009_accept_replay", reasonCode: "V009"
  };
  const firstAcceptance = replayService.submitTransition(acceptance);
  const replayedAcceptance = replayService.submitTransition(structuredClone(acceptance));
  assert.equal(replayedAcceptance.replayed, true);
  assert.equal(replayedAcceptance.transitionId, firstAcceptance.transitionId);
  assert.throws(
    () => replayService.submitTransition({ ...acceptance, version: 2 }),
    (error) => error instanceof WorkPackageServiceError && error.code === "DENY_IDEMPOTENCY_CONFLICT"
  );
});

// V-010 terminal (observer) UNBLOCKED and moved to a live conformance case in
// tests/conformance-p0-18-candidate.test.mjs (P0-18 candidate): the MOD-LIVE S2
// access-mode ladder is ratified on main @ 4abfff2, so read-only observer
// authorization is composed for real (positive Observe view; negative
// escalation-to-Control/Emergency; adversarial prototype-smuggling, hostile
// getter, unknown token, gated-mode-without-explicit-auth).

test("V-011 redaction: data classification enforcement on events (storage plane)", { skip: "BLOCKED: P0-08 security policy surface - storage-plane redaction only; display plane covered below" }, () => {
  // Positive: RESTRICTED data redacted before ledger append
  // Negative: unredacted RESTRICTED data rejected at envelope validation
});

// V-011 display-plane partial, unblocked by P0-17 (GOV-P017-02/04):
// display withholding is NOT storage redaction; the storage half above
// stays blocked and V-011 is NOT done.
test("V-011 display plane: classification floor withholds above-ceiling and unknown payloads", () => {
  const record = (classification) => ({
    sequence: 1,
    entry: {
      entryId: "evt_v011", type: "host.observed", actorId: "a", sessionId: "s",
      timestamp: "2026-07-19T10:00:00Z",
      payload: { classification, content_hash: "d".repeat(64), observed_fact: { secret: "V011-PAYLOAD" } }
    }
  });
  const [restricted] = projectEvents([record("RESTRICTED")], "INTERNAL");
  assert.equal(restricted.payloadRendered, false);
  assert.equal(restricted.withheldReason, "ABOVE_CEILING");
  assert.equal(restricted.payload, null);
  const [unknown] = projectEvents([record("internal ")], "INTERNAL");
  assert.equal(unknown.withheldReason, "UNRECOGNIZED_CLASSIFICATION");
  const [visible] = projectEvents([record("PUBLIC")], "INTERNAL");
  assert.equal(visible.payloadRendered, true);
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

// V-014 MCP UNBLOCKED and moved to a live conformance case in
// tests/conformance-p0-18-candidate.test.mjs (P0-18 candidate): the
// SECB-MCP-P0-001 gateway dispatch core is ratified on main @ 4abfff2, so
// credential-bounded read-only invocation is composed for real (positive
// bounded read dispatch; negative unknown-capability, non-read, missing
// authorization_id; adversarial credential-leak, revoked, prototype-pollution).

// V-015 unblocked by P0-11 HandoffService R1 (gate waived 2026-07-19).
test("V-015 A2A: structured handoff non-escalation", () => {
  const BASE = "90c84a67e36a25941bc0983a0e687745919eca8c";
  const win = { projectId: "prj_v015", workPackageId: "wp_v015", workPackageVersion: 1, validFrom: "2026-07-01T00:00:00Z", validUntil: "2026-12-31T00:00:00Z", status: "ACTIVE" };
  const grantSet = [
      { ...win, grantId: "g_e", decisionId: "d_e", actorId: "eng", roles: ["ENGIN"], allowedTransitions: ["WorkPackage:DRAFT->PLANNED", "WorkPackage:AUTHORIZED->READY", "WorkPackage:READY->RUNNING"] },
      { ...win, grantId: "g_r", decisionId: "d_r", actorId: "rev", roles: ["REV"], allowedTransitions: ["WorkPackage:PLANNED->REVIEWED"] },
      { ...win, grantId: "g_g", decisionId: "d_g", actorId: "gov", roles: ["GOV"], allowedTransitions: ["WorkPackage:REVIEWED->AUTHORIZED"] }
  ];
  const wp = new WorkPackageContractService({
    grants: grantSet,
    authoritySource: () => grantSet,
    now: () => new Date("2026-07-18T10:00:00Z")
  });
  wp.createWorkPackage({
    work_package_id: "wp_v015", version: 1, project_id: "prj_v015", objective: "v015", risk_class: "R2",
    status: "DRAFT", baseline: BASE, scope: ["src/"], non_scope: ["prod"], acceptance_criteria: ["ok"],
    roles: { producer: "eng" }, allowed_paths: ["src/services", "tests"], prohibited_paths: ["out"],
    evidence_obligations: ["self:t"], valid_until: "2026-08-01T00:00:00Z"
  }, { idempotencyKey: "v015_c", actorId: "eng", authorityRef: "g_e" });
  let s = 0;
  for (const [state, a, g] of [["PLANNED", "eng", "g_e"], ["REVIEWED", "rev", "g_r"], ["AUTHORIZED", "gov", "g_g"], ["READY", "eng", "g_e"], ["RUNNING", "eng", "g_e"]]) {
    wp.submitTransition({ projectId: "prj_v015", workPackageId: "wp_v015", version: 1, requestedState: state, actorId: a, authorityRef: g, policyDecision: "ALLOW", evidence: [{ ref: `e_${state}` }], idempotencyKey: `v015_t_${++s}`, reasonCode: "S" });
  }
  const handoff = new HandoffService({ workPackageService: wp, now: () => new Date("2026-07-18T10:00:00Z") });
  const env = (over = {}) => {
    const base = {
      handoff_id: "v015_ho", version: 1, project_id: "prj_v015", work_package_id: "wp_v015",
      source_session_id: "s", destination_role: "REV", objective: "review", authorized_scope: ["read"],
      work_completed: [], artifacts: [], assumptions: [], evidence_refs: ["e"], checks: [], limitations: [],
      unresolved_findings: [], risks: [], recommended_next_action: "review", context_delta: [], ...over
    };
    return { ...base, content_hash: canonicalFingerprint(base) };
  };
  const offer = (ceiling, id = "v015_ho") => handoff.offerHandoff({
    envelope: env({ handoff_id: id }), actorId: "eng", authorityRef: "g_e", sourceSessionId: "s", baseline: BASE, ceiling, idempotencyKey: `v015_o_${id}`
  });

  // Positive: a handoff whose ceiling is within the effective contract, accepted by an independent reviewer
  const ok = offer({ riskClass: "R2", dataClassification: "INTERNAL", paths: ["src/services"], tools: [], transitions: [] });
  assert.equal(ok.state, "OFFERED");
  const accepted = handoff.acceptHandoff("prj_v015", "v015_ho", { actorId: "rev", authorityRef: "g_r", sessionId: "sr", baseline: BASE, idempotencyKey: "v015_a" });
  assert.equal(accepted.state, "ACCEPTED");

  // Negative: authority escalation (path outside the contract) rejected
  assert.throws(
    () => offer({ riskClass: "R2", dataClassification: "INTERNAL", paths: ["outside/root"], tools: [], transitions: [] }, "v015_esc"),
    (e) => e instanceof HandoffServiceError && e.code === "DENY_ESCALATION"
  );
  // Negative: the executor cannot accept its own independence-bearing handoff
  offer({ riskClass: "R1", dataClassification: "INTERNAL", paths: ["src/services"], tools: [], transitions: [] }, "v015_sod");
  assert.throws(
    () => handoff.acceptHandoff("prj_v015", "v015_sod", { actorId: "eng", authorityRef: "g_e", sessionId: "s", baseline: BASE, idempotencyKey: "v015_sod_a" }),
    (e) => e instanceof HandoffServiceError && e.code === "DENY_SOD"
  );
});

// V-016 recovery is PARTIALLY covered live in
// tests/conformance-p0-18-candidate.test.mjs (P0-18 candidate): the MOD-RUNTIME
// S1 CheckpointLedger is ratified on main @ 4abfff2, so the RESUME-POINT half is
// composed for real (positive latest-resume resolution; negative
// unknown-session/checkpoint fail-closed; adversarial tamper -> hash-chain
// LEDGER_INTEGRITY_FAILURE). The DRIFT half below remains genuinely BLOCKED.
test("V-016 recovery: source-ledger drift comparison denies a drifted checkpoint", { skip: "BLOCKED: checkpoint-ledger non-goal #3 — the restore-execution DRIFT comparator (compare source_ledger_id @ sequence_at_checkpoint against the live source-ledger head to deny a drifted resume) is deferred; no primitive on main @ 4abfff2 performs this comparison" }, () => {
  // Positive: a checkpoint whose source-ledger head still matches
  //   sequence_at_checkpoint resumes verified.
  // Negative: a checkpoint whose source ledger has advanced (drifted) past
  //   sequence_at_checkpoint is denied — resume-against-drift blocked.
  // Unblocks when a restore-execution consumer that dereferences
  //   state_snapshot_ref and compares source-ledger head vs checkpoint sequence
  //   lands on main.
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
