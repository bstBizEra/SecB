import { test } from "node:test";
import assert from "node:assert/strict";
import { rmSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { ProjectRegistrationService, ProjectRegistrationError } from "../src/project/project-registration-service.mjs";
import { BootstrapAuthorizationGate } from "../src/control/bootstrap-authorization-gate.mjs";
import { SecBMcpServer } from "../src/mcp/secb-mcp-server.mjs";

const testStagingDir = resolve(process.cwd(), ".secb", "test-staging-reg");

test.after(() => {
  if (existsSync(testStagingDir)) {
    rmSync(testStagingDir, { recursive: true, force: true });
  }
});

test("ProjectRegistrationService registers proposal-only draft in staging without target repo mutation", () => {
  const service = new ProjectRegistrationService({ stagingBaseDir: testStagingDir });
  const pkg = service.registerDraft({
    projectId: "SECB-TEST-001",
    name: "SecB Test Project",
    owners: ["admin@secb.local"],
    classification: "INTERNAL"
  });

  assert.equal(pkg.project_id, "SECB-TEST-001");
  assert.equal(pkg.mode, "proposal_only");
  assert.equal(pkg.repository_mutation_authorized, false);
  assert.equal(pkg.status, "REGISTERED_PROPOSAL_ONLY");
  assert.ok(pkg.proposed_changes.length >= 2);
  assert.ok(pkg.prohibited_actions.includes("repository_write"));

  const stagedFile = join(testStagingDir, "SECB-TEST-001", "registration-package.json");
  assert.equal(existsSync(stagedFile), true);
});

test("ProjectRegistrationService inspects registration and verifies proposed manifest fingerprints", () => {
  const service = new ProjectRegistrationService({ stagingBaseDir: testStagingDir });
  service.registerDraft({ projectId: "SECB-TEST-002", name: "Manifest Test" });

  const pkg = service.inspectRegistration("SECB-TEST-002");
  assert.equal(pkg.project_id, "SECB-TEST-002");

  const verification = service.verifyProposedManifest("SECB-TEST-002");
  assert.equal(verification.project_id, "SECB-TEST-002");
  assert.equal(verification.repository_mutation_authorized, false);
  assert.ok(verification.total_proposed >= 2);
  assert.equal(verification.verified.every((v) => v.hashVerified), true);
});

test("BootstrapAuthorizationGate fails closed on missing signature", () => {
  const service = new ProjectRegistrationService({ stagingBaseDir: testStagingDir });
  service.registerDraft({ projectId: "SECB-TEST-003" });

  const gate = new BootstrapAuthorizationGate({ registrationService: service });

  assert.throws(
    () => {
      gate.authorizeBootstrap({ projectId: "SECB-TEST-003", authorizationRecord: {} });
    },
    (err) => err instanceof ProjectRegistrationError && err.code === "DENY_UNAUTHORIZED_MUTATION"
  );
});

test("BootstrapAuthorizationGate authorizes bootstrap with signed human GOV decision record", () => {
  const service = new ProjectRegistrationService({ stagingBaseDir: testStagingDir });
  service.registerDraft({ projectId: "SECB-TEST-004" });

  const gate = new BootstrapAuthorizationGate({ registrationService: service });
  const updated = gate.authorizeBootstrap({
    projectId: "SECB-TEST-004",
    authorizationRecord: { decisionId: "DEC-001", approvedBy: "gov-admin@secb.local" },
    reviewerSignature: "SIG-HUMAN-GOV-APPROVED"
  });

  assert.equal(updated.status, "AUTHORIZED_FOR_BOOTSTRAP");
  assert.equal(updated.repository_mutation_authorized, true);
});

test("SecBMcpServer dispatches project registration tools", () => {
  const service = new ProjectRegistrationService({ stagingBaseDir: testStagingDir });
  const registry = {
    resolve: (id) => ({
      resolved: true,
      identity: { agent_instance_id: id, max_data_classification: "INTERNAL", state: "ACTIVE" }
    })
  };
  const logs = [];
  const server = new SecBMcpServer({
    services: { registry, registrationService: service },
    invocationLog: (entry) => logs.push(entry),
    classificationCeiling: "INTERNAL"
  });

  const draftRes = server.handle(
    {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "secb_project_register_draft",
        arguments: { project_id: "SECB-MCP-PROJ" }
      }
    },
    { callerInstanceId: "test-agent" }
  );

  assert.equal(draftRes.id, 1);
  assert.ok(draftRes.result);
  assert.equal(draftRes.result.data.project_id, "SECB-MCP-PROJ");
  assert.equal(draftRes.result.data.mode, "proposal_only");

  const verifyRes = server.handle(
    {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "secb_project_proposed_manifest_verify",
        arguments: { project_id: "SECB-MCP-PROJ" }
      }
    },
    { callerInstanceId: "test-agent" }
  );

  assert.equal(verifyRes.id, 2);
  assert.equal(verifyRes.result.data.project_id, "SECB-MCP-PROJ");
  assert.equal(verifyRes.result.data.repository_mutation_authorized, false);
});

