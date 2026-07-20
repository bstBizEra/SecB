// Unit tests for the SECB-MCP-P0-001 candidate credential broker core.
// Covers every deny path (fail-closed), the opaque-handle/no-plaintext rule,
// the 10-field request-context gate shared with the gateway, and the
// PROMOTED-capability + adapter-match resolution gate.
import test from "node:test";
import assert from "node:assert/strict";
import { CredentialBroker } from "../src/gateway/credential-broker.mjs";
import { REQUIRED_CONTEXT_FIELDS } from "../src/gateway/mcp-gateway-core.mjs";
import {
  CapabilityRegistryService,
  GOVERNANCE_ROLE,
  INDEPENDENT_REVIEW_ROLE,
} from "../src/gateway/capability-registry-service.mjs";
import { validateContract } from "../src/contracts/contract-validator.mjs";

const FIXED_NOW = () => new Date("2026-07-20T10:00:00.000Z");

const validContext = () => ({
  agent_id: "agent.claude.motor.01",
  harness_id: "claude-code",
  project_id: "prj_secb_local",
  work_package_id: "wp_mod_mcp_002",
  workspace_lease_id: "lease-20260720-001",
  session_id: "session-0001",
  authorization_id: "auth-0001",
  capability_id: "gitea.read",
  purpose: "adapter-process-construction",
  evidence_required: true,
});

function makeSealer() {
  const sealedRefs = new Set();
  return {
    seal(materialRef) {
      const sealedRef = `sealed:os-store:${materialRef}`;
      sealedRefs.add(sealedRef);
      return sealedRef;
    },
    isSealedRef(candidate) {
      return sealedRefs.has(candidate);
    },
  };
}

const promotedRecord = (overrides = {}) => ({
  capability_id: "gitea.read",
  adapter_id: "gitea-rest",
  status: "PROMOTED",
  ...overrides,
});

function build({ sealer, registryResolver, ledgerWriter, now } = {}) {
  const entries = [];
  const activeSealer = sealer ?? makeSealer();
  const broker = new CredentialBroker({
    sealer: activeSealer,
    registryResolver: registryResolver ?? (() => ({ ok: true, record: promotedRecord() })),
    ledgerWriter: ledgerWriter ?? ((entry) => entries.push(entry)),
    now: now ?? FIXED_NOW,
  });
  return { broker, entries, sealer: activeSealer };
}

function mintAndBind(broker, sealer, handleId = "handle-gitea-01") {
  assert.equal(broker.mint({ handle_id: handleId, capability_id: "gitea.read", scope_note: "gitea REST adapter token" }).ok, true);
  const sealedRef = sealer.seal("vault://gitea/token-01");
  assert.equal(broker.bind(handleId, sealedRef).ok, true);
  return sealedRef;
}

test("constructor fails closed without sealer, resolver, ledger writer, or clock", () => {
  assert.throws(() => new CredentialBroker({}), /Sealer/);
  assert.throws(() => new CredentialBroker({ sealer: { seal: () => {} } }), /Sealer/);
  assert.throws(() => new CredentialBroker({ sealer: makeSealer() }), /registryResolver/);
  assert.throws(() => new CredentialBroker({ sealer: makeSealer(), registryResolver: () => {} }), /ledgerWriter/);
  assert.throws(
    () => new CredentialBroker({ sealer: makeSealer(), registryResolver: () => {}, ledgerWriter: () => {}, now: null }),
    /now/,
  );
});

test("mint denies malformed handle specs", () => {
  const { broker } = build();
  for (const spec of [undefined, null, {}, { handle_id: "h" }, { handle_id: "h", capability_id: "c" }, { handle_id: " ", capability_id: "c", scope_note: "s" }]) {
    assert.equal(broker.mint(spec).deny_code, "DENY_HANDLE_SPEC_INVALID");
  }
});

test("mint denies duplicate handles", () => {
  const { broker } = build();
  const spec = { handle_id: "handle-01", capability_id: "gitea.read", scope_note: "token" };
  assert.equal(broker.mint(spec).ok, true);
  assert.equal(broker.mint(spec).deny_code, "DENY_HANDLE_EXISTS");
});

test("bind denies unknown handles", () => {
  const { broker, sealer } = build();
  assert.equal(broker.bind("missing", sealer.seal("vault://x")).deny_code, "DENY_HANDLE_UNKNOWN");
});

test("bind rejects anything the sealer does not recognize as a sealed reference", () => {
  const { broker } = build();
  broker.mint({ handle_id: "handle-01", capability_id: "gitea.read", scope_note: "token" });
  for (const notSealed of ["vault://gitea/token-01", "plain-string", 42, null, { sealed: true }]) {
    assert.equal(broker.bind("handle-01", notSealed).deny_code, "DENY_SEALER_INVALID");
  }
});

