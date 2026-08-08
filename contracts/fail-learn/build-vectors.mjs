// Programmatically builds every positive/negative conformance vector for the
// SecB Fail-Learn WP1 contract set and writes them to vectors/positive and
// vectors/negative. Building vectors in code (rather than hand-typing ~50
// raw JSON files) keeps the many required fields and the content-address
// digests internally consistent and lets deliberate mutations for negative
// vectors be expressed as explicit, auditable diffs from a known-good base.

import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { sha256Hex, canonicalStringify } from "./semantic-validator.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function loadJson(p) {
  return JSON.parse(readFileSync(p, "utf8"));
}
const OUT = {
  positive: path.join(__dirname, "vectors", "positive"),
  negative: path.join(__dirname, "vectors", "negative")
};
mkdirSync(OUT.positive, { recursive: true });
mkdirSync(OUT.negative, { recursive: true });

function hash(seed) {
  return `sha256:${sha256Hex(seed)}`;
}
function encref(name) {
  return `encref:${name}:${hash(`${name}-body`)}`;
}
function refTo(idValue) {
  return { ref_id: idValue, digest: hash(`ref-of-${idValue}`) };
}

// Rework round 02 (SEC-FL-WP1-002): default, honest redaction attestation --
// a real denylist-pattern check does run on sanitized_message (and only
// there), so DENYLIST_PATTERN/true is the accurate default claim for the
// clean base documents built below. Vectors that need a different claim
// (or a lying/false one) override this explicitly.
function defaultRedactionAttestation() {
  return { redaction_applied: true, mechanism: "DENYLIST_PATTERN", policy_version: "redaction-policy-v1" };
}

// Rework round 02 (SEC-FL-WP1-001): every Skill Candidate test case now
// requires observed_tools/observed_mcp_servers/observed_filesystem_paths/
// observed_network_hosts alongside the original observed_side_effects/
// permission_class. This helper keeps every test-case literal below from
// having to spell out four empty-array defaults every time.
function testCase(fields) {
  return {
    observed_tools: [],
    observed_mcp_servers: [],
    observed_filesystem_paths: [],
    observed_network_hosts: [],
    ...fields
  };
}

const TENANT_A = { organization_id: "org-alpha", tenant_id: "tenant-a", project_id: "proj-01", work_package_id: "wp1-fail-learn", session_id: "sess-01" };
const TENANT_B = { organization_id: "org-alpha", tenant_id: "tenant-b", project_id: "proj-02", work_package_id: "wp1-fail-learn", session_id: "sess-02" };

const ACTOR_PRODUCER = { actor_id: "agent-producer-01", actor_type: "agent", role: "maker" };
const ACTOR_CHECKER = { actor_id: "agent-checker-01", actor_type: "agent", role: "checker" };
const ACTOR_REVIEWER = { actor_id: "agent-reviewer-01", actor_type: "agent", role: "reviewer" };
const ACTOR_BUILDER = { actor_id: "agent-builder-01", actor_type: "agent", role: "maker" };

// ---------------------------------------------------------------------------
// Document builders. Each "buildX" takes plain field overrides (never a
// vector_id or test-name) and returns a fully finalized, content-addressed
// document. Deliberate defects for negative vectors are introduced by the
// caller either via `overrides` (a schema-catchable defect) or via a
// `tamper(doc)` post-seal mutation (a semantic-layer-only defect, since it
// changes the sealed content without recomputing the content-address id).
// ---------------------------------------------------------------------------

function buildEnvelope(overrides = {}) {
  const base = {
    schema_version: "1.0",
    occurred_at: "2026-07-20T18:20:00.000Z",
    captured_at: "2026-07-20T18:20:05.000Z",
    clock_source: "secb-trusted-clock-01",
    sequence: 1,
    scope: TENANT_A,
    actor: ACTOR_PRODUCER,
    operation: {
      operation_type: "git_mutation",
      target_class: "repository",
      requested_capability: "write_file",
      command_digest: hash("command-write-file"),
      input_digest: hash("input-write-file")
    },
    decision: {
      result: "denied",
      policy_decision_id: "pdp-dec-01",
      policy_bundle_digest: hash("policy-bundle-01"),
      matched_rules: ["rule-deny-protected-branch"],
      fail_closed_applied: true
    },
    failure: {
      failure_class: "POLICY_DENIAL_EXPECTED",
      error_type: "PolicyDenial",
      error_code: "E_POLICY_DENY",
      sanitized_message: "policy denied write to protected branch",
      stacktrace_reference: encref("trace-01"),
      severity: "low"
    },
    environment: {
      repository_commit: sha256Hex("commit-seed-01").slice(0, 40),
      worktree_id: "wt-01",
      operating_system: "linux-x86_64",
      dependency_lock_digest: hash("dep-lock-01"),
      configuration_digest: hash("config-01"),
      tool_versions: { node: "22.0.0" }
    },
    outcome: {
      mutation_committed: false,
      affected_resources: [],
      rollback_required: false,
      containment_status: "contained"
    },
    evidence: {
      log_refs: [refTo("log-01")],
      trace_refs: [],
      test_result_refs: [],
      artifact_refs: [],
      screenshot_refs: [],
      attestation_refs: []
    },
    governance: {
      security_classification: "INTERNAL",
      contains_secrets: false,
      redaction_policy: "redact-v1",
      retention_policy: "retain-90d",
      admissibility_status: "admissible",
      redaction_attestation: defaultRedactionAttestation()
    }
  };
  const merged = deepMerge(base, overrides);
  const digest = sha256Hex(canonicalStringify(merged));
  return {
    ...merged,
    evidence_id: `fev_${digest}`,
    governance: {
      ...merged.governance,
      integrity_signature: {
        algorithm: "ED25519",
        key_id: "key-evidence-01",
        trust_domain: "secb.trust.evidence",
        canonical_form: "SECB_CANONICAL_JSON_V1",
        signed_digest: `sha256:${digest}`,
        signature_value: `sig-${digest.slice(0, 60)}`
      }
    }
  };
}

