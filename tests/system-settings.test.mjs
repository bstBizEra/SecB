/**
 * SecB System Settings Unit Tests
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getSystemSettings,
  updateSystemSettings,
  resetSystemSettings,
  validateSystemSettings,
  DEFAULT_SYSTEM_SETTINGS
} from "../src/config/system-settings.mjs";

test("AC-SETTINGS-01: DEFAULT_SYSTEM_SETTINGS matches ports and governance defaults", () => {
  const cfg = getSystemSettings();
  assert.equal(cfg.governance.policy_ceiling, "A0");
  assert.equal(cfg.ports.control_api, 3000);
  assert.equal(cfg.ports.event_ingress, 3001);
  assert.equal(cfg.ports.ruflo_mcp, 3003);
  assert.equal(cfg.ports.secb_mcp, 3005);
  assert.equal(cfg.knowledge.graphify_enabled, true);
});

test("AC-SETTINGS-02: updateSystemSettings applies valid overrides and validates schema", () => {
  resetSystemSettings();
  const updated = updateSystemSettings({
    governance: { policy_ceiling: "A2" },
    swarm: { max_agents: 15 }
  });

  assert.equal(updated.governance.policy_ceiling, "A2");
  assert.equal(updated.swarm.max_agents, 15);
  resetSystemSettings();
});

test("AC-SETTINGS-03: validateSystemSettings rejects invalid port or policy ceiling", () => {
  assert.throws(
    () => validateSystemSettings({ ...DEFAULT_SYSTEM_SETTINGS, ports: { ...DEFAULT_SYSTEM_SETTINGS.ports, control_api: 99999 } }),
    /validation failed/
  );
});
