import assert from "node:assert/strict";
import test from "node:test";
import { WorkPackageContractService, WorkPackageServiceError } from "../src/services/work-package-service.mjs";

// V-item conformance stubs — BLOCKED pending Codex P0-08/P0-09 and other P0 deliverables.
// Each stub documents what it will test and which dependency unblocks it.
// When a dependency lands, replace the skip with the actual test.

test("V-002 project scope: approved repository enforced", { skip: "BLOCKED: P0-08 Project Contract service" }, () => {
  // Positive: work package scoped to approved repository proceeds
  // Negative: work package referencing unapproved repository rejected
});

test("V-004 context: context receipt federation and retrieval", { skip: "BLOCKED: P0-10 Context federation" }, () => {
  // Positive: context receipt retrieved within compaction window
  // Negative: expired or missing context receipt fails closed
});

test("V-005 SoD: role assignment independence validated", { skip: "BLOCKED: P0-06 Role and SoD engine" }, () => {
  // Positive: independent actors assigned to producer/reviewer/QA
  // Negative: same actor assigned conflicting roles rejected
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
    }, { idempotencyKey: "v009_create" });
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

test("V-012 memory: memory record temporal boundary", { skip: "BLOCKED: P0-14 Decision/knowledge/outcome ledgers" }, () => {
  // Positive: memory record with valid temporal claim accepted
  // Negative: memory record exceeding retention window pruned
});

test("V-013 skill: skill lifecycle through SkillsHub", { skip: "BLOCKED: P0-14 + skill resolver" }, () => {
  // Positive: published skill resolves through capability fabric
  // Negative: unapproved skill blocked at invocation
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

test("V-017 knowledge: temporal knowledge claim derivation", { skip: "BLOCKED: P0-14 Knowledge ledger" }, () => {
  // Positive: knowledge claim derived from verified evidence
  // Negative: knowledge claim without evidence chain rejected
});

test("V-018 outcome: outcome receipt validation", { skip: "BLOCKED: P0-14 Outcome ledger" }, () => {
  // Positive: outcome receipt validates decision/skill/knowledge
  // Negative: outcome receipt invalidates and triggers reversion
});
