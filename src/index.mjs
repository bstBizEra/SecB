export {
  ContractValidationError,
  supportedContractKinds,
  validateContract
} from "./contracts/contract-validator.mjs";

export {
  canonicalFingerprint,
  canonicalize
} from "./contracts/canonical-fingerprint.mjs";

export {
  findReservedDelimiter
} from "./contracts/reserved-delimiters.mjs";

export {
  AuthorityConfigurationError,
  AuthorityEngine,
  CONFLICTING_ROLES,
  REQUIRED_ROLE
} from "./control/authority-engine.mjs";

export {
  STATE_MACHINES,
  TransitionDeniedError,
  TransitionEngine
} from "./control/state-machine.mjs";

export {
  DurableLedger,
  LedgerError,
  ZERO_HASH
} from "./ledger/durable-ledger.mjs";

export {
  EventLedger,
  EvidenceLedger
} from "./ledger/governed-ledgers.mjs";

export {
  DecisionLedger,
  KnowledgeLedger,
  OutcomeLedger
} from "./ledger/temporal-ledgers.mjs";

export {
  AUTHORITY_LEVELS,
  EVALUATION_TRANSITIONS,
  LIFECYCLE_TRANSITIONS,
  RegistryError,
  RuntimeRegistry
} from "./registry/runtime-registry.mjs";

export {
  CLAUDE_CODE_ADAPTER,
  CODEX_ADAPTER,
  GENERIC_ADAPTER,
  KNOWN_ADAPTERS,
  createAdapterRegistration
} from "./registry/adapters.mjs";

export {
  HostAgentError,
  HostRuntimeAgent
} from "./host/host-runtime-agent.mjs";

export {
  SecBMcpServer
} from "./mcp/secb-mcp-server.mjs";

export {
  PINNED_PROTOCOL_VERSION,
  TOOL_CATALOG
} from "./mcp/tool-catalog.mjs";

export {
  ProjectContractService,
  ProjectContractServiceError
} from "./project/project-contract-service.mjs";

export {
  SkillResolver,
  SkillResolverError
} from "./registry/skill-resolver.mjs";

export {
  EFFECTIVE_STATES,
  RESERVED_ID_DELIMITERS,
  WORK_PACKAGE_SERVICE_ROLE_GATES,
  WorkPackageContractService,
  WorkPackageServiceError
} from "./services/work-package-service.mjs";

export {
  HandoffService,
  HandoffServiceError
} from "./services/handoff-service.mjs";

export {
  ContextFederationError,
  ContextFederationService
} from "./services/context-federation-service.mjs";
// note: ContextFederationService exposes verifyReceipt (read-only) and
// consumeReceipt (ledgers a CONSUME); composing services use verifyReceipt
// for offer-time provenance gates.

export {
  runRetrieval
} from "./services/context-retrieval-policy.mjs";

export {
  DATA_CLASS_ORDER,
  RISK_ORDER,
  intersectWithParent,
  withinCeiling
} from "./services/non-escalation-comparator.mjs";

// Harness-neutral runtime provider plugin candidate registry
export {
  RuntimeProviderPluginRegistry,
  RuntimeProviderPluginRegistryError
} from "./runtime/runtime-provider-plugin-registry.mjs";

export {
  RUFLO_RUNTIME_PROVIDER_PLUGIN,
  RUFLO_RUNTIME_PROVIDER_PLUGIN_FINGERPRINT,
  RufloRuntimeProviderCandidate
} from "./runtime/providers/ruflo-runtime-provider-plugin.mjs";

// Ruflo runtime provider integration
export {
  RUFLO_ADAPTERS,
  RUFLO_SWARM_ADAPTER,
  RUFLO_CODER_ADAPTER,
  RUFLO_REVIEWER_ADAPTER,
  createRufloAdapterRegistration
} from "./registry/ruflo-adapters.mjs";

// Two DurableLedger subclasses that were delivered but never exported, so no
// consumer could reach them while the base class was already on this surface.
// Checked before wiring, per the process slice 1 paid for: no test forbids
// either by name, and neither transitively reaches an adoption-guarded module —
// both close over durable-ledger, contract-validator and lazy-ajv, all of which
// are already reachable. Neither performs I/O or reads a clock at module scope.
export { CheckpointLedger } from "./ledger/checkpoint-ledger.mjs";
export { DelegationLedger } from "./ledger/delegation-ledger.mjs";

