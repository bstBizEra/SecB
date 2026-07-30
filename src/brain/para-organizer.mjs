import { createHash } from "node:crypto";

/**
 * SecB PARA Organizer Module
 * Categorizes engineering knowledge into Projects, Areas, Resources, and Archives.
 * SHA-256 seals all organized items.
 */

export class PARAOrganizerError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "PARAOrganizerError";
    this.code = code;
  }
}

const PARA_CATEGORIES = Object.freeze(["PROJECTS", "AREAS", "RESOURCES", "ARCHIVES"]);

function hashString(val) {
  return createHash("sha256").update(val).digest("hex");
}

export class PARAOrganizer {
  #items = new Map();

  organizeKnowledge({ title, content, category = "RESOURCES", classification = "INTERNAL", metadata = {} }) {
    if (!title || !content) {
      throw new PARAOrganizerError("INVALID_KNOWLEDGE_ITEM", "title and content are required");
    }

    const catUpper = category.toUpperCase();
    if (!PARA_CATEGORIES.includes(catUpper)) {
      throw new PARAOrganizerError("INVALID_PARA_CATEGORY", `Category must be one of: ${PARA_CATEGORIES.join(", ")}`);
    }

    const itemId = `PARA-${catUpper}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const timestamp = new Date().toISOString();

    const payload = {
      item_id: itemId,
      title,
      content,
      category: catUpper,
      classification,
      metadata,
      created_at: timestamp
    };

    const fingerprint = hashString(JSON.stringify(payload));
    const item = { ...payload, fingerprint };

    this.#items.set(itemId, item);
    return item;
  }

  getItemsByCategory(category) {
    const catUpper = category.toUpperCase();
    const results = [];
    for (const item of this.#items.values()) {
      if (item.category === catUpper) {
        results.push(item);
      }
    }
    return results;
  }

  getSummary() {
    const summary = {
      PROJECTS: 0,
      AREAS: 0,
      RESOURCES: 0,
      ARCHIVES: 0,
      total_items: this.#items.size
    };

    for (const item of this.#items.values()) {
      if (summary[item.category] !== undefined) {
        summary[item.category]++;
      }
    }

    return summary;
  }
}