function buildExperience(overrides = {}, sourceEnvelope) {
  const base = {
    schema_version: "1.0",
    maturity_state: "X0",
    source_evidence_refs: [refTo(sourceEnvelope.evidence_id)],
    scope: TENANT_A,
    classification: "POLICY_DENIAL_EXPECTED",
    intended_outcome: "write should be blocked on a protected branch",
    observed_outcome: "write was blocked as expected",
    contributing_conditions: ["target branch is protected"],
    immediate_cause: "policy rule rule-deny-protected-branch matched",
    systemic_factors: [],
    containment: "no mutation occurred",
    workaround: "",
    proposed_prevention: "none required, control worked as designed",
    reproducibility: { status: "NOT_ATTEMPTED", evidence_refs: [] },
    confidence: "medium",
    reviewer_status: { status: "UNREVIEWED", checker_id: null, checker_distinct_from_actor: false },
    source_actor_id: ACTOR_PRODUCER.actor_id,
    redaction_attestation: defaultRedactionAttestation(),
    created_at: "2026-07-20T18:25:00.000Z"
  };
  const merged = deepMerge(base, overrides);
  const digest = sha256Hex(canonicalStringify(merged));
  return { ...merged, experience_id: `exp_${digest}` };
}

function buildKnowledge(overrides = {}, sourceExperience) {
  const base = {
    schema_version: "1.0",
    maturity_state: "K0",
    scope: TENANT_A,
    applicability: "any git_mutation targeting a protected branch",
    symptoms: ["write denied on protected branch"],
    diagnosis: "policy correctly enforces protected-branch write denial",
    verified_cause: "protected_branch action_class hard-deny rule",
    resolution: "route the change through a pull request instead of a direct write",
    prevention: "document the protected-branch workflow for agents",
    unsafe_shortcuts: ["do not attempt to bypass by disabling the policy bundle"],
    permissions_required: ["READ_ONLY"],
    evidence_refs: [refTo(sourceExperience.source_evidence_refs[0].ref_id)],
    experience_refs: [refTo(sourceExperience.experience_id)],
    reviewers: [],
    author_actor_id: ACTOR_PRODUCER.actor_id,
    confidence: "medium",
    validity: { valid_from: "2026-07-20T18:30:00.000Z", review_due: "2027-01-20T18:30:00.000Z", valid_until: null },
    supersedes: null,
    superseded_by: null,
    redaction_attestation: defaultRedactionAttestation(),
    created_at: "2026-07-20T18:30:00.000Z"
  };
  const merged = deepMerge(base, overrides);
  const digest = sha256Hex(canonicalStringify(merged));
  return { ...merged, knowledge_id: `know_${digest}` };
}

function buildSkill(overrides = {}, sourceKnowledge) {
  const base = {
    schema_version: "1.0",
    maturity_state: "S0",
    // Rework round 02 (REV-001): Skill Candidate gained its own tenant scope
    // field this round. Defaults to inheriting the source Knowledge
    // Artifact's scope (the honest, consistent case); vectors that need a
    // cross-tenant mismatch override this explicitly.
    scope: sourceKnowledge.scope,
    knowledge_ref: refTo(sourceKnowledge.knowledge_id),
    knowledge_maturity_at_binding: "K1",
    capability_manifest: {
      manifest_version: "1.0.0",
      skill_name: "route-protected-write-via-pr",
      purpose: "detect a protected-branch write attempt and open a pull request instead",
      declared_permissions: {
        action_classes: ["EXECUTION_WRITE"],
        declared_side_effects: ["FILE_WRITE", "GIT_COMMIT"],
        tools: ["git"],
        mcp_servers: [],
        filesystem_paths: ["/workspace/proj/build"],
        network_hosts: [],
        credentials: []
      },
      timeout_seconds: 300,
      idempotent: true
    },
    source: { repository: "secb", commit_sha: sha256Hex("skill-source-commit").slice(0, 40), dependency_lock_digest: hash("skill-dep-lock-01") },
    builder_identity: ACTOR_BUILDER,
    owner_actor_id: "owner-01",
    checker_actor_id: ACTOR_CHECKER.actor_id,
    provenance: { statement_type: "https://in-toto.io/Statement/v1", predicate_type: "https://secb.local/predicates/skill-build/v1", subject_digest: hash("skill-subject-01") },
    evaluation_evidence_refs: [],
    experience_refs: [],
    known_limitations: [],
    tests: {
      positive_cases: [testCase({ case_id: "pos-1", description: "opens a PR instead of writing directly", expected_result: "ALLOW", observed_side_effects: ["FILE_WRITE", "GIT_COMMIT"], permission_class: "EXECUTION_WRITE" })],
      negative_cases: [testCase({ case_id: "neg-1", description: "direct protected-branch write attempt is still denied", expected_result: "DENY", observed_side_effects: [], permission_class: "EXECUTION_WRITE" })],
      regression_cases: [],
      policy_denial_cases: []
    },
    created_at: "2026-07-20T18:35:00.000Z"
  };
  const merged = deepMerge(base, overrides);
  const digest = sha256Hex(canonicalStringify(merged));
  return {
    ...merged,
    skill_id: `skill_${digest}`,
    signature: {
      algorithm: "ED25519",
      key_id: "key-skill-01",
      trust_domain: "secb.trust.skill",
      canonical_form: "SECB_CANONICAL_JSON_V1",
      signed_digest: `sha256:${digest}`,
      signature_value: `sig-${digest.slice(0, 60)}`
    }
  };
}

