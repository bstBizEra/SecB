import assert from "node:assert/strict";
import test from "node:test";

import { RuntimeRegistry } from "../src/registry/runtime-registry.mjs";
import { AgentEnrollmentService } from "../src/services/agent-enrollment-service.mjs";
import { SecBMcpServer } from "../src/mcp/secb-mcp-server.mjs";

const REQUEST = Object.freeze({
  provider_id: "openai",
  runtime_product_id: "codex",
  runtime_deployment_id: "codex-windows",
  agent_profile_id: "codex-engineer",
  runtime_version: "1.0.0",
  deployment_location: "local",
  public_key_fingerprint: `sha256:${"a".repeat(64)}`,
  idempotency_key: "enroll-codex-001"
});

function enrollmentHarness() {
  const registry = new RuntimeRegistry({ policyCeiling: "A0" });
  const ledger = [];
  const service = new AgentEnrollmentService({
    registry,
    ledgerWriter: (entry) => ledger.push(entry),
    now: () => new Date("2026-07-31T00:00:00Z"),
    idFactory: () => "inst_server_generated_001",
    receiptFactory: () => "receipt-secret-001"
  });
  return { registry, ledger, service };
}

test("proposal creates only a server-id CANDIDATE/PENDING A0/PUBLIC record", () => {
  const { registry, ledger, service } = enrollmentHarness();
  const result = service.propose(REQUEST);
  assert.equal(result.ok, true);
  assert.equal(result.agent_instance_id, "inst_server_generated_001");
  assert.equal(result.evaluation_status, "CANDIDATE");
  assert.equal(result.lifecycle_state, "PENDING");
  assert.equal(result.authority_ceiling, "A0");
  assert.equal(result.max_data_classification, "PUBLIC");
  assert.equal(result.registration_receipt, "receipt-secret-001");

  const stored = registry.get(result.agent_instance_id);
  assert.deepEqual(stored.permitted_roles, []);
  assert.deepEqual(stored.approved_tools, []);
  assert.equal(stored.owner, "UNVERIFIED");
  assert.equal(registry.resolve(result.agent_instance_id).resolved, false);
  assert.equal(ledger.length, 1);
  assert.equal(ledger[0].event_type, "AGENT_ENROLLMENT_PROPOSED");
});

test("idempotency replays the same receipt and denies changed payload", () => {
  const { service, ledger } = enrollmentHarness();
  const first = service.propose(REQUEST);
  const replay = service.propose({ ...REQUEST });
  assert.equal(replay.ok, true);
  assert.equal(replay.replayed, true);
  assert.equal(replay.registration_receipt, first.registration_receipt);
  assert.equal(ledger.length, 1);

  const conflict = service.propose({ ...REQUEST, runtime_version: "2.0.0" });
  assert.equal(conflict.ok, false);
  assert.equal(conflict.deny_code, "DENY_IDEMPOTENCY_CONFLICT");
});

test("inspection requires the opaque receipt and never returns it", () => {
  const { service } = enrollmentHarness();
  const proposal = service.propose(REQUEST);
  assert.equal(service.inspect(proposal.agent_instance_id, "wrong").deny_code, "DENY_ENROLLMENT_RECEIPT");
  const inspected = service.inspect(proposal.agent_instance_id, proposal.registration_receipt);
  assert.equal(inspected.ok, true);
  assert.equal(inspected.evaluation_status, "CANDIDATE");
  assert.equal("registration_receipt" in inspected, false);
});

test("invalid enrollment requests fail before audit or registry mutation", () => {
  const { registry, ledger, service } = enrollmentHarness();
  const result = service.propose({ ...REQUEST, public_key_fingerprint: "not-a-key" });
  assert.equal(result.deny_code, "DENY_ENROLLMENT_INVALID");
  assert.equal(registry.size, 0);
  assert.equal(ledger.length, 0);
});