// MOD-GOV / MOD-RUNTIME control primitives, delivered and ratified but absent
// from this surface. Seven of the ten unreached control modules; the other three
// — overlap-policy, policy-decision-point, write-set-policy — state in their own
// headers that adoption is a later, separately governed step, and are held.
//
// SecBBootstrapExecutor writes files, so its fail-closed default was read rather
// than assumed: the DENY_UNAUTHORIZED_BOOTSTRAP throw is unconditional and does
// not depend on an authorization gate being injected. The gate is an optional
// inline path to authorization, never the thing enforcement rests on, and the
// constructor refuses without a registrationService. Exporting the class weakens
// no default.
export { BootstrapAuthorizationGate } from "./control/bootstrap-authorization-gate.mjs";
export { BootstrapExecutorError, SecBBootstrapExecutor } from "./control/bootstrap-executor.mjs";

export {
  CHECKPOINT_DRIFT_DENY_CODES,
  evaluateResume,
  evaluateResumeFromLedger
} from "./control/checkpoint-drift-comparator.mjs";

export {
  DENY_HUMAN_APPROVAL_REQUIRED,
  ALLOW,
  evaluateDelegation,
  evaluateDelegationRequest,
  buildDelegationDecisionRecord
} from "./control/delegation-gate.mjs";

export {
  ESCALATION_ROLES,
  ESCALATION_BOUND,
  evaluateEscalationRoute,
  bindEscalationRoute,
  verifyEscalation
} from "./control/escalation-route.mjs";

export {
  FAILURE_CLASSES,
  RETRY_AUTHORIZED,
  evaluateRetry,
  buildRetryDecisionRecord
} from "./control/retry-policy.mjs";

export {
  WORKSPACE_LEASE_DENY_CODES,
  mintLease,
  evaluateLease,
  renewLease
} from "./control/workspace-lease-policy.mjs";

// MOD-MCP gateway cores, delivered but unreachable from this surface. All four
// declare themselves "pure in-process core only: no transport, port, filesystem,
// network, credential access, or process spawning", and that claim was verified
// rather than accepted: none imports node:fs, node:net, node:http, node:tls,
// node:dgram or node:child_process, and none performs I/O or reads a clock at
// module scope.
//
// Their headers also say "Runtime activation remains a separate operator-
// authorized step". That governs standing a gateway up — binding a port, opening
// a transport — not naming a pure class on a library surface. Exporting opens
// nothing and is not activation.
//
// CredentialBroker was the one that needed more than the usual check. Its header
// carries an ANTI-PASSTHROUGH BOUNDARY: resolveForAdapter() output is for adapter
// process construction by the operator-authorized deployment step, and must never
// reach McpGatewayCore.invoke() results, adapter results, receipts, evidence
// envelopes or ledger entries. Until now nothing enforced that except the comment
// and the accident that no consumer could reach the broker at all — and this
// export removes the accident. So the boundary is pinned mechanically in
// tests/gateway-purity-boundary.test.mjs before it is widened, not after:
// mcp-gateway-core imports the broker nowhere, transitively or directly, and the
// test fails if it ever does. The broker still refuses to construct without a
// Sealer, a registryResolver and an append-only ledgerWriter; exporting the class
// weakens no default.
export {
  INDEPENDENT_REVIEW_ROLE,
  GOVERNANCE_ROLE,
  CapabilityRegistryService
} from "./gateway/capability-registry-service.mjs";
export { CredentialBroker } from "./gateway/credential-broker.mjs";
export { REQUIRED_CONTEXT_FIELDS, McpGatewayCore } from "./gateway/mcp-gateway-core.mjs";

// RufloCommandBridge is the fourth gateway module and is NOT exported. This
// slice tried to and was refused by runtime-provider-plugin.test.mjs: "legacy
// bridge must not be publicly exported". The word doing the work is legacy — the
// bridge was superseded by RuntimeProviderPluginRegistry, and putting it back on
// the surface reopens the path the replacement exists to close. The pre-wiring
// check missed this because the guard asserts the class is ABSENT, so it never
// imports the module and names no path — it was found by running the suite, not
// by reading it. Unreached is the correct state for this one, not a gap.

