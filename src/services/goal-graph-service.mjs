// MOD-WORK Slice 2 candidate: GoalGraphService (R2).
//
// External traceability index over the portfolio -> product -> objective goal
// hierarchy and the objective -> work-package linkage (canonical
// `WorkPackage ADVANCES Objective`). Deny-by-default, fail-closed, pure
// in-process core: no transport, filesystem, network, credential access, or
// process spawning. Persistence is delegated to an injected append-only
// ledgerWriter; every state change is written to the ledger BEFORE it takes
// effect (audit-first), and a throwing writer yields a structured denial with
// no state change.
//
// EXTERNAL INDEX ONLY: linkage records that a work package advances an
// objective. It performs no work-package mutation and grants no authority
// semantics (the R3 gate-WP-on-linkage / embed-objective_id variants are
// explicitly deferred per mod-work-gap-assessment-001 section 5). Work-package
// existence is proven only through the injected read-only workPackageResolver.

import { RESERVED_ID_DELIMITERS, findReservedDelimiter } from "../contracts/reserved-delimiters.mjs";
import { normalizeRole, checkPairwiseDistinct } from "../control/sod-rules.mjs";

// Closed hierarchy: each level's required parent level. PORTFOLIO is the root
// (null parent); PRODUCT hangs off a PORTFOLIO; OBJECTIVE hangs off a PRODUCT.
const LEVEL_PARENT = Object.freeze({
  PORTFOLIO: null,
  PRODUCT: "PORTFOLIO",
  OBJECTIVE: "PRODUCT"
});

const isBlank = (value) => typeof value !== "string" || value.trim() === "";

function hardenedRecord(entries) {
  const output = Object.create(null);
  for (const [key, value] of entries) {
    Object.defineProperty(output, key, {
      value,
      enumerable: true,
      configurable: false,
      writable: false
    });
  }
  return Object.freeze(output);
}

const deny = (code) => hardenedRecord([
  ["ok", false],
  ["deny_code", code],
  ["message", "request denied"]
]);

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

function normalizeAttemptedAt(value) {
  try {
    const epochMs = Date.prototype.getTime.call(value);
    if (!Number.isFinite(epochMs)) return null;
    return new Date(epochMs).toISOString();
  } catch {
    return null;
  }
}

function hasReservedDelimiter(...values) {
  return values.some((value) => findReservedDelimiter(value) !== null);
}

// A single approval is well-formed when it carries a non-blank role, a
// non-blank actor id, and a parseable decided_at timestamp. (Shape check kept
// local: the kernel SoD module owns actor/role SoD primitives, not approval
// record shapes.)
function approvalWellFormed(approval) {
  return approval !== null
    && typeof approval === "object"
    && !Array.isArray(approval)
    && !isBlank(approval.role)
    && !isBlank(approval.actor_id)
    && !isBlank(approval.decided_at)
    && Number.isFinite(Date.parse(approval.decided_at));
}

// Evaluate a governance-approval bundle for force-retirement (N-5 shape):
// one independent-review approval + one governance approval, with producer,
// independent reviewer, and governance approver three pairwise-distinct
// actors. Role tokens are resolved through the kernel role vocabulary
// (normalizeRole: independent_review -> REV, governance -> GOV) and the
// distinctness gate is the kernel checkPairwiseDistinct primitive. Structured
// deny codes mirror the capability-registry N-5 gate:
//   DENY_APPROVALS      - malformed bundle, missing role, or unknown producer
//   DENY_SELF_APPROVAL  - independent reviewer is the producer
//   DENY_SOD_VIOLATION  - the two approvers collapse, or governance is producer
function evaluateForceRetireApprovals(approvals, producerActorId) {
  if (!Array.isArray(approvals) || approvals.length === 0 || !approvals.every(approvalWellFormed)) {
    return { ok: false, code: "DENY_APPROVALS" };
  }
  if (isBlank(producerActorId)) {
    return { ok: false, code: "DENY_APPROVALS" };
  }
  const independent = approvals.find((approval) => normalizeRole(approval.role) === "REV");
  const governance = approvals.find((approval) => normalizeRole(approval.role) === "GOV");
  if (!independent || !governance) {
    return { ok: false, code: "DENY_APPROVALS" };
  }
  // Producer-as-independent is the dedicated self-approval deny; remaining
  // collapses (one non-producer actor holding BOTH approvals, or the producer
  // holding the governance role) fall through to the pairwise-distinct gate.
  if (independent.actor_id === producerActorId) {
    return { ok: false, code: "DENY_SELF_APPROVAL" };
  }
  const distinct = checkPairwiseDistinct([
    { role: "producer", actorId: producerActorId },
    { role: "independent_review", actorId: independent.actor_id },
    { role: "governance", actorId: governance.actor_id }
  ], { code: "DENY_SOD_VIOLATION" });
  if (!distinct.ok) {
    return { ok: false, code: distinct.code };
  }
  return { ok: true, independent, governance };
}

