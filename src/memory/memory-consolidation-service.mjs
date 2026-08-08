import { createHash } from "node:crypto";
import { SecondBrainService } from "../brain/second-brain-service.mjs";

/**
 * SecB Memory Consolidation Service
 * Consolidates short-term session logs and context traces into long-term PARA working memory.
 */

export class MemoryConsolidationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "MemoryConsolidationError";
    this.code = code;
  }
}

function hashString(val) {
  return createHash("sha256").update(val).digest("hex");
}

export class MemoryConsolidationService {
  #secondBrainService;
  #consolidations = new Map();

  constructor({ secondBrainService } = {}) {
    this.#secondBrainService = secondBrainService ?? new SecondBrainService();
  }

  consolidateSessionMemory({ sessionId, sessionTrace, category = "RESOURCES", classification = "INTERNAL" }) {
    if (!sessionId || !sessionTrace) {
      throw new MemoryConsolidationError("INVALID_CONSOLIDATION_PARAMS", "sessionId and sessionTrace are required");
    }

    const consolidationId = `MEM-CONS-${sessionId}-${Date.now()}`;
    const timestamp = new Date().toISOString();

    const capturedItem = this.#secondBrainService.captureKnowledge({
      title: `Consolidated Memory: ${sessionId}`,
      content: typeof sessionTrace === "string" ? sessionTrace : JSON.stringify(sessionTrace),
      category,
      classification
    });

    const record = {
      consolidation_id: consolidationId,
      session_id: sessionId,
      target_para_item_id: capturedItem.item_id,
      category: capturedItem.category,
      classification: capturedItem.classification,
      consolidated_at: timestamp,
      fingerprint: hashString(JSON.stringify(capturedItem))
    };

    this.#consolidations.set(consolidationId, record);
    return record;
  }

  inspectMemorySummary() {
    const paraSummary = this.#secondBrainService.inspectPARA();
    return {
      consolidations_count: this.#consolidations.size,
      para_memory: paraSummary,
      status: "HEALTHY"
    };
  }
}
