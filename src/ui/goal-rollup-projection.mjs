// MOD-WORK Slice 3: goal rollup projection (R1).
//
// Pure read model over the GoalGraphService traceability index. Given the goal
// hierarchy (PORTFOLIO -> PRODUCT -> OBJECTIVE) and the objective -> work-package
// linkage, it projects a per-goal rollup: work-package counts by status, child
// goal statuses, and a completion signal derived ONLY from observable states.
//
// Deny-by-default and fail-closed like the other read projections
// (src/ui/report-projections.mjs): an unknown goal returns a structured deny, a
// broken hierarchy link surfaces as a DEGRADED entry (never a throw), and a work
// package the injected resolver cannot resolve is marked UNKNOWN rather than
// assumed complete. Work-package states are caller-side data, so every projected
// result carries data_untrusted: true.
//
// No I/O, no clock, no mutation, no authority. The GoalGraphService read surface
// (getGoal / listGoals / listLinkedWorkPackages) and a workPackageResolver are
// injected; the projection holds no state of its own. It is an index-only read
// model and grants no authority (R1) — consistent with the Slice 2 service.

// The single observable "done" state. Completion is derived only from this
// state being present on a resolved work package; nothing is inferred for
// work packages the resolver cannot resolve.
const COMPLETION_STATE = "ACCEPTED";

// Expected child goal level for each parent level. OBJECTIVE is a leaf: it
// carries linked work packages, not child goals.
const EXPECTED_CHILD_LEVEL = Object.freeze({
  PORTFOLIO: "PRODUCT",
  PRODUCT: "OBJECTIVE",
  OBJECTIVE: null
});

const isBlank = (value) => typeof value !== "string" || value.trim() === "";

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function deny(code) {
  return deepFreeze({ ok: false, deny_code: code, data_untrusted: true });
}

// Every work package contributes exactly one bucket to counts_by_status (its
// resolved status, or UNKNOWN when unresolvable), so the totals derive directly
// from the aggregated counts — leaf and parent nodes use the same arithmetic.
function totalsFromCounts(counts) {
  let total = 0;
  for (const value of Object.values(counts)) total += value;
  return {
    total,
    completed: counts[COMPLETION_STATE] ?? 0,
    unknown: counts.UNKNOWN ?? 0
  };
}

// Completion signal from observable counts only. Unresolved (UNKNOWN) work
// packages make completeness undeterminable — never assumed complete.
function deriveCompletion({ total, completed, unknown }) {
  if (total === 0) return "EMPTY";
  if (unknown > 0) return "UNKNOWN";
  if (completed === total) return "COMPLETE";
  if (completed > 0) return "PARTIAL";
  return "NONE";
}

// Roll up an OBJECTIVE: resolve each linked work package's status through the
// injected resolver. A resolver that throws, returns falsy, or returns no
// usable status marks that work package UNKNOWN (fail-closed) rather than
// dropping it or assuming a state.
function rollupObjective(summary, ctx) {
  const workPackageIds = ctx.listLinkedWorkPackages(summary.goal_id);
  const counts = {};
  const workPackages = [];
  for (const workPackageId of workPackageIds) {
    let status = null;
    let resolution = "RESOLVED";
    try {
      const resolved = ctx.workPackageResolver(workPackageId);
      if (resolved && typeof resolved === "object" && !isBlank(resolved.status)) {
        status = resolved.status;
      } else {
        resolution = "UNKNOWN";
      }
    } catch {
      resolution = "UNKNOWN";
    }
    const bucket = resolution === "UNKNOWN" ? "UNKNOWN" : status;
    counts[bucket] = (counts[bucket] ?? 0) + 1;
    workPackages.push({
      work_package_id: workPackageId,
      status: resolution === "UNKNOWN" ? null : status,
      resolution
    });
  }
  const totals = totalsFromCounts(counts);
  return {
    goal_id: summary.goal_id,
    level: "OBJECTIVE",
    status: summary.status,
    counts_by_status: counts,
    work_package_count: totals.total,
    work_packages: workPackages,
    completion_signal: deriveCompletion(totals),
    degraded: false,
    degraded_entries: []
  };
}