function deepMerge(base, overrides) {
  if (overrides == null) return structuredClone(base);
  const out = structuredClone(base);
  for (const [k, v] of Object.entries(overrides)) {
    if (v !== null && typeof v === "object" && !Array.isArray(v) && out[k] !== null && typeof out[k] === "object" && !Array.isArray(out[k])) {
      out[k] = deepMerge(out[k], v);
    } else {
      out[k] = structuredClone(v);
    }
  }
  return out;
}

function tamper(doc, mutator) {
  const clone = structuredClone(doc);
  mutator(clone);
  return clone;
}

// ---------------------------------------------------------------------------
// Shared "clean chain" used by many vectors: evidence -> experience -> knowledge -> skill.
// ---------------------------------------------------------------------------
const cleanEvidence = buildEnvelope();
const cleanExperienceX1 = buildExperience(
  {
    maturity_state: "X1",
    reproducibility: { status: "INDEPENDENT_CHECKER_CONFIRMATION", evidence_refs: [refTo("checker-report-01")] },
    reviewer_status: { status: "CHECKER_CONFIRMED", checker_id: ACTOR_CHECKER.actor_id, checker_distinct_from_actor: true },
    confidence: "high"
  },
  cleanEvidence
);
const cleanKnowledgeK1 = buildKnowledge(
  {
    maturity_state: "K1",
    reviewers: [{ reviewer_id: ACTOR_REVIEWER.actor_id, reviewed_at: "2026-07-20T18:40:00.000Z", verdict: "APPROVED" }],
    confidence: "high"
  },
  cleanExperienceX1
);
const cleanSkillS0 = buildSkill({}, cleanKnowledgeK1);
const cleanSkillS1 = buildSkill(
  {
    maturity_state: "S1",
    evaluation_evidence_refs: [refTo("eval-report-01")],
    security_review_ref: refTo("secreview-01")
  },
  cleanKnowledgeK1
);

const positives = [];
const negatives = [];

function pos(vector_id, description, scenario_refs, matrix_row_refs, documents) {
  positives.push({ vector_id, description, scenario_refs, matrix_row_refs, expected: { ajv: "PASS", semantic: "PASS" }, documents });
}
function neg(vector_id, description, scenario_refs, matrix_row_refs, documents, expected) {
  negatives.push({ vector_id, description, scenario_refs, matrix_row_refs, expected, documents });
}

// SCEN-01 -------------------------------------------------------------------
pos("pos-01-scenario1-clean-denial-fail-closed", "Clean policy denial: fail_closed_applied true, matched_rules present, classified as the positive-control class the taxonomy names for it.", ["SCEN-01"], ["ROW-1"], { envelope: cleanEvidence });

neg("neg-01-scenario1-denied-missing-matched-rules", "Denied with an empty matched_rules array -- schema requires at least one matched rule on any denial.", ["SCEN-01"], ["ROW-1"],
  { envelope: buildEnvelope({ decision: { matched_rules: [] } }) },
  { ajv: "FAIL", semantic: "N/A" });

neg("neg-02-scenario1-denial-misclassified-as-defect", "A clean, fail-closed denial (schema-valid) but classified as IMPLEMENTATION_DEFECT instead of a positive-control class -- the taxonomy says a correctly denied request must never be reported as a control malfunction.", ["SCEN-01"], ["ROW-1"],
  { envelope: buildEnvelope({ failure: { failure_class: "IMPLEMENTATION_DEFECT" } }) },
  { ajv: "PASS", semantic: "FAIL" });

// SCEN-02 -------------------------------------------------------------------
pos("pos-02-scenario2-cancelled-no-mutation", "A cancelled (not denied) attempt still evidences no committed mutation and no affected resources -- evidence capture never performed the action.", ["SCEN-02"], ["ROW-1"],
  { envelope: buildEnvelope({ decision: { result: "cancelled", fail_closed_applied: false, matched_rules: [] }, failure: { failure_class: "TRANSIENT_FAILURE" } }) });

neg("neg-03-scenario2-denied-with-mutation-committed", "Denied action that nonetheless claims a committed mutation -- a denied action must never report performing the action.", ["SCEN-02"], ["ROW-1"],
  { envelope: buildEnvelope({ outcome: { mutation_committed: true, affected_resources: ["/workspace/proj/build/output.log"] } }) },
  { ajv: "FAIL", semantic: "N/A" });

// SCEN-03 -------------------------------------------------------------------
pos("pos-03-scenario3-secrets-absent-clean", "Well-formed governance block: contains_secrets false, sanitized_message free of secret-shaped substrings.", ["SCEN-03"], ["ROW-1"],
  { envelope: buildEnvelope({ governance: { security_classification: "RESTRICTED" } }) });

neg("neg-04-scenario3-contains-secrets-true", "governance.contains_secrets asserted true -- hard-const-false field, no admissible envelope may ever declare it true.", ["SCEN-03"], ["ROW-1"],
  { envelope: buildEnvelope({ governance: { contains_secrets: true } }) },
  { ajv: "FAIL", semantic: "N/A" });

neg("neg-05-scenario3-sanitized-message-secret-pattern", "sanitized_message embeds a secret-shaped substring (api_key=...) -- structural guard rejects the shape even though contains_secrets is (falsely) still false.", ["SCEN-03"], ["ROW-1"],
  { envelope: buildEnvelope({ failure: { sanitized_message: "upstream call failed with api_key=sk-live-abcdef1234567890" } }) },
  { ajv: "FAIL", semantic: "N/A" });