export class GoalGraphService {
  #schemaValidator;
  #ledgerWriter;
  #workPackageResolver;
  #now;
  // Goals keyed by `${goal_id}|${version}`; each entry keeps a mutable status
  // separate from the frozen contract (retirement flips status without
  // mutating the stored record). Graph reads resolve a goal_id to its highest
  // registered version.
  #goals = new Map();
  // Links keyed by goal_id -> Map<work_package_id, link>. Version-independent:
  // linkage binds an objective identity, not a specific goal version.
  #links = new Map();
  #nextSequence = 1;

  constructor({ schemaValidator, ledgerWriter, workPackageResolver, now = () => new Date() } = {}) {
    if (typeof schemaValidator !== "function") {
      throw new Error("GoalGraphService requires a schemaValidator function (fail-closed record validation)");
    }
    if (typeof ledgerWriter !== "function") {
      throw new Error("GoalGraphService requires an append-only ledgerWriter function (fail-closed audit)");
    }
    if (typeof workPackageResolver !== "function") {
      throw new Error("GoalGraphService requires a workPackageResolver function (external work-package index)");
    }
    if (typeof now !== "function") throw new Error("now must be a function");
    this.#schemaValidator = schemaValidator;
    this.#ledgerWriter = ledgerWriter;
    this.#workPackageResolver = workPackageResolver;
    this.#now = now;
  }

