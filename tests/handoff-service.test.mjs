import assert from "node:assert/strict";
import test from "node:test";
import { canonicalFingerprint } from "../src/contracts/canonical-fingerprint.mjs";
import { WorkPackageContractService } from "../src/services/work-package-service.mjs";
import { HandoffService, HandoffServiceError } from "../src/services/handoff-service.mjs";
import { withinCeiling } from "../src/services/non-escalation-comparator.mjs";

const PROJECT = "prj_secb_local";
const WP = "wp_handoff_001";
const BASELINE = "90c84a67e36a25941bc0983a0e687745919eca8c";
const ENGIN = "engin-actor";
const REV = "rev-actor";
const REV2 = "rev-actor-2";
const GOV = "gov-actor";

function grants() {
  const window = { projectId: PROJECT, workPackageId: WP, workPackageVersion: 1, validFrom: "2026-07-01T00:00:00Z", validUntil: "2026-12-31T00:00:00Z", status: "ACTIVE" };
  return [
    { ...window, grantId: "g_engin", decisionId: "d_engin", actorId: ENGIN, roles: ["ENGIN"], allowedTransitions: ["WorkPackage:DRAFT->PLANNED", "WorkPackage:AUTHORIZED->READY", "WorkPackage:READY->RUNNING"] },
    { ...window, grantId: "g_rev", decisionId: "d_rev", actorId: REV, roles: ["REV"], allowedTransitions: ["WorkPackage:PLANNED->REVIEWED"] },
    { ...window, grantId: "g_gov", decisionId: "d_gov", actorId: GOV, roles: ["GOV"], allowedTransitions: ["WorkPackage:REVIEWED->AUTHORIZED"] }
  ];
}

function draft() {
  return {
    work_package_id: WP, version: 1, project_id: PROJECT,
    objective: "handoff R1 conformance", risk_class: "R2", status: "DRAFT", baseline: BASELINE,
    scope: ["src/services/"], non_scope: ["production"], acceptance_criteria: ["handoff works"],
    roles: { producer: ENGIN }, allowed_paths: ["src/services", "tests"], prohibited_paths: ["outside"],
    evidence_obligations: ["self:unit"], valid_until: "2026-08-01T00:00:00Z"
  };
}

function seal(envelope) {
  const { content_hash, ...body } = envelope;
  return { ...envelope, content_hash: canonicalFingerprint(body) };
}

function envelope(overrides = {}) {
  return seal({
    handoff_id: "ho_1", version: 1, project_id: PROJECT, work_package_id: WP,
    source_session_id: "ses_src", destination_role: "REV",
    objective: "independent review", authorized_scope: ["read"],
    work_completed: [], artifacts: [], assumptions: [], evidence_refs: ["ev_1"],
    checks: [], limitations: [], unresolved_findings: [], risks: [],
    recommended_next_action: "review", context_delta: [],
    content_hash: "0".repeat(64),
    ...overrides
  });
}

function harness({ start = "2026-07-18T10:00:00Z" } = {}) {
  let nowMs = Date.parse(start);
  const clock = () => new Date(nowMs);
  const grantSet = grants();
  const wp = new WorkPackageContractService({ grants: grantSet, authoritySource: () => grantSet, now: clock });
  // drive the work package to RUNNING under ENGIN (effective; executor=ENGIN)
  wp.createWorkPackage(draft(), { idempotencyKey: "c1", actorId: ENGIN, authorityRef: "g_engin" });
  const steps = [
    ["PLANNED", ENGIN, "g_engin"], ["REVIEWED", REV, "g_rev"], ["AUTHORIZED", GOV, "g_gov"],
    ["READY", ENGIN, "g_engin"], ["RUNNING", ENGIN, "g_engin"]
  ];
  let seq = 0;
  for (const [state, actorId, authorityRef] of steps) {
    wp.submitTransition({ projectId: PROJECT, workPackageId: WP, version: 1, requestedState: state, actorId, authorityRef, policyDecision: "ALLOW", evidence: [{ ref: `ev_${state}` }], idempotencyKey: `t_${++seq}`, reasonCode: "STEP" });
  }
  const handoff = new HandoffService({ workPackageService: wp, now: clock });
  const setNow = (iso) => { nowMs = Date.parse(iso); };
  const offer = (over = {}) => handoff.offerHandoff({
    envelope: envelope(over.envelope), actorId: ENGIN, authorityRef: "g_engin", sourceSessionId: "ses_src",
    baseline: BASELINE, ceiling: { riskClass: "R2", dataClassification: "INTERNAL", paths: ["src/services"], tools: [], transitions: [] },
    idempotencyKey: over.idempotencyKey ?? "idem_offer_1", ...over.request
  });
  return { wp, handoff, offer, setNow };
}

