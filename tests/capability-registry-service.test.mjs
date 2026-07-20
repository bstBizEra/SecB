// Unit tests for the SECB-MCP-P0-001 candidate private capability registry.
// Covers every deny path (fail-closed), the N-5 promotion gate (independent
// review distinct from producer + governance), revocation, and the
// PROMOTED-only resolve/gateway projection.
import test from "node:test";
import assert from "node:assert/strict";
import { validateContract } from "../src/contracts/contract-validator.mjs";
import {
  CapabilityRegistryService,
  GOVERNANCE_ROLE,
  INDEPENDENT_REVIEW_ROLE,
} from "../src/gateway/capability-registry-service.mjs";
import { McpGatewayCore } from "../src/gateway/mcp-gateway-core.mjs";

const FIXED_NOW = () => new Date("2026-07-20T10:00:00.000Z");
const PRODUCER = "modelcontextprotocol";

const validRecord = (overrides = {}) => ({
  capability_id: "filesystem.read",
  version: "1.0.0",
  adapter_id: "fs-read",
  tool: "read_text_file",
  access: "read",
  status: "CANDIDATE",
  source_identity: {
    maintainer: PRODUCER,
    repository: "https://github.com/modelcontextprotocol/servers",
    namespace: "@modelcontextprotocol/server-filesystem",
  },
  immutable_version: {
    commit: "0a1b2c3d4e5f60718293a4b5c6d7e8f901234567",
    tag_or_digest: "sha256:aa11bb22cc33dd44ee55ff667788990011223344556677889900aabbccddeeff",
  },
  integrity: {
    sha256: "aa11bb22cc33dd44ee55ff667788990011223344556677889900aabbccddeeff",
  },
  tool_inventory: ["read_text_file"],
  filesystem_boundary: "workspace-lease-root-read-only",
  network_boundary: "none",
  credential_handle: null,
  intake_evidence_refs: ["evidence:intake:fs-read:0001"],
  approvals: [],
  revocation: { revoked: false, reason: null, known_bad_versions: [] },
  ...overrides,
});

const gateApprovals = () => ([
  { role: INDEPENDENT_REVIEW_ROLE, actor_id: "agent.claude.rev.01", decided_at: "2026-07-20T09:00:00.000Z" },
  { role: GOVERNANCE_ROLE, actor_id: "operator.gov.01", decided_at: "2026-07-20T09:05:00.000Z" },
]);

const governanceOnly = () => ([
  { role: GOVERNANCE_ROLE, actor_id: "operator.gov.01", decided_at: "2026-07-20T09:05:00.000Z" },
]);

function build({ ledgerWriter, schemaValidator, now } = {}) {
  const entries = [];
  const service = new CapabilityRegistryService({
    schemaValidator: schemaValidator ?? ((record) => validateContract("capabilityRecord", record)),
    ledgerWriter: ledgerWriter ?? ((entry) => entries.push(entry)),
    now: now ?? FIXED_NOW,
  });
  return { service, entries };
}

test("constructor fails closed without validator, ledger writer, or clock", () => {
  assert.throws(() => new CapabilityRegistryService({}), /schemaValidator/);
  assert.throws(() => new CapabilityRegistryService({ schemaValidator: () => true }), /ledgerWriter/);
  assert.throws(
    () => new CapabilityRegistryService({ schemaValidator: () => true, ledgerWriter: () => {}, now: null }),
    /now/,
  );
});

test("schema-invalid record denies with DENY_RECORD_INVALID", () => {
  const { service } = build();
  const record = validRecord();
  delete record.integrity;
  const outcome = service.registerCandidate(record);
  assert.equal(outcome.ok, false);
  assert.equal(outcome.deny_code, "DENY_RECORD_INVALID");
});

test("intake status is forced to CANDIDATE even when submitted as PROMOTED", () => {
  const { service } = build();
  const outcome = service.registerCandidate(validRecord({ status: "PROMOTED" }));
  assert.equal(outcome.ok, true);
  assert.equal(outcome.status, "CANDIDATE");
  assert.equal(service.resolve("filesystem.read").deny_code, "DENY_CAPABILITY_NOT_PROMOTED");
});

test("a record claiming to already be revoked cannot enter intake", () => {
  const { service } = build();
  const record = validRecord({ revocation: { revoked: true, reason: "bad", known_bad_versions: ["1.0.0"] }, status: "REVOKED" });
  const outcome = service.registerCandidate(record);
  assert.equal(outcome.deny_code, "DENY_RECORD_INVALID");
});