// SCEN-04 -------------------------------------------------------------------
pos("pos-04-scenario4-content-address-clean", "Freshly sealed, unmutated envelope: recomputed content-address digest matches the declared evidence_id.", ["SCEN-04"], ["ROW-1"],
  { envelope: buildEnvelope({ sequence: 2 }) });

neg("neg-06-scenario4-tampered-after-seal", "Envelope mutated (severity escalated) after evidence_id was minted, without recomputing the id -- schema-shape still valid, but the content-address no longer matches: tampering is detected.", ["SCEN-04"], ["ROW-1"],
  { envelope: tamper(buildEnvelope({ sequence: 3 }), (d) => { d.failure.severity = "critical"; }) },
  { ajv: "PASS", semantic: "FAIL" });

// SCEN-05 -------------------------------------------------------------------
pos("pos-05-scenario5-tenant-lineage-consistent", "Experience Record's scope.tenant_id matches its cited Failure Evidence Envelope's scope.tenant_id.", ["SCEN-05"], ["ROW-1"],
  { experience: buildExperience({}, cleanEvidence), experienceSourceEvidence: [cleanEvidence] });

neg("neg-07-scenario5-cross-tenant-lineage", "Experience Record declares Tenant B while citing evidence that is scoped to Tenant A -- cross-tenant lineage.", ["SCEN-05"], ["ROW-1"],
  { experience: buildExperience({ scope: TENANT_B }, cleanEvidence), experienceSourceEvidence: [cleanEvidence] },
  { ajv: "PASS", semantic: "FAIL" });

// SCEN-06 -------------------------------------------------------------------
pos("pos-06-scenario6-reconstructable-evidence", "Envelope carries substantive log_refs and artifact_refs -- a failure can be reconstructed from what was sealed.", ["SCEN-06"], ["ROW-1"],
  { envelope: buildEnvelope({ sequence: 4, evidence: { log_refs: [refTo("log-02")], artifact_refs: [refTo("artifact-01")] } }) });

neg("neg-08-scenario6-unreconstructable-empty-evidence", "Every evidence reference list is empty -- nothing to reconstruct the failure from.", ["SCEN-06"], ["ROW-1"],
  { envelope: buildEnvelope({ evidence: { log_refs: [] } }) },
  { ajv: "FAIL", semantic: "N/A" });

// SCEN-07 -------------------------------------------------------------------
pos("pos-07-scenario7-independent-checker-advances-x1", "Independent checker confirmation (checker distinct from the reporting actor) advances the record to X1.", ["SCEN-07"], ["ROW-2"],
  { experience: cleanExperienceX1, experienceSourceEvidence: [cleanEvidence] });

neg("neg-09-scenario7-self-attestation-flag-lie", "checker_id equals source_actor_id (the reporting agent 'confirms itself'), but checker_distinct_from_actor is falsely asserted true and maturity_state claims X1 -- schema cannot compare the two id fields, so this passes ajv; the semantic validator re-derives distinctness from the raw ids and rejects it.", ["SCEN-07"], ["ROW-2"],
  {
    experience: buildExperience(
      { maturity_state: "X1", reproducibility: { status: "INDEPENDENT_CHECKER_CONFIRMATION" }, reviewer_status: { status: "CHECKER_CONFIRMED", checker_id: ACTOR_PRODUCER.actor_id, checker_distinct_from_actor: true } },
      cleanEvidence
    ),
    experienceSourceEvidence: [cleanEvidence]
  },
  { ajv: "PASS", semantic: "FAIL" });

neg("neg-10-scenario7-self-attestation-honestly-flagged", "Same self-attestation, but checker_distinct_from_actor is honestly set false while maturity_state still claims X1 -- this is the schema-layer catch (if/then), a distinct proof from neg-09's semantic-layer catch of the same underlying defect.", ["SCEN-07"], ["ROW-2"],
  { experience: buildExperience({ maturity_state: "X1", reproducibility: { status: "INDEPENDENT_CHECKER_CONFIRMATION" }, reviewer_status: { status: "SELF_ATTESTED", checker_id: ACTOR_PRODUCER.actor_id, checker_distinct_from_actor: false } }, cleanEvidence) },
  { ajv: "FAIL", semantic: "N/A" });

neg("neg-11-matrixrow2-invalid-evidence-remains-x0", "Experience claims X1 while its cited evidence is inadmissible -- invalid evidence must keep the record at X0.", ["SCEN-07"], ["ROW-2"],
  {
    experience: buildExperience({ maturity_state: "X1", reproducibility: { status: "DETERMINISTIC_REPRODUCTION" }, reviewer_status: { status: "UNREVIEWED", checker_id: null, checker_distinct_from_actor: true } }, cleanEvidence),
    experienceSourceEvidence: [buildEnvelope({ governance: { admissibility_status: "inadmissible" } })]
  },
  { ajv: "PASS", semantic: "FAIL" });

// SCEN-08 -------------------------------------------------------------------
pos("pos-08-scenario8-reviewed-lineage-advances-k1", "K1 knowledge carries an APPROVED reviewer independent of both the author and the source experience's actor/checker. Also (rework round 02, REV-001) the first positive proof that Knowledge's own scope.tenant_id is genuinely checked against its cited experience's scope, not merely present.", ["SCEN-08", "SCEN-05"], ["ROW-3"],
  { knowledge: cleanKnowledgeK1, knowledgeExperience: cleanExperienceX1 });