function denies(fn, code) {
  assert.throws(fn, (e) => e instanceof HandoffServiceError && e.code === code);
}

test("comparator: within-ceiling on every dimension, incomparable denies", () => {
  const bound = { riskClass: "R3", dataClassification: "CONFIDENTIAL", paths: ["src"], tools: ["read", "write"], transitions: ["a->b"] };
  assert.equal(withinCeiling({ riskClass: "R2", dataClassification: "INTERNAL", paths: ["src/x"], tools: ["read"], transitions: [] }, bound).ok, true);
  assert.equal(withinCeiling({ riskClass: "R4", dataClassification: "INTERNAL", paths: [], tools: [], transitions: [] }, bound).code, "DENY_ESCALATION");
  assert.equal(withinCeiling({ riskClass: "R2", dataClassification: "SECRET", paths: [], tools: [], transitions: [] }, bound).code, "DENY_ESCALATION_UNCOMPARABLE");
  assert.equal(withinCeiling({ riskClass: "R2", dataClassification: "INTERNAL", paths: ["other"], tools: [], transitions: [] }, bound).code, "DENY_ESCALATION");
  assert.equal(withinCeiling({ riskClass: "R2", dataClassification: "INTERNAL", paths: ["src/../etc"], tools: [], transitions: [] }, bound).code, "DENY_ESCALATION_UNCOMPARABLE");
  assert.equal(withinCeiling({ riskClass: "R2", dataClassification: "INTERNAL", paths: [], tools: ["exec*"], transitions: [] }, bound).code, "DENY_ESCALATION_UNCOMPARABLE");
});

test("two-phase happy path: offer then independent accept", () => {
  const h = harness();
  const offered = h.offer();
  assert.equal(offered.state, "OFFERED");
  assert.deepEqual(offered.contractSilentDimensions, ["dataClassification", "tools", "transitions"]);
  const accepted = h.handoff.acceptHandoff(PROJECT, "ho_1", { actorId: REV, authorityRef: "g_rev", sessionId: "ses_rev", baseline: BASELINE, idempotencyKey: "idem_acc_1" });
  assert.equal(accepted.state, "ACCEPTED");
  assert.equal(accepted.effectiveCeiling.riskClass, "R2");
  assert.equal(h.handoff.getHandoff(PROJECT, "ho_1").state, "ACCEPTED");
});

test("non-escalation: a path outside the effective contract is denied", () => {
  const h = harness();
  denies(() => h.offer({ request: { ceiling: { riskClass: "R2", dataClassification: "INTERNAL", paths: ["outside/secret"], tools: [], transitions: [] } } }), "DENY_ESCALATION");
});

test("non-escalation: a risk class above the contract is denied", () => {
  const h = harness();
  denies(() => h.offer({ request: { ceiling: { riskClass: "R4", dataClassification: "INTERNAL", paths: ["src/services"], tools: [], transitions: [] } } }), "DENY_ESCALATION");
});

test("SoD: the executor cannot accept its own independence-bearing handoff", () => {
  const h = harness();
  h.offer();
  denies(() => h.handoff.acceptHandoff(PROJECT, "ho_1", { actorId: ENGIN, authorityRef: "g_engin", sessionId: "s", baseline: BASELINE, idempotencyKey: "idem_sod" }), "DENY_SOD");
});

test("receipts: a context_receipt_ref with no resolver (R1) is denied", () => {
  const h = harness();
  denies(() => h.offer({ request: { contextReceiptRef: { receipt_id: "r1", version: 1, content_hash: "x" } } }), "DENY_RECEIPT_UNVERIFIABLE");
});

test("reserved delimiter in a handoff id field is denied", () => {
  const h = harness();
  denies(() => h.offer({ envelope: { handoff_id: "ho@1" } }), "DENY_ID_CHARSET");
});

