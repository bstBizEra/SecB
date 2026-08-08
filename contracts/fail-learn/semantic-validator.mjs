// Companion semantic validator for the SecB Fail-Learn WP1 contract set
// (SECB-FAIL-LEARN-001 / SECB-FAIL-LEARN-P0-001, package
// p0-fail-learn-architecture-intake-014, work package wp1). Every function
// here exists because JSON Schema (Draft 2020-12, no $data) cannot compare
// one document's field value against another document's field value, cannot
// recompute a hash over sibling data, and cannot consult an external
// data-driven legality table. Each function's docstring names exactly which
// P0 conformance scenario or contract-validation-matrix row it supports.
//
// IMPORTANT: none of these functions branch on vector_id, case_id, or any
// other test-identifying string. Every check reads only the field values of
// the documents it is given. See 01-producer-self-verification.yaml for the
// grep proof and adversarial mutation spot-checks.

import { createHash } from "node:crypto";

export function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    const sorted = {};
    for (const key of Object.keys(value).sort()) sorted[key] = canonicalize(value[key]);
    return sorted;
  }
  return value;
}

export function canonicalStringify(value) {
  return JSON.stringify(canonicalize(value));
}

export function sha256Hex(input) {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

function deletePath(obj, dottedPath) {
  const parts = dottedPath.split(".");
  let cursor = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (cursor == null || typeof cursor !== "object") return;
    cursor = cursor[parts[i]];
  }
  if (cursor != null && typeof cursor === "object") delete cursor[parts[parts.length - 1]];
}

/**
 * Recomputes the canonical content-address suffix for `doc`, excluding the
 * fields named in `excludeFields` (dotted paths), and compares it to the
 * suffix embedded in doc[idField] (format "<prefix>_<64 lowercase hex>").
 * Used by validateContentAddressIntegrity below. This is the mechanism that
 * gives "content-addressed" (task item 1) real teeth: any mutation to a
 * sealed document after its id was minted changes the recomputed digest and
 * is caught here -- SCEN-04 (evidence tampering invalidates verification).
 */
export function recomputedSuffixMatches(doc, idField, excludeFields) {
  const clone = structuredClone(doc);
  for (const f of excludeFields) deletePath(clone, f);
  const recomputed = sha256Hex(canonicalStringify(clone));
  const declared = String(doc[idField] || "");
  const declaredSuffix = declared.includes("_") ? declared.slice(declared.indexOf("_") + 1) : declared;
  return { matches: recomputed === declaredSuffix, recomputed, declaredSuffix };
}

/**
 * SCEN-04 / task item 1 ("versioned, content-addressed"). Applies to
 * FailureEvidenceEnvelope (evidence_id), ExperienceRecord (experience_id),
 * KnowledgeArtifact (knowledge_id), and SkillCandidate (skill_id).
 */
export function validateContentAddressIntegrity(doc, idField, excludeFields) {
  const { matches, recomputed, declaredSuffix } = recomputedSuffixMatches(doc, idField, excludeFields);
  if (matches) return { valid: true, violations: [] };
  return {
    valid: false,
    violations: [{
      check: "content_address_integrity",
      message: `${idField} suffix (${declaredSuffix}) does not match recomputed canonical digest (${recomputed}) -- document was mutated after the id was minted, or the id was never genuinely content-addressed`
    }]
  };
}

/**
 * SECB-FAIL-LEARN-001 section 5 final sentence / SCEN-01 / matrix row 1:
 * "A correctly denied request SHALL NOT be reported as a control
 * malfunction." Cross-checks decision.result/fail_closed_applied/
 * matched_rules against the taxonomy's is_positive_control flag for the
 * declared failure_class -- a comparison across two different objects
 * (envelope + taxonomy) that a single schema cannot express.
 */
