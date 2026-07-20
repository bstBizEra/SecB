import assert from "node:assert/strict";
import test from "node:test";
import { GoalGraphService } from "../src/services/goal-graph-service.mjs";
import { createGoalRollupProjection } from "../src/ui/goal-rollup-projection.mjs";
import { validateContract } from "../src/contracts/contract-validator.mjs";

const HASH = "a".repeat(64);
const schemaValidator = (record) => validateContract("goal", record);

function provenance(agentId = "claude-motor") {
  return { source: "mod-work-gap-assessment-001.md", agent_id: agentId, created_at: "2026-07-19T10:00:00+07:00" };
}
function goal(level, overrides = {}) {
  const base = { version: 1, project_id: "prj_secb_local", level, title: level, status: "ACTIVE", provenance: provenance(), content_hash: HASH };
  return { ...base, ...overrides };
}

// Build a live GoalGraphService with a portfolio -> product -> objective chain
// and (optionally) a second objective, linking work packages per `links`.
function makeGraph({ links = {}, secondObjective = false } = {}) {
  const service = new GoalGraphService({
    schemaValidator,
    ledgerWriter: () => {},
    workPackageResolver: () => ({ allowed: true }),
    now: () => new Date("2026-07-19T10:00:00Z")
  });
  assert.equal(service.registerGoal(goal("PORTFOLIO", { goal_id: "g_pf", parent_goal_id: null })).ok, true);
  assert.equal(service.registerGoal(goal("PRODUCT", { goal_id: "g_pr", parent_goal_id: "g_pf" })).ok, true);
  assert.equal(service.registerGoal(goal("OBJECTIVE", { goal_id: "g_ob1", parent_goal_id: "g_pr" })).ok, true);
  if (secondObjective) {
    assert.equal(service.registerGoal(goal("OBJECTIVE", { goal_id: "g_ob2", parent_goal_id: "g_pr" })).ok, true);
  }
  for (const [goalId, wpIds] of Object.entries(links)) {
    for (const wpId of wpIds) assert.equal(service.linkWorkPackage(goalId, wpId).ok, true);
  }
  return service;
}

// Resolver over a fixed status table; ids absent from the table are unresolvable.
function statusResolver(table) {
  return (workPackageId) => (workPackageId in table ? { status: table[workPackageId] } : null);
}

test("factory fails closed on missing collaborators", () => {
  const service = makeGraph();
  assert.throws(() => createGoalRollupProjection({}));
  assert.throws(() => createGoalRollupProjection({ goalGraphService: service }));
  assert.throws(() => createGoalRollupProjection({ goalGraphService: {}, workPackageResolver: () => ({}) }));
  assert.throws(() => createGoalRollupProjection({ goalGraphService: service, workPackageResolver: 5 }));
});

test("objective rollup counts work packages by status and derives PARTIAL completion", () => {
  const service = makeGraph({ links: { g_ob1: ["wp_a", "wp_b", "wp_c"] } });
  const projection = createGoalRollupProjection({
    goalGraphService: service,
    workPackageResolver: statusResolver({ wp_a: "ACCEPTED", wp_b: "RUNNING", wp_c: "ACCEPTED" })
  });
  const result = projection.rollupForGoal("g_ob1");
  assert.equal(result.ok, true);
  assert.equal(result.level, "OBJECTIVE");
  assert.equal(result.data_untrusted, true);
  assert.equal(result.work_package_count, 3);
  assert.deepEqual({ ...result.counts_by_status }, { ACCEPTED: 2, RUNNING: 1 });
  assert.equal(result.completion_signal, "PARTIAL");
  assert.equal(result.work_packages.length, 3);
  assert.deepEqual({ ...result.work_packages[0] }, { work_package_id: "wp_a", status: "ACCEPTED", resolution: "RESOLVED" });
});