test("seal: a tampered envelope whose content_hash does not match is denied", () => {
  const h = harness();
  denies(() => h.handoff.offerHandoff({
    envelope: { ...envelope(), objective: "mutated-after-seal" },
    actorId: ENGIN, authorityRef: "g_engin", sourceSessionId: "ses_src", baseline: BASELINE,
    ceiling: { riskClass: "R2", dataClassification: "INTERNAL", paths: ["src/services"], tools: [], transitions: [] },
    idempotencyKey: "idem_seal"
  }), "DENY_FINGERPRINT_MISMATCH");
});

test("expiry: acceptance after the offer expires is denied", () => {
  const h = harness();
  h.offer();
  h.setNow("2026-07-20T00:00:00Z");
  denies(() => h.handoff.acceptHandoff(PROJECT, "ho_1", { actorId: REV, authorityRef: "g_rev", sessionId: "s", baseline: BASELINE, idempotencyKey: "idem_exp" }), "DENY_EXPIRED");
});

test("baseline: acceptance asserting a different baseline is denied", () => {
  const h = harness();
  h.offer();
  denies(() => h.handoff.acceptHandoff(PROJECT, "ho_1", { actorId: REV, authorityRef: "g_rev", sessionId: "s", baseline: "deadbeef", idempotencyKey: "idem_base" }), "DENY_BASELINE_MISMATCH");
});

test("single acceptance: a second accept is denied; identical replay is stable", () => {
  const h = harness();
  h.offer();
  const first = h.handoff.acceptHandoff(PROJECT, "ho_1", { actorId: REV, authorityRef: "g_rev", sessionId: "s", baseline: BASELINE, idempotencyKey: "idem_once" });
  const replay = h.handoff.acceptHandoff(PROJECT, "ho_1", { actorId: REV, authorityRef: "g_rev", sessionId: "s", baseline: BASELINE, idempotencyKey: "idem_once" });
  assert.equal(replay.replayed, true);
  assert.equal(replay.acceptedAt, first.acceptedAt);
  denies(() => h.handoff.acceptHandoff(PROJECT, "ho_1", { actorId: REV2, authorityRef: "g_rev", sessionId: "s2", baseline: BASELINE, idempotencyKey: "idem_twice" }), "DENY_NOT_OFFERED");
});

test("idempotency: same offer key + different envelope is a conflict", () => {
  const h = harness();
  h.offer();
  denies(() => h.offer({ envelope: { objective: "different" } }), "DENY_IDEMPOTENCY_CONFLICT");
});

test("revoke is terminal and blocks later acceptance; decline likewise", () => {
  const h = harness();
  h.offer();
  const revoked = h.handoff.revokeHandoff(PROJECT, "ho_1", { actorId: ENGIN });
  assert.equal(revoked.state, "REVOKED");
  denies(() => h.handoff.acceptHandoff(PROJECT, "ho_1", { actorId: REV, authorityRef: "g_rev", sessionId: "s", baseline: BASELINE, idempotencyKey: "idem_rev_acc" }), "DENY_NOT_OFFERED");
});

test("duplicate handoff id and unknown handoff are denied", () => {
  const h = harness();
  h.offer();
  denies(() => h.offer({ idempotencyKey: "idem_dup" }), "DENY_DUPLICATE_HANDOFF");
  denies(() => h.handoff.getHandoff(PROJECT, "ho_ghost"), "DENY_UNKNOWN_HANDOFF");
});

test("returned records are frozen and detached", () => {
  const h = harness();
  const offered = h.offer();
  assert.throws(() => { offered.state = "ACCEPTED"; }, TypeError);
});

// ---------------------------------------------------------------------------
// Handoff provenance: the five refusals the deny-path ratchet still carried.
//
// All five defend one invariant — a handoff may only descend from a parent that
// exists, was accepted, binds the same work package, sits within the depth cap,
// and carries a receipt bound to this exact project/work-package/session/
// baseline. Chain integrity is what makes a handoff evidence about anything; a
// chain that accepts an unknown or unaccepted parent is a provenance claim with
// no provenance.
//
// Extends this file's harness rather than adding another. Two cases need a
// service configured differently (a depth cap, a receipt resolver), so they
// build one from the same work-package service the harness already drove to
// RUNNING.
// ---------------------------------------------------------------------------