export function validateFailureClassificationConsistency(envelope, taxonomy) {
  const violations = [];
  const entry = (taxonomy?.entries || []).find((e) => e.failure_class === envelope?.failure?.failure_class);
  if (!entry) {
    violations.push({ check: "failure_classification_consistency", message: `failure_class ${envelope?.failure?.failure_class} not found in supplied taxonomy` });
    return { valid: false, violations };
  }
  const cleanlyDenied =
    envelope?.decision?.result === "denied" &&
    envelope?.decision?.fail_closed_applied === true &&
    Array.isArray(envelope?.decision?.matched_rules) &&
    envelope.decision.matched_rules.length > 0;
  if (cleanlyDenied && entry.is_positive_control !== true) {
    violations.push({
      check: "failure_classification_consistency",
      message: `envelope reports a clean policy denial (fail_closed_applied=true, matched_rules non-empty) but classifies it as ${envelope.failure.failure_class}, which the taxonomy marks is_positive_control=false -- a correctly denied request must not be reported as a control malfunction`
    });
  }
  return { valid: violations.length === 0, violations };
}

/**
 * SECB-FAIL-LEARN-001 section 14 / SCEN-05: derived records must declare the
 * SAME tenant_id as the evidence they are lineage-derived from. `parentDocs`
 * is an array of documents each carrying a `.scope.tenant_id` (or `.tenant_id`
 * directly for envelopes, which nest it at `.scope.tenant_id` too).
 */
export function validateTenantLineageConsistency(childScope, parentDocs) {
  const violations = [];
  for (const parent of parentDocs || []) {
    const parentTenant = parent?.scope?.tenant_id;
    if (parentTenant && parentTenant !== childScope?.tenant_id) {
      violations.push({
        check: "tenant_lineage_consistency",
        message: `child record scope.tenant_id (${childScope?.tenant_id}) does not match a cited parent record's scope.tenant_id (${parentTenant}) -- cross-tenant lineage`
      });
    }
  }
  return { valid: violations.length === 0, violations };
}

/**
 * SCEN-07 / matrix row 2 negative proof ("Self-attestation ... remain X0").
 * Re-derives distinctness from the raw actor ids rather than trusting the
 * checker_distinct_from_actor flag, so a producer cannot advance to X1 by
 * simply asserting the flag while checker_id secretly equals source_actor_id.
 */
export function validateNoSelfAttestationAdvancement(experience) {
  const violations = [];
  const selfAttested = experience?.reviewer_status?.checker_id != null && experience.reviewer_status.checker_id === experience.source_actor_id;
  if (experience?.maturity_state === "X1" && selfAttested) {
    violations.push({
      check: "no_self_attestation_advancement",
      message: `experience ${experience.experience_id} claims maturity_state X1 but reviewer_status.checker_id equals source_actor_id (${experience.source_actor_id}) -- self-attestation cannot advance past X0, regardless of the checker_distinct_from_actor flag's declared value`
    });
  }
  return { valid: violations.length === 0, violations };
}

/**
 * SCEN-07 (dual to the above): the original agent cannot verify its own
 * causal explanation. Same underlying check, phrased from the "who resolved
 * the referenced evidence's own actor" angle when evidence context is
 * supplied -- catches the case where checker_id differs from
 * source_actor_id on the experience record itself, but is identical to the
 * ORIGINAL evidence envelope's actor_id (i.e. the "checker" is the same
 * agent that produced the underlying failure, just recorded under a
 * different experience-level field).
 */
export function validateCheckerNotOriginalEvidenceActor(experience, sourceEvidenceDocs) {
  const violations = [];
  const checkerId = experience?.reviewer_status?.checker_id;
  if (experience?.maturity_state !== "X1" || checkerId == null) return { valid: true, violations };
  for (const evidenceDoc of sourceEvidenceDocs || []) {
    if (evidenceDoc?.actor?.actor_id && evidenceDoc.actor.actor_id === checkerId) {
      violations.push({
        check: "checker_not_original_evidence_actor",
        message: `experience ${experience.experience_id} claims X1 via checker ${checkerId}, but that same actor_id produced the original Failure Evidence Envelope ${evidenceDoc.evidence_id} -- the original agent cannot verify its own causal explanation`
      });
    }
  }
  return { valid: violations.length === 0, violations };
}

/**
 * Matrix row 2 negative proof ("invalid evidence remain X0"). If any cited
 * source evidence is not admissible, the experience cannot advance past X0.
 */