test("MCP enrollment is disabled by default and available only when injected", () => {
  const registry = new RuntimeRegistry({ policyCeiling: "A0" });
  const audit = [];
  const services = {
    registry,
    workPackage: {},
    eventLedger: {},
    evidenceLedger: {},
    skillResolver: {}
  };
  const makeServer = () => new SecBMcpServer({
    services,
    invocationLog: (entry) => audit.push(entry),
    now: () => new Date("2026-07-31T00:00:00Z")
  });
  const call = (server, name, args) =>
    server.handle({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } });

  assert.equal(call(makeServer(), "secb_agent_registration_propose", REQUEST).error.data.code, "DENY_ENROLLMENT_DISABLED");

  services.agentEnrollment = new AgentEnrollmentService({
    registry,
    ledgerWriter: () => {},
    now: () => new Date("2026-07-31T00:00:00Z"),
    idFactory: () => "inst_mcp_001",
    receiptFactory: () => "receipt-mcp-001"
  });
  const result = call(makeServer(), "secb_agent_registration_propose", REQUEST).result.data;
  assert.equal(result.agent_instance_id, "inst_mcp_001");
  assert.equal(registry.resolve(result.agent_instance_id).resolved, false);
  assert.ok(audit.some((entry) => entry.decision === "ALLOW_ENROLLMENT_CANDIDATE"));
});

// ---------------------------------------------------------------------------
// The enrollment admission boundary: the two refusals the ratchet carried.
//
// Enrollment decides which agents may exist at all, so both of these are the
// service refusing to admit rather than refusing a request. Each depends on an
// INJECTED dependency failing, which is why they are reachable at all: the
// service takes its id source, receipt source, clock, ledger writer and
// registry from the caller and trusts none of them.
// ---------------------------------------------------------------------------

function brokenHarness(overrides) {
  const registry = new RuntimeRegistry({ policyCeiling: "A0" });
  const ledger = [];
  const service = new AgentEnrollmentService({
    registry,
    ledgerWriter: (entry) => ledger.push(entry),
    now: () => new Date("2026-07-31T00:00:00Z"),
    idFactory: () => "inst_server_generated_001",
    receiptFactory: () => "receipt-secret-001",
    ...overrides
  });
  return { registry, ledger, service };
}

test("DENY_ENROLLMENT_RUNTIME — a server-side generator that yields nothing usable", () => {
  // The instance id and the enrollment receipt are SERVER-derived: the caller
  // never supplies them, so a generator returning blank is not bad input, it is
  // the server unable to mint an identity. Admitting an agent with no id, or
  // issuing a receipt that is the empty string, would create a registration
  // nothing could later be held to.
  //
  // The clock case is here because it did NOT deny until this change. Reading
  // an injected clock directly threw RangeError, so the finiteness check was
  // unreachable and callers got "Invalid time value" instead of a deny_code.
  const cases = [
    ["blank-id", { idFactory: () => "" }],
    ["whitespace-id", { idFactory: () => "   " }],
    ["blank-receipt", { receiptFactory: () => "" }],
    ["unparseable-clock", { now: () => new Date("not a date") }]
  ];
  for (const [label, overrides] of cases) {
    const { service, ledger, registry } = brokenHarness(overrides);
    const result = service.propose({ ...REQUEST, idempotency_key: `enroll-${label}` });
    assert.equal(result.ok, false, `${label}: enrollment must be refused`);
    assert.equal(result.deny_code, "DENY_ENROLLMENT_RUNTIME", label);
    // Nothing is admitted and nothing is recorded. A refusal that had already
    // written to the ledger or the registry would leave a half-enrolled agent.
    assert.equal(ledger.length, 0, `${label}: the ledger must be untouched`);
    assert.ok(!registry.get("inst_server_generated_001"), `${label}: nothing registered`);
  }
});

