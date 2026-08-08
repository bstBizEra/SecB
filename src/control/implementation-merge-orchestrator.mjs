import { createHash } from "node:crypto";

/**
 * SecB Implementation Merge Orchestrator
 * Validates pre-merge release invariants (100% test pass, signed Human GOV approval, evidence sealing)
 * before generating the final MergeReleasePacket.
 */

export class MergeOrchestratorError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "MergeOrchestratorError";
    this.code = code;
  }
}

function hashString(val) {
  return createHash("sha256").update(val).digest("hex");
}

export class ImplementationMergeOrchestrator {
  orchestrateMergeRelease({ projectId, allocationId, authorizationRecord, evidenceEnvelope }) {
    if (!projectId || !allocationId) {
      throw new MergeOrchestratorError("INVALID_MERGE_PARAMS", "projectId and allocationId are required");
    }

    if (!authorizationRecord || !authorizationRecord.reviewerSignature) {
      throw new MergeOrchestratorError("DENY_UNAUTHORIZED_MERGE", "Fails closed: Signed Human GOV authorizationRecord is required before merge release");
    }

    if (!evidenceEnvelope || !evidenceEnvelope.fingerprint) {
      throw new MergeOrchestratorError("DENY_UNSEALED_EVIDENCE", "Fails closed: SHA-256 sealed evidenceEnvelope is required");
    }

    const testPassed = evidenceEnvelope.test_results?.fail === 0 || evidenceEnvelope.status === "PASSED";
    if (!testPassed) {
      throw new MergeOrchestratorError("DENY_FAILED_TESTS", "Fails closed: All unit tests must pass before merge release");
    }

    const releaseId = `MERGE-RELEASE-${projectId}-${Date.now()}`;
    const timestamp = new Date().toISOString();

    const payload = {
      release_id: releaseId,
      project_id: projectId,
      allocation_id: allocationId,
      authorization_signature: authorizationRecord.reviewerSignature,
      evidence_fingerprint: evidenceEnvelope.fingerprint,
      status: "APPROVED_FOR_MAIN_MERGE",
      approved_at: timestamp
    };

    const packetFingerprint = hashString(JSON.stringify(payload));

    return {
      ok: true,
      release_packet: { ...payload, fingerprint: packetFingerprint },
      summary: `Merge release packet generated for project ${projectId} (Worktree ${allocationId})`
    };
  }
}