  // Audit-first: write the attempted action BEFORE any effect. A throwing
  // writer denies the action entirely (returns false -> DENY_AUDIT_UNAVAILABLE).
  #audit(event, disposition, fields) {
    try {
      this.#ledgerWriter(hardenedRecord([
        ["sequence", this.#nextSequence++],
        ["attempted_at", fields.attempted_at ?? null],
        ["component", "goal-graph"],
        ["event", event],
        ["disposition", disposition],
        ["goal_id", fields.goal_id ?? null],
        ["version", fields.version ?? null],
        ["level", fields.level ?? null],
        ["work_package_id", fields.work_package_id ?? null],
        ["actors", Object.freeze(fields.actors ?? [])],
        ["reason", fields.reason ?? null]
      ]));
      return true;
    } catch {
      return false;
    }
  }

  #denyAudited(event, code, fields) {
    if (!this.#audit(event, code, fields)) return deny("DENY_AUDIT_UNAVAILABLE");
    return deny(code);
  }

  #attemptedAt() {
    try {
      return normalizeAttemptedAt(this.#now());
    } catch {
      return null;
    }
  }

  #key(goalId, version) {
    return `${goalId}|${version}`;
  }

  // Highest registered version for a goal_id, or null.
  #resolveGoalId(goalId) {
    if (isBlank(goalId)) return null;
    let best = null;
    for (const entry of this.#goals.values()) {
      if (entry.goalId !== goalId) continue;
      if (!best || entry.version > best.version) best = entry;
    }
    return best;
  }

  registerGoal(record) {
    const attemptedAt = this.#attemptedAt();
    const fields = {
      attempted_at: attemptedAt,
      goal_id: isBlank(record?.goal_id) ? null : record.goal_id,
      version: Number.isInteger(record?.version) ? record.version : null,
      level: isBlank(record?.level) ? null : record.level
    };
    if (attemptedAt === null) return this.#denyAudited("REGISTER_GOAL", "DENY_CLOCK_UNAVAILABLE", fields);

    let validation;
    try {
      validation = this.#schemaValidator(record);
    } catch {
      return this.#denyAudited("REGISTER_GOAL", "DENY_RECORD_INVALID", fields);
    }
    if (validation !== true && validation?.valid !== true) {
      return this.#denyAudited("REGISTER_GOAL", "DENY_RECORD_INVALID", fields);
    }

    // Reserved composite-key delimiters are denied in every id field.
    if (hasReservedDelimiter(record.goal_id, record.project_id)
      || (typeof record.parent_goal_id === "string" && hasReservedDelimiter(record.parent_goal_id))) {
      return this.#denyAudited("REGISTER_GOAL", "DENY_ID_CHARSET", fields);
    }

    if (!(record.level in LEVEL_PARENT)) {
      return this.#denyAudited("REGISTER_GOAL", "DENY_HIERARCHY", fields);
    }
    const requiredParentLevel = LEVEL_PARENT[record.level];

    // PORTFOLIO must have a null parent; PRODUCT/OBJECTIVE must name a parent.
    if (requiredParentLevel === null) {
      if (record.parent_goal_id !== null) {
        return this.#denyAudited("REGISTER_GOAL", "DENY_HIERARCHY", fields);
      }
    } else {
      if (typeof record.parent_goal_id !== "string" || isBlank(record.parent_goal_id)) {
        return this.#denyAudited("REGISTER_GOAL", "DENY_HIERARCHY", fields);
      }
      const parent = this.#resolveGoalId(record.parent_goal_id);
      if (!parent || parent.level !== requiredParentLevel) {
        return this.#denyAudited("REGISTER_GOAL", "DENY_HIERARCHY", fields);
      }
    }

    const key = this.#key(record.goal_id, record.version);
    if (this.#goals.has(key)) {
      return this.#denyAudited("REGISTER_GOAL", "DENY_DUPLICATE", fields);
    }

    const stored = deepFreeze(structuredClone(record));
    if (!this.#audit("REGISTER_GOAL", "ALLOW", fields)) {
      return deny("DENY_AUDIT_UNAVAILABLE");
    }
    this.#goals.set(key, {
      goalId: record.goal_id,
      version: record.version,
      level: record.level,
      status: record.status,
      producerActorId: record.provenance.agent_id,
      record: stored
    });
    return hardenedRecord([
      ["ok", true],
      ["goal_id", record.goal_id],
      ["version", record.version],
      ["level", record.level],
      ["status", record.status]
    ]);
  }

  linkWorkPackage(goalId, workPackageId) {
    const attemptedAt = this.#attemptedAt();
    const fields = {
      attempted_at: attemptedAt,
      goal_id: isBlank(goalId) ? null : goalId,
      work_package_id: isBlank(workPackageId) ? null : workPackageId
    };
    if (attemptedAt === null) return this.#denyAudited("LINK_WORK_PACKAGE", "DENY_CLOCK_UNAVAILABLE", fields);

    if (isBlank(goalId) || isBlank(workPackageId)) {
      return this.#denyAudited("LINK_WORK_PACKAGE", "DENY_GOAL_NOT_LINKABLE", fields);
    }
    if (hasReservedDelimiter(goalId, workPackageId)) {
      return this.#denyAudited("LINK_WORK_PACKAGE", "DENY_ID_CHARSET", fields);
    }

    // A goal is linkable only when it exists, is an OBJECTIVE, and is ACTIVE.
    const goal = this.#resolveGoalId(goalId);
    if (!goal || goal.level !== "OBJECTIVE" || goal.status !== "ACTIVE") {
      return this.#denyAudited("LINK_WORK_PACKAGE", "DENY_GOAL_NOT_LINKABLE", { ...fields, level: goal?.level ?? null });
    }

    // Work-package existence is proven only through the external resolver.
    let resolved;
    try {
      resolved = this.#workPackageResolver(workPackageId);
    } catch {
      return this.#denyAudited("LINK_WORK_PACKAGE", "DENY_UNKNOWN_WORK_PACKAGE", { ...fields, level: goal.level });
    }
    if (!resolved || resolved.allowed === false) {
      return this.#denyAudited("LINK_WORK_PACKAGE", "DENY_UNKNOWN_WORK_PACKAGE", { ...fields, level: goal.level });
    }

    const existing = this.#links.get(goalId);
    if (existing?.has(workPackageId)) {
      return this.#denyAudited("LINK_WORK_PACKAGE", "DENY_ALREADY_LINKED", { ...fields, level: goal.level });
    }

    if (!this.#audit("LINK_WORK_PACKAGE", "ALLOW", { ...fields, level: goal.level })) {
      return deny("DENY_AUDIT_UNAVAILABLE");
    }
    const links = existing ?? new Map();
    links.set(workPackageId, deepFreeze({
      goal_id: goalId,
      work_package_id: workPackageId,
      linked_at: attemptedAt
    }));
    this.#links.set(goalId, links);
    return hardenedRecord([
      ["ok", true],
      ["goal_id", goalId],
      ["work_package_id", workPackageId],
      ["status", "LINKED"]
    ]);
  }

  // Read-only: resolve the wp -> objective -> product -> portfolio chain.
  traceChain(workPackageId) {
    if (isBlank(workPackageId)) return deny("DENY_UNKNOWN_WORK_PACKAGE");
    let objectiveGoalId = null;
    for (const [goalId, links] of this.#links) {
      if (links.has(workPackageId)) {
        objectiveGoalId = goalId;
        break;
      }
    }
    if (objectiveGoalId === null) return deny("DENY_UNKNOWN_WORK_PACKAGE");

    const objective = this.#resolveGoalId(objectiveGoalId);
    if (!objective || objective.level !== "OBJECTIVE") return deny("DENY_BROKEN_CHAIN");

    const product = this.#resolveGoalId(objective.record.parent_goal_id);
    if (!product || product.level !== "PRODUCT") return deny("DENY_BROKEN_CHAIN");

    const portfolio = this.#resolveGoalId(product.record.parent_goal_id);
    if (!portfolio || portfolio.level !== "PORTFOLIO") return deny("DENY_BROKEN_CHAIN");

    return hardenedRecord([
      ["ok", true],
      ["work_package_id", workPackageId],
      ["chain", deepFreeze({
        work_package_id: workPackageId,
        objective: objective.goalId,
        product: product.goalId,
        portfolio: portfolio.goalId
      })]
    ]);
  }

  // Read-only accessor for a goal_id's highest registered version.
  getGoal(goalId) {
    const entry = this.#resolveGoalId(goalId);
    if (!entry) return deny("DENY_UNKNOWN_GOAL");
    return hardenedRecord([
      ["ok", true],
      ["goal_id", entry.goalId],
      ["version", entry.version],
      ["level", entry.level],
      ["status", entry.status],
      ["record", entry.record]
    ]);
  }

  // Read-only enumeration: a frozen summary of every goal at its highest
  // registered version, carrying current status and parent linkage. Additive
  // accessor for external read models (goal-rollup-projection, Slice 3); pure
  // read, no state change, no audit (nothing is attempted).
  listGoals() {
    const summaries = new Map();
    for (const entry of this.#goals.values()) {
      const best = summaries.get(entry.goalId);
      if (!best || entry.version > best.version) {
        summaries.set(entry.goalId, {
          goal_id: entry.goalId,
          version: entry.version,
          level: entry.level,
          status: entry.status,
          parent_goal_id: entry.record.parent_goal_id
        });
      }
    }
    return deepFreeze([...summaries.values()]);
  }

  // Read-only enumeration: the frozen list of work_package_ids linked to a
  // goal (empty for a blank or unlinked goal). Additive accessor for external
  // read models; pure read, no state change.
  listLinkedWorkPackages(goalId) {
    if (isBlank(goalId)) return deepFreeze([]);
    const links = this.#links.get(goalId);
    if (!links) return deepFreeze([]);
    return deepFreeze([...links.keys()]);
  }

  // Retire a goal. Blocked while it has ACTIVE child goals or any linked work
  // packages, unless `force` is set AND `approvals` carries a valid N-5
  // pairwise-distinct governance approval (independent review + governance,
  // three actors distinct from the goal's producer).
  retireGoal(goalId, { force = false, approvals = null } = {}) {
    const attemptedAt = this.#attemptedAt();
    const fields = {
      attempted_at: attemptedAt,
      goal_id: isBlank(goalId) ? null : goalId,
      actors: Array.isArray(approvals)
        ? approvals.filter((a) => a && typeof a === "object" && !isBlank(a.role) && !isBlank(a.actor_id)).map((a) => `${a.role}:${a.actor_id}`)
        : []
    };
    if (attemptedAt === null) return this.#denyAudited("RETIRE_GOAL", "DENY_CLOCK_UNAVAILABLE", fields);

    const entry = this.#resolveGoalId(goalId);
    if (!entry) return this.#denyAudited("RETIRE_GOAL", "DENY_UNKNOWN_GOAL", fields);
    fields.version = entry.version;
    fields.level = entry.level;

    const hasActiveChildren = [...this.#goals.values()].some(
      (candidate) => candidate.record.parent_goal_id === goalId && candidate.status === "ACTIVE"
    );
    const linkedCount = this.#links.get(goalId)?.size ?? 0;

    if (hasActiveChildren && !force) {
      return this.#denyAudited("RETIRE_GOAL", "DENY_HAS_ACTIVE_CHILDREN", fields);
    }
    if (linkedCount > 0 && !force) {
      return this.#denyAudited("RETIRE_GOAL", "DENY_HAS_LINKED_WORK_PACKAGES", fields);
    }

    if (force && (hasActiveChildren || linkedCount > 0)) {
      const verdict = evaluateForceRetireApprovals(approvals, entry.producerActorId);
      if (!verdict.ok) {
        return this.#denyAudited("RETIRE_GOAL", verdict.code, fields);
      }
    }

    if (!this.#audit("RETIRE_GOAL", "ALLOW", fields)) {
      return deny("DENY_AUDIT_UNAVAILABLE");
    }
    entry.status = "RETIRED";
    return hardenedRecord([
      ["ok", true],
      ["goal_id", entry.goalId],
      ["version", entry.version],
      ["status", "RETIRED"]
    ]);
  }
}

export { RESERVED_ID_DELIMITERS };