test("DENY_UNKNOWN_PARENT — a handoff cannot descend from a parent that does not exist", () => {
  const { offer } = harness();
  denies(() => offer({ request: { parentHandoffId: "ho_does_not_exist" } }), "DENY_UNKNOWN_PARENT");
});

test("DENY_PARENT_NOT_ACCEPTED — an offered but unaccepted parent cannot be descended from", () => {
  const { offer } = harness();
  offer({ envelope: { handoff_id: "ho_parent" }, idempotencyKey: "idem_parent" });
  // The parent exists and is OFFERED, never ACCEPTED. Descending from it would
  // let a chain inherit authority the destination role never took up.
  denies(
    () => offer({
      envelope: { handoff_id: "ho_child" },
      idempotencyKey: "idem_child",
      request: { parentHandoffId: "ho_parent" }
    }),
    "DENY_PARENT_NOT_ACCEPTED"
  );
});

test("DENY_CHAIN_DEPTH — a chain deeper than the cap is refused, not truncated", () => {
  const { wp } = harness();
  // depthCap 0 admits a root handoff and refuses any child. The refusal must be
  // a denial rather than a silent truncation: a chain quietly cut at the cap
  // would present a child as a root and lose the provenance entirely.
  const svc = new HandoffService({ workPackageService: wp, now: () => new Date("2026-07-18T10:00:00Z"), depthCap: 0 });
  const base = {
    actorId: ENGIN, authorityRef: "g_engin", sourceSessionId: "ses_src", baseline: BASELINE,
    ceiling: { riskClass: "R2", dataClassification: "INTERNAL", paths: ["src/services"], tools: [], transitions: [] }
  };
  const root = svc.offerHandoff({ ...base, envelope: envelope({ handoff_id: "ho_root" }), idempotencyKey: "i_root" });
  assert.equal(root.depth, 0, "a root handoff sits at depth 0 and is admitted by a cap of 0");
  svc.acceptHandoff(PROJECT, "ho_root", {
    actorId: REV, authorityRef: "g_rev", sessionId: "ses_rev", baseline: BASELINE, idempotencyKey: "i_accept_root"
  });
  denies(
    () => svc.offerHandoff({
      ...base, envelope: envelope({ handoff_id: "ho_deep" }),
      idempotencyKey: "i_deep", parentHandoffId: "ho_root"
    }),
    "DENY_CHAIN_DEPTH"
  );
});

test("DENY_RECEIPT_BINDING — a receipt that resolves ALLOW but binds a different subject", () => {
  const { wp } = harness();
  // The resolver says ALLOW. That is the point: a receipt can be perfectly valid
  // and still be about something else, and a service that checked only the
  // verdict would accept another work package's context as this one's evidence.
  //
  // contextReceiptRef must be an OBJECT carrying receipt_id. Passing the bare
  // string denied as DENY_MALFORMED_REQUEST, and the strict helper refused to
  // accept that as this case passing — which is the whole reason the helper
  // matches on exact code rather than on "it threw".
  const wrongSubject = {
    project_id: "prj_other", work_package_id: "wp_other",
    session_id: "ses_other", baseline_version: "baseline_other"
  };
  const svc = new HandoffService({
    workPackageService: wp,
    now: () => new Date("2026-07-18T10:00:00Z"),
    receiptResolver: () => ({ code: "ALLOW", receipt: wrongSubject })
  });
  denies(
    () => svc.offerHandoff({
      envelope: envelope({ handoff_id: "ho_receipt" }),
      actorId: ENGIN, authorityRef: "g_engin", sourceSessionId: "ses_src", baseline: BASELINE,
      ceiling: { riskClass: "R2", dataClassification: "INTERNAL", paths: ["src/services"], tools: [], transitions: [] },
      idempotencyKey: "i_receipt", contextReceiptRef: { receipt_id: "rc_wrong" }
    }),
    "DENY_RECEIPT_BINDING"
  );
});