test("duplicate capability version denies", () => {
  const { service } = build();
  assert.equal(service.registerCandidate(validRecord()).ok, true);
  assert.equal(service.registerCandidate(validRecord()).deny_code, "DENY_DUPLICATE_CAPABILITY_VERSION");
});

test("throwing ledger writer denies registration with no state change (audit-first)", () => {
  const { service } = build({ ledgerWriter: () => { throw new Error("ledger unavailable"); } });
  const outcome = service.registerCandidate(validRecord());
  assert.equal(outcome.deny_code, "DENY_AUDIT_UNAVAILABLE");
  const probe = build().service;
  assert.equal(probe.resolve("filesystem.read").deny_code, "DENY_UNKNOWN_CAPABILITY");
});

test("ledger write precedes registry effect", () => {
  const entries = [];
  const { service } = build({ ledgerWriter: (entry) => entries.push(entry) });
  service.registerCandidate(validRecord());
  assert.equal(entries.length, 1);
  assert.equal(entries[0].event, "REGISTER_CANDIDATE");
  assert.equal(entries[0].disposition, "ALLOW");
  assert.equal(entries[0].attempted_at, "2026-07-20T10:00:00.000Z");
});

test("invalid clock denies fail-closed", () => {
  const { service } = build({ now: () => "not-a-date" });
  assert.equal(service.registerCandidate(validRecord()).deny_code, "DENY_CLOCK_UNAVAILABLE");
});

test("promotion of an unknown capability or version denies", () => {
  const { service } = build();
  assert.equal(service.promote("filesystem.read", "1.0.0", gateApprovals()).deny_code, "DENY_UNKNOWN_CAPABILITY");
  service.registerCandidate(validRecord());
  assert.equal(service.promote("filesystem.read", "9.9.9", gateApprovals()).deny_code, "DENY_UNKNOWN_CAPABILITY");
});

test("promotion without the full N-5 approvals set denies", () => {
  const { service } = build();
  service.registerCandidate(validRecord());
  const independent = gateApprovals()[0];
  const governance = gateApprovals()[1];
  for (const approvals of [undefined, [], [independent], [governance]]) {
    assert.equal(service.promote("filesystem.read", "1.0.0", approvals).deny_code, "DENY_APPROVALS");
  }
});

test("malformed approval entries deny", () => {
  const { service } = build();
  service.registerCandidate(validRecord());
  const outcome = service.promote("filesystem.read", "1.0.0", [
    ...gateApprovals(),
    { role: "extra", actor_id: "", decided_at: "2026-07-20T09:00:00.000Z" },
  ]);
  assert.equal(outcome.deny_code, "DENY_APPROVALS");
});

test("independent review by the record producer is a denied self-approval", () => {
  const { service } = build();
  service.registerCandidate(validRecord());
  const approvals = gateApprovals();
  approvals[0].actor_id = PRODUCER;
  assert.equal(service.promote("filesystem.read", "1.0.0", approvals).deny_code, "DENY_SELF_APPROVAL");
});

test("promotion happy path makes the record resolvable", () => {
  const { service, entries } = build();
  service.registerCandidate(validRecord());
  const outcome = service.promote("filesystem.read", "1.0.0", gateApprovals());
  assert.equal(outcome.ok, true);
  assert.equal(outcome.status, "PROMOTED");
  const resolved = service.resolve("filesystem.read");
  assert.equal(resolved.ok, true);
  assert.equal(resolved.record.status, "PROMOTED");
  assert.equal(resolved.record.adapter_id, "fs-read");
  assert.equal(resolved.record.approvals.length, 2);
  assert.deepEqual(entries.map((entry) => `${entry.event}:${entry.disposition}`), [
    "REGISTER_CANDIDATE:ALLOW",
    "PROMOTE:ALLOW",
  ]);
});

test("a second promotion for the same capability denies", () => {
  const { service } = build();
  service.registerCandidate(validRecord());
  service.registerCandidate(validRecord({ version: "1.0.1" }));
  service.promote("filesystem.read", "1.0.0", gateApprovals());
  assert.equal(service.promote("filesystem.read", "1.0.0", gateApprovals()).deny_code, "DENY_ALREADY_PROMOTED");
  assert.equal(service.promote("filesystem.read", "1.0.1", gateApprovals()).deny_code, "DENY_ALREADY_PROMOTED");
});