export function validateExperienceEvidenceAdmissibility(experience, sourceEvidenceDocs) {
  const violations = [];
  const inadmissible = (sourceEvidenceDocs || []).filter((d) => d?.governance?.admissibility_status !== "admissible");
  if (inadmissible.length > 0 && experience?.maturity_state !== "X0" && experience?.maturity_state !== "QUARANTINED" && experience?.maturity_state !== "REJECTED") {
    violations.push({
      check: "experience_evidence_admissibility",
      message: `experience ${experience.experience_id} claims maturity_state ${experience.maturity_state} but cites evidence with governance.admissibility_status != admissible (${inadmissible.map((d) => d.evidence_id).join(", ")}) -- invalid evidence must remain X0`
    });
  }
  return { valid: violations.length === 0, violations };
}

/**
 * SCEN-08 / matrix row 3 ("a lesson cannot become knowledge without
 * independent review"). Cross-checks each APPROVED reviewer against the
 * knowledge author AND, when the source experience is supplied, against
 * that experience's source_actor_id and checker_id -- none of which a single
 * schema can compare.
 */
export function validateIndependentKnowledgeReview(knowledge, experienceDoc) {
  const violations = [];
  if (knowledge?.maturity_state !== "K1") return { valid: true, violations };
  // Rework round 02 (SEC-FL-WP1-N001): a K1 knowledge document always cites at
  // least one experience_refs entry (schema-required, nonempty_reference_list),
  // so a caller that resolves and passes that experience document is always
  // possible in principle. Previously, omitting experienceDoc entirely made the
  // author/experience-actor collision invisible (this function silently fell
  // back to checking only knowledge.author_actor_id). Fail CLOSED instead: a K1
  // claim cannot be certified independent without the source experience
  // actually being supplied for cross-checking.
  if (!experienceDoc) {
    violations.push({
      check: "independent_knowledge_review",
      message: `knowledge ${knowledge.knowledge_id} claims K1 but no source Experience Record was supplied to validateIndependentKnowledgeReview for independence cross-checking -- a K1 claim cannot be verified independent of the reporting/checking actor without resolving and passing the cited experience_refs document; this call fails closed rather than silently skipping the author/experience-actor collision check (SEC-FL-WP1-N001)`
    });
    return { valid: false, violations };
  }
  const disqualified = new Set([knowledge.author_actor_id]);
  if (experienceDoc.source_actor_id) disqualified.add(experienceDoc.source_actor_id);
  if (experienceDoc.reviewer_status?.checker_id) disqualified.add(experienceDoc.reviewer_status.checker_id);
  const independentApproval = (knowledge.reviewers || []).some((r) => r.verdict === "APPROVED" && !disqualified.has(r.reviewer_id));
  if (!independentApproval) {
    violations.push({
      check: "independent_knowledge_review",
      message: `knowledge ${knowledge.knowledge_id} claims K1 but has no APPROVED reviewer independent of the author (${knowledge.author_actor_id}) or the source experience's actor/checker (${experienceDoc.source_actor_id}, ${experienceDoc.reviewer_status?.checker_id})`
    });
  }
  return { valid: independentApproval, violations };
}

/**
 * SCEN-09 (partial) / SCEN-14 / matrix row 4 lineage precondition. A single
 * function covers both: it is the same defect (an actual, non-K1 knowledge
 * state -- whether K0 or DEPRECATED or anything else -- being bound to a
 * skill candidate) regardless of what the skill candidate's
 * knowledge_maturity_at_binding CLAIMS.
 */
export function validateNoDerivationFromDeprecatedKnowledge(skill, knowledgeDoc) {
  const violations = [];
  if (!knowledgeDoc) return { valid: true, violations };
  if (knowledgeDoc.maturity_state !== "K1") {
    violations.push({
      check: "no_derivation_from_non_k1_knowledge",
      message: `skill ${skill.skill_id} claims knowledge_maturity_at_binding=K1 for knowledge ${knowledgeDoc.knowledge_id}, but that knowledge's actual maturity_state is ${knowledgeDoc.maturity_state} -- deprecated, superseded, rejected, or unreviewed (K0) knowledge cannot produce a new skill candidate`
    });
  }
  return { valid: violations.length === 0, violations };
}

