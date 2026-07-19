// SecB MCP Server — alpha tool service factory
//
// Returns the injectable services map for McpServer. Each handler wires
// one catalog tool to an underlying SecB in-process service.
//
// Services provided (alpha read-only subset):
//   secb_canonical_fingerprint  — pure SHA-256 canonicalization
//   secb_contract_validate      — pure contract schema validation
//   secb_registry_resolve       — registry identity/quarantine projection
//   secb_ledger_verify_summary  — integrity chain check (events, evidence)
//   secb_events_read            — verified, classification-floored events
//   secb_evidence_read          — verified, classification-floored evidence
//
// NOT included (substrate absent in alpha; callers get DENY_SERVICE_UNAVAILABLE
// from the dispatch layer):
//   secb_work_package_resolve_effective — no WorkPackageService in alpha
//   secb_project_resolve_effective      — version-agnostic lookup not yet available
//   secb_skill_resolve                  — no SkillResolver in alpha
//
// Doctrine:
//   - verify() before read() for every ledger-backed tool; broken chain →
//     throw (dispatch layer returns DENY_SERVICE_ERROR; zero entries, no partial)
//   - applyClassificationFloor from src/ui/report-projections.mjs;
//     no second lattice implementation in this module
//   - data_untrusted marker added by the dispatch layer, not here

import { createHash } from "node:crypto";
import { validateContract, ContractValidationError } from "../contracts/contract-validator.mjs";
import { applyClassificationFloor } from "../ui/report-projections.mjs";

// -------------------------------------------------------------------------
// Internal helpers
// -------------------------------------------------------------------------

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((k) => [k, canonicalize(value[k])])
    );
  }
  return value;
}

function sha256hex(obj) {
  return createHash("sha256").update(JSON.stringify(canonicalize(obj))).digest("hex");
}

// Map catalog kebab-case kind names to contract-validator internal names.
const KIND_MAP = Object.freeze({
  "agent-registration": "agentRegistration",
  "context-receipt": "contextReceipt",
  "evidence-envelope": "evidenceEnvelope",
  "event-envelope": "eventEnvelope",
  "handoff-envelope": "handoffEnvelope",
  "project-contract": "project",
  "work-package": "workPackage",
});

// -------------------------------------------------------------------------
// Factory
// -------------------------------------------------------------------------

export function makeToolServices({ registry, eventsLedger, evidenceLedger } = {}) {
  return {
    // -- Pure functions --------------------------------------------------------

    secb_canonical_fingerprint: async (params) => ({
      fingerprint: sha256hex(params.document),
    }),

    secb_contract_validate: async (params) => {
      const internalKind = KIND_MAP[params.kind];
      if (!internalKind) {
        return { valid: false, errors: [{ message: `Unsupported kind: ${params.kind}` }] };
      }
      try {
        validateContract(internalKind, params.document);
        return { valid: true, errors: [] };
      } catch (err) {
        if (err instanceof ContractValidationError) {
          return {
            valid: false,
            errors: (err.errors ?? []).map((e) => ({
              path: e.instancePath ?? "",
              message: e.message ?? String(e),
            })),
          };
        }
        throw err;
      }
    },

    // -- Registry projection --------------------------------------------------

    secb_registry_resolve: async (params) => {
      const resolution = registry.resolve(params.agent_instance_id);
      if (resolution.resolved) {
        return { status: "APPROVED_ACTIVE", reason: null, identity: resolution.identity };
      }
      return { status: "QUARANTINED", reason: resolution.reason };
    },

    // -- Ledger verification --------------------------------------------------

    secb_ledger_verify_summary: async (params) => {
      const ledgerMap = { events: eventsLedger, evidence: evidenceLedger };
      const ledger = ledgerMap[params.ledger];
      if (!ledger) {
        const err = new Error(`Ledger '${params.ledger}' not available in alpha`);
        err.code = "DENY_SERVICE_UNAVAILABLE";
        throw err;
      }
      try {
        const status = ledger.verify();
        return { verified: true, head_hash: status.headHash, count: status.count };
      } catch (verifyErr) {
        // Broken chain: verified=false, typed reason, no partial content.
        return {
          verified: false,
          head_hash: null,
          count: null,
          reason: verifyErr.code ?? "LEDGER_INTEGRITY_FAILURE",
        };
      }
    },

    // -- Ledger reads (verify-before-read, classification floor) -------------

    secb_events_read: async (params, ctx) => {
      // Full-stop on broken chain: verify first, then read. Never partial.
      try {
        eventsLedger.verify();
      } catch (verifyErr) {
        const err = new Error(`Ledger integrity failure: ${verifyErr.code ?? "LEDGER_INTEGRITY_FAILURE"}`);
        err.code = "DENY_LEDGER_INTEGRITY_FAILURE";
        throw err;
      }
      const records = eventsLedger.read();
      const envelopes = records.map((r) => r.entry.payload);
      const { entries, withheld_count, truncated } = applyClassificationFloor(
        envelopes, ctx.effectiveCeiling
      );
      return { entries, withheld_count, truncated, count: records.length };
    },

    secb_evidence_read: async (params, ctx) => {
      try {
        evidenceLedger.verify();
      } catch (verifyErr) {
        const err = new Error(`Ledger integrity failure: ${verifyErr.code ?? "LEDGER_INTEGRITY_FAILURE"}`);
        err.code = "DENY_LEDGER_INTEGRITY_FAILURE";
        throw err;
      }
      const records = evidenceLedger.read();
      const envelopes = records.map((r) => r.entry.payload);
      const { entries, withheld_count, truncated } = applyClassificationFloor(
        envelopes, ctx.effectiveCeiling
      );
      return { entries, withheld_count, truncated, count: records.length };
    },
  };
}
