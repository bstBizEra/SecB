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
import { assertSeparationOfDuties, SOD } from "./separation-of-duties.mjs";

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
   * Separation of duties is evaluated against the COMPOSED approval history,
   * not against the grant's, so a caller cannot hand a clean history to the
   * check and a different one to the manifest.
   */
  const sod = assertSeparationOfDuties({
    approvalHistory: manifest.approval_history,
    producerActorId
  });

  if (sod.verdict !== SOD.SATISFIED) {
    return {
      verdict: ADMISSIBILITY.INADMISSIBLE,
      // UNVERIFIABLE and VIOLATED are different facts and a caller that cannot
      // tell them apart cannot tell "add the missing field" from "the wrong
      // person approved this".
      code: sod.verdict === SOD.VIOLATED ? "DENY_SOD_VIOLATED" : "DENY_SOD_UNVERIFIABLE",
      reason: sod.reason,
      manifest: null,
      separationOfDuties: sod
    };
  }

  return {
    verdict: ADMISSIBILITY.ADMISSIBLE,
    code: null,
    reason: "Composition is well-formed and producer, reviewer and approver are distinct.",
    manifest,
    separationOfDuties: sod
  };
}