test("DENY_PARENT_SCOPE — a chain may not cross work packages", () => {
  // Needs a SECOND work package in the same project, because the parent is
  // looked up by (project, handoffId) and only then compared on work package.
  // A chain that crossed work packages would let evidence gathered under one
  // authorised scope be presented as provenance under another — the parent
  // exists, was accepted, and is still the wrong parent.
  const WP2 = "wp_handoff_002";
  const both = [
    ...grants(),
    ...grants().map((g) => ({ ...g, workPackageId: WP2, grantId: `${g.grantId}_2`, decisionId: `${g.decisionId}_2` }))
  ];
  const clock = () => new Date("2026-07-18T10:00:00Z");
  const wp = new WorkPackageContractService({ grants: both, authoritySource: () => both, now: clock });

  const drive = (workPackageId, suffix) => {
    wp.createWorkPackage({ ...draft(), work_package_id: workPackageId }, {
      idempotencyKey: `c_${suffix}`, actorId: ENGIN, authorityRef: `g_engin${suffix}`
    });
    const steps = [
      ["PLANNED", ENGIN, `g_engin${suffix}`], ["REVIEWED", REV, `g_rev${suffix}`],
      ["AUTHORIZED", GOV, `g_gov${suffix}`], ["READY", ENGIN, `g_engin${suffix}`],
      ["RUNNING", ENGIN, `g_engin${suffix}`]
    ];
    let seq = 0;
    for (const [state, actorId, authorityRef] of steps) {
      wp.submitTransition({
        projectId: PROJECT, workPackageId, version: 1, requestedState: state,
        actorId, authorityRef, policyDecision: "ALLOW", evidence: [{ ref: `ev_${state}` }],
        idempotencyKey: `t_${suffix}_${seq++}`, reasonCode: "STEP"
      });
    }
  };
  drive(WP, "");
  drive(WP2, "_2");

  const svc = new HandoffService({ workPackageService: wp, now: clock });
  const base = {
    actorId: ENGIN, authorityRef: "g_engin", sourceSessionId: "ses_src", baseline: BASELINE,
    ceiling: { riskClass: "R2", dataClassification: "INTERNAL", paths: ["src/services"], tools: [], transitions: [] }
  };

  svc.offerHandoff({ ...base, envelope: envelope({ handoff_id: "ho_wp1" }), idempotencyKey: "i_wp1" });
  svc.acceptHandoff(PROJECT, "ho_wp1", {
    actorId: REV, authorityRef: "g_rev", sessionId: "ses_rev", baseline: BASELINE, idempotencyKey: "i_acc_wp1"
  });

  // Parent exists and IS accepted — the only thing wrong is its work package.
  denies(
    () => svc.offerHandoff({
      ...base,
      authorityRef: "g_engin_2",
      envelope: envelope({ handoff_id: "ho_wp2", work_package_id: WP2 }),
      idempotencyKey: "i_wp2",
      parentHandoffId: "ho_wp1"
    }),
    "DENY_PARENT_SCOPE"
  );
});

// ---------------------------------------------------------------------------
// Fail-closed construction.
//
// Found by tools/per-site-demonstration.mjs: DENY_CONFIG is demonstrated in
// four other services, so the ratchet — which keys by code name — read it as
// covered while this constructor's two guards had never fired.
//
// They are the reason a HandoffService cannot exist without the authority it
// depends on. A handoff decides whether work may pass from one actor to
// another; built against a workPackageService that cannot resolve effective
// contracts or produce a decision ledger, it would answer that question with no
// authority behind it and no record of having done so.
// ---------------------------------------------------------------------------

test("DENY_CONFIG — a work-package service that cannot answer is refused at construction", () => {
  const partial = {
    resolveEffective: () => ({ code: "ALLOW" })
    // getDecisionLedger deliberately absent
  };
  for (const [what, workPackageService] of [
    ["missing entirely", undefined],
    ["null", null],
    ["a plain object with neither method", {}],
    ["resolveEffective only", partial],
    ["getDecisionLedger only", { getDecisionLedger: () => ({}) }],
    ["both present but not callable", { resolveEffective: true, getDecisionLedger: "ledger" }]
  ]) {
    assert.throws(
      () => new HandoffService({ workPackageService }),
      (error) => {
        assert.ok(error instanceof HandoffServiceError, `${what}: wrong error class`);
        assert.equal(error.code, "DENY_CONFIG", `${what}: wrong code`);
        return true;
      },
      what
    );
  }
});