/**
 * SCEN-10 / matrix row 4 ("undeclared side effect or permission rejects").
 * Walks every declared test case category and asserts every OBSERVED value
 * in each of the SIX declared_permissions categories is a member of the
 * manifest's corresponding declared set: declared_side_effects,
 * action_classes, tools, mcp_servers, filesystem_paths, network_hosts.
 * declared_side_effects can never legally contain CREDENTIAL_ACTION and
 * action_classes can never legally contain a hard-deny class (schema-level
 * exclusion, see common.schema.json declarable_* enums) -- so any test case
 * that observes CREDENTIAL_ACCESS or claims a hard-deny permission_class is
 * automatically undeclared and rejected here.
 *
 * Rework round 02 (SEC-FL-WP1-001): prior to this round, only
 * declared_side_effects and action_classes were checked (2 of 6 categories);
 * tools/mcp_servers/filesystem_paths/network_hosts had no "observed"
 * counterpart field anywhere in the contract, so a narrow, innocuous-looking
 * manifest (e.g. action_classes=[READ_ONLY], declared_side_effects=[NONE])
 * could smuggle broad, unexamined tool/MCP-server/filesystem/network access
 * past this check entirely (SEC's reviewer demonstrated this with an SSRF-
 * style network_hosts + sensitive filesystem_paths + raw exec tools probe --
 * see vectors/negative/neg-32-scenario10-manifest-smuggling-network-and-filesystem.json).
 * All six categories are now walked symmetrically. tools/mcp_servers use
 * exact-string set membership (same style as the original two categories);
 * filesystem_paths and network_hosts likewise use exact-string membership,
 * NOT prefix/subnet/CIDR containment -- a declared "/etc" would NOT cover an
 * observed "/etc/passwd" under this check, and a declared "*.internal.corp"
 * would not itself expand as a wildcard. That prefix/wildcard-matching
 * semantics question is deliberately left to WP7 (Skill Foundry) runtime
 * enforcement design, not decided here at the WP1 contract-shape layer.
 */
export function validateNoUndeclaredSideEffectsOrPermissions(skill) {
  const violations = [];
  const declared = skill?.capability_manifest?.declared_permissions || {};
  const declaredEffects = new Set(declared.declared_side_effects || []);
  const declaredClasses = new Set(declared.action_classes || []);
  const declaredTools = new Set(declared.tools || []);
  const declaredMcpServers = new Set(declared.mcp_servers || []);
  const declaredFilesystemPaths = new Set(declared.filesystem_paths || []);
  const declaredNetworkHosts = new Set(declared.network_hosts || []);
  const allCases = [
    ...(skill?.tests?.positive_cases || []),
    ...(skill?.tests?.negative_cases || []),
    ...(skill?.tests?.regression_cases || []),
    ...(skill?.tests?.policy_denial_cases || [])
  ];
  const CATEGORY_CHECKS = [
    { field: "observed_side_effects", declaredSet: declaredEffects, check: "no_undeclared_side_effects", declaredName: "declared_permissions.declared_side_effects" },
    { field: "observed_tools", declaredSet: declaredTools, check: "no_undeclared_tools", declaredName: "declared_permissions.tools" },
    { field: "observed_mcp_servers", declaredSet: declaredMcpServers, check: "no_undeclared_mcp_servers", declaredName: "declared_permissions.mcp_servers" },
    { field: "observed_filesystem_paths", declaredSet: declaredFilesystemPaths, check: "no_undeclared_filesystem_paths", declaredName: "declared_permissions.filesystem_paths" },
    { field: "observed_network_hosts", declaredSet: declaredNetworkHosts, check: "no_undeclared_network_hosts", declaredName: "declared_permissions.network_hosts" }
  ];
  for (const testCase of allCases) {
    for (const { field, declaredSet, check, declaredName } of CATEGORY_CHECKS) {
      for (const observedValue of testCase[field] || []) {
        if (!declaredSet.has(observedValue)) {
          violations.push({
            check,
            message: `skill ${skill.skill_id} test case ${testCase.case_id} ${field} includes ${observedValue}, which is not in capability_manifest.${declaredName} (${[...declaredSet].join(", ") || "<empty>"})`
          });
        }
      }
    }
    if (testCase.permission_class && !declaredClasses.has(testCase.permission_class)) {
      violations.push({
        check: "no_undeclared_permission_class",
        message: `skill ${skill.skill_id} test case ${testCase.case_id} exercises permission_class ${testCase.permission_class}, which is not in capability_manifest.declared_permissions.action_classes (${[...declaredClasses].join(", ") || "<empty>"})`
      });
    }
  }
  return { valid: violations.length === 0, violations };
}

