// Loads every vector under vectors/positive and vectors/negative, compiles
// all seven fail-learn WP1 schemas (draft 2020-12, ajv strict mode,
// ajv-formats for date-time), runs ajv against every document each vector
// supplies, runs the companion semantic-validator.mjs against the same
// documents, compares actual results to each vector's declared expectation,
// and prints a JSON summary. Modeled on the established convention in
// SecB-evidence/p0-auto-auth-contracts-successor-018/run-validation.mjs.

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import * as sv from "./semantic-validator.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_DIR = path.join(__dirname, "schemas");
const DATA_DIR = path.join(__dirname, "data");
const VECTOR_DIRS = {
  positive: path.join(__dirname, "vectors", "positive"),
  negative: path.join(__dirname, "vectors", "negative")
};

const SCHEMA_FILES = [
  "common.schema.json",
  "classification-taxonomy.schema.json",
  "failure-evidence-envelope.schema.json",
  "experience-record.schema.json",
  "knowledge-artifact.schema.json",
  "skill-candidate.schema.json",
  "transitions.schema.json"
];

function loadJson(p) {
  return JSON.parse(readFileSync(p, "utf8"));
}

const ajv = new Ajv2020({ strict: true, strictTypes: true, strictTuples: true, allErrors: true, discriminator: false });
addFormats(ajv);

const compileWarnings = [];
const originalWarn = console.warn;
console.warn = (...args) => {
  compileWarnings.push(args.join(" "));
  originalWarn(...args);
};
for (const file of SCHEMA_FILES) {
  ajv.addSchema(loadJson(path.join(SCHEMA_DIR, file)), file);
}
console.warn = originalWarn;

function getValidator(ref) {
  const v = ajv.getSchema(ref);
  if (!v) throw new Error(`Schema not compiled: ${ref}`);
  return v;
}

const DEFAULT_TAXONOMY = loadJson(path.join(DATA_DIR, "classification-taxonomy.instance.json"));
const DEFAULT_TABLE = loadJson(path.join(DATA_DIR, "maturity-transition-table.json"));

// Primary document -> schema ref. Every vector's "documents" object may
// carry any subset of these keys plus the lineage/context keys handled
// separately below.
const PRIMARY_DOC_SCHEMA = {
  envelope: "failure-evidence-envelope.schema.json",
  experience: "experience-record.schema.json",
  knowledge: "knowledge-artifact.schema.json",
  skill: "skill-candidate.schema.json",
  event: "transitions.schema.json#/$defs/event_envelope",
  transitionRequest: "transitions.schema.json#/$defs/transition_request",
  transitionTableSubject: "transitions.schema.json#/$defs/transition_table",
  taxonomy: "classification-taxonomy.schema.json"
};

// Context/lineage documents are also real instances of a known schema and
// are ajv-checked too, even though they exist in a vector primarily to feed
// a semantic check rather than to be the vector's own subject.
const CONTEXT_DOC_SCHEMA = {
  experienceSourceEvidence: "failure-evidence-envelope.schema.json", // array
  knowledgeExperience: "experience-record.schema.json",
  skillKnowledge: "knowledge-artifact.schema.json",
  skillKnowledgeExperience: "experience-record.schema.json",
  skillEvidenceForLineage: "failure-evidence-envelope.schema.json"
};

function ajvValidateVector(documents) {
  const errors = [];
  let allValid = true;

  for (const [key, schemaRef] of Object.entries(PRIMARY_DOC_SCHEMA)) {
    const doc = documents[key];
    if (doc === undefined) continue;
    const validateFn = getValidator(schemaRef);
    const ok = validateFn(doc);
    if (!ok) {
      allValid = false;
      errors.push({ document: key, schema: schemaRef, errors: validateFn.errors });
    }
  }

  for (const [key, schemaRef] of Object.entries(CONTEXT_DOC_SCHEMA)) {
    const value = documents[key];
    if (value === undefined) continue;
    const validateFn = getValidator(schemaRef);
    const items = Array.isArray(value) ? value : [value];
    items.forEach((doc, idx) => {
      const ok = validateFn(doc);
      if (!ok) {
        allValid = false;
        errors.push({ document: `${key}[${idx}]`, schema: schemaRef, errors: validateFn.errors });
      }
    });
  }

  return { valid: allValid, errors };
}