test("plaintext-looking secret material is rejected even if a permissive sealer accepts it", () => {
  const permissiveSealer = { seal: (x) => x, isSealedRef: () => true };
  const { broker } = build({ sealer: permissiveSealer });
  broker.mint({ handle_id: "handle-01", capability_id: "gitea.read", scope_note: "token" });
  for (const plaintext of [
    "ghp_abcdefghijklmnop",
    "Bearer abcdef.123456-secret",
    "sk-abcdefgh12345678",
    "-----BEGIN RSA PRIVATE KEY-----",
  ]) {
    assert.equal(broker.bind("handle-01", plaintext).deny_code, "DENY_SEALER_INVALID");
  }
});

test("a throwing sealer fails closed", () => {
  const { broker } = build({ sealer: { seal: () => "x", isSealedRef: () => { throw new Error("sealer down"); } } });
  broker.mint({ handle_id: "handle-01", capability_id: "gitea.read", scope_note: "token" });
  assert.equal(broker.bind("handle-01", "anything").deny_code, "DENY_SEALER_INVALID");
});

test("rebinding a bound handle denies", () => {
  const { broker, sealer } = build();
  mintAndBind(broker, sealer);
  assert.equal(broker.bind("handle-gitea-01", sealer.seal("vault://other")).deny_code, "DENY_HANDLE_ALREADY_BOUND");
});

test("every missing request_context field denies resolution with DENY_CONTEXT", () => {
  const { broker, sealer } = build();
  mintAndBind(broker, sealer);
  for (const field of REQUIRED_CONTEXT_FIELDS) {
    const context = validContext();
    delete context[field];
    assert.equal(broker.resolveForAdapter("handle-gitea-01", "gitea-rest", context).deny_code, "DENY_CONTEXT", `expected denial when ${field} missing`);
  }
});

test("evidence_required must be exactly true for resolution", () => {
  const { broker, sealer } = build();
  mintAndBind(broker, sealer);
  for (const bad of [false, undefined, "true", 1]) {
    const context = { ...validContext(), evidence_required: bad };
    assert.equal(broker.resolveForAdapter("handle-gitea-01", "gitea-rest", context).deny_code, "DENY_CONTEXT");
  }
});

test("context capability must match the handle capability", () => {
  const { broker, sealer } = build();
  mintAndBind(broker, sealer);
  const context = { ...validContext(), capability_id: "filesystem.read" };
  assert.equal(broker.resolveForAdapter("handle-gitea-01", "gitea-rest", context).deny_code, "DENY_CONTEXT");
});

test("unknown and unbound handles deny resolution", () => {
  const { broker } = build();
  assert.equal(broker.resolveForAdapter("missing", "gitea-rest", validContext()).deny_code, "DENY_HANDLE_UNKNOWN");
  broker.mint({ handle_id: "handle-unbound", capability_id: "gitea.read", scope_note: "token" });
  assert.equal(broker.resolveForAdapter("handle-unbound", "gitea-rest", validContext()).deny_code, "DENY_HANDLE_UNBOUND");
});

test("non-promoted, denied, or throwing registry resolution denies", () => {
  for (const registryResolver of [
    () => ({ ok: false, deny_code: "DENY_CAPABILITY_NOT_PROMOTED" }),
    () => ({ ok: true, record: promotedRecord({ status: "CANDIDATE" }) }),
    () => ({ ok: true, record: promotedRecord({ status: "REVOKED" }) }),
    () => { throw new Error("registry unavailable"); },
    () => null,
  ]) {
    const { broker, sealer } = build({ registryResolver });
    mintAndBind(broker, sealer);
    assert.equal(broker.resolveForAdapter("handle-gitea-01", "gitea-rest", validContext()).deny_code, "DENY_CAPABILITY_NOT_PROMOTED");
  }
});

test("adapter mismatch denies resolution", () => {
  const { broker, sealer } = build();
  mintAndBind(broker, sealer);
  for (const adapterId of ["fs-read", "", undefined]) {
    assert.equal(broker.resolveForAdapter("handle-gitea-01", adapterId, validContext()).deny_code, "DENY_ADAPTER_MISMATCH");
  }
});

test("resolution happy path returns the sealed reference only", () => {
  const { broker, sealer } = build();
  const sealedRef = mintAndBind(broker, sealer);
  const outcome = broker.resolveForAdapter("handle-gitea-01", "gitea-rest", validContext());
  assert.equal(outcome.ok, true);
  assert.equal(outcome.sealed_ref, sealedRef);
  assert.equal(outcome.capability_id, "gitea.read");
  assert.equal(outcome.adapter_id, "gitea-rest");
});