neg("neg-12-scenario8-knowledge-self-reviewed", "The only APPROVED reviewer on a K1 claim is the knowledge's own author -- schema cannot compare reviewer_id to author_actor_id; the semantic validator rejects it.", ["SCEN-08"], ["ROW-3"],
  { knowledge: buildKnowledge({ maturity_state: "K1", reviewers: [{ reviewer_id: ACTOR_PRODUCER.actor_id, reviewed_at: "2026-07-20T18:40:00.000Z", verdict: "APPROVED" }] }, cleanExperienceX1), knowledgeExperience: cleanExperienceX1 },
  { ajv: "PASS", semantic: "FAIL" });

neg("neg-13-matrixrow3-knowledge-missing-reviewer", "K1 claimed with an empty reviewers array -- schema-level: K1 requires at least one APPROVED reviewer.", ["SCEN-08"], ["ROW-3"],
  { knowledge: buildKnowledge({ maturity_state: "K1", reviewers: [] }, cleanExperienceX1) },
  { ajv: "FAIL", semantic: "N/A" });

neg("neg-14-matrixrow3-knowledge-missing-scope", "The scope field is omitted entirely -- required at the schema level regardless of maturity_state.", ["SCEN-08"], ["ROW-3"], { knowledge: (() => { const k = buildKnowledge({}, cleanExperienceX1); delete k.scope; return k; })() }, { ajv: "FAIL", semantic: "N/A" });

neg("neg-15-matrixrow3-knowledge-missing-evidence", "evidence_refs is an empty array -- the nonempty_reference_list $ref requires at least one citation.", ["SCEN-08"], ["ROW-3"], { knowledge: buildKnowledge({ evidence_refs: [] }, cleanExperienceX1) }, { ajv: "FAIL", semantic: "N/A" });

// SCEN-09 --------------------------------------------------------------------
pos("pos-09-scenario9-s1-with-evaluation-evidence", "Skill promoted to S1 carries non-empty evaluation_evidence_refs and a security_review_ref, bound to verified (K1) knowledge -- 'manifest and tests compile', matrix row 4 positive proof.", ["SCEN-09"], ["ROW-4"],
  { skill: cleanSkillS1, skillKnowledge: cleanKnowledgeK1 });

neg("neg-16-scenario9-s1-missing-evaluation-evidence", "Skill claims maturity_state S1 but evaluation_evidence_refs is empty and security_review_ref is omitted -- promotion beyond S0 requires evaluation evidence on record.", ["SCEN-09"], ["ROW-4"],
  { skill: buildSkill({ maturity_state: "S1" }, cleanKnowledgeK1) },
  { ajv: "FAIL", semantic: "N/A" });

neg("neg-17-scenario9-knowledge-snapshot-lie", "Skill claims knowledge_maturity_at_binding K1 (schema forces the claim itself to be K1), but the actually-referenced Knowledge Artifact is still K0 (unreviewed) -- schema cannot compare the claim to the real document; the semantic validator does.", ["SCEN-09"], ["ROW-4"],
  { skill: cleanSkillS0, skillKnowledge: buildKnowledge({ maturity_state: "K0" }, cleanExperienceX1) },
  { ajv: "PASS", semantic: "FAIL" });

// SCEN-10 ---------------------------------------------------------------------
pos("pos-10-scenario10-manifest-and-tests-compile", "Every test case's observed_side_effects and permission_class are subsets of the manifest's declared sets -- manifest and tests compile cleanly.", ["SCEN-10"], ["ROW-4"], { skill: cleanSkillS0, skillKnowledge: cleanKnowledgeK1 });

neg("neg-18-scenario10-undeclared-side-effect", "A test case observes NETWORK_CALL, which the manifest never declared (only FILE_WRITE/GIT_COMMIT are declared) -- undeclared side effect rejects.", ["SCEN-10"], ["ROW-4"],
  { skill: buildSkill({ tests: { positive_cases: [testCase({ case_id: "pos-1", description: "unexpected outbound call observed", expected_result: "ALLOW", observed_side_effects: ["FILE_WRITE", "NETWORK_CALL"], permission_class: "EXECUTION_WRITE" })] } }, cleanKnowledgeK1), skillKnowledge: cleanKnowledgeK1 },
  { ajv: "PASS", semantic: "FAIL" });

neg("neg-19-matrixrow4-undeclared-permission-class", "A test case exercises permission_class PROTECTED_BRANCH, a hard-deny class the manifest can never declare -- undeclared permission rejects.", ["SCEN-10"], ["ROW-4"],
  { skill: buildSkill({ tests: { negative_cases: [testCase({ case_id: "neg-1", description: "attempted protected-branch escalation observed and denied", expected_result: "DENY", observed_side_effects: [], permission_class: "PROTECTED_BRANCH" })] } }, cleanKnowledgeK1), skillKnowledge: cleanKnowledgeK1 },
  { ajv: "PASS", semantic: "FAIL" });

// SCEN-11 -----------------------------------------------------------------------
pos("pos-11-scenario11-negative-tests-fail-closed", "All negative_cases and policy_denial_cases expect DENY/ERROR, never ALLOW.", ["SCEN-11"], ["ROW-4"],
  { skill: buildSkill({ tests: { negative_cases: [testCase({ case_id: "neg-1", description: "direct write still denied", expected_result: "DENY", observed_side_effects: [], permission_class: "EXECUTION_WRITE" })], policy_denial_cases: [testCase({ case_id: "pol-1", description: "policy bundle denies escalation attempt", expected_result: "DENY", observed_side_effects: [], permission_class: "EXECUTION_WRITE" })], regression_cases: [testCase({ case_id: "reg-1", description: "prior fix still holds", expected_result: "ALLOW", observed_side_effects: ["FILE_WRITE"], permission_class: "EXECUTION_WRITE" })] } }, cleanKnowledgeK1), skillKnowledge: cleanKnowledgeK1 });

