// MOD-OPS Slice S1 — KPI catalog registry (PURE, UNWIRED).
//
// Purpose (G1 from mod-ops-gap-assessment-001, bst/mod-ops-assessment): give
// `src/` a single pure, frozen, deny-by-default answer to "which KPIs does the
// operations doctrine name, under which group, with which stable identifier?".
// Today the catalog exists only as four prose bullet lists in
// docs/17-operations/02-kpis-and-scorecards.md; nothing in code can enumerate
// it. This registry codifies the 24 doctrine KPI names VERBATIM (doc-parity
// enforced by the test suite, which parses the actual markdown at runtime so
// any code/doc drift fails CI — mirrors MOD-GOV S2 risk-registry / MOD-LIVE S1
// event-family-policy discipline).
//
// Scope discipline: pure data + pure lookups. No I/O, no clock, no schema, no
// persistence, no transport, no imports at all. NOTHING consumes this registry
// in this slice — adoption by a scorecard assembler (S2) or any report/live
// path is later, separately governed work (assessment §5 #4).
//
// Catalog only (G1): this registry NAMES KPIs. It defines no formulas, no
// thresholds, no targets, no measurement sources, no ratings — those are
// G4-future and operator-shaped (assessment §5 #3, #5). Inventing them here
// would be un-sourced authority.
//
// Stable-id scheme: `<group-id>.<kpi-slug>` where both halves are the doctrine
// heading / bullet text lowercased with every non-alphanumeric run collapsed
// to a single hyphen (e.g. "safety/control violations" under "Agents and
// harnesses" -> "agents-and-harnesses.safety-control-violations"). The parity
// test derives every id from the doc text independently, so the scheme itself
// is drift-guarded, not just the literals below.
//
// House style: result objects. Lookups return a deep-frozen { ok: true, ... }
// on success and a frozen { ok: false, code, message } on any malformed or
// unknown input (deny-by-default — an unknown id or group is never coerced to
// a default, never guessed).
//
// FAIL-CLOSED EXTRACTION (WSPACE-S1 house lesson): every property read off a
// caller-supplied input is a SINGLE contained read into a local const inside
// try/catch before any use, so a hostile getter or Proxy trap cannot throw
// past the guard and cannot return one value to a check and another to the
// body. Own-property catalog lookup only (Object.hasOwn) — prototype keys
// ("toString", "constructor", "__proto__") never resolve to an entry.
//
// Audit-before-effect holds by construction: the registry has no side effects;
// its decision record IS its returned frozen result.

// The full closed set of deny codes this registry can emit, frozen so callers
// may switch on it without risk of silent drift.
export const KPI_DENY_CODES = Object.freeze([
  "DENY_KPI_ID_MALFORMED",
  "DENY_KPI_UNKNOWN",
  "DENY_GROUP_UNKNOWN"
]);

const NULL_BYTE = "\0";

const deny = (code, message) => Object.freeze({ ok: false, code, message });

// --- Groups (doc order; names verbatim from the doc's `##` headings) ---------

export const KPI_GROUP_ORDER = Object.freeze([
  "platform",
  "delivery",
  "agents-and-harnesses",
  "learning-and-skills"
]);

export const KPI_GROUPS = Object.freeze({
  "platform": Object.freeze({ id: "platform", name: "Platform" }),
  "delivery": Object.freeze({ id: "delivery", name: "Delivery" }),
  "agents-and-harnesses": Object.freeze({ id: "agents-and-harnesses", name: "Agents and harnesses" }),
  "learning-and-skills": Object.freeze({ id: "learning-and-skills", name: "Learning and skills" })
});

// --- KPI catalog (doc order; names verbatim from the doc's bullet lists) -----

const entry = (group, id, name) => Object.freeze({ id, group, name });