test("projectId cannot escape the staging boundary on any path", () => {
  // projectId arrives from an MCP tools/call argument and was only type-checked
  // and delimiter-scanned, so "../" reached join() + mkdirSync(recursive) +
  // writeFileSync. A tool that lists repository_write and directory_creation in
  // its OWN prohibited_actions was therefore an arbitrary directory-create and
  // file-write primitive anywhere the process could reach.
  const service = new ProjectRegistrationService({ stagingBaseDir: testStagingDir });
  const escapes = [
    "../escaped",
    "../../escaped",
    "a/../../escaped",
    "./../escaped",
    resolve(testStagingDir, "..", "sibling-escape"),
    "/etc/secb-escape"
  ];
  for (const projectId of escapes) {
    assert.throws(
      () => service.registerDraft({ projectId, name: "escape attempt" }),
      (error) => {
        assert.ok(error instanceof ProjectRegistrationError, `${projectId}: wrong error type`);
        assert.equal(error.code, "DENY_REGISTRATION_PATH_ESCAPE", `${projectId}: wrong code`);
        return true;
      },
      `registerDraft must refuse ${projectId}`
    );
    // Nothing may be created outside the boundary, not even the directory.
    assert.equal(existsSync(resolve(testStagingDir, "..", "escaped")), false);
    assert.equal(existsSync(resolve(testStagingDir, "..", "sibling-escape")), false);
    // The read and the second write path take the same id and must refuse too.
    assert.throws(() => service.inspectRegistration(projectId), (e) => e.code === "DENY_REGISTRATION_PATH_ESCAPE");
    assert.throws(() => service.transitionState(projectId, "REVIEW_REQUIRED"), (e) => e.code === "DENY_REGISTRATION_PATH_ESCAPE");
  }

  // The boundary itself is not a valid target either.
  assert.throws(() => service.registerDraft({ projectId: "." }), (e) => e.code === "DENY_REGISTRATION_PATH_ESCAPE");

  // A legitimate id still works, so the guard is confinement and not a blanket refusal.
  const ok = service.registerDraft({ projectId: "SECB-CONFINED-OK", name: "fine" });
  assert.equal(ok.project_id, "SECB-CONFINED-OK");
  assert.equal(existsSync(join(testStagingDir, "SECB-CONFINED-OK", "registration-package.json")), true);
});

// ---------------------------------------------------------------------------
// The two registration refusals the deny-path ratchet carried.
//
// They look redundant and are not. registerDraft's own guard rejects a falsy or
// non-string projectId; the path boundary rejects a string that is blank once
// trimmed. `"   "` passes the first and is caught by the second, which is the
// evidence that these are LAYERED rather than one shadowing the other -- and the
// second layer is the one at the filesystem boundary, where the id is about to
// become a directory name.
// ---------------------------------------------------------------------------

test("DENY_INVALID_PROJECT_ID — registerDraft refuses a missing or non-string projectId", () => {
  const service = new ProjectRegistrationService({ stagingBaseDir: testStagingDir });
  for (const projectId of [undefined, null, "", 0, 42, {}, ["SECB-ARRAY"]]) {
    assert.throws(
      () => service.registerDraft({ projectId, name: "denial case" }),
      (error) => {
        // The CLASS is asserted alongside the code. Callers catch
        // ProjectRegistrationError; a refusal that carried the right code on the
        // wrong class would pass a code-only assertion and still escape them.
        assert.ok(error instanceof ProjectRegistrationError, `${String(projectId)}: wrong error class`);
        assert.equal(error.code, "DENY_INVALID_PROJECT_ID", `${String(projectId)}: wrong code`);
        return true;
      }
    );
  }
});