// Roll up a PRODUCT or PORTFOLIO: recurse over child goals, aggregating their
// counts. A child whose level does not match the expected child level for this
// parent (a broken hierarchy link) is a DEGRADED entry — recorded, never
// thrown. A child already on the ancestor path is a CYCLE (defensive against a
// version-shadowed graph); it is degraded and not re-entered.
function rollupParent(summary, ctx, visited) {
  const expectedChildLevel = EXPECTED_CHILD_LEVEL[summary.level];
  const childSummaries = ctx.childrenByParent.get(summary.goal_id) ?? [];
  const counts = {};
  const children = [];
  const degradedEntries = [];

  for (const child of childSummaries) {
    if (visited.has(child.goal_id)) {
      children.push({ goal_id: child.goal_id, level: child.level, status: child.status, work_package_count: 0, completion_signal: "UNKNOWN", degraded: true, reason: "CYCLE" });
      degradedEntries.push({ goal_id: child.goal_id, reason: "CYCLE" });
      continue;
    }
    if (child.level !== expectedChildLevel) {
      children.push({ goal_id: child.goal_id, level: child.level, status: child.status, work_package_count: 0, completion_signal: "UNKNOWN", degraded: true, reason: "UNEXPECTED_CHILD_LEVEL" });
      degradedEntries.push({ goal_id: child.goal_id, reason: "UNEXPECTED_CHILD_LEVEL" });
      continue;
    }
    const childNode = buildNode(child, ctx, visited);
    for (const [bucket, count] of Object.entries(childNode.counts_by_status)) {
      counts[bucket] = (counts[bucket] ?? 0) + count;
    }
    children.push({
      goal_id: childNode.goal_id,
      level: childNode.level,
      status: childNode.status,
      work_package_count: childNode.work_package_count,
      completion_signal: childNode.completion_signal,
      degraded: childNode.degraded
    });
    if (childNode.degraded) degradedEntries.push(...childNode.degraded_entries);
  }

  const totals = totalsFromCounts(counts);
  return {
    goal_id: summary.goal_id,
    level: summary.level,
    status: summary.status,
    counts_by_status: counts,
    work_package_count: totals.total,
    children,
    completion_signal: deriveCompletion(totals),
    degraded: degradedEntries.length > 0,
    degraded_entries: degradedEntries
  };
}

// Dispatch a node by level. `visited` carries the ancestor path for cycle
// defense; the current node is added before descending.
function buildNode(summary, ctx, visited) {
  const nextVisited = new Set(visited).add(summary.goal_id);
  if (summary.level === "OBJECTIVE") return rollupObjective(summary, ctx);
  return rollupParent(summary, ctx, nextVisited);
}

// Build a deterministic hierarchy snapshot from the service's read surface so a
// single rollup call traverses one consistent view.
function snapshotHierarchy(listGoals) {
  const byId = new Map();
  const childrenByParent = new Map();
  for (const summary of listGoals()) {
    byId.set(summary.goal_id, summary);
    const parent = summary.parent_goal_id;
    if (parent !== null && parent !== undefined) {
      const siblings = childrenByParent.get(parent) ?? [];
      siblings.push(summary);
      childrenByParent.set(parent, siblings);
    }
  }
  return { byId, childrenByParent };
}

// Factory: bind a rollup read model to a GoalGraphService read surface and a
// caller-supplied workPackageResolver. Fail-closed on missing collaborators,
// mirroring the service constructor guards.
export function createGoalRollupProjection({ goalGraphService, workPackageResolver } = {}) {
  if (!goalGraphService
    || typeof goalGraphService.getGoal !== "function"
    || typeof goalGraphService.listGoals !== "function"
    || typeof goalGraphService.listLinkedWorkPackages !== "function") {
    throw new Error("createGoalRollupProjection requires a goalGraphService with getGoal/listGoals/listLinkedWorkPackages read accessors");
  }
  if (typeof workPackageResolver !== "function") {
    throw new Error("createGoalRollupProjection requires a workPackageResolver function (caller-side work-package state source)");
  }

  function rollupForGoal(goalId) {
    if (isBlank(goalId)) return deny("DENY_INVALID_GOAL_ID");
    // Canonical existence check through the service read API.
    const got = goalGraphService.getGoal(goalId);
    if (!got || got.ok !== true) return deny("DENY_UNKNOWN_GOAL");

    const { byId, childrenByParent } = snapshotHierarchy(() => goalGraphService.listGoals());
    const rootSummary = byId.get(goalId);
    if (!rootSummary) return deny("DENY_UNKNOWN_GOAL");

    const ctx = {
      childrenByParent,
      listLinkedWorkPackages: (id) => goalGraphService.listLinkedWorkPackages(id),
      workPackageResolver
    };
    const node = buildNode(rootSummary, ctx, new Set());

    return deepFreeze({
      ok: true,
      data_untrusted: true,
      goal_id: node.goal_id,
      level: node.level,
      status: node.status,
      work_package_count: node.work_package_count,
      counts_by_status: node.counts_by_status,
      completion_signal: node.completion_signal,
      degraded: node.degraded,
      degraded_entries: node.degraded_entries,
      ...(node.level === "OBJECTIVE"
        ? { work_packages: node.work_packages }
        : { children: node.children })
    });
  }

  return Object.freeze({ rollupForGoal });
}
