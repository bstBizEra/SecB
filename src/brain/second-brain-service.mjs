import { PARAOrganizer } from "./para-organizer.mjs";

export class SecondBrainServiceError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "SecondBrainServiceError";
    this.code = code;
  }
}

const CLASS_ORDER = Object.freeze(["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED"]);

export class SecondBrainService {
  #para;

  constructor({ paraOrganizer } = {}) {
    this.#para = paraOrganizer ?? new PARAOrganizer();
  }

  captureKnowledge({ title, content, category = "RESOURCES", classification = "INTERNAL", metadata = {} }) {
    return this.#para.organizeKnowledge({ title, content, category, classification, metadata });
  }

  queryBrain({ query = "", category = null, dataClassification = "INTERNAL" } = {}) {
    const callerRank = CLASS_ORDER.indexOf(dataClassification);
    const effectiveRank = callerRank === -1 ? 1 : callerRank; // default INTERNAL (rank 1)

    const allCategories = category ? [category.toUpperCase()] : ["PROJECTS", "AREAS", "RESOURCES", "ARCHIVES"];
    const survivorItems = [];

    for (const cat of allCategories) {
      const items = this.#para.getItemsByCategory(cat);
      for (const item of items) {
        const itemRank = CLASS_ORDER.indexOf(item.classification);
        // Withhold items strictly above caller ceiling (fail-closed ceiling protection)
        if (itemRank <= effectiveRank) {
          const qLower = query.toLowerCase().trim();
          const isMatch = !qLower || item.title.toLowerCase().includes(qLower) || item.content.toLowerCase().includes(qLower);
          if (isMatch) {
            survivorItems.push(item);
          }
        }
      }
    }

    const receiptId = `RECEIPT-BRAIN-${Date.now()}`;
    const contextReceipt = {
      receipt_id: receiptId,
      query,
      effective_ceiling: CLASS_ORDER[effectiveRank],
      items_survived: survivorItems.length,
      compact_snippets: survivorItems.map((it) => ({
        item_id: it.item_id,
        category: it.category,
        title: it.title,
        snippet: it.content.slice(0, 150) + (it.content.length > 150 ? "..." : "")
      }))
    };

    return contextReceipt;
  }

  distillSkill({ name, description, content }) {
    if (!name || !content) {
      throw new SecondBrainServiceError("INVALID_SKILL_DISTILLATION", "name and content are required for skill distillation");
    }

    const skillPackage = {
      name,
      title: `${name} Governed Skill`,
      description: description || `Auto-distilled skill for ${name}`,
      content: `# ${name}\n\n${description || ""}\n\n## Auto-Distilled Workflow\n\n${content}`,
      path: `.agents/skills/${name}/SKILL.md`,
      distilled_at: new Date().toISOString()
    };

    // Auto-organize in PARA under RESOURCES
    this.captureKnowledge({
      title: `Skill: ${name}`,
      content: skillPackage.content,
      category: "RESOURCES",
      classification: "INTERNAL",
      metadata: { skill_name: name }
    });

    return skillPackage;
  }

  inspectPARA() {
    return this.#para.getSummary();
  }
}