test("DENY_REGISTRATION_PATH — a blank projectId is refused at the filesystem boundary", () => {
  const service = new ProjectRegistrationService({ stagingBaseDir: testStagingDir });

  // inspectRegistration has NO guard of its own, so the path boundary is the
  // only thing standing between an untrusted id and a resolve() against the
  // staging root. That is the design -- confinement is enforced where the
  // boundary actually is -- but it means this refusal is load-bearing, not
  // decorative.
  for (const projectId of [undefined, null, "", "   ", 42]) {
    assert.throws(
      () => service.inspectRegistration(projectId),
      (error) => {
        assert.ok(error instanceof ProjectRegistrationError);
        assert.equal(error.code, "DENY_REGISTRATION_PATH", `${String(projectId)}: wrong code`);
        return true;
      }
    );
  }

  // The whitespace case reaches the SAME refusal through registerDraft, whose
  // own `!projectId` check does not see it. Distinct from
  // DENY_REGISTRATION_PATH_ESCAPE, which is a well-formed id that resolves
  // outside the boundary; this is an id that names nothing at all.
  assert.throws(
    () => service.registerDraft({ projectId: "   ", name: "blank after trim" }),
    (error) => error.code === "DENY_REGISTRATION_PATH"
  );
});

// ---------------------------------------------------------------------------
// The service's OWN refusal on an authorized transition.
//
// Found by tools/per-site-demonstration.mjs, and findable no other way here:
// DENY_UNAUTHORIZED_MUTATION is demonstrated in bootstrap-authorization-gate,
// so the deny-path ratchet — which keys by code name — read it as covered while
// this module's copy had never fired.
//
// It had never fired because the gate refuses first with its own check, so no
// call THROUGH the gate reaches this one. transitionState is public, though, and
// a caller reaching it directly bypasses the gate entirely. This is the last
// line, and a last line nobody has seen fire is not a line.
// ---------------------------------------------------------------------------

test("DENY_UNAUTHORIZED_MUTATION — no state becomes AUTHORIZED without a signed record", () => {
  const service = new ProjectRegistrationService({ stagingBaseDir: testStagingDir });
  service.registerDraft({ projectId: "SECB-AUTHZ-001", name: "authorization boundary" });

  // BOTH authorized states, not one. A guard that covered only
  // AUTHORIZED_FOR_BOOTSTRAP would pass a test that exercised only that state,
  // and AUTHORIZED_FOR_IMPLEMENTATION is the one that permits repository writes.
  for (const targetState of ["AUTHORIZED_FOR_BOOTSTRAP", "AUTHORIZED_FOR_IMPLEMENTATION"]) {
    for (const [what, record] of [
      ["no record at all", undefined],
      ["an explicitly null record", null],
      ["a record with no reviewer signature", { approver: "operator" }],
      ["a record whose signature is blank", { approver: "operator", reviewerSignature: "" }]
    ]) {
      assert.throws(
        () => service.transitionState("SECB-AUTHZ-001", targetState, record),
        (error) => {
          assert.ok(error instanceof ProjectRegistrationError, `${targetState} / ${what}: wrong error class`);
          assert.equal(error.code, "DENY_UNAUTHORIZED_MUTATION", `${targetState} / ${what}: wrong code`);
          return true;
        },
        `${targetState} / ${what}`
      );
    }
  }
});

test("the authorization requirement is scoped to the authorized states, not blanket", () => {
  // The other half of the property. A guard that demanded a signed record for
  // EVERY transition would satisfy the test above completely while breaking the
  // ordinary lifecycle — and nothing above would notice, because refusing too
  // much looks identical to refusing correctly when you only test refusals.
  const service = new ProjectRegistrationService({ stagingBaseDir: testStagingDir });
  service.registerDraft({ projectId: "SECB-AUTHZ-002", name: "unauthorized stages still move" });

  const moved = service.transitionState("SECB-AUTHZ-002", "REVIEW_REQUIRED");
  assert.equal(moved.status, "REVIEW_REQUIRED");

  // And an unknown stage is a different refusal entirely.
  assert.throws(
    () => service.transitionState("SECB-AUTHZ-002", "AUTHORIZED_FOR_EVERYTHING"),
    (error) => error.code === "INVALID_LIFECYCLE_STAGE"
  );
});
