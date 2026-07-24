/**
 * SecB Ruflo V3 Swarm Config Unit Tests
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  validateSwarmConfig,
  DEFAULT_SWARM_CONFIG,
  V3_PERFORMANCE_TARGETS
} from "../src/registry/ruflo-swarm-config.mjs";

test("AC-SWARM-CFG-01: validateSwarmConfig returns defaults for empty object", () => {
  const cfg = validateSwarmConfig({});
  assert.equal(cfg.name, "secb-ruflo-v3-swarm");
  assert.equal(cfg.topology, "hierarchical");
  assert.equal(cfg.maxAgents, 8);
});

test("AC-SWARM-CFG-02: validateSwarmConfig accepts valid overrides", () => {
  const cfg = validateSwarmConfig({ topology: "mesh", maxAgents: 15 });
  assert.equal(cfg.topology, "mesh");
  assert.equal(cfg.maxAgents, 15);
});

test("AC-SWARM-CFG-03: validateSwarmConfig throws on invalid topology or out-of-range maxAgents", () => {
  assert.throws(() => validateSwarmConfig({ topology: "invalid" }), /Invalid topology/);
  assert.throws(() => validateSwarmConfig({ maxAgents: 100 }), /maxAgents must be/);
});
