import assert from "node:assert/strict";
import test from "node:test";
import { GoalGraphService } from "../src/services/goal-graph-service.mjs";
import { validateContract } from "../src/contracts/contract-validator.mjs";

const HASH = "a".repeat(64);
const schemaValidator = (record) => validateContract("goal", record);

function provenance(agentId = "claude-motor") {
  return { source: "mod-work-gap-assessment-001.md", agent_id: agentId, created_at: "2026-07-19T10:00:00+07:00" };
}

function portfolio(overrides = {}) {
  return { goal_id: "g_portfolio", version: 1, project_id: "prj_secb_local", level: "PORTFOLIO", title: "Portfolio", status: "ACTIVE", parent_goal_id: null, provenance: provenance(), content_hash: HASH, ...overrides };
}
function product(overrides = {}) {
  return { goal_id: "g_product", version: 1, project_id: "prj_secb_local", level: "PRODUCT", title: "Product", status: "ACTIVE", parent_goal_id: "g_portfolio", provenance: provenance(), content_hash: HASH, ...overrides };
}
function objective(overrides = {}) {
  return { goal_id: "g_objective", version: 1, project_id: "prj_secb_local", level: "OBJECTIVE", title: "Objective", status: "ACTIVE", parent_goal_id: "g_product", provenance: provenance(), content_hash: HASH, ...overrides };
}

function makeService(options = {}) {
  const ledger = [];
  const service = new GoalGraphService({
    schemaValidator,
    ledgerWriter: options.ledgerWriter ?? ((entry) => ledger.push(entry)),
    workPackageResolver: options.workPackageResolver ?? (() => ({ allowed: true })),
    now: options.now ?? (() => new Date("2026-07-19T10:00:00Z"))
  });
  return { service, ledger };
}

// Register a full portfolio -> product -> ACTIVE objective chain.
function seedChain(service) {
  assert.equal(service.registerGoal(portfolio()).ok, true);
  assert.equal(service.registerGoal(product()).ok, true);
  assert.equal(service.registerGoal(objective()).ok, true);
}

test("constructor fails closed on missing collaborators", () => {
  assert.throws(() => new GoalGraphService({}));
  assert.throws(() => new GoalGraphService({ schemaValidator }));
  assert.throws(() => new GoalGraphService({ schemaValidator, ledgerWriter: () => {} }));
  assert.throws(() => new GoalGraphService({ schemaValidator, ledgerWriter: () => {}, workPackageResolver: () => true, now: 5 }));
});

test("registerGoal accepts the portfolio -> product -> objective ordering", () => {
  const { service } = makeService();
  const p = service.registerGoal(portfolio());
  assert.equal(p.ok, true);
  assert.equal(p.level, "PORTFOLIO");
  assert.ok(Object.isFrozen(p));
  assert.equal(service.registerGoal(product()).ok, true);
  assert.equal(service.registerGoal(objective()).ok, true);
});

test("registerGoal denies schema-invalid records", () => {
  const { service } = makeService();
  const missingId = portfolio();
  delete missingId.goal_id;
  assert.equal(service.registerGoal(missingId).deny_code, "DENY_RECORD_INVALID");
  assert.equal(service.registerGoal(portfolio({ level: "MODULE" })).deny_code, "DENY_RECORD_INVALID");
});

test("registerGoal denies reserved delimiters in id fields", () => {
  const { service } = makeService();
  assert.equal(service.registerGoal(portfolio({ goal_id: "g|bad" })).deny_code, "DENY_ID_CHARSET");
  assert.equal(service.registerGoal(portfolio({ project_id: "prj@bad" })).deny_code, "DENY_ID_CHARSET");
  service.registerGoal(portfolio());
  assert.equal(service.registerGoal(product({ parent_goal_id: "g|bad" })).deny_code, "DENY_ID_CHARSET");
});

test("registerGoal enforces the PORTFOLIO-null parent rule both ways", () => {
  const { service } = makeService();
  // PORTFOLIO may not name a parent.
  assert.equal(service.registerGoal(portfolio({ parent_goal_id: "g_x" })).deny_code, "DENY_HIERARCHY");
  // PRODUCT must name a parent (null denied).
  service.registerGoal(portfolio());
  assert.equal(service.registerGoal(product({ parent_goal_id: null })).deny_code, "DENY_HIERARCHY");
});

