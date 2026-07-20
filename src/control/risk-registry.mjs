// MOD-GOV Slice S2 — Risk / mutation / authority class registry as code.
//
// Purpose (K-10, K-11 from mod-gov-gap-assessment-001): give `src/` a single
// pure, frozen, deny-by-default answer to "what does R3 require?", "what is the
// mutation ceiling of A2?", and "what does M4 permit?". Today those tables live
// only as DRAFT prose across four governance docs; nothing in code can consult
// them, so services cannot be wired to a common risk vocabulary.
//
// Scope discipline: pure data + pure lookups. No I/O, no persistence, no
// transport. NOTHING consumes this registry in this slice — adoption by
// authority-engine / services / PDP is a later, separately governed step.
//
// House style: result objects. Lookups return { ok: true, value } on success
// and { ok: false, code } on any unknown class/level (deny-by-default — an
// unknown input is never silently coerced to a default).
//
// AUTHORITATIVE SOURCES (verbatim codification):
//   - Risk indicators + required controls:
//       docs/00-governance/authority-and-risk-model.md §2   (LEGACY — authoritative)
//   - Authority classes A0-A5:
//       docs/00-governance/authority-and-risk-model.md §1
//   - Mutation classes M0-M5:
//       docs/16-security/02-risk-and-mutation-classes.md    (OM v0.1 DRAFT)
//   - Minimum role topology by risk:
//       docs/00-governance/SECB-GOV-001.md §8
//   - Independence strength I0-I4:
//       docs/11-agents/01-roles-and-separation-of-duties.md
//
// DOC-PACK DIVERGENCE RULE: the risk class *descriptions* differ between the
// LEGACY pack (authority-and-risk-model.md §2) and the OM v0.1 DRAFT pack
// (16-security/02). Per the S2 charter, the LEGACY table is codified verbatim
// (it is authoritative until v0.1 acceptance). Each divergence is annotated at
// its entry below with a `DIVERGENCE(v0.1)` note and enumerated in the commit
// message discrepancy table; these feed the v0.1 acceptance decision. The
// doc-parity test asserts the code matches the LEGACY doc, so any future drift
// on either side fails CI.

import { RISK_ORDER, DATA_CLASS_ORDER } from "../services/non-escalation-comparator.mjs";

// Re-export the single source of ordering (do not redefine — one source of
// truth for R-class / data-class lattices, shared with the non-escalation
// comparator).
export { RISK_ORDER, DATA_CLASS_ORDER };

export const MUTATION_ORDER = Object.freeze(["M0", "M1", "M2", "M3", "M4", "M5"]);
export const AUTHORITY_ORDER = Object.freeze(["A0", "A1", "A2", "A3", "A4", "A5"]);
export const INDEPENDENCE_ORDER = Object.freeze(["I0", "I1", "I2", "I3", "I4"]);