neg("neg-20-scenario11-negative-case-expects-allow", "A negative_cases entry declares expected_result ALLOW -- the item schema for negative/policy-denial cases closes the enum to DENY/ERROR only, so ALLOW is not a legal value here at all.", ["SCEN-11"], ["ROW-4"],
  { skill: buildSkill({ tests: { negative_cases: [testCase({ case_id: "neg-1", description: "mislabeled case", expected_result: "ALLOW", observed_side_effects: [], permission_class: "EXECUTION_WRITE" })] } }, cleanKnowledgeK1) },
  { ajv: "FAIL", semantic: "N/A" });

// SCEN-12 -------------------------------------------------------------------------
pos("pos-12-scenario12-legal-suspend-transition", "S2 -> SUSPENDED is a legal edge in the maturity transition table.", ["SCEN-12"], [],
  { transitionRequest: { object_type: "SkillCandidate", object_id: cleanSkillS1.skill_id, from_state: "S2", to_state: "SUSPENDED", triggering_event_type: "skill.suspended", evidence_refs: [refTo("suspend-evidence-01")], actor: ACTOR_REVIEWER } });

pos("pos-13-scenario12-legal-rollback-transition", "SUSPENDED -> ROLLED_BACK is a legal edge in the maturity transition table.", ["SCEN-12"], [],
  { transitionRequest: { object_type: "SkillCandidate", object_id: cleanSkillS1.skill_id, from_state: "SUSPENDED", to_state: "ROLLED_BACK", triggering_event_type: "skill.rolled_back", evidence_refs: [refTo("rollback-evidence-01")], actor: ACTOR_REVIEWER } });

neg("neg-21-scenario12-illegal-skip-to-s2", "S0 -> S2 skips evaluation (S1) and signed approval entirely -- not a legal edge.", ["SCEN-12"], [],
  { transitionRequest: { object_type: "SkillCandidate", object_id: cleanSkillS0.skill_id, from_state: "S0", to_state: "S2", triggering_event_type: "skill.promoted", evidence_refs: [refTo("skip-evidence-01")], actor: ACTOR_REVIEWER } },
  { ajv: "PASS", semantic: "FAIL" });

neg("neg-22-scenario12-illegal-rollback-resume", "ROLLED_BACK -> S3 attempts to resume a rolled-back skill directly at its prior maturity -- not a legal edge; only RETIRED, or re-entry as a brand-new S0 candidate, is legal from ROLLED_BACK.", ["SCEN-12"], [],
  { transitionRequest: { object_type: "SkillCandidate", object_id: cleanSkillS1.skill_id, from_state: "ROLLED_BACK", to_state: "S3", triggering_event_type: "skill.promoted", evidence_refs: [refTo("resume-evidence-01")], actor: ACTOR_REVIEWER } },
  { ajv: "PASS", semantic: "FAIL" });

// SCEN-13 -------------------------------------------------------------------------
pos("pos-14-scenario13-full-lineage-traceability", "Skill -> Knowledge -> Experience -> Evidence: every hop's ref_id matches the next document's own id. Also (rework round 02, REV-001) the first positive proof that Skill Candidate's own scope.tenant_id is genuinely checked against its full knowledge/experience/evidence lineage, not merely present.", ["SCEN-13", "SCEN-05"], [],
  { skill: cleanSkillS0, skillKnowledge: cleanKnowledgeK1, skillKnowledgeExperience: cleanExperienceX1, skillEvidenceForLineage: cleanEvidence });

neg("neg-23-scenario13-lineage-break-knowledge-mismatch", "skill.knowledge_ref.ref_id does not match the supplied knowledge document's own knowledge_id -- a spliced/broken chain.", ["SCEN-13"], [],
  { skill: buildSkill({ knowledge_ref: refTo("know_0000000000000000000000000000000000000000000000000000000000000000") }, cleanKnowledgeK1), skillKnowledge: cleanKnowledgeK1, skillKnowledgeExperience: cleanExperienceX1, skillEvidenceForLineage: cleanEvidence },
  { ajv: "PASS", semantic: "FAIL" });

// SCEN-14 -------------------------------------------------------------------------
pos("pos-15-scenario14-active-knowledge-spawns-candidate", "Knowledge is genuinely K1 (active, not deprecated) and legitimately spawns a Skill Candidate.", ["SCEN-14"], [],
  { skill: cleanSkillS0, skillKnowledge: cleanKnowledgeK1 });

neg("neg-24-scenario14-deprecated-knowledge-spawns-candidate", "The referenced Knowledge Artifact is DEPRECATED, but the skill still claims knowledge_maturity_at_binding K1 -- deprecated knowledge cannot produce a new skill candidate.", ["SCEN-14"], [],
  { skill: cleanSkillS0, skillKnowledge: buildKnowledge({ maturity_state: "DEPRECATED", superseded_by: refTo("know_1111111111111111111111111111111111111111111111111111111111111111") }, cleanExperienceX1) },
  { ajv: "PASS", semantic: "FAIL" });

// SCEN-15 -------------------------------------------------------------------------
pos("pos-16-scenario15-outcome-event-execution-completed", "A well-formed skill.execution.completed event validates against the closed event vocabulary.", ["SCEN-15"], [],
  { event: { schema_version: "1.0", event_id: `evt_${sha256Hex("event-exec-completed-01")}`, event_type: "skill.execution.completed", occurred_at: "2026-07-20T19:00:00.000Z", scope: TENANT_A, subject_ref: { object_type: "SkillCandidate", object_id: cleanSkillS1.skill_id, previous_maturity_state: "S1", new_maturity_state: "S1" }, actor: ACTOR_REVIEWER, evidence_refs: [refTo("execution-log-01")], payload_digest: hash("execution-payload-01") } });

