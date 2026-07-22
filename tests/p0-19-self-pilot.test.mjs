import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { DurableLedger } from "../src/ledger/durable-ledger.mjs";
import { EventLedger } from "../src/ledger/governed-ledgers.mjs";
import { WorkspaceLeaseLedger } from "../src/ledger/workspace-lease-ledger.mjs";
import { buildSelfPilotFixtures, PILOT_NOW_ISO } from "../src/self-pilot/fixtures.mjs";
import {
  runReadOnlySelfPilot,
  READ_ONLY_SELF_PILOT_STEPS,
  GOV_DECISION_SLOT,
  SelfPilotError
} from "../src/self-pilot/read-only-self-pilot.mjs";

// P0-19 READ-ONLY SELF-PILOT — candidate proof (AMD-002 clause 3). Proves the
// governed chain COMPOSES and GATES read-only over fixtures, that each step is
// gated by the real primitive, that the GOV decision slot is NEVER auto-filled,
// that no real mutation/spawn/remote occurs, and that no composed primitive
// source file was modified (byte-identity guard).

const ROOT = resolve(import.meta.dirname, "..");
const now = () => new Date(PILOT_NOW_ISO);

// Fixture-backed ledgers in a throwaway temp dir. The pilot NEVER opens its own
// store; the caller injects these ephemeral instances.
function withPilotLedgers(operation) {
  const dir = mkdtempSync(join(tmpdir(), "secb-self-pilot-"));
  try {
    const eventLedger = new EventLedger({ filePath: join(dir, "events.jsonl") });
    const evidenceSealLedger = new DurableLedger({ filePath: join(dir, "evidence-seals.ndjson"), ledgerId: "secb-evidence-seal-ledger" });
    const workspaceLeaseLedger = new WorkspaceLeaseLedger({ filePath: join(dir, "workspace-leases.jsonl") });
    return operation({ dir, ledgers: { eventLedger, evidenceSealLedger, workspaceLeaseLedger } });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function runPilot({ driveGov = true } = {}) {
  return withPilotLedgers(({ dir, ledgers }) => {
    const fixtures = buildSelfPilotFixtures({ driveGov });
    const trace = runReadOnlySelfPilot({ fixtures, now, ledgers });
    return { trace, dir };
  });
}

function stepOf(trace, name) {
  return trace.steps.find((s) => s.step === name);
}

test("full chain runs end-to-end read-only over fixtures and completes", () => {
  const { trace } = runPilot();
  assert.equal(trace.halted, false);
  assert.equal(trace.completed, true);
  assert.equal(trace.mode, "READ_ONLY");
  assert.equal(trace.read_only, true);
  assert.equal(trace.authorized_execution, false);
  assert.equal(trace.self_authorized, false);
  assert.equal(trace.candidate, true);
  assert.equal(trace.p0_19_complete, false);
  assert.equal(trace.p0_20_verdict_rendered, false);
  assert.equal(trace.activation, false);

  // Every declared step is present, in order, and PASS.
  assert.deepEqual(trace.steps.map((s) => s.step), [...READ_ONLY_SELF_PILOT_STEPS]);
  for (const s of trace.steps) {
    assert.equal(s.status, "PASS", `${s.step} should PASS: ${JSON.stringify(s.detail)}`);
  }
});

test("trace is deep-frozen and self-certifies advisory-only", () => {
  const { trace } = runPilot();
  assert.equal(Object.isFrozen(trace), true);
  assert.equal(Object.isFrozen(trace.steps), true);
  assert.equal(Object.isFrozen(trace.gov_decision), true);
  const cert = trace.self_certification;
  assert.equal(cert.certification_scope, "advisory_only");
  assert.equal(cert.execution_authority, false);
  assert.equal(cert.approval_authority, false);
  assert.equal(cert.ready_for_operator_review, true);
});

test("each step names the real primitive that gates it", () => {
  const { trace } = runPilot();
  const gates = Object.fromEntries(trace.steps.map((s) => [s.step, s.primitive]));
  assert.match(gates.WORK_PACKAGE, /work-package-service/);
  assert.match(gates.AGENT_IDENTITY, /runtime-registry/);
  assert.match(gates.CONTEXT_RECEIPT, /context-federation-service/);
  assert.match(gates.RUNTIME_ADAPTER, /host-runtime-agent/);
  assert.match(gates.WORKSPACE_LEASE, /workspace-lease-policy/);
  assert.match(gates.OBSERVED_EXECUTION, /access-mode-policy/);
  assert.match(gates.EVENT_AND_EVIDENCE, /evidence-envelope-service/);
});

test("replayable trace: two runs over the same fixtures produce an identical trace", () => {
  const a = runPilot().trace;
  const b = runPilot().trace;
  // The whole trace is deterministic (no ambient-derived field is embedded);
  // JSON equality is byte-for-byte replay identity.
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

test("replay package view segregates streams and reconciles the event stream", () => {
  const { trace } = runPilot();
  assert.equal(trace.replay.ok, true);
  assert.deepEqual(trace.replay.package.streams, {
    eventRecords: 3,
    evidenceRecords: 1,
    contextReceipts: 1,
    handoffEnvelopes: 0,
    policyDecisions: 2
  });
  // Three sequential read-only events -> no disorder/gap findings.
  assert.deepEqual(trace.replay.package.findings, []);
  assert.deepEqual(trace.replay.package.gaps, []);
});

test("GATE: a Work Package that cannot reach AUTHORIZED halts the chain", () => {
  const { trace } = runPilot({ driveGov: false });
  assert.equal(trace.halted, true);
  assert.equal(trace.halted_at, "WORK_PACKAGE");
  assert.equal(trace.completed, false);
  assert.equal(trace.self_certification.ready_for_operator_review, false);

  const wpStep = stepOf(trace, "WORK_PACKAGE");
  assert.equal(wpStep.status, "DENIED");
  // Every later step is recorded SKIPPED (deny-by-default, fail-closed).
  const later = READ_ONLY_SELF_PILOT_STEPS.slice(READ_ONLY_SELF_PILOT_STEPS.indexOf("WORK_PACKAGE") + 1);
  for (const name of later) {
    assert.equal(stepOf(trace, name).status, "SKIPPED", `${name} must be SKIPPED after halt`);
  }
  // Even a halted run never fills the GOV slot.
  assert.equal(trace.gov_decision.verdict, null);
});

test("GATE: unaccepted evidence cannot advance; producer cannot self-verify (SoD)", () => {
  const { trace } = runPilot();
  const detail = trace.chain.event_and_evidence;
  assert.equal(detail.event_ledger.verified, true);
  assert.equal(detail.event_ledger.count, 3);
  const ev = detail.evidence[0];
  assert.equal(ev.verification_status, "VERIFICATION_PENDING");
  assert.equal(ev.accepted, false);
  assert.equal(ev.self_verify_denied, "DENY_VERIFIER_IS_PRODUCER");

  // The independent REV/QA slots stay pending and unassigned.
  assert.equal(trace.chain.independent_review.rev.status, "PENDING_INDEPENDENT");
  assert.equal(trace.chain.independent_review.rev.verdict, null);
  assert.equal(trace.chain.independent_review.qa.verdict, null);
  assert.equal(trace.chain.independent_review.evidence_acceptance.acceptor, null);
});

test("GATE: a lease over-reaching the write-set is denied; a contained set is allowed", () => {
  const { trace } = runPilot();
  const lease = trace.chain.workspace_lease;
  assert.equal(lease.contained_request_allowed, true);
  assert.equal(lease.over_reach_denied_code, "DENY_LEASE_WRITE_SET_EXCEEDED");
  assert.equal(lease.worktree_materialized, false);
});

test("GATE: read-only Observe is allowed but escalation to Control is denied", () => {
  const { trace } = runPilot();
  const observed = trace.chain.observed_execution;
  assert.equal(observed.access_mode, "Observe");
  assert.equal(observed.escalation_denied_code, "DENY_ACCESS_ESCALATION");
  assert.equal(observed.event_count, 3);
  // Every observation is a known event family and read-only.
  assert.deepEqual(observed.events.map((e) => e.family).sort(), ["file", "git", "test"]);
});

test("GOV decision slot is NEVER auto-filled: the pilot cannot self-render a verdict", () => {
  const { trace } = runPilot();
  // The slot is the frozen operator-only constant, verdict + renderer null.
  assert.equal(trace.gov_decision, GOV_DECISION_SLOT);
  assert.equal(trace.gov_decision.verdict, null);
  assert.equal(trace.gov_decision.rendered_by, null);
  assert.equal(trace.gov_decision.status, "PENDING_OPERATOR");
  assert.equal(trace.gov_decision.authority, "HUMAN_GOV_REQUIRED");
  assert.equal(trace.gov_decision.effective, false);
  assert.equal(Object.isFrozen(GOV_DECISION_SLOT), true);
  // The module exports no verdict-setter; the completed run still leaves it empty.
  assert.equal(trace.p0_20_verdict_rendered, false);
});

test("outcome receipt is a schema-valid but NON-EFFECTIVE candidate outcome", () => {
  const { trace } = runPilot();
  const outcome = trace.chain.outcome_receipt;
  assert.equal(outcome.effective, false);
  assert.equal(outcome.reversion_required, false);
  assert.equal(outcome.outcome_status, "INVALIDATED");
});

test("deny-by-default config: the pilot refuses to run without injected fixture ledgers", () => {
  const fixtures = buildSelfPilotFixtures();
  assert.throws(
    () => runReadOnlySelfPilot({ fixtures, now, ledgers: {} }),
    (err) => err instanceof SelfPilotError && err.code === "DENY_CONFIG"
  );
  assert.throws(
    () => runReadOnlySelfPilot({ fixtures, now }),
    (err) => err instanceof SelfPilotError && err.code === "DENY_CONFIG"
  );
  assert.throws(
    () => runReadOnlySelfPilot({ now, ledgers: {} }),
    (err) => err instanceof SelfPilotError && err.code === "DENY_CONFIG"
  );
});

test("no real mutation/spawn/remote: pilot source imports no process/network capability", () => {
  const forbidden = /child_process|node:net|node:http|node:https|node:dgram|node:tls|\.spawn\(|execSync|execFileSync|spawnSync|fetch\(|require\(/;
  for (const rel of ["src/self-pilot/read-only-self-pilot.mjs", "src/self-pilot/fixtures.mjs"]) {
    const source = readFileSync(resolve(ROOT, rel), "utf8");
    assert.equal(forbidden.test(source), false, `${rel} must not reference process/network primitives`);
  }
});

test("no real mutation: pilot writes only into the injected ephemeral ledger dir", () => {
  withPilotLedgers(({ dir, ledgers }) => {
    const fixtures = buildSelfPilotFixtures();
    const trace = runReadOnlySelfPilot({ fixtures, now, ledgers });
    assert.equal(trace.halted, false);
    // All writes landed in the injected temp dir, under the OS temp root.
    assert.equal(dir.startsWith(tmpdir()), true);
    const files = readdirSync(dir).sort();
    assert.deepEqual(files, ["events.jsonl", "evidence-seals.ndjson", "workspace-leases.jsonl"]);
  });
});

// ---------------------------------------------------------------------------
// Byte-identity guard (base main @ 385ac65). Every composed primitive source
// file is pinned to its git blob hash at the pilot's base commit; the pilot
// COMPOSES them and modifies none. MANIFEST.json is excluded (this candidate
// intentionally appends its new file entries there).
//
// PIN UPDATE (bst/mod-evid-s2-s3-ledger-rehydration-fix-001, disclosed): the
// evidence-envelope-service.mjs pin below was advanced from
// "62359eb1a209cbb868332f4f324e1e0cb203644f" to reflect the ledger-
// rehydration fix for the second independent MOD-EVID S2/S3 review's finding
// #4 (docs/03-project-control/candidates/mod-evid-s2-s3-second-independent-review-001.md) --
// a real, intentional, security-relevant source change to that file, not
// composition drift. This guard exists to catch the self-pilot module
// silently mutating a primitive it only composes; it is not meant to freeze
// a primitive against its own legitimate bugfixes forever. Every other
// pinned hash below is unchanged and still asserts byte-identity to main @
// 385ac65.
//
// PIN UPDATE #2 (same branch, disclosed): the evidence-envelope-service.mjs
// pin below was advanced AGAIN, from "c7ea62a20e093415fb90b5321eceb71453d037bd"
// to "0843d4a9b0c966c13135890ec91a87c823911d30", to reflect a fast-follow fix
// on top of the same branch closing the independent review of the
// rehydration fix ITSELF (docs/03-project-control/candidates/
// mod-evid-s2-s3-ledger-rehydration-fix-independent-review-001.md, finding
// #4): #rehydrate() now runs the SAME #assertEdge edge-legality check the
// live ladder methods already use on every ledger entry's claimed status
// transition, instead of copying it verbatim. Again a real, intentional,
// security-relevant source change to that one file, not composition drift.
//
// PIN UPDATE #3 (same branch, disclosed): the evidence-envelope-service.mjs
// pin below was advanced AGAIN, from "0843d4a9b0c966c13135890ec91a87c823911d30"
// to "b4ea87196e239d590711b4c7acd0f17b7f331afb", to reflect the round-3
// transition-guard convergence fast-follow closing the round-3 independent
// review's finding (docs/03-project-control/candidates/
// mod-evid-s2-s3-rehydration-edge-legality-fix-independent-review-001.md,
// section 5): #assertEdge alone validated the ABSTRACT
// STATE_MACHINES.Evidence graph, but sealEnvelope, requestVerification,
// recordVerification, and acceptEvidence each enforce a NARROWER rule
// (fixed single target, pinned source status, verdict/approvals/SoD shape)
// than raw graph-edge legality. Every ladder transition's full guard is now
// factored into one shared private method per transition, called identically
// by the live method (its own arguments) and by #rehydrate() (values folded
// from the ledger), so the two paths can never again drift apart on how much
// legality each one checks. Once more a real, intentional, security-relevant
// source change to that one file, not composition drift.
//
// PIN UPDATE #4 (same branch, disclosed): the evidence-envelope-service.mjs
// pin below was advanced AGAIN, from "b4ea87196e239d590711b4c7acd0f17b7f331afb"
// to "264b1c24ab78f427b6a4f0fbcfe55140bc953485", to reflect the round-4
// envelope-establishment convergence fast-follow closing the round-4
// independent review's finding (docs/03-project-control/candidates/
// mod-evid-s2-s3-rehydration-guard-parity-fix-independent-review-001.md,
// section 6): round 3 converged every live method's TRANSITION guard with
// #rehydrate(), but none of those guards ever ran on a record's CREATION --
// the first EVIDENCE_SEAL entry for a never-before-seen key, the sole
// ledger-visible proxy for registerEnvelope()'s own creation-time
// validation (registerEnvelope() itself never reaches the ledger).
// registerEnvelope()'s schema gate, content_hash self-consistency check,
// and forge-on-entry status check are now factored into one shared private
// method, #assertEnvelopeEstablishment, called by both registerEnvelope()
// and #rehydrate()'s EVIDENCE_SEAL first-sighting branch. Once more a real,
// intentional, security-relevant source change to that one file, not
// composition drift.
// ---------------------------------------------------------------------------
const NUL = String.fromCharCode(0);
const PINNED_BLOBS = Object.freeze({
  "src/services/work-package-service.mjs": "6b2af450726cef0b7f74601834b4f91c7db19ed2",
  "src/services/context-federation-service.mjs": "7eb57a289b8331d5576703c5c656624c98f1c029",
  "src/services/context-retrieval-policy.mjs": "a7ba0120fc6a0e3b7469f264e52ea4d0c76ec7ff",
  "src/services/evidence-envelope-service.mjs": "264b1c24ab78f427b6a4f0fbcfe55140bc953485",
  "src/registry/runtime-registry.mjs": "d6e1ce8897940901a9a9b8d339676d0abae67c35",
  "src/registry/adapters.mjs": "34269ca2767b60d0c511373fe19c84bbe393cee7",
  "src/host/host-runtime-agent.mjs": "fbbec1dccb9e09dc639c07f86fea336ba4e00370",
  "src/ledger/durable-ledger.mjs": "6be08fc14ff31a7c871c5e86888af42285d40529",
  "src/ledger/governed-ledgers.mjs": "32ff590386574311ff5fcdce846b40bcfe2a1f07",
  "src/ledger/workspace-lease-ledger.mjs": "7c0251727ffd516d2e1b5251efeb2d2f2e9525e0",
  "src/control/workspace-lease-policy.mjs": "c24cb94edebdfa19dccd89a9b7ed593be08d042b",
  "src/control/write-set-policy.mjs": "5f1e119c8089ba8250f3596164c0974662587449",
  "src/live/access-mode-policy.mjs": "5d96eec7af6e717218a81ea5563e09c6b18d191b",
  "src/live/event-family-policy.mjs": "47ebc9bb7e5190c6f0f78232884379b3c284248d",
  "src/live/replay-assembler.mjs": "6ba6e4b143ad3662c7dc2f364a8ff665002667d6",
  "src/contracts/canonical-fingerprint.mjs": "721e99032ce7040312e77138c8f156b649fd996e",
  "src/contracts/contract-validator.mjs": "306a3d23ef748ffb987cd35d9ab4cf60264f32bc"
});

// git blob hash: sha1("blob <byteLength>\0" + content). CRLF normalized to LF
// first, replicating git's clean filter on this Windows checkout — the pinned
// hashes are what `git rev-parse 385ac65:<file>` reports.
function gitBlobSha1(rel) {
  const normalized = readFileSync(resolve(ROOT, rel), "utf8").replace(/\r\n/g, "\n");
  const body = Buffer.from(normalized, "utf8");
  const header = Buffer.from(`blob ${body.length}${NUL}`, "utf8");
  return createHash("sha1").update(header).update(body).digest("hex");
}

test("byte-identity: every composed primitive is unchanged vs main @ 385ac65", () => {
  for (const [rel, pinned] of Object.entries(PINNED_BLOBS)) {
    assert.equal(gitBlobSha1(rel), pinned, `${rel} must be blob-identical to main @ 385ac65`);
  }
});
