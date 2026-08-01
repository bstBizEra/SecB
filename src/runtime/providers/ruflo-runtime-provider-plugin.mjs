import { canonicalFingerprint } from "../../contracts/canonical-fingerprint.mjs";

/**
 * Ruflo runtime provider plugin descriptor.
 *
 * This is an author-declarable capability descriptor, not an operational
 * grant. Ruflo remains an external execution provider; SecB remains the sole
 * authority, evidence-acceptance, governance, release, and activation plane.
 */
export const RUFLO_RUNTIME_PROVIDER_PLUGIN = Object.freeze({
  schema_version: "1.0",
  plugin_id: "runtime-provider-ruflo",
  plugin_version: "0.1.0",
  provider_id: "PROVIDER-RUFLO",
  runtime_product_id: "ruflo",
  display_name: "Ruflo Runtime Provider",
  purpose: "Translate bounded Ruflo swarm execution and telemetry into SecB runtime projections and evidence candidates.",
  implementation: Object.freeze({
    module: "src/runtime/providers/ruflo-runtime-provider-plugin.mjs",
    export_name: "RufloRuntimeProviderCandidate"
  }),
  capabilities: Object.freeze({
    deployment_types: Object.freeze(["local_sidecar"]),
    operations: Object.freeze([
      "observe_agent_lifecycle",
      "observe_task_outcome",
      "observe_execution_completion",
      "inspect_health"
    ]),
    event_types: Object.freeze([
      "agent.spawned",
      "task.completed",
      "task.failed",
      "swarm.completed",
      "runtime.heartbeat"
    ])
  }),
  security: Object.freeze({
    maximum_input_classification: "INTERNAL",
    network_access: "loopback",
    credential_mode: "brokered",
    output_trust: "UNTRUSTED_CANDIDATE"
  }),
  boundaries: Object.freeze({
    authority_source: "SECB",
    may_issue_authority: false,
    may_self_authorize: false,
    may_accept_evidence: false,
    may_admit_memory: false,
    may_promote_knowledge: false,
    may_publish_skills: false,
    may_merge_protected_branch: false,
    may_release: false,
    may_activate: false,
    owns_secb_work_state: false
  }),
  ui: Object.freeze({
    mode: "projection",
    surface: "SecB Command Center / Runtime Operations / Ruflo"
  }),
  evidence_obligations: Object.freeze([
    "context-receipt",
    "event-envelope",
    "evidence-candidate",
    "outcome-receipt"
  ]),
  candidate_status: "CANDIDATE"
});

export const RUFLO_RUNTIME_PROVIDER_PLUGIN_FINGERPRINT = canonicalFingerprint(
  RUFLO_RUNTIME_PROVIDER_PLUGIN
);

/**
 * Inert candidate surface. It intentionally provides description only and has
 * no dispatch, bridge-construction, activation, authority, or ledger API.
 */
export class RufloRuntimeProviderCandidate {
  constructor() {
    Object.freeze(this);
  }

  describe() {
    return structuredClone(RUFLO_RUNTIME_PROVIDER_PLUGIN);
  }
}