test("registerGoal enforces level ordering against the registered parent", () => {
  const { service } = makeService();
  service.registerGoal(portfolio());
  // PRODUCT parent must be a registered PORTFOLIO.
  assert.equal(service.registerGoal(product({ parent_goal_id: "g_missing" })).deny_code, "DENY_HIERARCHY");
  service.registerGoal(product());
  // OBJECTIVE parent must be a PRODUCT, not a PORTFOLIO.
  assert.equal(service.registerGoal(objective({ parent_goal_id: "g_portfolio" })).deny_code, "DENY_HIERARCHY");
  // PRODUCT parent must be a PORTFOLIO, not an OBJECTIVE.
  service.registerGoal(objective());
  assert.equal(
    service.registerGoal(product({ goal_id: "g_product2", parent_goal_id: "g_objective" })).deny_code,
    "DENY_HIERARCHY"
  );
});

test("registerGoal denies duplicate goal_id + version (idempotent-deny)", () => {
  const { service } = makeService();
  assert.equal(service.registerGoal(portfolio()).ok, true);
  assert.equal(service.registerGoal(portfolio()).deny_code, "DENY_DUPLICATE");
  // A different version of the same goal_id is not a duplicate.
  assert.equal(service.registerGoal(portfolio({ version: 2 })).ok, true);
});

test("registerGoal denies when the clock is unavailable", () => {
  const { service } = makeService({ now: () => new Date(NaN) });
  assert.equal(service.registerGoal(portfolio()).deny_code, "DENY_CLOCK_UNAVAILABLE");
});

test("a throwing ledger writer denies register with no state change (audit-before-effect)", () => {
  const { service } = makeService({ ledgerWriter: () => { throw new Error("ledger down"); } });
  assert.equal(service.registerGoal(portfolio()).deny_code, "DENY_AUDIT_UNAVAILABLE");
  assert.equal(service.getGoal("g_portfolio").deny_code, "DENY_UNKNOWN_GOAL");
});

test("linkWorkPackage binds a resolvable WP to an ACTIVE OBJECTIVE", () => {
  const { service } = makeService();
  seedChain(service);
  const result = service.linkWorkPackage("g_objective", "wp_1");
  assert.equal(result.ok, true);
  assert.equal(result.status, "LINKED");
  assert.ok(Object.isFrozen(result));
});

test("linkWorkPackage denies non-linkable goals", () => {
  const { service } = makeService();
  seedChain(service);
  // Unknown goal.
  assert.equal(service.linkWorkPackage("g_missing", "wp_1").deny_code, "DENY_GOAL_NOT_LINKABLE");
  // Not an OBJECTIVE.
  assert.equal(service.linkWorkPackage("g_product", "wp_1").deny_code, "DENY_GOAL_NOT_LINKABLE");
  // OBJECTIVE that is not ACTIVE.
  service.registerGoal(objective({ goal_id: "g_obj_draft", status: "DRAFT" }));
  assert.equal(service.linkWorkPackage("g_obj_draft", "wp_1").deny_code, "DENY_GOAL_NOT_LINKABLE");
});

test("linkWorkPackage denies unknown work packages (resolver falsy or throwing)", () => {
  const falsy = makeService({ workPackageResolver: () => false });
  seedChain(falsy.service);
  assert.equal(falsy.service.linkWorkPackage("g_objective", "wp_1").deny_code, "DENY_UNKNOWN_WORK_PACKAGE");

  const explicit = makeService({ workPackageResolver: () => ({ allowed: false }) });
  seedChain(explicit.service);
  assert.equal(explicit.service.linkWorkPackage("g_objective", "wp_1").deny_code, "DENY_UNKNOWN_WORK_PACKAGE");

  const throwing = makeService({ workPackageResolver: () => { throw new Error("wp source down"); } });
  seedChain(throwing.service);
  assert.equal(throwing.service.linkWorkPackage("g_objective", "wp_1").deny_code, "DENY_UNKNOWN_WORK_PACKAGE");
});