/**
 * SCEN-13 ("every skill traces to knowledge, experience, and original
 * evidence"). Walks the four-hop reference chain skill -> knowledge ->
 * experience -> evidence and requires each hop's ref_id to actually match
 * the next document's own id, catching a spliced/broken chain that a
 * single-document schema cannot see.
 */
export function validateFullLineageTraceability(skill, knowledgeDoc, experienceDoc, evidenceDoc) {
  const violations = [];
  if (skill?.knowledge_ref?.ref_id !== knowledgeDoc?.knowledge_id) {
    violations.push({ check: "full_lineage_traceability", message: `skill.knowledge_ref.ref_id (${skill?.knowledge_ref?.ref_id}) does not match the supplied knowledge document's knowledge_id (${knowledgeDoc?.knowledge_id})` });
  }
  const knowledgeCitesExperience = (knowledgeDoc?.experience_refs || []).some((r) => r.ref_id === experienceDoc?.experience_id);
  if (!knowledgeCitesExperience) {
    violations.push({ check: "full_lineage_traceability", message: `knowledge ${knowledgeDoc?.knowledge_id}.experience_refs does not cite the supplied experience document's experience_id (${experienceDoc?.experience_id})` });
  }
  const experienceCitesEvidence = (experienceDoc?.source_evidence_refs || []).some((r) => r.ref_id === evidenceDoc?.evidence_id);
  if (!experienceCitesEvidence) {
    violations.push({ check: "full_lineage_traceability", message: `experience ${experienceDoc?.experience_id}.source_evidence_refs does not cite the supplied evidence document's evidence_id (${evidenceDoc?.evidence_id})` });
  }
  return { valid: violations.length === 0, violations };
}

/**
 * Separation of duties: the builder of a skill candidate cannot also be its
 * checker (P0 plan section 7, "The same server-derived identity, agent
 * instance, or session SHALL NOT satisfy both sides of a required
 * separation").
 */
export function validateSkillProducerCheckerSeparation(skill) {
  const violations = [];
  if (skill?.builder_identity?.actor_id && skill.builder_identity.actor_id === skill.checker_actor_id) {
    violations.push({
      check: "skill_producer_checker_separation",
      message: `skill ${skill.skill_id}: checker_actor_id equals builder_identity.actor_id (${skill.checker_actor_id}) -- producer and independent checker must be distinct identities`
    });
  }
  return { valid: violations.length === 0, violations };
}

/**
 * SCEN-12 / matrix compatibility rules ("what transitions are legal").
 * Consults the versioned, data-driven maturity-transition-table.json rather
 * than a hardcoded schema conditional -- see transitions.schema.json's
 * top-level description for why.
 */
export function validateTransitionLegality(table, objectType, fromState, toState) {
  const violations = [];
  const edges = table?.object_types?.[objectType]?.[fromState];
  if (edges === undefined) {
    violations.push({ check: "transition_legality", message: `unknown state ${fromState} for object_type ${objectType} in the supplied transition table` });
    return { valid: false, violations };
  }
  if (!edges.includes(toState)) {
    violations.push({ check: "transition_legality", message: `${objectType} cannot transition from ${fromState} to ${toState} -- not a legal edge in maturity-transition-table.json` });
  }
  return { valid: violations.length === 0, violations };
}
