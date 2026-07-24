/**
 * SecB Ruflo V3 Swarm Configuration & Defaults
 * Ported from Ruflo v3/swarm.config.ts for SecB Governed Control Plane.
 *
 * Configures top-level swarm defaults, domain groupings, topologies,
 * and performance targets while preserving SecB's governance boundaries.
 */

export const V3_TOPOLOGY_DEFAULT = "hierarchical";
export const V3_MAX_AGENTS_DEFAULT = 8;

export const V3_PERFORMANCE_TARGETS = Object.freeze({
  searchAcceleration: "150x-12500x",
  flashAttentionSpeedup: "2.49x-7.47x",
  memoryReduction: "50-75%",
  maxResponseTimeMs: 100,
  minAccuracyThreshold: 0.95
});

export const V3_AGENT_DOMAINS = Object.freeze({
  GOVERNANCE: ["secb-governance-engine", "authority-checker", "evidence-ledger"],
  SECURITY: ["security-architect", "security-auditor", "v3-security-architect"],
  CORE: ["coordinator", "coder", "tester", "reviewer", "architect", "researcher"],
  SPECIALIZED: ["memory-specialist", "performance-engineer", "topology-optimizer"]
});

export const DEFAULT_SWARM_CONFIG = Object.freeze({
  name: "secb-ruflo-v3-swarm",
  version: "3.32.9",
  description: "SecB Governed 15-Agent Hierarchical Mesh Swarm",
  topology: "hierarchical",
  maxAgents: 8,
  strategy: "specialized",
  consensus: "raft",
  antiDrift: true,
  checkpointInterval: 10,
  performance: V3_PERFORMANCE_TARGETS
});

/**
 * Validate a Ruflo swarm configuration object against SecB requirements.
 */
export function validateSwarmConfig(config) {
  if (!config || typeof config !== "object") {
    throw new TypeError("Swarm config must be an object");
  }
  const maxAgents = config.maxAgents ?? V3_MAX_AGENTS_DEFAULT;
  if (typeof maxAgents !== "number" || maxAgents < 1 || maxAgents > 60) {
    throw new RangeError("maxAgents must be between 1 and 60");
  }
  const topology = config.topology ?? V3_TOPOLOGY_DEFAULT;
  const validTopologies = ["hierarchical", "mesh", "hierarchical-mesh", "ring", "star", "adaptive"];
  if (!validTopologies.includes(topology)) {
    throw new TypeError(`Invalid topology "${topology}". Must be one of: ${validTopologies.join(", ")}`);
  }
  return {
    ...DEFAULT_SWARM_CONFIG,
    ...config,
    maxAgents,
    topology
  };
}