test("linkWorkPackage denies reserved delimiters and duplicate links (idempotent-deny)", () => {
  const { service } = makeService();
  seedChain(service);
  assert.equal(service.linkWorkPackage("g_objective", "wp@1").deny_code, "DENY_ID_CHARSET");
  assert.equal(service.linkWorkPackage("g_objective", "wp_1").ok, true);
  assert.equal(service.linkWorkPackage("g_objective", "wp_1").deny_code, "DENY_ALREADY_LINKED");
});

test("a throwing ledger writer denies link with no state change", () => {
  let live = true;
  const { service } = makeService({ ledgerWriter: (entry) => { if (!live) throw new Error("ledger down"); } });
  seedChain(service);
  live = false;
  assert.equal(service.linkWorkPackage("g_objective", "wp_1").deny_code, "DENY_AUDIT_UNAVAILABLE");
  live = true;
  // The link never took effect, so a fresh attempt is not a duplicate.
  assert.equal(service.linkWorkPackage("g_objective", "wp_1").ok, true);
});

test("traceChain returns the deterministic wp -> objective -> product -> portfolio path", () => {
  const { service } = makeService();
  seedChain(service);
  service.linkWorkPackage("g_objective", "wp_1");
  const trace = service.traceChain("wp_1");
  assert.equal(trace.ok, true);
  assert.deepEqual({ ...trace.chain }, {
    work_package_id: "wp_1",
    objective: "g_objective",
    product: "g_product",
    portfolio: "g_portfolio"
  });
  assert.ok(Object.isFrozen(trace.chain));
});

test("traceChain denies unknown and broken chains", () => {
  const { service } = makeService();
  seedChain(service);
  assert.equal(service.traceChain("wp_unlinked").deny_code, "DENY_UNKNOWN_WORK_PACKAGE");
  assert.equal(service.traceChain("").deny_code, "DENY_UNKNOWN_WORK_PACKAGE");

  service.linkWorkPackage("g_objective", "wp_1");
  // Shadow the product id with a higher-version PORTFOLIO so the objective's
  // parent no longer resolves to a PRODUCT: the read is fail-closed.
  assert.equal(service.registerGoal(portfolio({ goal_id: "g_product", version: 2 })).ok, true);
  assert.equal(service.traceChain("wp_1").deny_code, "DENY_BROKEN_CHAIN");
});

test("getGoal returns the frozen record or denies unknown", () => {
  const { service } = makeService();
  seedChain(service);
  const got = service.getGoal("g_objective");
  assert.equal(got.ok, true);
  assert.equal(got.level, "OBJECTIVE");
  assert.ok(Object.isFrozen(got.record));
  assert.equal(service.getGoal("g_missing").deny_code, "DENY_UNKNOWN_GOAL");
});

test("retireGoal succeeds when there are no active children and no links", () => {
  const { service } = makeService();
  seedChain(service);
  const result = service.retireGoal("g_objective");
  assert.equal(result.ok, true);
  assert.equal(result.status, "RETIRED");
  assert.equal(service.getGoal("g_objective").status, "RETIRED");
});

test("retireGoal is gated by active children and linked work packages without force", () => {
  const { service } = makeService();
  seedChain(service);
  // Product has an ACTIVE objective child.
  assert.equal(service.retireGoal("g_product").deny_code, "DENY_HAS_ACTIVE_CHILDREN");
  // Objective has a linked WP.
  service.linkWorkPackage("g_objective", "wp_1");
  assert.equal(service.retireGoal("g_objective").deny_code, "DENY_HAS_LINKED_WORK_PACKAGES");
  assert.equal(service.retireGoal("g_missing").deny_code, "DENY_UNKNOWN_GOAL");
});