pos("pos-17-scenario15-outcome-event-regression-detected", "A well-formed skill.regression.detected event validates -- this is the data-plane hook outcome telemetry would consume to test whether promotion reduced recurrence; the recurrence computation itself is a WP8 analytics concern, not schema-provable.", ["SCEN-15"], [],
  { event: { schema_version: "1.0", event_id: `evt_${sha256Hex("event-regression-detected-01")}`, event_type: "skill.regression.detected", occurred_at: "2026-07-20T19:05:00.000Z", scope: TENANT_A, subject_ref: { object_type: "SkillCandidate", object_id: cleanSkillS1.skill_id, previous_maturity_state: "S1", new_maturity_state: "SUSPENDED" }, actor: ACTOR_REVIEWER, evidence_refs: [refTo("regression-log-01")], payload_digest: hash("regression-payload-01") } });

neg("neg-25-scenario15-event-type-not-in-closed-enum", "event_type 'skill.made_up_event' is not in the closed vocabulary from section 12.", ["SCEN-15"], [],
  { event: { schema_version: "1.0", event_id: `evt_${sha256Hex("event-bad-01")}`, event_type: "skill.made_up_event", occurred_at: "2026-07-20T19:10:00.000Z", scope: TENANT_A, subject_ref: { object_type: "SkillCandidate", object_id: cleanSkillS1.skill_id, previous_maturity_state: "S1", new_maturity_state: "S1" }, actor: ACTOR_REVIEWER, evidence_refs: [], payload_digest: hash("bad-payload-01") } },
  { ajv: "FAIL", semantic: "N/A" });

// Deliverable self-conformance: the taxonomy instance and transition table are themselves conformant artifacts.
const taxonomyInstance = loadJson(path.join(__dirname, "data", "classification-taxonomy.instance.json"));
const transitionTable = loadJson(path.join(__dirname, "data", "maturity-transition-table.json"));

pos("pos-18-taxonomy-instance-conformant", "The canonical classification-taxonomy.instance.json is itself schema-conformant: exactly 14 closed entries, correct SECURITY_EVENT/positive-control if/then behavior.", [], ["ROW-1"], { taxonomy: taxonomyInstance });

neg("neg-26-taxonomy-missing-entry", "A taxonomy instance with only 13 entries (SECURITY_EVENT removed) -- the registry is fixed-size and closed.", [], ["ROW-1"],
  { taxonomy: { ...taxonomyInstance, entries: taxonomyInstance.entries.filter((e) => e.failure_class !== "SECURITY_EVENT") } },
  { ajv: "FAIL", semantic: "N/A" });

neg("neg-27-taxonomy-security-event-marked-positive-control", "SECURITY_EVENT entry edited to claim is_positive_control=true -- the per-entry if/then forbids this combination.", [], ["ROW-1"],
  { taxonomy: { ...taxonomyInstance, entries: taxonomyInstance.entries.map((e) => (e.failure_class === "SECURITY_EVENT" ? { ...e, is_positive_control: true } : e)) } },
  { ajv: "FAIL", semantic: "N/A" });

pos("pos-19-transition-table-conformant", "The canonical maturity-transition-table.json is itself schema-conformant against transitions.schema.json#/$defs/transition_table.", [], [],
  { transitionTableSubject: transitionTable });

neg("neg-28-transition-table-missing-object-type", "A transition table missing the SkillCandidate key entirely -- all four fail-learn object types are required.", [], [],
  { transitionTableSubject: (() => { const t = structuredClone(transitionTable); delete t.object_types.SkillCandidate; return t; })() },
  { ajv: "FAIL", semantic: "N/A" });

// Bonus: separation-of-duties beyond the 15 named scenarios, tied to P0 plan section 7.
neg("neg-29-bonus-sod-producer-equals-checker", "Skill's checker_actor_id equals its own builder_identity.actor_id -- the same identity cannot satisfy both sides of a required separation (P0 plan section 7).", ["SOD-P0-SEC7"], [],
  { skill: buildSkill({ checker_actor_id: ACTOR_BUILDER.actor_id }, cleanKnowledgeK1), skillKnowledge: cleanKnowledgeK1 },
  { ajv: "PASS", semantic: "FAIL" });

// =============================================================================
// Rework round 02 (02-rework-001-defect-correction.yaml): new vectors added to
// close REV-001 and SEC-FL-WP1-001/002. Numbering continues from neg-29/pos-19.
// =============================================================================

// --- REV-001 (tenant lineage: Knowledge and Skill Candidate, not just Experience) ---

pos("pos-20-scenario3-redaction-attestation-explicit-external-scanner", "governance.redaction_attestation explicitly claims an EXTERNAL_SECRET_SCANNER mechanism (not just the default DENYLIST_PATTERN every other envelope vector uses) -- the attestation shape accepts any of the closed mechanism values, not only the one mechanism this package's own schema-layer guard actually implements.", ["SCEN-03"], ["ROW-1"],
  { envelope: buildEnvelope({ sequence: 5, governance: { redaction_attestation: { redaction_applied: true, mechanism: "EXTERNAL_SECRET_SCANNER", policy_version: "redaction-policy-v2" } } }) });