test("objective rollup with all work packages ACCEPTED is COMPLETE", () => {
  const service = makeGraph({ links: { g_ob1: ["wp_a", "wp_b"] } });
  const projection = createGoalRollupProjection({
    goalGraphService: service,
    workPackageResolver: statusResolver({ wp_a: "ACCEPTED", wp_b: "ACCEPTED" })
  });
  const result = projection.rollupForGoal("g_ob1");
  assert.equal(result.completion_signal, "COMPLETE");
  assert.deepEqual({ ...result.counts_by_status }, { ACCEPTED: 2 });
});

test("objective with no linked work packages rolls up EMPTY", () => {
  const service = makeGraph();
  const projection = createGoalRollupProjection({ goalGraphService: service, workPackageResolver: statusResolver({}) });
  const result = projection.rollupForGoal("g_ob1");
  assert.equal(result.ok, true);
  assert.equal(result.work_package_count, 0);
  assert.deepEqual({ ...result.counts_by_status }, {});
  assert.equal(result.completion_signal, "EMPTY");
  assert.deepEqual(result.work_packages.map((w) => w.work_package_id), []);
});

test("product rollup aggregates its objective children", () => {
  const service = makeGraph({ secondObjective: true, links: { g_ob1: ["wp_a"], g_ob2: ["wp_b", "wp_c"] } });
  const projection = createGoalRollupProjection({
    goalGraphService: service,
    workPackageResolver: statusResolver({ wp_a: "ACCEPTED", wp_b: "ACCEPTED", wp_c: "RUNNING" })
  });
  const result = projection.rollupForGoal("g_pr");
  assert.equal(result.level, "PRODUCT");
  assert.equal(result.work_package_count, 3);
  assert.deepEqual({ ...result.counts_by_status }, { ACCEPTED: 2, RUNNING: 1 });
  assert.equal(result.completion_signal, "PARTIAL");
  assert.equal(result.children.length, 2);
  const childIds = result.children.map((c) => c.goal_id).sort();
  assert.deepEqual(childIds, ["g_ob1", "g_ob2"]);
  assert.equal(result.degraded, false);
});

test("portfolio rollup recursively aggregates the whole subtree", () => {
  const service = makeGraph({ secondObjective: true, links: { g_ob1: ["wp_a"], g_ob2: ["wp_b"] } });
  const projection = createGoalRollupProjection({
    goalGraphService: service,
    workPackageResolver: statusResolver({ wp_a: "ACCEPTED", wp_b: "ACCEPTED" })
  });
  const result = projection.rollupForGoal("g_pf");
  assert.equal(result.level, "PORTFOLIO");
  assert.equal(result.work_package_count, 2);
  assert.equal(result.completion_signal, "COMPLETE");
  // Immediate children are the product(s); descendant WP counts still aggregate up.
  assert.deepEqual(result.children.map((c) => c.goal_id), ["g_pr"]);
});

test("unresolvable work packages are marked UNKNOWN and block a completion claim", () => {
  const service = makeGraph({ links: { g_ob1: ["wp_a", "wp_gone"] } });
  const projection = createGoalRollupProjection({
    goalGraphService: service,
    // wp_gone is absent from the table -> resolver returns null -> UNKNOWN.
    workPackageResolver: statusResolver({ wp_a: "ACCEPTED" })
  });
  const result = projection.rollupForGoal("g_ob1");
  assert.equal(result.work_package_count, 2);
  assert.deepEqual({ ...result.counts_by_status }, { ACCEPTED: 1, UNKNOWN: 1 });
  assert.equal(result.completion_signal, "UNKNOWN");
  const gone = result.work_packages.find((w) => w.work_package_id === "wp_gone");
  assert.deepEqual({ ...gone }, { work_package_id: "wp_gone", status: null, resolution: "UNKNOWN" });
});

