import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { canonicalFingerprint } from "../src/contracts/canonical-fingerprint.mjs";
import { DurableContextReplayAdapter, DurableContextReplayError } from "../src/services/durable-context-replay-adapter.mjs";
import { DurableHeadAnchor } from "../src/ledger/durable-head-anchor.mjs";

const ANCHOR_KEY = Buffer.alloc(32, 0x43);

function adapter(filePath, contextFederation) {
  const headAnchor = new DurableHeadAnchor({ filePath: `${filePath}.head`, ledgerId: "secb-context-replay-ledger",
    integrityKey: ANCHOR_KEY });
  return new DurableContextReplayAdapter({ filePath, contextFederation, headAnchor });
}

const withTemp = (run) => {
  const directory = mkdtempSync(join(tmpdir(), "secb-context-replay-"));
  try { return run(directory); } finally { rmSync(directory, { recursive: true, force: true }); }
};

function request(overrides = {}) {
  return {
    document: {
      receipt_id: "receipt-1", project_id: "project-1", work_package_id: "wp-1", session_id: "session-1",
      freshness_timestamp: "2026-08-03T12:00:00.000Z", content_hash: "a".repeat(64),
      ...(overrides.document ?? {})
    },
    candidateSources: [], actorId: "actor-1", authorityRef: "authority-1", baseline: "b".repeat(40),
    idempotencyKey: "context-issue-1", ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== "document"))
  };
}

function provider() {
  const issued = new Map();
  const calls = { issue: 0, replay: 0 };
  const key = (value) => canonicalFingerprint({ project: value.document.project_id,
    receipt: value.document.receipt_id, idempotency: value.idempotencyKey });
  const fingerprint = (value) => canonicalFingerprint(value);
  return {
    calls,
    issueReceipt(value) {
      calls.issue += 1;
      const identity = key(value);
      const prior = issued.get(identity);
      if (prior && prior.fingerprint !== fingerprint(value)) throw Object.assign(new Error("conflict"), { code: "DENY_IDEMPOTENCY_CONFLICT" });
      if (prior) return { ...structuredClone(prior.result), replayed: true };
      const result = { receiptId: value.document.receipt_id, projectId: value.document.project_id, version: 1,
        state: "ISSUED", boundWpVersion: 1, expiresAt: "2026-08-04T12:00:00.000Z", exclusions: [], replayed: false };
      issued.set(identity, { fingerprint: fingerprint(value), result });
      return structuredClone(result);
    },
    replayReceipt(value) {
      calls.replay += 1;
      const prior = issued.get(key(value));
      if (!prior) throw Object.assign(new Error("miss"), { code: "DENY_CONTEXT_REPLAY_MISS" });
      if (prior.fingerprint !== fingerprint(value)) throw Object.assign(new Error("conflict"), { code: "DENY_IDEMPOTENCY_CONFLICT" });
      return { ...structuredClone(prior.result), replayed: true };
    }
  };
}

test("durable replay survives adapter restart without invoking the provider", () => withTemp((directory) => {
  const filePath = join(directory, "replay.ndjson");
  const firstProvider = provider();
  const first = adapter(filePath, firstProvider);
  const issued = first.issueReceipt(request());
  assert.equal(issued.replayed, false);
  assert.equal(first.verify().count, 1);

  const unavailable = {
    issueReceipt() { throw new Error("provider unavailable"); },
    replayReceipt() { throw new Error("provider unavailable"); }
  };
  const restarted = adapter(filePath, unavailable);
  const replayed = restarted.replayReceipt(request());
  assert.equal(replayed.replayed, true);
  assert.equal(replayed.receiptId, issued.receiptId);
  assert.equal(restarted.verify().count, 1);
}));

test("replay-only miss never persists and can recover a provider issuance without mutating the ledger", () => withTemp((directory) => {
  const filePath = join(directory, "replay.ndjson");
  const context = provider();
  const replayAdapter = adapter(filePath, context);
  assert.throws(() => replayAdapter.replayReceipt(request()), (error) => error.code === "DENY_CONTEXT_REPLAY_MISS");
  assert.equal(replayAdapter.verify().count, 0);

  const original = context.issueReceipt(request()); // models a crash after Context issuance and before adapter persistence
  const recovered = replayAdapter.replayReceipt(request());
  assert.equal(recovered.receiptId, original.receiptId);
  assert.equal(recovered.replayed, true);
  assert.equal(replayAdapter.verify().count, 0);
}));

test("exact durable identity rejects request drift and competing instances converge", () => withTemp((directory) => {
  const filePath = join(directory, "replay.ndjson");
  const context = provider();
  const left = adapter(filePath, context);
  const right = adapter(filePath, context);
  left.issueReceipt(request());
  assert.equal(right.issueReceipt(request()).replayed, true);
  assert.equal(right.verify().count, 1);
  assert.throws(() => right.replayReceipt(request({ baseline: "c".repeat(40) })),
    (error) => error instanceof DurableContextReplayError && error.code === "DENY_IDEMPOTENCY_CONFLICT");
}));

test("tampered durable replay evidence fails closed", () => withTemp((directory) => {
  const filePath = join(directory, "replay.ndjson");
  const replayAdapter = adapter(filePath, provider());
  replayAdapter.issueReceipt(request());
  const record = JSON.parse(readFileSync(filePath, "utf8").trim());
  record.entry.payload.result.receiptId = "forged";
  writeFileSync(filePath, `${JSON.stringify(record)}\n`);
  assert.throws(() => replayAdapter.replayReceipt(request()), (error) => error.code === "LEDGER_INTEGRITY_FAILURE");
}));

test("trusted head rejects a valid old replay-ledger prefix after rollback", () => withTemp((directory) => {
  const filePath = join(directory, "replay.ndjson");
  const replayAdapter = adapter(filePath, provider());
  replayAdapter.issueReceipt(request());
  replayAdapter.issueReceipt(request({ document: { receipt_id: "receipt-2" }, idempotencyKey: "context-issue-2" }));
  const [oldPrefix] = readFileSync(filePath, "utf8").trim().split(/\r?\n/);
  writeFileSync(filePath, `${oldPrefix}\n`);
  assert.throws(() => replayAdapter.replayReceipt(request()),
    (error) => error.code === "REPLAY_LEDGER_ROLLBACK_DETECTED");
}));

test("construction requires the trusted head collaborator", () => withTemp((directory) => {
  assert.throws(() => new DurableContextReplayAdapter({ filePath: join(directory, "replay.ndjson"),
    contextFederation: provider() }),
  (error) => error instanceof DurableContextReplayError && error.code === "INVALID_REPLAY_HEAD_ANCHOR");
}));

test("unsafe request graphs are denied before either provider operation", () => withTemp((directory) => {
  const context = provider();
  const replayAdapter = adapter(join(directory, "replay.ndjson"), context);
  const hostile = request();
  Object.defineProperty(hostile, "baseline", { enumerable: true, get() { throw new Error("getter ran"); } });
  assert.throws(() => replayAdapter.issueReceipt(hostile), (error) => error.code === "DENY_REPLAY_MALFORMED");
  assert.deepEqual(context.calls, { issue: 0, replay: 0 });
}));