neg("neg-30-scenario5-knowledge-cross-tenant-lineage", "Knowledge Artifact declares Tenant B scope while citing (via knowledgeExperience) an Experience Record scoped to Tenant A. Reproduces REV-001's own mutation of pos-08 exactly: same author/reviewers/evidence/experience_refs as the clean K1 case, content-address digest recomputed automatically by buildKnowledge (not hand-tampered), isolating scope.tenant_id as the one property under test. Before rework round 02 this passed both ajv and the semantic layer as fully conformant K1 knowledge -- validateTenantLineageConsistency was never called for documents.knowledge.", ["SCEN-05"], ["ROW-3"],
  {
    knowledge: buildKnowledge(
      { maturity_state: "K1", scope: TENANT_B, reviewers: [{ reviewer_id: ACTOR_REVIEWER.actor_id, reviewed_at: "2026-07-20T18:40:00.000Z", verdict: "APPROVED" }], confidence: "high" },
      cleanExperienceX1
    ),
    knowledgeExperience: cleanExperienceX1
  },
  { ajv: "PASS", semantic: "FAIL" });

neg("neg-31-scenario5-skill-cross-tenant-lineage", "Skill Candidate declares Tenant B scope while its cited Knowledge Artifact (skillKnowledge) is scoped to Tenant A -- same class of defect REV-001 demonstrated for Knowledge, reproduced for Skill Candidate's newly-added scope field. Before rework round 02 Skill Candidate had no scope field at all, so this exact mismatch was not even schema-expressible.", ["SCEN-05"], ["ROW-4"],
  { skill: buildSkill({ scope: TENANT_B }, cleanKnowledgeK1), skillKnowledge: cleanKnowledgeK1 },
  { ajv: "PASS", semantic: "FAIL" });

// --- SEC-FL-WP1-001 (manifest capability-smuggling: 4 of 6 categories unchecked) ---

neg("neg-32-scenario10-manifest-smuggling-network-and-filesystem", "Manifest declares only READ_ONLY / [NONE] (matched exactly by the test case's own observed_side_effects/permission_class, so the original two-category check finds nothing to flag), but the SAME test case's newly-required observed_tools/observed_mcp_servers/observed_filesystem_paths/observed_network_hosts fields report raw exec tools (curl/ssh/scp/nc), an unreviewed MCP server, SSH-key-directory and secrets-mount filesystem access, and cloud-metadata SSRF-style network hosts (169.254.169.254, metadata.google.internal) -- none of which the manifest declares. Reproduces SEC-FL-WP1-001's own adversarial probe verbatim (same network_hosts/filesystem_paths/tools values). Before rework round 02 these four fields did not exist anywhere in the contract, so this smuggling was not even schema-expressible, let alone checkable.", ["SCEN-10"], ["ROW-4"],
  {
    skill: buildSkill(
      {
        capability_manifest: {
          declared_permissions: {
            action_classes: ["READ_ONLY"],
            declared_side_effects: ["NONE"],
            tools: [],
            mcp_servers: [],
            filesystem_paths: [],
            network_hosts: []
          }
        },
        tests: {
          positive_cases: [testCase({
            case_id: "pos-1",
            description: "narrow read-only manifest, but this test case observes smuggled broad capability access",
            expected_result: "ALLOW",
            observed_side_effects: ["NONE"],
            permission_class: "READ_ONLY",
            observed_tools: ["curl", "ssh", "scp", "nc"],
            observed_mcp_servers: ["arbitrary-unreviewed-mcp-server"],
            observed_filesystem_paths: ["/etc", "/root/.ssh", "/var/run/secrets"],
            observed_network_hosts: ["169.254.169.254", "metadata.google.internal", "0.0.0.0"]
          })],
          negative_cases: [testCase({
            case_id: "neg-1",
            description: "matching non-smuggling denial case, declared only so tests.negative_cases (minItems 1) is satisfied",
            expected_result: "DENY",
            observed_side_effects: ["NONE"],
            permission_class: "READ_ONLY"
          })],
          regression_cases: [],
          policy_denial_cases: []
        }
      },
      cleanKnowledgeK1
    ),
    skillKnowledge: cleanKnowledgeK1
  },
  { ajv: "PASS", semantic: "FAIL" });

// --- SEC-FL-WP1-002 (secret leakage: redaction_applied attestation, denylist hardening) ---

neg("neg-33-scenario3-admissible-envelope-claims-no-redaction", "governance.admissibility_status is admissible, but governance.redaction_attestation.redaction_applied is false -- rework round 02 (SEC-FL-WP1-002) closes this: an admissible envelope can no longer confess that no redaction step was ever claimed to run.", ["SCEN-03"], ["ROW-1"],
  { envelope: buildEnvelope({ governance: { redaction_attestation: { redaction_applied: false, mechanism: "NONE", policy_version: "redaction-policy-v1" } } }) },
  { ajv: "FAIL", semantic: "N/A" });

neg("neg-34-scenario3-sanitized-message-case-variation-now-caught", "sanitized_message embeds a case-varied api_key trigger ('API_KEY:' rather than 'api_key=') -- SEC-FL-WP1-002's own demonstrated bypass of the original lowercase-only denylist regex. Rework round 02 hardens the pattern to match trigger keywords case-insensitively, so this is now caught at the schema layer where it previously passed clean.", ["SCEN-03"], ["ROW-1"],
  { envelope: buildEnvelope({ failure: { sanitized_message: "leaked API_KEY: abc123def456" } }) },
  { ajv: "FAIL", semantic: "N/A" });

// ---------------------------------------------------------------------------
for (const v of positives) writeFileSync(path.join(OUT.positive, `${v.vector_id}.json`), JSON.stringify(v, null, 2) + "\n");
for (const v of negatives) writeFileSync(path.join(OUT.negative, `${v.vector_id}.json`), JSON.stringify(v, null, 2) + "\n");

console.log(`Wrote ${positives.length} positive and ${negatives.length} negative vectors.`);