export const KPI_CATALOG = Object.freeze([
  // Platform (docs/17-operations/02-kpis-and-scorecards.md §Platform)
  entry("platform", "platform.governed-session-completion-rate", "governed session completion rate"),
  entry("platform", "platform.evidence-completeness-and-acceptance", "evidence completeness and acceptance"),
  entry("platform", "platform.mean-recovery-time", "mean recovery time"),
  entry("platform", "platform.policy-violation-and-containment-rate", "policy violation and containment rate"),
  entry("platform", "platform.cost-per-accepted-work-package", "cost per accepted work package"),
  entry("platform", "platform.outcome-realization-rate", "outcome realization rate"),
  // Delivery (§Delivery)
  entry("delivery", "delivery.critical-path-reduction", "critical-path reduction"),
  entry("delivery", "delivery.parallel-efficiency", "parallel efficiency"),
  entry("delivery", "delivery.rework-and-late-conflict-rate", "rework and late-conflict rate"),
  entry("delivery", "delivery.integration-queue-time", "integration queue time"),
  entry("delivery", "delivery.defect-escape", "defect escape"),
  entry("delivery", "delivery.rollback-frequency-and-recovery-success", "rollback frequency and recovery success"),
  // Agents and harnesses (§Agents and harnesses)
  entry("agents-and-harnesses", "agents-and-harnesses.acceptance-rate", "acceptance rate"),
  entry("agents-and-harnesses", "agents-and-harnesses.independent-review-finding-rate", "independent review finding rate"),
  entry("agents-and-harnesses", "agents-and-harnesses.tool-success-and-unsupported-claim-rate", "tool success and unsupported-claim rate"),
  entry("agents-and-harnesses", "agents-and-harnesses.cost-latency-and-context-efficiency", "cost, latency and context efficiency"),
  entry("agents-and-harnesses", "agents-and-harnesses.evidence-quality", "evidence quality"),
  entry("agents-and-harnesses", "agents-and-harnesses.safety-control-violations", "safety/control violations"),
  // Learning and skills (§Learning and skills)
  entry("learning-and-skills", "learning-and-skills.failures-with-structured-disposition", "failures with structured disposition"),
  entry("learning-and-skills", "learning-and-skills.experience-to-knowledge-conversion", "experience-to-knowledge conversion"),
  entry("learning-and-skills", "learning-and-skills.knowledge-contradiction-supersession-closure", "knowledge contradiction/supersession closure"),
  entry("learning-and-skills", "learning-and-skills.skill-candidate-evaluation-pass-rate", "skill candidate evaluation pass rate"),
  entry("learning-and-skills", "learning-and-skills.skill-reuse-regression-and-outcome-improvement", "skill reuse, regression and outcome improvement"),
  entry("learning-and-skills", "learning-and-skills.time-from-repeated-failure-to-governed-skill", "time from repeated failure to governed skill")
]);

// --- Derived frozen indexes (module-load time; no caller input involved) -----

const byId = {};
const byGroup = {};
for (const groupId of KPI_GROUP_ORDER) byGroup[groupId] = [];
for (const kpi of KPI_CATALOG) {
  byId[kpi.id] = kpi;
  byGroup[kpi.group].push(kpi);
}
for (const groupId of KPI_GROUP_ORDER) Object.freeze(byGroup[groupId]);
const KPI_BY_ID = Object.freeze(byId);
const KPIS_BY_GROUP = Object.freeze(byGroup);

const GROUP_LIST = Object.freeze(KPI_GROUP_ORDER.map((id) => KPI_GROUPS[id]));

// --- Lookups (deny-by-default, fail-closed extraction) -----------------------

// Full KPI entry for a stable id, or a typed denial. Single contained read of
// `input?.kpiId`; malformed (non-string / blank / null byte / hostile
// extraction) and unknown (well-formed but uncataloged — never guessed) are
// distinct codes. Prototype keys are own-property misses -> DENY_KPI_UNKNOWN.
export function getKpi(input) {
  let kpiId;
  try {
    kpiId = input?.kpiId;
  } catch {
    return deny("DENY_KPI_ID_MALFORMED", "kpiId could not be read safely from the input");
  }
  if (typeof kpiId !== "string" || kpiId.trim().length === 0 || kpiId.includes(NULL_BYTE)) {
    return deny("DENY_KPI_ID_MALFORMED", "kpiId must be a non-blank string without null bytes");
  }
  if (!Object.hasOwn(KPI_BY_ID, kpiId)) {
    return deny("DENY_KPI_UNKNOWN", `no doctrine KPI is cataloged under id "${kpiId}"`);
  }
  return Object.freeze({ ok: true, kpi: KPI_BY_ID[kpiId] });
}

// Doc-ordered KPI list for a known group, or DENY_GROUP_UNKNOWN on every
// failure path (malformed input included — an unreadable or non-string group
// is by definition not a known group; deny-by-default, assessment S1 charter:
// "frozen list for a known group; DENY_GROUP_UNKNOWN otherwise").
export function listKpisByGroup(input) {
  let groupId;
  try {
    groupId = input?.groupId;
  } catch {
    return deny("DENY_GROUP_UNKNOWN", "groupId could not be read safely from the input");
  }
  if (typeof groupId !== "string" || !Object.hasOwn(KPIS_BY_GROUP, groupId)) {
    return deny("DENY_GROUP_UNKNOWN", "groupId is not one of the four doctrine KPI groups");
  }
  return Object.freeze({ ok: true, group: KPI_GROUPS[groupId], kpis: KPIS_BY_GROUP[groupId] });
}

// The four doctrine groups, in doc order. Takes no input; never denies.
export function listGroups() {
  return Object.freeze({ ok: true, groups: GROUP_LIST });
}
