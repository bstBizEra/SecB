/**
 * Separation of duties for a skill promotion — as far as this branch's
 * contracts can express it, which is not far enough, and this module says so
 * instead of passing.
 *
 * PURE AND UNWIRED. No filesystem, no ledger, no callers.
 *
 * WHAT THE DATA SUPPORTS
 *
 * Measured across this branch's contracts:
 *
 *   skill-grant-record          no actor field at all
 *   skill-manifest              no actor field at all
 *   skill-package-descriptor    authority_ceiling_cap only
 *   decision-record             actor_id, authority_ref
 *   approval_history[]          decision_id, decision_type, approved_by, approved_at
 *
 * So the APPROVERS are recorded and the PRODUCER is recorded nowhere. Compare
 * `main`'s skill-promotion.schema.json, which requires producer_actor_id,
 * independent_review_actor_id and governance_actor_id explicitly.
 *
 * THE CONSEQUENCE, AND WHY THIS MODULE EXISTS
 *
 * Separation of duties cannot be verified here. A check that quietly evaluates
 * only the half it can see would report SATISFIED for a promotion whose author,
 * reviewer and approver are one actor — the exact arrangement the property
 * exists to forbid.
 *
 * So this refuses. `assertSeparationOfDuties` returns UNVERIFIABLE whenever the
 * producer is unknown, and the caller must treat that as a denial. It becomes
 * capable of returning SATISFIED only when a producer identity is supplied,
 * which today means the caller knows something the contracts do not record.
 *
 * That is the honest shape: the gap is a missing field, not a missing check,
 * and the check is written so the missing field cannot be mistaken for a pass.
 */

export const SOD = Object.freeze({
  SATISFIED: "SATISFIED",
  VIOLATED: "VIOLATED",
  UNVERIFIABLE: "UNVERIFIABLE"
});

/**
 * Approval kinds that must not share an actor with each other or the producer.
 *
 * Taken from contracts/skill-manifest.schema.json's own enum, not invented. An
 * earlier draft listed "INDEPENDENT_REVIEW" and "GOVERNANCE", neither of which
 * exists — the contract says INDEPENDENT_REV, and the governance act is
 * HUMAN_PROMOTION. Validating a composed manifest against the real contract is
 * what caught it.
 *
 * REVOCATION is deliberately absent: revoking is not an approval and holding it
 * alongside one is not a duties conflict.
 */
export const DISTINCT_ROLE_TYPES = Object.freeze([
  "SANDBOX_ENTRY",
  "EVALUATION_PASS",
  "SECURITY_REVIEW",
  "INDEPENDENT_REV",
  "INDEPENDENT_QA",
  "HUMAN_PROMOTION"
]);

const norm = (v) => (typeof v === "string" ? v.trim().toLowerCase() : null);

/**
 * @param {object} args
 * @param {Array}  args.approvalHistory  manifest.approval_history
 * @param {string} [args.producerActorId] who authored the skill. Absent today —
 *   no contract on this branch records it.
 * @returns {{verdict: string, reason: string, detail: object}}
 */
export function assertSeparationOfDuties({ approvalHistory, producerActorId } = {}) {
  if (!Array.isArray(approvalHistory) || approvalHistory.length === 0) {
    return {
      verdict: SOD.UNVERIFIABLE,
      reason: "No approval history: there is nothing to separate.",
      detail: { approvals: 0 }
    };
  }

  const byType = new Map();
  for (const entry of approvalHistory) {
    const actor = norm(entry?.approved_by);
    if (!actor) {
      return {
        verdict: SOD.UNVERIFIABLE,
        reason: "An approval records no approved_by; an anonymous approval cannot be separated from anything.",
        detail: { entry }
      };
    }
    const type = entry?.decision_type ?? "(untyped)";
    if (!byType.has(type)) byType.set(type, new Set());
    byType.get(type).add(actor);
  }

  // What IS checkable: two different approval roles held by the same actor.
  const actorsByType = [...byType.entries()];
  for (let i = 0; i < actorsByType.length; i += 1) {
    for (let j = i + 1; j < actorsByType.length; j += 1) {
      const [typeA, a] = actorsByType[i];
      const [typeB, b] = actorsByType[j];
      const shared = [...a].filter((x) => b.has(x));
      if (shared.length) {
        return {
          verdict: SOD.VIOLATED,
          reason: `The same actor holds ${typeA} and ${typeB}.`,
          detail: { actors: shared, roles: [typeA, typeB] }
        };
      }
    }
  }

  /**
   * THE HALF THAT CANNOT BE CHECKED. Everything above compares approvers to
   * approvers. Nothing on this branch records who PRODUCED the skill, so
   * "the author approved their own work" is invisible — and that is the
   * arrangement separation of duties exists to forbid.
   *
   * Returning SATISFIED here would be the check reporting on the half it can
   * see and staying silent about the half that matters most.
   */
  const producer = norm(producerActorId);
  if (!producer) {
    return {
      verdict: SOD.UNVERIFIABLE,
      reason:
        "No producer identity. This branch's contracts record approvers but not the author, " +
        "so producer-vs-approver cannot be evaluated. Treat as a denial, not as a pass.",
      detail: {
        approverRolesChecked: actorsByType.map(([t]) => t),
        missing: "producerActorId"
      }
    };
  }

  const producerAlsoApproved = actorsByType
    .filter(([, actors]) => actors.has(producer))
    .map(([type]) => type);
  if (producerAlsoApproved.length) {
    return {
      verdict: SOD.VIOLATED,
      reason: `The producer also holds ${producerAlsoApproved.join(", ")}.`,
      detail: { producer, roles: producerAlsoApproved }
    };
  }

  return {
    verdict: SOD.SATISFIED,
    reason: "Producer, reviewer and approver are distinct actors.",
    detail: {
      producer,
      approverRolesChecked: actorsByType.map(([t]) => t)
    }
  };
}