function asArray(value) {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function runSemanticChecks(documents) {
  const violations = [];

  if (documents.envelope) {
    violations.push(...sv.validateContentAddressIntegrity(documents.envelope, "evidence_id", ["evidence_id", "governance.integrity_signature"]).violations);
    violations.push(...sv.validateFailureClassificationConsistency(documents.envelope, documents.taxonomy || DEFAULT_TAXONOMY).violations);
  }

  if (documents.experience) {
    violations.push(...sv.validateContentAddressIntegrity(documents.experience, "experience_id", ["experience_id"]).violations);
    violations.push(...sv.validateNoSelfAttestationAdvancement(documents.experience).violations);
    const sourceEvidence = asArray(documents.experienceSourceEvidence);
    if (sourceEvidence.length > 0) {
      violations.push(...sv.validateTenantLineageConsistency(documents.experience.scope, sourceEvidence).violations);
      violations.push(...sv.validateExperienceEvidenceAdmissibility(documents.experience, sourceEvidence).violations);
      violations.push(...sv.validateCheckerNotOriginalEvidenceActor(documents.experience, sourceEvidence).violations);
    }
  }

  if (documents.knowledge) {
    violations.push(...sv.validateContentAddressIntegrity(documents.knowledge, "knowledge_id", ["knowledge_id"]).violations);
    violations.push(...sv.validateIndependentKnowledgeReview(documents.knowledge, documents.knowledgeExperience).violations);
    // Rework round 02 (REV-001): previously wired only for Experience Records.
    // Knowledge's tenant lineage is checked against its cited source experience.
    const knowledgeLineageDocs = asArray(documents.knowledgeExperience);
    if (knowledgeLineageDocs.length > 0) {
      violations.push(...sv.validateTenantLineageConsistency(documents.knowledge.scope, knowledgeLineageDocs).violations);
    }
  }

  if (documents.skill) {
    violations.push(...sv.validateContentAddressIntegrity(documents.skill, "skill_id", ["skill_id", "signature"]).violations);
    violations.push(...sv.validateNoUndeclaredSideEffectsOrPermissions(documents.skill).violations);
    violations.push(...sv.validateSkillProducerCheckerSeparation(documents.skill).violations);
    if (documents.skillKnowledge) {
      violations.push(...sv.validateNoDerivationFromDeprecatedKnowledge(documents.skill, documents.skillKnowledge).violations);
    }
    if (documents.skillKnowledge && documents.skillKnowledgeExperience && documents.skillEvidenceForLineage) {
      violations.push(...sv.validateFullLineageTraceability(documents.skill, documents.skillKnowledge, documents.skillKnowledgeExperience, documents.skillEvidenceForLineage).violations);
    }
    // Rework round 02 (REV-001): Skill Candidate gained its own `scope` field
    // this round; check it against whichever lineage documents the vector
    // supplies (knowledge at minimum, plus experience/evidence when present).
    const skillLineageDocs = [documents.skillKnowledge, documents.skillKnowledgeExperience, documents.skillEvidenceForLineage].filter(Boolean);
    if (skillLineageDocs.length > 0) {
      violations.push(...sv.validateTenantLineageConsistency(documents.skill.scope, skillLineageDocs).violations);
    }
  }

  if (documents.transitionRequest) {
    const table = documents.transitionTable || DEFAULT_TABLE;
    const { object_type: objectType, from_state: fromState, to_state: toState } = documents.transitionRequest;
    violations.push(...sv.validateTransitionLegality(table, objectType, fromState, toState).violations);
  }

  return { valid: violations.length === 0, violations };
}

function runVector(kind, file) {
  const fullPath = path.join(VECTOR_DIRS[kind], file);
  const vector = loadJson(fullPath);
  const documents = vector.documents || {};

  let ajvResult;
  let ajvThrew = null;
  try {
    ajvResult = ajvValidateVector(documents);
  } catch (err) {
    ajvThrew = err.message;
    ajvResult = { valid: false, errors: [{ document: "*", error: err.message }] };
  }

  let semanticResult;
  let semanticThrew = null;
  try {
    semanticResult = runSemanticChecks(documents);
  } catch (err) {
    semanticThrew = err.message;
    semanticResult = { valid: false, violations: [{ check: "exception", message: err.message }] };
  }

  const actual = { ajv: ajvResult.valid ? "PASS" : "FAIL", semantic: semanticResult.valid ? "PASS" : "FAIL" };
  const expected = vector.expected || {};

  let matches;
  if (kind === "positive") {
    matches = actual.ajv === "PASS" && actual.semantic === "PASS";
  } else if (expected.ajv === "FAIL" && expected.semantic === "FAIL") {
    matches = actual.ajv === "FAIL" && actual.semantic === "FAIL";
  } else if (expected.ajv === "FAIL" && expected.semantic === "N/A") {
    matches = actual.ajv === "FAIL";
  } else if (expected.ajv === "PASS" && expected.semantic === "FAIL") {
    matches = actual.ajv === "PASS" && actual.semantic === "FAIL";
  } else {
    // Rework round 02 (REV-004): this was a loose OR-condition ("either check
    // failing counts as a match") that none of the shipped negative vectors
    // exercised -- dead code against the current fixture set, but a latent
    // "correct outcome, wrong cause" trap for a future fixture authored with
    // an `expected` shape outside the two well-defined negative patterns.
    // Fail loudly instead of guessing: every negative vector's `expected`
    // must be one of {ajv:FAIL,semantic:FAIL}, {ajv:FAIL,semantic:N/A}, or
    // {ajv:PASS,semantic:FAIL}.
    throw new Error(`Vector ${vector.vector_id || file} (kind=negative) declares an unrecognized expected shape ${JSON.stringify(expected)} -- fix the fixture's \`expected\` field rather than relying on a loose fallback match (REV-004).`);
  }

  return {
    vector_id: vector.vector_id || file,
    kind,
    scenario_refs: vector.scenario_refs || [],
    matrix_row_refs: vector.matrix_row_refs || [],
    expected,
    actual,
    matches,
    ajvThrew,
    semanticThrew,
    ajvErrorSummary: ajvResult.valid ? [] : ajvResult.errors.map((e) => ({ document: e.document, schema: e.schema, count: e.errors ? e.errors.length : 1 })),
    semanticViolationSummary: semanticResult.valid ? [] : (semanticResult.violations || []).map((v) => ({ check: v.check, message: v.message }))
  };
}

function main() {
  const results = [];
  for (const kind of ["positive", "negative"]) {
    const files = readdirSync(VECTOR_DIRS[kind]).filter((f) => f.endsWith(".json")).sort();
    for (const file of files) results.push(runVector(kind, file));
  }

  const positive = results.filter((r) => r.kind === "positive");
  const negative = results.filter((r) => r.kind === "negative");

  const summary = {
    schema_version: "1.0",
    record_kind: "FAIL_LEARN_WP1_RUN_VALIDATION_RESULT",
    ajv_options: { strict: true, strictTypes: true, strictTuples: true, allErrors: true, formats: "ajv-formats bound" },
    schema_compile_warnings: compileWarnings,
    counts: {
      positive_total: positive.length,
      positive_pass: positive.filter((r) => r.matches).length,
      positive_unexpected: positive.filter((r) => !r.matches).length,
      negative_total: negative.length,
      negative_correctly_rejected: negative.filter((r) => r.matches).length,
      negative_unexpected: negative.filter((r) => !r.matches).length
    },
    positive_results: positive,
    negative_results: negative
  };

  console.log(JSON.stringify(summary, null, 2));
  const anyUnexpected = summary.counts.positive_unexpected > 0 || summary.counts.negative_unexpected > 0;
  process.exitCode = anyUnexpected ? 1 : 0;
}

main();