test("throwing ledger writer denies promotion and leaves status CANDIDATE", () => {
  const entries = [];
  let fail = false;
  const { service } = build({
    ledgerWriter: (entry) => {
      if (fail) throw new Error("ledger unavailable");
      entries.push(entry);
    },
  });
  service.registerCandidate(validRecord());
  fail = true;
  assert.equal(service.promote("filesystem.read", "1.0.0", gateApprovals()).deny_code, "DENY_AUDIT_UNAVAILABLE");
  fail = false;
  assert.equal(service.resolve("filesystem.read").deny_code, "DENY_CAPABILITY_NOT_PROMOTED");
});

test("resolve returns only PROMOTED records (deny-by-default)", () => {
  const { service } = build();
  assert.equal(service.resolve("filesystem.read").deny_code, "DENY_UNKNOWN_CAPABILITY");
  service.registerCandidate(validRecord());
  assert.equal(service.resolve("filesystem.read").deny_code, "DENY_CAPABILITY_NOT_PROMOTED");
});

test("revocation without a governance approval denies", () => {
  const { service } = build();
  service.registerCandidate(validRecord());
  for (const approvals of [undefined, [], [gateApprovals()[0]]]) {
    assert.equal(service.revoke("filesystem.read", "known-bad release", approvals).deny_code, "DENY_APPROVALS");
  }
});

test("revocation requires a reason", () => {
  const { service } = build();
  service.registerCandidate(validRecord());
  assert.equal(service.revoke("filesystem.read", "", governanceOnly()).deny_code, "DENY_REVOCATION_INVALID");
});

test("governance revocation always lands and blocks resolution", () => {
  const { service } = build();
  service.registerCandidate(validRecord());
  service.registerCandidate(validRecord({ version: "1.0.1" }));
  service.promote("filesystem.read", "1.0.0", gateApprovals());
  const outcome = service.revoke("filesystem.read", "credential exfiltration in upstream release", governanceOnly());
  assert.equal(outcome.ok, true);
  assert.deepEqual([...outcome.known_bad_versions], ["1.0.0", "1.0.1"]);
  assert.equal(service.resolve("filesystem.read").deny_code, "DENY_REVOKED");
  assert.equal(service.promote("filesystem.read", "1.0.0", gateApprovals()).deny_code, "DENY_REVOKED");
});

test("throwing ledger writer denies revocation (fail-closed kill path still audited-first)", () => {
  let fail = false;
  const { service } = build({
    ledgerWriter: () => {
      if (fail) throw new Error("ledger unavailable");
    },
  });
  service.registerCandidate(validRecord());
  service.promote("filesystem.read", "1.0.0", gateApprovals());
  fail = true;
  assert.equal(service.revoke("filesystem.read", "reason", governanceOnly()).deny_code, "DENY_AUDIT_UNAVAILABLE");
  fail = false;
  assert.equal(service.resolve("filesystem.read").ok, true);
});

test("toGatewayRegistry projects only PROMOTED records and feeds the gateway", async () => {
  const { service } = build();
  service.registerCandidate(validRecord());
  service.registerCandidate(validRecord({ capability_id: "workspace.write", adapter_id: "fs-write", tool: "write_file", access: "mutate" }));
  service.promote("filesystem.read", "1.0.0", gateApprovals());
  const registry = service.toGatewayRegistry();
  assert.equal(registry.size, 1);
  assert.deepEqual({ ...registry.get("filesystem.read") }, { adapter_id: "fs-read", tool: "read_text_file", access: "read" });

  const gateway = new McpGatewayCore({
    capabilityRegistry: registry,
    adapters: new Map([["fs-read", { invoke: (tool) => ({ tool }) }]]),
    invocationLog: () => {},
    now: FIXED_NOW,
    revocationCheck: () => false,
    resultValidator: () => true,
  });
  const outcome = await gateway.invoke({
    agent_id: "agent.claude.motor.01",
    harness_id: "claude-code",
    project_id: "prj_secb_local",
    work_package_id: "wp_mod_mcp_002",
    workspace_lease_id: "lease-20260720-001",
    session_id: "session-0001",
    authorization_id: "auth-0001",
    capability_id: "filesystem.read",
    purpose: "registry-projection-check",
    evidence_required: true,
  }, {});
  assert.equal(outcome.ok, true);
  assert.equal(outcome.receipt.adapter_id, "fs-read");
});