test("a throwing resolver marks the work package UNKNOWN instead of throwing", () => {
  const service = makeGraph({ links: { g_ob1: ["wp_a"] } });
  const projection = createGoalRollupProjection({
    goalGraphService: service,
    workPackageResolver: () => { throw new Error("wp source down"); }
  });
  const result = projection.rollupForGoal("g_ob1");
  assert.equal(result.completion_signal, "UNKNOWN");
  assert.deepEqual({ ...result.counts_by_status }, { UNKNOWN: 1 });
});

test("unknown goal returns a structured deny", () => {
  const service = makeGraph();
  const projection = createGoalRollupProjection({ goalGraphService: service, workPackageResolver: statusResolver({}) });
  const result = projection.rollupForGoal("g_missing");
  assert.equal(result.ok, false);
  assert.equal(result.deny_code, "DENY_UNKNOWN_GOAL");
  assert.equal(result.data_untrusted, true);
  assert.ok(Object.isFrozen(result));
});

test("a blank goal id is denied deny-by-default", () => {
  const service = makeGraph();
  const projection = createGoalRollupProjection({ goalGraphService: service, workPackageResolver: statusResolver({}) });
  assert.equal(projection.rollupForGoal("").deny_code, "DENY_INVALID_GOAL_ID");
  assert.equal(projection.rollupForGoal("   ").deny_code, "DENY_INVALID_GOAL_ID");
  assert.equal(projection.rollupForGoal(null).deny_code, "DENY_INVALID_GOAL_ID");
});

test("a broken hierarchy link surfaces as a DEGRADED entry, not a throw", () => {
  // Fake read surface: a PRODUCT whose only child is (wrongly) a PORTFOLIO.
  const fakeService = {
    getGoal: (id) => (id === "g_pr"
      ? { ok: true, goal_id: "g_pr", level: "PRODUCT", status: "ACTIVE" }
      : { ok: false, deny_code: "DENY_UNKNOWN_GOAL" }),
    listGoals: () => [
      { goal_id: "g_pr", version: 1, level: "PRODUCT", status: "ACTIVE", parent_goal_id: null },
      { goal_id: "g_weird", version: 1, level: "PORTFOLIO", status: "ACTIVE", parent_goal_id: "g_pr" }
    ],
    listLinkedWorkPackages: () => []
  };
  const projection = createGoalRollupProjection({ goalGraphService: fakeService, workPackageResolver: statusResolver({}) });
  const result = projection.rollupForGoal("g_pr");
  assert.equal(result.ok, true);
  assert.equal(result.degraded, true);
  assert.deepEqual(result.degraded_entries.map((e) => ({ ...e })), [{ goal_id: "g_weird", reason: "UNEXPECTED_CHILD_LEVEL" }]);
  const weirdChild = result.children.find((c) => c.goal_id === "g_weird");
  assert.equal(weirdChild.degraded, true);
});

test("projected output is deeply frozen (immutable read model)", () => {
  const service = makeGraph({ secondObjective: true, links: { g_ob1: ["wp_a"], g_ob2: ["wp_b"] } });
  const projection = createGoalRollupProjection({
    goalGraphService: service,
    workPackageResolver: statusResolver({ wp_a: "ACCEPTED", wp_b: "RUNNING" })
  });
  const objectiveResult = projection.rollupForGoal("g_ob1");
  assert.ok(Object.isFrozen(objectiveResult));
  assert.ok(Object.isFrozen(objectiveResult.counts_by_status));
  assert.ok(Object.isFrozen(objectiveResult.work_packages));
  assert.ok(Object.isFrozen(objectiveResult.work_packages[0]));
  assert.throws(() => { objectiveResult.completion_signal = "COMPLETE"; }, TypeError);

  const portfolioResult = projection.rollupForGoal("g_pf");
  assert.ok(Object.isFrozen(portfolioResult));
  assert.ok(Object.isFrozen(portfolioResult.children));
  assert.ok(Object.isFrozen(portfolioResult.children[0]));
  assert.ok(Object.isFrozen(portfolioResult.counts_by_status));
});