test("DENY_CONFIG — receiptResolver is optional, but not optional in TYPE", () => {
  const wp = { resolveEffective: () => ({ code: "ALLOW" }), getDecisionLedger: () => ({}) };

  // null is the documented R1 state and must construct.
  assert.ok(new HandoffService({ workPackageService: wp, receiptResolver: null }));
  assert.ok(new HandoffService({ workPackageService: wp }));

  // Anything else non-callable is refused. The distinction matters because the
  // resolver is what flips context_receipt_ref to verifiable: a truthy
  // non-function would be silently treated as "a resolver is present" while
  // being unable to resolve anything.
  for (const receiptResolver of [{}, "consumeReceipt", 0, true, []]) {
    assert.throws(
      () => new HandoffService({ workPackageService: wp, receiptResolver }),
      (error) => error.code === "DENY_CONFIG",
      String(receiptResolver)
    );
  }
});

// ---------------------------------------------------------------------------
// Who may revoke a handoff.
//
// Found by tools/per-site-demonstration.mjs. DENY_REVOKE_AUTHORITY is
// demonstrated in context-federation-service, so the ratchet read the name as
// covered while this one had never fired — meaning any actor at all could have
// revoked any handoff and nothing in the suite would have noticed.
//
// Revocation is not a small power here. A handoff is how work and its ceiling
// pass from one actor to another; a third party able to revoke can strip an
// actor of work it holds, and can do it repeatedly.
// ---------------------------------------------------------------------------

test("DENY_REVOKE_AUTHORITY — only the source actor or GOV may revoke a handoff", () => {
  const h = harness();
  h.offer();

  // Neither the TARGET of the handoff nor an unrelated actor may revoke it.
  // REV is the party the work was offered to, which is the case most likely to
  // be waved through as "involved enough".
  for (const actorId of [REV, REV2, "someone-else"]) {
    denies(() => h.handoff.revokeHandoff(PROJECT, "ho_1", { actorId }), "DENY_REVOKE_AUTHORITY");
  }

  // The source actor may.
  assert.equal(h.handoff.revokeHandoff(PROJECT, "ho_1", { actorId: ENGIN }).state, "REVOKED");
});

test("the GOV escape is a LITERAL actor id, not a GOV-role actor", () => {
  // Recording the R1 limitation the source comments describe rather than
  // asserting the behaviour someone would assume. The check is
  // `actorId !== "GOV"`, so the governance actor of this fixture — "gov-actor",
  // the id that actually holds GOV grants on the work package — is REFUSED,
  // while the bare string "GOV" is accepted by any caller that types it.
  //
  // That is grant plumbing this service does not have at R1. The test exists so
  // the day it arrives, this fails and says what to replace.
  const byRoleActor = harness();
  byRoleActor.offer();
  denies(() => byRoleActor.handoff.revokeHandoff(PROJECT, "ho_1", { actorId: GOV }), "DENY_REVOKE_AUTHORITY");

  const byLiteral = harness();
  byLiteral.offer();
  assert.equal(byLiteral.handoff.revokeHandoff(PROJECT, "ho_1", { actorId: "GOV" }).state, "REVOKED");
});

// ---------------------------------------------------------------------------
// Idempotency, live effectiveness, and the version bound at offer time.
//
// Three more per-site findings, all in this module. DENY_IDEMPOTENCY_KEY,
// DENY_WORK_PACKAGE_NOT_EFFECTIVE and DENY_VERSION_SUPERSEDED are each
// demonstrated in context-federation-service, so a code-name-keyed check read
// all three as covered while none of this service's four sites had ever fired.
//
// The pattern is worth naming: handoff-service consistently shares refusal
// vocabulary with the federation service, which is why it accumulated the most
// borrowed coverage of any module in the repository.
// ---------------------------------------------------------------------------

test("DENY_IDEMPOTENCY_KEY — a blank key is refused before anything is recorded", () => {
  const h = harness();
  // Called directly rather than through the harness helper: that helper
  // coalesces a missing key to a default, so `undefined` and `null` would never
  // reach the guard. A harness convenience quietly covering the case under test
  // is exactly how this site stayed undemonstrated.
  for (const idempotencyKey of [undefined, null, "", "   ", 0, {}]) {
    denies(
      () => h.handoff.offerHandoff({
        envelope: envelope(), actorId: ENGIN, authorityRef: "g_engin", sourceSessionId: "ses_src",
        baseline: BASELINE,
        ceiling: { riskClass: "R2", dataClassification: "INTERNAL", paths: ["src/services"], tools: ["read"], transitions: [] },
        idempotencyKey
      }),
      "DENY_IDEMPOTENCY_KEY"
    );
  }
  // And nothing was written on the way out: a refused offer must leave no
  // handoff behind for a later call to find.
  denies(() => h.handoff.getHandoff(PROJECT, "ho_1"), "DENY_UNKNOWN_HANDOFF");
});