test("force retire requires a valid pairwise-distinct N-5 approval", () => {
  function fresh() {
    const { service } = makeService();
    seedChain(service);
    service.linkWorkPackage("g_objective", "wp_1");
    return service;
  }
  const good = [
    { role: "independent_review", actor_id: "rev-1", decided_at: "2026-07-19T09:00:00Z" },
    { role: "governance", actor_id: "gov-1", decided_at: "2026-07-19T09:30:00Z" }
  ];
  assert.equal(fresh().retireGoal("g_objective", { force: true, approvals: good }).ok, true);

  // Missing approvals bundle.
  assert.equal(fresh().retireGoal("g_objective", { force: true }).deny_code, "DENY_APPROVALS");
  // Independent reviewer is the goal producer (claude-motor).
  assert.equal(
    fresh().retireGoal("g_objective", { force: true, approvals: [
      { role: "independent_review", actor_id: "claude-motor", decided_at: "2026-07-19T09:00:00Z" },
      { role: "governance", actor_id: "gov-1", decided_at: "2026-07-19T09:30:00Z" }
    ] }).deny_code,
    "DENY_SELF_APPROVAL"
  );
  // Both approvals held by the same actor.
  assert.equal(
    fresh().retireGoal("g_objective", { force: true, approvals: [
      { role: "independent_review", actor_id: "same", decided_at: "2026-07-19T09:00:00Z" },
      { role: "governance", actor_id: "same", decided_at: "2026-07-19T09:30:00Z" }
    ] }).deny_code,
    "DENY_SOD_VIOLATION"
  );
  // Governance approver is the producer.
  assert.equal(
    fresh().retireGoal("g_objective", { force: true, approvals: [
      { role: "independent_review", actor_id: "rev-1", decided_at: "2026-07-19T09:00:00Z" },
      { role: "governance", actor_id: "claude-motor", decided_at: "2026-07-19T09:30:00Z" }
    ] }).deny_code,
    "DENY_SOD_VIOLATION"
  );
});

test("listGoals enumerates highest-version goal summaries with current status", () => {
  const { service } = makeService();
  seedChain(service);
  // A second version of the objective shadows v1 in the summary.
  assert.equal(service.registerGoal(objective({ version: 2, status: "DRAFT" })).ok, true);
  const summaries = service.listGoals();
  assert.ok(Object.isFrozen(summaries));
  const byId = new Map(summaries.map((s) => [s.goal_id, s]));
  assert.equal(byId.size, 3);
  assert.deepEqual({ ...byId.get("g_objective") }, {
    goal_id: "g_objective", version: 2, level: "OBJECTIVE", status: "DRAFT", parent_goal_id: "g_product"
  });
  assert.equal(byId.get("g_portfolio").parent_goal_id, null);
  // Retirement is reflected as current status in the enumeration.
  service.retireGoal("g_objective");
  assert.equal(new Map(service.listGoals().map((s) => [s.goal_id, s])).get("g_objective").status, "RETIRED");
});

test("listLinkedWorkPackages returns the frozen linked work-package ids", () => {
  const { service } = makeService();
  seedChain(service);
  assert.deepEqual(service.listLinkedWorkPackages("g_objective"), []);
  assert.deepEqual(service.listLinkedWorkPackages(""), []);
  service.linkWorkPackage("g_objective", "wp_1");
  service.linkWorkPackage("g_objective", "wp_2");
  const linked = service.listLinkedWorkPackages("g_objective");
  assert.ok(Object.isFrozen(linked));
  assert.deepEqual([...linked].sort(), ["wp_1", "wp_2"]);
  assert.deepEqual(service.listLinkedWorkPackages("g_unlinked"), []);
});

test("retireGoal denies on unavailable clock and throwing ledger", () => {
  const clock = makeService({ now: () => new Date(NaN) });
  assert.equal(clock.service.retireGoal("g_objective").deny_code, "DENY_CLOCK_UNAVAILABLE");

  let live = true;
  const { service } = makeService({ ledgerWriter: () => { if (!live) throw new Error("down"); } });
  seedChain(service);
  live = false;
  assert.equal(service.retireGoal("g_objective").deny_code, "DENY_AUDIT_UNAVAILABLE");
  live = true;
  // Retirement never took effect.
  assert.equal(service.getGoal("g_objective").status, "ACTIVE");
});
