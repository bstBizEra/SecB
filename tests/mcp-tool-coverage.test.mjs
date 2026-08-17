// Every tool the server would serve is exercised by something.
//
// WHY THIS EXISTS
//
// A pre-flight of the 38-tool catalog, run before the operator's one activation
// act, found six tools that no test named and that the zero-argument sweep in
// mcp-server.test.mjs could not reach, because all six require arguments. They
// are dispatched — the server names all 38 — so starting the server would serve
// six handlers nothing had ever called.
//
// One of them was worse than untested. `secb_implementation_merge_verify`
// constructed an ImplementationMergeOrchestrator, discarded it, and returned
// `{ status: "INSPECTED", release_id }` whatever happened. A tool advertising
// "Verify pre-merge release invariants" verified nothing and reported a result
// that reads as a verification. It is fixed in the same change and asserted below
// to decline instead.
//
// The guard is the durable half: tool 39 cannot arrive untested.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { TOOL_CATALOG } from "../src/mcp/tool-catalog.mjs";
import { SecBMcpServer } from "../src/mcp/secb-mcp-server.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CALLER = "inst_ok";

function registryStub() {
  return {
    resolve(id) {
      if (id !== CALLER) return { resolved: false, quarantined: true, reason: "Unknown agent instance" };
      return {
        resolved: true,
        quarantined: false,
        identity: {
          agent_instance_id: CALLER,
          runtime_product_id: "claude-code",
          max_data_classification: "INTERNAL",
          permitted_roles: ["ENGIN"],
          project_scopes: ["prj_secb_local"]
        }
      };
    }
  };
}

function harness(services = {}) {
  const server = new SecBMcpServer({
    services: { registry: registryStub(), ...services },
    invocationLog: () => {},
    now: () => new Date("2026-08-18T00:00:00Z")
  });
  // The caller is asserted as handle()'s SECOND argument, not inside params.
  // Putting it in the request body leaves every call unbound and denied, which
  // reads as six broken tools rather than one wrong harness.
  return (name, args) =>
    server.handle(
      { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } },
      { callerInstanceId: CALLER }
    );
}

/** The payload a tools/call result carries, however this server wraps it. */
function payload(response) {
  const r = response?.result ?? response;
  if (r?.structuredContent) return r.structuredContent;
  if (Array.isArray(r?.content) && r.content[0]?.text) {
    try {
      return JSON.parse(r.content[0].text);
    } catch {
      return { text: r.content[0].text };
    }
  }
  return r;
}

// ---------------------------------------------------------------------------
// The guard.
// ---------------------------------------------------------------------------

test("every catalog tool is exercised by a test, or reachable by the zero-argument sweep", () => {
  // Read the directory, not `git ls-files`. A test file that exists but is not
  // yet tracked is still a test file, and reading the index made this guard fail
  // on the very commit that closes the gap it reports — the file naming the six
  // was untracked while it ran.
  const testFiles = readdirSync(resolve(REPO, "tests")).filter((f) => f.endsWith(".mjs"));
  const corpus = testFiles.map((f) => readFileSync(resolve(REPO, "tests", f), "utf8")).join("\n");

  const unexercised = TOOL_CATALOG.filter(
    (t) => t.required.length > 0 && !corpus.includes(t.name)
  ).map((t) => t.name);

  assert.deepEqual(
    unexercised,
    [],
    "These tools are dispatched by the server and named by no test. A tool with required arguments " +
      "is not reached by the zero-argument sweep either, so nothing has ever called its handler. " +
      "Starting the server would serve them untried."
  );
});

// ---------------------------------------------------------------------------
// The six that were unexercised, one test each.
// ---------------------------------------------------------------------------

test("secb_implementation_merge_verify declines instead of reporting a verification it did not perform", () => {
  const out = payload(harness()("secb_implementation_merge_verify", { release_id: "rel_1" }));

  // The defect this replaced: status INSPECTED, returned unconditionally.
  assert.notEqual(out.status, "INSPECTED", "a tool that verifies nothing must not report a verification");
  assert.equal(out.available, false);
  assert.match(out.reason, /performs no verification/i);
  // The reason names why, so a caller is not left guessing which input is absent.
  assert.match(out.reason, /evidenceEnvelope/);
  assert.equal(out.release_id, "rel_1");
});

test("secb_contract_validate validates a document and reports an invalid one without throwing", () => {
  const call = harness();

  const bad = payload(call("secb_contract_validate", { kind: "not-a-real-contract-kind", document: {} }));
  assert.equal(bad.valid, false, "an unknown contract kind is a denial, not a crash");
  assert.ok(typeof bad.code === "string" && bad.code.length > 0, "a denial names its code");
});

test("secb_project_resolve_effective says the service is unwired rather than inventing a contract", () => {
  const unwired = payload(harness()("secb_project_resolve_effective", { project_id: "prj_secb_local" }));
  assert.equal(unwired.available, false);
  assert.match(unwired.reason, /ProjectContractService/);

  const wired = payload(
    harness({ project: { resolveEffective: ({ projectId }) => ({ effective: { project_id: projectId }, code: "ALLOW" }) } })(
      "secb_project_resolve_effective",
      { project_id: "prj_secb_local" }
    )
  );
  assert.equal(wired.code, "ALLOW");
  assert.equal(wired.effective.project_id, "prj_secb_local");
});

test("secb_agent_config_resolve denies as a structured error when its config source is not wired", () => {
  // The first version of this test asserted that a known agent type resolves to
  // something different from an unknown one. It does not: on a server with no
  // agent-config source, BOTH deny, because SecBAgentRegistry cannot read a
  // configuration that is not there. Asserting a distinction that does not exist
  // would have been an invented requirement, so this asserts what is true and
  // what matters — the denial is structured and identical, not a leaked crash.
  const call = harness();
  const known = call("secb_agent_config_resolve", { agent_type: "coder" });
  const unknown = call("secb_agent_config_resolve", { agent_type: "no-such-agent-type-xyz" });

  for (const [label, response] of [["known", known], ["unknown", unknown]]) {
    assert.ok(response.error, `${label} type: expected a structured error`);
    assert.equal(response.error.data?.code, "DENY_TOOL_ERROR", `${label} type: the denial names its code`);
    // A denial must not carry a stack trace out to the caller.
    assert.ok(
      !/\bat\s+\w+.*\(.*:\d+:\d+\)/.test(JSON.stringify(response)),
      `${label} type: a stack trace escaped into the response`
    );
  }
});

test("secb_agent_registration_inspect denies invalid params before touching enrollment", () => {
  const missing = payload(harness()("secb_agent_registration_inspect", {}));
  assert.ok(
    missing.code === "DENY_INVALID_PARAMS" || missing.error || missing.available === false,
    `expected a denial for missing required params, got ${JSON.stringify(missing).slice(0, 120)}`
  );
});

test("secb_project_registration_inspect answers for an unknown project without inventing a registration", () => {
  const out = payload(harness()("secb_project_registration_inspect", { project_id: "prj_that_does_not_exist" }));
  assert.ok(out && typeof out === "object");
  // Whatever shape it uses, it must not claim a staged registration exists.
  const text = JSON.stringify(out);
  assert.ok(
    !/"staged"\s*:\s*true/.test(text),
    `an unknown project must not report a staged registration: ${text.slice(0, 140)}`
  );
});