// --- Risk classes R0-R4 -----------------------------------------------------
// `indicators` and `requiredControls` are the LEGACY authority-and-risk-model.md
// §2 cells, verbatim (doc-parity enforced). `requiredRoleTopology` is the
// SECB-GOV-001 §8 cell, verbatim (doc-parity enforced). `independence` follows
// docs/11-agents/01 ("R2 requires at least I2 for final review. R3/R4 should use
// I3 or I4"; I0 == R0 advisory). `humanApproval` is DERIVED from the presence of
// "human" in the SECB-GOV-001 topology cell (doc-parity enforced against that
// regex). `mutationCeiling` is DERIVED (see note below) — no doc states an
// explicit R->M table, so it is NOT doc-parity asserted; it is flagged for v0.1.
//
// DERIVED mutationCeiling rationale: risk describes the nature of the work; the
// ceiling is the most permissive mutation class that work at that risk may
// reach. Mapped conservatively (deny-by-default favours the tighter ceiling) by
// matching the M-class capability text to the R-class indicators:
//   R0 read-only            -> M0 (observe only)
//   R1 documentation        -> M1 (draft artifacts outside authoritative systems)
//   R2 normal non-prod mut. -> M2 (isolated non-production mutation)
//   R3 integration/boundary -> M3 (integration candidate creation)
//   R4 production/irrevers.  -> M5 (production/irreversible mutation)
// M4 (restricted environment activation) is intentionally NOT a risk-derived
// ceiling — it is reachable only via A4 operational authority, not by risk
// class alone. This derivation is advisory and flagged for the v0.1 decision.
const RISK_CLASSES = Object.freeze({
  R0: Object.freeze({
    class: "R0",
    // LEGACY authority-and-risk-model.md §2. DIVERGENCE(v0.1): 16-security/02
    // says "Read-only advisory; no sensitive data or mutation".
    indicators: "Read-only, reversible, no sensitive data",
    requiredControls: "Identity, scope, evidence check",
    requiredRoleTopology: "Producer + evidence check",
    independence: "I0",
    mutationCeiling: "M0",
    humanApproval: false
  }),
  R1: Object.freeze({
    class: "R1",
    // LEGACY. DIVERGENCE(v0.1): 16-security/02 says "Low-risk documentation or
    // reversible internal work".
    indicators: "Documentation or low-impact metadata",
    requiredControls: "Independent REV, deterministic validation",
    requiredRoleTopology: "Producer + REV",
    independence: "I1",
    mutationCeiling: "M1",
    humanApproval: false
  }),
  R2: Object.freeze({
    class: "R2",
    // LEGACY. DIVERGENCE(v0.1): 16-security/02 says "Normal code/data change in
    // non-production scope" — drops "config", adds non-production scoping.
    indicators: "Normal code/data/config mutation",
    requiredControls: "Isolated workspace, ENGIN/REV/QA, rollback",
    requiredRoleTopology: "SARCHI/ARCHI + ENGIN + REV + QA",
    independence: "I2",
    mutationCeiling: "M2",
    humanApproval: false
  }),
  R3: Object.freeze({
    class: "R3",
    // LEGACY. DIVERGENCE(v0.1): 16-security/02 says "Security, privacy, finance,
    // regulated or sensitive data impact" — legacy names "shared platform" and
    // omits "regulated"/"privacy" as explicit R3 indicators.
    indicators: "Security boundary, financial logic, personal/sensitive data, shared platform",
    requiredControls: "SEC, stronger independence, human GOV, adversarial tests",
    requiredRoleTopology: "R2 + SEC + DOMAIN + human GOV",
    independence: "I3",
    mutationCeiling: "M3",
    humanApproval: true
  }),
  R4: Object.freeze({
    class: "R4",
    // LEGACY. DIVERGENCE(v0.1): 16-security/02 says "Production, irreversible,
    // public, safety-critical or material regulatory impact" — legacy names
    // "systemic, high-value" instead of "public, safety-critical".
    indicators: "Production, irreversible, regulated, systemic, high-value",
    requiredControls: "Independent design, release authority, change window, progressive delivery, human approvals",
    requiredRoleTopology: "Independent design, ENGIN, REV, QA, SEC, OPS, release authority and explicit human approvals",
    independence: "I4",
    mutationCeiling: "M5",
    humanApproval: true
  })
});

// --- Mutation classes M0-M5 -------------------------------------------------
// Verbatim from docs/16-security/02-risk-and-mutation-classes.md (doc-parity
// enforced). Legacy authority-and-risk-model.md has no mutation table, so there
// is no LEGACY counterpart to diverge from — single-sourced.
const MUTATION_CLASSES = Object.freeze({
  M0: Object.freeze({ class: "M0", capability: "Observe only" }),
  M1: Object.freeze({ class: "M1", capability: "Draft artifacts outside authoritative systems" }),
  M2: Object.freeze({ class: "M2", capability: "Isolated non-production mutation" }),
  M3: Object.freeze({ class: "M3", capability: "Integration candidate creation" }),
  M4: Object.freeze({ class: "M4", capability: "Restricted environment activation" }),
  M5: Object.freeze({ class: "M5", capability: "Production/irreversible mutation" })
});