test("ledger entries are written for every attempt and never contain sealed references", () => {
  const { broker, entries, sealer } = build();
  const sealedRef = mintAndBind(broker, sealer);
  broker.resolveForAdapter("handle-gitea-01", "gitea-rest", validContext());
  broker.resolveForAdapter("handle-gitea-01", "wrong-adapter", validContext());
  assert.deepEqual(entries.map((entry) => `${entry.event}:${entry.disposition}`), [
    "MINT:ALLOW",
    "BIND:ALLOW",
    "RESOLVE_FOR_ADAPTER:ALLOW",
    "RESOLVE_FOR_ADAPTER:DENY_ADAPTER_MISMATCH",
  ]);
  const serialized = JSON.stringify(entries.map((entry) => ({ ...entry })));
  assert.equal(serialized.includes(sealedRef), false);
  assert.equal(serialized.includes("vault://"), false);
});

test("throwing ledger writer denies each operation (audit-first)", () => {
  let fail = false;
  const sealer = makeSealer();
  const { broker } = build({
    sealer,
    ledgerWriter: () => {
      if (fail) throw new Error("ledger unavailable");
    },
  });
  fail = true;
  assert.equal(broker.mint({ handle_id: "h1", capability_id: "gitea.read", scope_note: "s" }).deny_code, "DENY_AUDIT_UNAVAILABLE");
  fail = false;
  const sealedRef = mintAndBind(broker, sealer, "h2");
  fail = true;
  assert.equal(broker.bind("h2", sealedRef).deny_code, "DENY_AUDIT_UNAVAILABLE");
  assert.equal(broker.resolveForAdapter("h2", "gitea-rest", validContext()).deny_code, "DENY_AUDIT_UNAVAILABLE");
});

test("invalid clock denies fail-closed", () => {
  const { broker } = build({ now: () => "not-a-date" });
  assert.equal(broker.mint({ handle_id: "h1", capability_id: "gitea.read", scope_note: "s" }).deny_code, "DENY_CLOCK_UNAVAILABLE");
});

test("broker refuses handles for capabilities revoked in the real registry", () => {
  const registry = new CapabilityRegistryService({
    schemaValidator: (record) => validateContract("capabilityRecord", record),
    ledgerWriter: () => {},
    now: FIXED_NOW,
  });
  registry.registerCandidate({
    capability_id: "gitea.read",
    version: "1.0.0",
    adapter_id: "gitea-rest",
    tool: "list_repositories",
    access: "read",
    status: "CANDIDATE",
    source_identity: { maintainer: "secb", repository: "https://git.secb.local/secb/gitea-adapter", namespace: "secb/gitea-adapter" },
    immutable_version: { commit: "0a1b2c3d4e5f60718293a4b5c6d7e8f901234567", tag_or_digest: "v1.0.0" },
    integrity: { sha256: "aa11bb22cc33dd44ee55ff667788990011223344556677889900aabbccddeeff" },
    tool_inventory: ["list_repositories"],
    filesystem_boundary: "none",
    network_boundary: "gitea-internal-only",
    credential_handle: "handle-gitea-01",
    intake_evidence_refs: ["evidence:intake:gitea:0001"],
    approvals: [],
    revocation: { revoked: false, reason: null, known_bad_versions: [] },
  });
  registry.promote("gitea.read", "1.0.0", [
    { role: INDEPENDENT_REVIEW_ROLE, actor_id: "agent.claude.rev.01", decided_at: "2026-07-20T09:00:00.000Z" },
    { role: GOVERNANCE_ROLE, actor_id: "operator.gov.01", decided_at: "2026-07-20T09:05:00.000Z" },
  ]);

  const sealer = makeSealer();
  const { broker } = build({ sealer, registryResolver: (capabilityId) => registry.resolve(capabilityId) });
  mintAndBind(broker, sealer);
  assert.equal(broker.resolveForAdapter("handle-gitea-01", "gitea-rest", validContext()).ok, true);

  registry.revoke("gitea.read", "upstream compromise", [
    { role: GOVERNANCE_ROLE, actor_id: "operator.gov.01", decided_at: "2026-07-20T09:30:00.000Z" },
  ]);
  assert.equal(
    broker.resolveForAdapter("handle-gitea-01", "gitea-rest", validContext()).deny_code,
    "DENY_CAPABILITY_NOT_PROMOTED",
  );
});
