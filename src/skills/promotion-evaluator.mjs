/**
 * Is this promotion admissible? — the one place composition and separation of
 * duties meet.
 *
 * PURE AND UNWIRED. No filesystem, no git, no ledger, no registry, no callers.
 * It answers a question and returns an answer. It cannot promote anything, and
 * the export surface is pinned by a test so it cannot quietly grow the ability.
 *
 * WHY IT EXISTS SEPARATELY FROM composeManifest
 *
 * `composeManifest` answers "do these two halves make a manifest". That is a
 * shape question and it has nothing to say about who wrote them. Evaluating a
 * promotion is a different question, and the difference matters:
 *
 *   a manifest can be perfectly well-formed and still be a skill its own author
 *   approved.
 *
 * Keeping them apart means the shape check cannot be mistaken for the authority
 * check, which is the mistake the whole SkillsHub programme has been unpicking.
 *
 * THE PROPERTY THIS MODULE EXISTS TO HOLD
 *
 * An UNVERIFIABLE separation of duties BLOCKS the promotion. It is not a
 * warning attached to an otherwise-successful result. On this branch that means
 * every promotion is currently inadmissible, because no contract records who
 * produced a skill — and that is the correct answer, not a bug to route around.
 */

import { composeManifest, CompositionError } from "./manifest-composition.mjs";
import { checkPairwiseDistinct, normalizeRole } from "../control/sod-rules.mjs";

/**
 * SEPARATION OF DUTIES IS DELEGATED, NOT REIMPLEMENTED.
 *
 * An earlier version of this file imported a hand-rolled
 * `src/skills/separation-of-duties.mjs`. That module has been deleted.
 * `src/control/sod-rules.mjs` already exists and its own header states its
 * purpose: a single home for the SoD shapes "the SecB kernel and its services
 * enforce today in four parallel places" — and item 4 in that list is exactly
 * this case, "promotion needs an independent_review actor distinct from the
 * record producer, plus a governance actor", noted as being expressed there in
 * a divergent role vocabulary.
 *
 * Writing a fifth implementation, in a sixth vocabulary, inside the repository
 * that built a module to stop that, was the mistake. An independent review
 * caught it.
 */

export const ADMISSIBILITY = Object.freeze({
  ADMISSIBLE: "ADMISSIBLE",
  INADMISSIBLE: "INADMISSIBLE"
});

/**
 * @param {object} args
 * @param {object} args.descriptor        author half
 * @param {object} args.grant             governance half
 * @param {object} args.source            { repository, commit_sha, licence }
 * @param {string} args.owner             governance assignment
 * @param {string} [args.producerActorId] who authored the skill; absent today
 * @returns {{verdict: string, code: string|null, reason: string,
 *            manifest: object|null, separationOfDuties: object|null}}
 */
export function evaluatePromotion({ descriptor, grant, source, owner, producerActorId } = {}) {
  let manifest;
  try {
    manifest = composeManifest({ descriptor, grant, source, owner });
  } catch (error) {
    if (!(error instanceof CompositionError)) throw error;
    return {
      verdict: ADMISSIBILITY.INADMISSIBLE,
      code: error.code,
      reason: error.message,
      manifest: null,
      separationOfDuties: null
    };
  }

  /**
   * Evaluated against the COMPOSED approval history, not the grant's, so a
   * caller cannot hand a clean history to the check and a different one to the
   * manifest.
   */
  const history = manifest.approval_history;

  /**
   * The producer is not recorded by any contract on this branch — measured, and
   * deriving it from git was measured too and does not work, because git
   * identity here is a machine identity shared by every agent. So this is
   * UNVERIFIABLE for every promotion this repository can currently produce, and
   * UNVERIFIABLE BLOCKS. It is not a warning attached to a success.
   */
  if (typeof producerActorId !== "string" || producerActorId.trim() === "") {
    return {
      verdict: ADMISSIBILITY.INADMISSIBLE,
      code: "DENY_SOD_UNVERIFIABLE",
      reason:
        "No producer identity. No contract on this branch records who authored a skill, " +
        "so producer-vs-approver cannot be evaluated. This is a denial, not a pass.",
      manifest: null,
      separationOfDuties: { missing: "producerActorId" }
    };
  }

  for (const entry of history) {
    if (typeof entry?.approved_by !== "string" || entry.approved_by.trim() === "") {
      return {
        verdict: ADMISSIBILITY.INADMISSIBLE,
        code: "DENY_SOD_UNVERIFIABLE",
        reason: "An approval records no approved_by; an anonymous approval cannot be separated from anything.",
        manifest: null,
        separationOfDuties: { entry }
      };
    }
  }

  const actors = [
    { role: "PRODUCER", actorId: producerActorId },
    ...history.map((e) => ({
      role: normalizeRole(e.decision_type) ?? e.decision_type,
      actorId: e.approved_by
    }))
  ];

  const distinct = checkPairwiseDistinct(actors);
  if (!distinct.ok) {
    return {
      verdict: ADMISSIBILITY.INADMISSIBLE,
      // Distinct from DENY_SOD_UNVERIFIABLE on purpose: "add the missing field"
      // and "the wrong person approved this" are different problems.
      code: "DENY_SOD_VIOLATED",
      reason: distinct.message,
      manifest: null,
      separationOfDuties: distinct
    };
  }

  return {
    verdict: ADMISSIBILITY.ADMISSIBLE,
    code: null,
    /**
     * The wording is deliberately narrow. An earlier version said "producer,
     * reviewer and approver are distinct", which was FALSE for a history
     * containing a single SANDBOX_ENTRY and no review at all — the check counts
     * overlaps, it does not verify that the required approvals exist. Saying
     * more than was checked is how a verdict becomes a lie.
     */
    reason: `Composition is well-formed and no two of the ${actors.length} recorded parties are the same actor. ` +
      "This does NOT verify that the required approvals are present.",
    manifest,
    separationOfDuties: distinct
  };
}