// --- Authority classes A0-A5 ------------------------------------------------
// name + permittedScope verbatim from authority-and-risk-model.md §1 (doc-parity
// enforced). 16-security/02 has no authority table — single-sourced.
//
// DERIVED mutationCeiling: A-class permitted scope and M-class capability text
// align 1:1 by index (A_n grants exactly M_n), a well-supported reading of §1
// vs the mutation table:
//   A0 Observe            <-> M0 Observe only
//   A1 Analyze            <-> M1 Draft artifacts outside authoritative systems
//   A2 Bounded Execute    <-> M2 Isolated non-production mutation
//   A3 Integrate Candidate<-> M3 Integration candidate creation
//   A4 Operational Auth.  <-> M4 Restricted environment activation
//   A5 Governance Root    <-> M5 Production/irreversible mutation
// The A->M index equality is asserted as an invariant in tests, not doc-parity
// (no doc states the mapping as a table); flagged for the v0.1 decision.
const AUTHORITY_CLASSES = Object.freeze({
  A0: Object.freeze({ class: "A0", name: "Observe", permittedScope: "Read approved metadata and evidence; no mutation", mutationCeiling: "M0" }),
  A1: Object.freeze({ class: "A1", name: "Analyze", permittedScope: "Produce recommendations, plans, and candidates", mutationCeiling: "M1" }),
  A2: Object.freeze({ class: "A2", name: "Bounded Execute", permittedScope: "Mutate within an authorized isolated workspace", mutationCeiling: "M2" }),
  A3: Object.freeze({ class: "A3", name: "Integrate Candidate", permittedScope: "Prepare immutable integration candidates; no protected merge", mutationCeiling: "M3" }),
  A4: Object.freeze({ class: "A4", name: "Operational Authority", permittedScope: "Perform bounded environment operations under explicit approval", mutationCeiling: "M4" }),
  A5: Object.freeze({ class: "A5", name: "Governance Root", permittedScope: "Approve exceptions, release, activation, promotion, revocation, and risk acceptance", mutationCeiling: "M5" })
});

export { RISK_CLASSES, MUTATION_CLASSES, AUTHORITY_CLASSES };

// --- Lookups (deny-by-default) ----------------------------------------------

// Own-property lookup only — inherited keys (e.g. "toString", "constructor")
// must never resolve to a class entry. Returns the entry or undefined.
function ownEntry(table, key) {
  return typeof key === "string" && Object.hasOwn(table, key) ? table[key] : undefined;
}

// Full risk profile for a class, or a typed denial for an unknown class.
export function riskProfile(riskClass) {
  const entry = ownEntry(RISK_CLASSES, riskClass);
  if (!entry) return { ok: false, code: "DENY_UNKNOWN_RISK_CLASS" };
  return { ok: true, value: entry };
}

// Controls bundle a risk class requires: role topology, independence floor,
// mutation ceiling, human-approval flag, and the raw controls text.
export function requiredControls(riskClass) {
  const entry = ownEntry(RISK_CLASSES, riskClass);
  if (!entry) return { ok: false, code: "DENY_UNKNOWN_RISK_CLASS" };
  return {
    ok: true,
    value: Object.freeze({
      requiredControls: entry.requiredControls,
      requiredRoleTopology: entry.requiredRoleTopology,
      independence: entry.independence,
      mutationCeiling: entry.mutationCeiling,
      humanApproval: entry.humanApproval
    })
  };
}

// Mutation ceiling (M-class) permitted by an authority class, or typed denial.
export function mutationCeilingFor(authorityClass) {
  const entry = ownEntry(AUTHORITY_CLASSES, authorityClass);
  if (!entry) return { ok: false, code: "DENY_UNKNOWN_AUTHORITY_CLASS" };
  return { ok: true, value: entry.mutationCeiling };
}

// Capability description for a mutation class, or typed denial.
export function mutationCapability(mutationClass) {
  const entry = ownEntry(MUTATION_CLASSES, mutationClass);
  if (!entry) return { ok: false, code: "DENY_UNKNOWN_MUTATION_CLASS" };
  return { ok: true, value: entry.capability };
}

// candidate <= bound on the frozen R-class order. Unknown class denies
// (never treated as "at most"). Mirrors the non-escalation comparator's
// ordered() semantics for the risk dimension.
export function isRiskAtMost(candidate, bound) {
  const c = RISK_ORDER.indexOf(candidate);
  const b = RISK_ORDER.indexOf(bound);
  if (c === -1 || b === -1) return { ok: false, code: "DENY_UNKNOWN_RISK_CLASS" };
  return c <= b ? { ok: true } : { ok: false, code: "DENY_RISK_EXCEEDS" };
}

// candidate <= bound on the frozen M-class order. Unknown class denies.
export function isMutationAtMost(candidate, bound) {
  const c = MUTATION_ORDER.indexOf(candidate);
  const b = MUTATION_ORDER.indexOf(bound);
  if (c === -1 || b === -1) return { ok: false, code: "DENY_UNKNOWN_MUTATION_CLASS" };
  return c <= b ? { ok: true } : { ok: false, code: "DENY_MUTATION_EXCEEDS" };
}
