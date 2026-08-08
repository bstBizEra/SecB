import { createHash } from "node:crypto";
import { SecondBrainService } from "./second-brain-service.mjs";

/**
 * SecB Knowledge Maturity Pipeline Engine
 * Manages the 5-stage transformation lifecycle:
 * Stage 1: SESSION_RECORD
 * Stage 2: EVIDENCE_ENVELOPE
 * Stage 3: KNOWLEDGE_CLAIM
 * Stage 4: EXPERIENCE_PATTERN
 * Stage 5: GOVERNED_SKILL
 */

export class KnowledgeMaturityError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "KnowledgeMaturityError";
    this.code = code;
  }
}

function hashString(val) {
  return createHash("sha256").update(val).digest("hex");
}

export class KnowledgeMaturityPipeline {
  #pipelines = new Map();
  #secondBrainService;

  constructor({ secondBrainService } = {}) {
    this.#secondBrainService = secondBrainService ?? new SecondBrainService();
  }

  // Stage 1 -> Stage 2: Promote Session Record to Evidence Envelope
  promoteSessionToEvidence({ sessionId, sessionTrace, testResults = {} }) {
    if (!sessionId || !sessionTrace) {
      throw new KnowledgeMaturityError("INVALID_SESSION", "sessionId and sessionTrace are required");
    }

    const pipelineId = `MATURITY-${sessionId}-${Date.now()}`;
    const timestamp = new Date().toISOString();

    const evidenceData = {
      session_id: sessionId,
      session_trace: sessionTrace,
      test_results: testResults,
      sealed_at: timestamp
    };

    const fingerprint = hashString(JSON.stringify(evidenceData));

    const pipelineState = {
      pipeline_id: pipelineId,
      stage: "EVIDENCE_ENVELOPE",
      stage_number: 2,
      session_id: sessionId,
      evidence_envelope: { ...evidenceData, fingerprint },
      knowledge_claim: null,
      experience_pattern: null,
      governed_skill: null,
      updated_at: timestamp
    };

    this.#pipelines.set(pipelineId, pipelineState);
    return pipelineState;
  }

  // Stage 2 -> Stage 3: Derive Knowledge Claim
  deriveKnowledgeFromEvidence({ pipelineId, claimSummary, baseline = "main" }) {
    const pipeline = this.#pipelines.get(pipelineId);
    if (!pipeline) {
      throw new KnowledgeMaturityError("PIPELINE_NOT_FOUND", `Pipeline ${pipelineId} not found`);
    }

    if (pipeline.stage_number < 2) {
      throw new KnowledgeMaturityError("INVALID_STAGE_TRANSITION", "Must be at least at EVIDENCE_ENVELOPE stage");
    }

    const claimData = {
      summary: claimSummary || `Knowledge claim derived from ${pipeline.session_id}`,
      baseline,
      evidence_fingerprint: pipeline.evidence_envelope.fingerprint,
      derived_at: new Date().toISOString()
    };

    claimData.fingerprint = hashString(JSON.stringify(claimData));

    pipeline.stage = "KNOWLEDGE_CLAIM";
    pipeline.stage_number = 3;
    pipeline.knowledge_claim = claimData;
    pipeline.updated_at = new Date().toISOString();

    // Store in Second Brain under PROJECTS
    this.#secondBrainService.captureKnowledge({
      title: `Knowledge Claim: ${claimSummary}`,
      content: JSON.stringify(claimData),
      category: "PROJECTS",
      classification: "INTERNAL"
    });

    return pipeline;
  }

  // Stage 3 -> Stage 4: Synthesize Experience Pattern
  synthesizeExperience({ pipelineId, patternTitle, description }) {
    const pipeline = this.#pipelines.get(pipelineId);
    if (!pipeline) {
      throw new KnowledgeMaturityError("PIPELINE_NOT_FOUND", `Pipeline ${pipelineId} not found`);
    }

    if (pipeline.stage_number < 3) {
      throw new KnowledgeMaturityError("INVALID_STAGE_TRANSITION", "Must be at least at KNOWLEDGE_CLAIM stage");
    }

    const patternData = {
      title: patternTitle || `Experience Pattern for ${pipeline.session_id}`,
      description: description || "Synthesized cross-session experience pattern",
      claim_fingerprint: pipeline.knowledge_claim.fingerprint,
      synthesized_at: new Date().toISOString()
    };

    patternData.fingerprint = hashString(JSON.stringify(patternData));

    pipeline.stage = "EXPERIENCE_PATTERN";
    pipeline.stage_number = 4;
    pipeline.experience_pattern = patternData;
    pipeline.updated_at = new Date().toISOString();

    // Store in Second Brain under RESOURCES
    this.#secondBrainService.captureKnowledge({
      title: `Experience Pattern: ${patternTitle}`,
      content: JSON.stringify(patternData),
      category: "RESOURCES",
      classification: "INTERNAL"
    });

    return pipeline;
  }

  // Stage 4 -> Stage 5: Promote Experience Pattern to Governed Skill
  promoteExperienceToSkill({ pipelineId, skillName, description }) {
    const pipeline = this.#pipelines.get(pipelineId);
    if (!pipeline) {
      throw new KnowledgeMaturityError("PIPELINE_NOT_FOUND", `Pipeline ${pipelineId} not found`);
    }

    if (pipeline.stage_number < 4) {
      throw new KnowledgeMaturityError("INVALID_STAGE_TRANSITION", "Must be at least at EXPERIENCE_PATTERN stage");
    }

    const name = skillName || `skill-${pipeline.session_id}`;
    const skillPkg = this.#secondBrainService.distillSkill({
      name,
      description: description || pipeline.experience_pattern.description,
      content: `Pattern: ${pipeline.experience_pattern.title}\nProvenance: ${pipeline.pipeline_id}`
    });

    pipeline.stage = "GOVERNED_SKILL";
    pipeline.stage_number = 5;
    pipeline.governed_skill = skillPkg;
    pipeline.updated_at = new Date().toISOString();

    return pipeline;
  }

  getPipelineStatus(pipelineId) {
    const pipeline = this.#pipelines.get(pipelineId);
    if (!pipeline) {
      throw new KnowledgeMaturityError("PIPELINE_NOT_FOUND", `Pipeline ${pipelineId} not found`);
    }
    return pipeline;
  }
}
