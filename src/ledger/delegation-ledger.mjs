import { validateContract } from "../contracts/contract-validator.mjs";
import { DurableLedger, LedgerError } from "./durable-ledger.mjs";

// MOD-A2A Slice S1 (closes gap MA-1's schema/persistence half in
// docs/03-project-control/candidates/mod-a2a-gap-assessment-001.md):
// delegation-request contract + DelegationLedger primitive. This is a
// ledger PRIMITIVE that records a pre-execution delegation-request FACT
// (an agent asking another agent/role to take on bounded work) — it is
// NOT a live dispatch/transport mechanism (MA-3, explicitly deferred to
// "P0-15/P0-16 adapters" by a prior planning decision this record does
// not reopen) and it implements NO acceptance/rejection/completion
// semantics. That lifecycle question is a distinct, sibling surface to
// the already-delivered `HandoffService` (P0-11) per the assessment's
// boundary note B1: a handoff moves *review responsibility* for
// already-executed work, post-execution, within one work package; a
// delegation-request is the forward act of *assigning new work*,
// pre-execution, with a budget/skills/due-condition/expected-output.
// This file does not modify, import from, or get imported by
// `HandoffService` or `non-escalation-comparator.mjs` — the `ceiling`
// field below repeats that comparator's own five-dimension shape
// (riskClass/dataClassification/paths/tools/transitions) so that a
// *future*, separately-governed slice (the assessment's S2, an unwired
// delegation non-escalation gate) can pass it straight into
// `withinCeiling()` without reshaping it — but no such wiring exists in
// this slice.
//
// Doctrine-named field vocabulary (grepped before writing this schema,
// per task instruction): `docs/07-capabilities/mcp-a2a-governance.md`
// line 28 — "Every delegation declares source, destination, objective,
// scope, inputs, expected output, acceptance criteria, authority
// ceiling, tools, skills, data, budget, due condition, evidence
// obligations, and escalation route." Mapping used here (identical to
// the gap assessment's own already-reviewed S1 field resolution):
//   source            -> source_actor_id
//   destination       -> destination_role (single declared role, never
//                         a set — reuses HandoffService's existing
//                         convention per assessment boundary note B4;
//                         no agent-instance routing in this slice)
//   objective         -> objective
//   scope             -> ceiling.paths (not a separate top-level field
//                         — "scope" and "authority ceiling" describe the
//                         same bounded-paths concept from two doctrine
//                         angles; a second, divergent "scope" list would
//                         invite drift against the ceiling's own paths
//                         dimension)
//   inputs            -> inputs (array of opaque refs, never raw
//                         content — same "pointer, not payload"
//                         discipline MOD-RUNTIME's checkpoint slice used
//                         to stay out of MOD-MEM's territory)
//   expected output   -> expected_output
//   acceptance criteria -> acceptance_criteria
//   authority ceiling  -> ceiling (imported shape, not re-derived)
//   tools              -> ceiling.tools (doctrine names "tools"
//                         separately from "authority ceiling", but the
//                         non-escalation comparator's ceiling already
//                         has its own `tools` dimension; folding
//                         doctrine's "tools" into that dimension avoids
//                         a second, independently-drifting tools list —
//                         same resolution the assessment's own S1
//                         slice text already made)
//   skills             -> skills (required capability set)
//   data               -> ceiling.dataClassification (doctrine's "data"
//                         maps to the comparator's existing
//                         dataClassification dimension, same folding
//                         rationale as "tools" above)
//   budget             -> budget ({amount, unit} — opaque numeric/unit
//                         pair; no accounting logic in this slice)
//   due condition      -> due_condition (opaque string claim; not
//                         enforced/evaluated in this slice)
//   evidence obligations -> evidence_obligations
//   escalation route   -> escalation_route (a single declared role;
//                         present but NOT YET CONSUMED — wiring an
//                         escalation-route primitive against this field
//                         is the assessment's separate S3 slice, out of
//                         scope here)
//
// No status field. A delegation-request record is a single immutable
// fact ("this request was made"), not a stateful entity — unlike
// `HandoffService`'s ledger, which tracks an explicit
// OFFERED -> ACCEPTED/DECLINED/REVOKED state machine for a two-party,
// same-work-package exchange. Status-transition semantics for a
// delegation request (e.g. a future PENDING/ACCEPTED/DECLINED lifecycle)
// are explicitly a later, separately-scoped slice's concern, not this
// one's — adding even a minimal status enum here without any code path
// that ever transitions it would be an unused, untested field, which
// this slice deliberately does not add.

function delegationRequestEntry(delegationRequest, idempotencyKey) {
  return {
    entryId: delegationRequest.delegation_id,
    projectId: delegationRequest.project_id,
    workPackageId: delegationRequest.work_package_id,
    sessionId: delegationRequest.session_id,
    actorId: delegationRequest.source_actor_id,
    type: "DELEGATION_REQUEST",
    payload: delegationRequest,
    timestamp: delegationRequest.created_at,
    idempotencyKey
  };
}

export class DelegationLedger extends DurableLedger {
  constructor({ filePath }) {
    super({ filePath, ledgerId: "secb-delegation-ledger" });
  }

  // Durable append of a validated delegation-request record. Hash
  // chain, idempotency-key replay, optimistic-concurrency
  // (expectedSequence), and writer-lock contention are all inherited
  // unmodified from DurableLedger.append — nothing below reimplements
  // or weakens any of it.
  appendDelegationRequest(delegationRequest, { expectedSequence, idempotencyKey }) {
    validateContract("delegationRequest", delegationRequest);
    if (!idempotencyKey) {
      throw new LedgerError("DENY_MISSING_ENTRY_FIELDS", "idempotencyKey is required for delegation-request append");
    }
    return this.append(delegationRequestEntry(delegationRequest, idempotencyKey), { expectedSequence });
  }

  // Fail-closed exact lookup: an unknown delegation_id resolves to NONE
  // with a typed reason, mirroring CheckpointLedger.resolveCheckpoint's
  // and DecisionLedger.resolveEffective's deny-on-use discipline. This
  // is the only read-side primitive this slice provides — existence and
  // validated-shape lookup only, no "list pending for role" or similar
  // lifecycle-adjacent query, per the assessment's own minimal S1
  // scoping ("ledger existence and validated shape only").
  resolveDelegationRequest(delegationId) {
    if (!delegationId || typeof delegationId !== "string") {
      return { delegationRequest: null, code: "DENY_INVALID_DELEGATION_ID", reason: "delegationId must be a non-empty string" };
    }
    const match = this.read().find((record) => record.entry.entryId === delegationId);
    if (!match) {
      return { delegationRequest: null, code: "DENY_UNKNOWN_DELEGATION", reason: `Unknown delegation request: ${delegationId}` };
    }
    return { delegationRequest: structuredClone(match.entry.payload), sequence: match.sequence, code: "ALLOW" };
  }
}