// Slice 5. Seven pure modules that were delivered and left unreachable. Screened
// the same five ways as slice 4, with two of the checks rebuilt because slice 4
// proved them blind:
//
//   4. absence guards. A test asserting an export is NOT on this surface imports
//      nothing and names no path, so the path-based screen could not see the one
//      that refused RufloCommandBridge. Now scanned by export name.
//   5. governing records. AGENTS.md, docs/AGENTS.md, docs/00-governance/ only.
//      Candidate drafts under docs/03-project-control/ are excluded: they record
//      that a module WAS unwired at review time, an observation rather than a
//      prohibition, and including them produced 24 hits containing no gates.
//      Read as paragraphs, not lines — in AGENTS.md the module names and the
//      "(SEC/GOV-gated)" governing them are four wrapped lines apart.
//
// Check 5 held three modules this slice would otherwise have taken:
// skill-candidate-registry, skill-promotion-ledger and skill-revocation-ledger
// are named by the skills registry amendment as the eventual runtime registry,
// wired only under SEC/GOV. They stay unreached until that decision exists.
//
// A seventh module was screened CLEAR and turned out not to be; see the note
// further down, which has to describe it without naming it. None of the six
// below performs I/O, reads a clock, or draws randomness at module scope;
// event-normalizer imports randomBytes but only calls it inside functions.
export {
  LOCAL_BRIDGE_LOCATOR_MAX_TTL_MS,
  LOCAL_BRIDGE_POSIX_PATH_MAX_BYTES,
  LocalBridgeEndpointError,
  resolveLocalBridgeEndpoint
} from "./bridge/local-bridge-endpoint-resolver.mjs";
export {
  LOCAL_BRIDGE_PROOF_MAX_TTL_MS,
  LocalBridgeInstallationProofError,
  validateLocalBridgeInstallationProof
} from "./bridge/local-bridge-installation-proof.mjs";

// The Command Center snapshot composer under src/ui/ is NOT exported here, and
// this slice's attempt to export it was refused twice. Its own test reads THIS
// FILE as text and asserts the module's name does not appear in it at all —
// "deny registry is frozen and module remains pure, unwired, and action-free".
// Not the import: the NAME. The first revert removed the export and left an
// explanation that used the name, and the guard stayed red, which is why this
// paragraph talks around it.
//
// So "pure, unwired" in that module's header is enforced after all, and the
// reasoning above — that unwired describes a state rather than constrains one —
// was wrong about that one module. Two slices, two absence guards, neither
// findable by reading: the first named only a class, the second builds the path
// in a loop variable, so no single line carries both this file's path and the
// module's name.
//
// Swept for the whole class rather than waiting to be caught a third time:
// exactly three test files read src/index.mjs as text, and only that one carries
// absence assertions. It is the last of its kind currently in the tree.
export { createGoalRollupProjection } from "./ui/goal-rollup-projection.mjs";

// event-normalizer's names are broad for a shared surface — ADAPTER_VERSION,
// EVENT_TYPES, buildEnvelope. They are exported unrenamed because renaming a
// delivered module's public identifiers is a behaviour change, not wiring, and
// belongs to whoever owns the module rather than to the slice that reaches it.
// Both constants are plain identity strings; neither carries a secret.
export {
  ADAPTER_VERSION,
  RUNTIME_DEPLOYMENT_ID,
  EVENT_TYPES,
  buildEnvelope,
  normalizeRufloHook,
  mapRufloState
} from "./events/event-normalizer.mjs";

export {
  RUNTIME_LIFECYCLE_STATES,
  VALID_LIFECYCLE_TRANSITIONS,
  FiveLayerRegistryError,
  ProviderRegistry,
  ModelRegistry,
  RuntimeRegistryFiveLayer,
  AgentRegistryFiveLayer,
  SessionRegistry,
  ModelPolicyRouter
} from "./registry/five-layer-registry.mjs";
export {
  V3_TOPOLOGY_DEFAULT,
  V3_MAX_AGENTS_DEFAULT,
  V3_PERFORMANCE_TARGETS,
  V3_AGENT_DOMAINS,
  DEFAULT_SWARM_CONFIG,
  validateSwarmConfig
} from "./registry/ruflo-swarm-config.mjs";