test("DENY_ENROLLMENT_UNAVAILABLE — the audit trail or the registry refuses the write", () => {
  // Audit-first: the ledger entry is written BEFORE the registration takes
  // effect, so a throwing writer must deny rather than proceed. An enrollment
  // that succeeded while its audit record failed would be an agent admitted
  // with no evidence that anyone admitted it.
  const throwing = brokenHarness({ ledgerWriter: () => { throw new Error("ledger offline"); } });
  const viaLedger = throwing.service.propose({ ...REQUEST, idempotency_key: "enroll-ledger-down" });
  assert.equal(viaLedger.ok, false);
  assert.equal(viaLedger.deny_code, "DENY_ENROLLMENT_UNAVAILABLE");
  assert.ok(!throwing.registry.get("inst_server_generated_001"),
    "a failed audit write must leave no registration behind");

  // The same refusal covers the registry itself failing, which matters because
  // the two writes are not atomic: the ledger entry lands first.
  const registry = new RuntimeRegistry({ policyCeiling: "A0" });
  registry.register = () => { throw new Error("registry offline"); };
  const ledger = [];
  const service = new AgentEnrollmentService({
    registry, ledgerWriter: (entry) => ledger.push(entry),
    now: () => new Date("2026-07-31T00:00:00Z"),
    idFactory: () => "inst_server_generated_001",
    receiptFactory: () => "receipt-secret-001"
  });
  const viaRegistry = service.propose({ ...REQUEST, idempotency_key: "enroll-registry-down" });
  assert.equal(viaRegistry.ok, false);
  assert.equal(viaRegistry.deny_code, "DENY_ENROLLMENT_UNAVAILABLE");
});

// ---------------------------------------------------------------------------
// Instance identity: the two refusals that keep an actor from being two things.
//
// Found by tools/per-site-demonstration.mjs. Both codes are demonstrated in
// runtime-registry, so the ratchet — which keys by code name — read them as
// covered while this service's copies had never fired.
//
// They matter here because in SecB an agent INSTANCE is the actor. Every
// separation-of-duties check downstream compares actor ids, so an id that can
// be enrolled twice, or acted on without a record, is an identity the authority
// model cannot reason about.
// ---------------------------------------------------------------------------

test("DENY_DUPLICATE_INSTANCE — the same instance id cannot be enrolled twice", () => {
  const { service, registry } = enrollmentHarness();

  const first = service.propose({ ...REQUEST });
  assert.equal(first.ok, true);
  assert.ok(registry.get("inst_server_generated_001"), "the first proposal must have registered");

  // The id factory is fixed, so the second proposal generates the SAME id — the
  // exact collision the guard exists for. A different idempotency key, so this
  // is a genuinely new request rather than a replay.
  const second = service.propose({ ...REQUEST, idempotency_key: "idem-second-enrollment" });
  assert.equal(second.deny_code, "DENY_DUPLICATE_INSTANCE");
});

test("DENY_UNKNOWN_INSTANCE — a receipt that is valid while the registry has no record", () => {
  // REACHABLE BY CONSTRUCTION, NOT BY MONKEYPATCHING. RuntimeRegistry has no
  // delete, so with the real registry this cannot fire. But `registry` is an
  // injected dependency, and this guard is what stops the service from
  // concluding "a receipt exists, therefore the record exists". Those are two
  // separate stores, and only one of them belongs to this service.
  const real = new RuntimeRegistry({ policyCeiling: "A0" });
  let forget = false;
  const service = new AgentEnrollmentService({
    registry: {
      register: (record) => real.register(record),
      get: (id) => (forget ? null : real.get(id))
    },
    ledgerWriter: () => {},
    now: () => new Date("2026-07-31T00:00:00Z"),
    idFactory: () => "inst_server_generated_001",
    receiptFactory: () => "receipt-secret-001"
  });

  service.propose({ ...REQUEST });
  // The receipt is genuine and still matches; only the record is gone.
  forget = true;
  assert.equal(service.inspect("inst_server_generated_001", "receipt-secret-001").deny_code, "DENY_UNKNOWN_INSTANCE");

  // And the ORDER holds: a bad receipt is refused as a receipt problem even when
  // the record is also missing. Collapsing the two would tell a caller its
  // instance is unknown when the real fault was an unverifiable receipt.
  assert.equal(service.inspect("inst_server_generated_001", "wrong-receipt").deny_code, "DENY_ENROLLMENT_RECEIPT");
});