test("DENY_WORK_PACKAGE_NOT_EFFECTIVE — effectiveness is resolved LIVE at offer and again at accept", () => {
  // Two separate sites, and the second is the one that matters. A handoff
  // offered while the work package was effective must not be acceptable after
  // it stops being effective — otherwise the offer becomes a stored permission
  // that outlives the authority it was drawn from.
  const real = harness();
  let effective = true;
  const gate = {
    resolveEffective: (p, w, opts) => (effective ? real.wp.resolveEffective(p, w, opts) : { code: "DENY_EXPIRED" }),
    getDecisionLedger: (...a) => real.wp.getDecisionLedger(...a)
  };
  const handoff = new HandoffService({ workPackageService: gate, now: () => new Date("2026-07-18T10:00:00Z") });

  effective = false;
  denies(
    () => handoff.offerHandoff({
      envelope: envelope(), actorId: ENGIN, authorityRef: "g_engin", sourceSessionId: "ses_src",
      baseline: BASELINE,
      ceiling: { riskClass: "R2", dataClassification: "INTERNAL", paths: ["src/services"], tools: ["read"], transitions: [] },
      idempotencyKey: "idem_not_effective"
    }),
    "DENY_WORK_PACKAGE_NOT_EFFECTIVE"
  );

  // Now offer while effective, then withdraw effectiveness before acceptance.
  effective = true;
  handoff.offerHandoff({
    envelope: envelope(), actorId: ENGIN, authorityRef: "g_engin", sourceSessionId: "ses_src",
    baseline: BASELINE,
    ceiling: { riskClass: "R2", dataClassification: "INTERNAL", paths: ["src/services"], tools: ["read"], transitions: [] },
    idempotencyKey: "idem_offer_live"
  });
  effective = false;
  denies(
    () => handoff.acceptHandoff(PROJECT, "ho_1", { actorId: REV, authorityRef: "g_rev", sessionId: "ses_dst", baseline: BASELINE, idempotencyKey: "idem_acc" }),
    "DENY_WORK_PACKAGE_NOT_EFFECTIVE"
  );
});

test("DENY_VERSION_SUPERSEDED — a handoff cannot be accepted under a contract version it was not offered under", () => {
  // The time-of-check/time-of-use guard on authority itself. The offer records
  // the version it resolved; acceptance re-resolves and refuses if the answer
  // moved. Without it, a handoff negotiated against version 1 would be honoured
  // under version 2 — a ceiling agreed against a contract nobody re-read.
  const real = harness();
  let bump = 0;
  const shifting = {
    resolveEffective: (p, w, opts) => {
      const r = real.wp.resolveEffective(p, w, opts);
      return bump ? { ...r, version: r.version + bump } : r;
    },
    getDecisionLedger: (...a) => real.wp.getDecisionLedger(...a)
  };
  const handoff = new HandoffService({ workPackageService: shifting, now: () => new Date("2026-07-18T10:00:00Z") });

  handoff.offerHandoff({
    envelope: envelope(), actorId: ENGIN, authorityRef: "g_engin", sourceSessionId: "ses_src",
    baseline: BASELINE,
    ceiling: { riskClass: "R2", dataClassification: "INTERNAL", paths: ["src/services"], tools: ["read"], transitions: [] },
    idempotencyKey: "idem_version_bound"
  });

  bump = 1;
  denies(
    () => handoff.acceptHandoff(PROJECT, "ho_1", { actorId: REV, authorityRef: "g_rev", sessionId: "ses_dst", baseline: BASELINE, idempotencyKey: "idem_acc" }),
    "DENY_VERSION_SUPERSEDED"
  );

  // Unchanged version still accepts, so the guard is a version check and not a
  // blanket refusal of every acceptance.
  bump = 0;
  assert.equal(
    handoff.acceptHandoff(PROJECT, "ho_1", { actorId: REV, authorityRef: "g_rev", sessionId: "ses_dst", baseline: BASELINE, idempotencyKey: "idem_acc" }).state,
    "ACCEPTED"
  );
});
