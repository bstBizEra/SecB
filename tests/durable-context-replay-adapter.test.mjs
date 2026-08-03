import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import { canonicalFingerprint } from "../src/contracts/canonical-fingerprint.mjs";
import { DurableContextReplayAdapter, DurableContextReplayError } from "../src/services/durable-context-replay-adapter.mjs";
import { DurableHeadAnchor } from "../src/ledger/durable-head-anchor.mjs";

const ANCHOR_KEY = Buffer.alloc(32, 0x43);

function adapter(filePath, contextFederation, suppliedAnchor) {
  const headAnchor = suppliedAnchor ?? new DurableHeadAnchor({ filePath: `${filePath}.head`, ledgerId: "secb-context-replay-ledger",
    integrityKey: ANCHOR_KEY, initialize: true });
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

test("crash after ledger append is replayable without mutation and finalizes on issue retry", () => withTemp((directory) => {
  const filePath = join(directory, "replay.ndjson");
  const context = provider();
  const realAnchor = new DurableHeadAnchor({ filePath: `${filePath}.head`, ledgerId: "secb-context-replay-ledger",
    integrityKey: ANCHOR_KEY, initialize: true });
  let crash = true;
  const crashAfterAppend = {
    snapshot: realAnchor.snapshot.bind(realAnchor),
    prepare: realAnchor.prepare.bind(realAnchor),
    markDurable: realAnchor.markDurable.bind(realAnchor),
    finalize(input) {
      if (crash) { crash = false; throw Object.assign(new Error("simulated crash"), { code: "SIMULATED_CRASH" }); }
      return realAnchor.finalize(input);
    }
  };
  assert.throws(() => adapter(filePath, context, crashAfterAppend).issueReceipt(request()),
    (error) => error.code === "SIMULATED_CRASH");
  assert.deepEqual(realAnchor.read(), { count: 0, headHash: "0".repeat(64) });
  assert.equal(realAnchor.readPending().count, 1);

  const restarted = adapter(filePath, context, realAnchor);
  const anchorBeforeReplay = realAnchor.read();
  assert.equal(restarted.replayReceipt(request()).replayed, true);
  assert.deepEqual(realAnchor.read(), anchorBeforeReplay); // replay-only path does not finalize
  assert.equal(realAnchor.readPending().count, 1);
  assert.equal(restarted.issueReceipt(request()).replayed, true);
  assert.equal(realAnchor.readPending(), null);
  assert.equal(restarted.verify().count, 1);
}));

test("crash after authenticated prepare resumes the same issuance identity", () => withTemp((directory) => {
  const filePath = join(directory, "replay.ndjson");
  const context = provider();
  const realAnchor = new DurableHeadAnchor({ filePath: `${filePath}.head`, ledgerId: "secb-context-replay-ledger",
    integrityKey: ANCHOR_KEY, initialize: true });
  let crash = true;
  const crashAfterPrepare = {
    snapshot: realAnchor.snapshot.bind(realAnchor),
    prepare(input) {
      const prepared = realAnchor.prepare(input);
      if (crash) { crash = false; throw Object.assign(new Error("simulated crash"), { code: "SIMULATED_CRASH" }); }
      return prepared;
    },
    markDurable: realAnchor.markDurable.bind(realAnchor), finalize: realAnchor.finalize.bind(realAnchor)
  };
  assert.throws(() => adapter(filePath, context, crashAfterPrepare).issueReceipt(request()),
    (error) => error.code === "SIMULATED_CRASH");
  assert.equal(adapter(filePath, context, realAnchor).verify().count, 0);
  assert.equal(adapter(filePath, context, realAnchor).replayReceipt(request()).replayed, true);
  const resumed = adapter(filePath, context, realAnchor).issueReceipt(request());
  assert.equal(resumed.replayed, false);
  assert.equal(realAnchor.readPending(), null);
  assert.equal(realAnchor.read().count, 1);
}));

test("PREPARED ledger tail is not replay-trusted until fsync durability is recorded", () => withTemp((directory) => {
  const filePath = join(directory, "replay.ndjson");
  const context = provider();
  const realAnchor = new DurableHeadAnchor({ filePath: `${filePath}.head`, ledgerId: "secb-context-replay-ledger",
    integrityKey: ANCHOR_KEY, initialize: true });
  let crash = true;
  const crashBeforeDurable = {
    snapshot: realAnchor.snapshot.bind(realAnchor), prepare: realAnchor.prepare.bind(realAnchor),
    markDurable(input) {
      if (crash) { crash = false; throw Object.assign(new Error("simulated pre-durable crash"), { code: "SIMULATED_CRASH" }); }
      return realAnchor.markDurable(input);
    },
    finalize: realAnchor.finalize.bind(realAnchor)
  };
  assert.throws(() => adapter(filePath, context, crashBeforeDurable).issueReceipt(request()),
    (error) => error.code === "SIMULATED_CRASH");
  assert.equal(realAnchor.readPending().phase, "PREPARED");
  const replayCallsBefore = context.calls.replay;
  const restarted = adapter(filePath, context, realAnchor);
  assert.equal(restarted.replayReceipt(request()).replayed, true);
  assert.equal(context.calls.replay, replayCallsBefore + 1); // untrusted tail was ignored; provider replay supplied the result
  assert.equal(realAnchor.readPending().phase, "PREPARED");
  assert.equal(restarted.issueReceipt(request()).replayed, true);
  assert.equal(realAnchor.readPending(), null);
  assert.equal(restarted.verify().count, 1);
}));

test("finalize interleaving between atomic head snapshots retries without false rollback", () => withTemp((directory) => {
  const filePath = join(directory, "replay.ndjson");
  const context = provider();
  const realAnchor = new DurableHeadAnchor({ filePath: `${filePath}.head`, ledgerId: "secb-context-replay-ledger",
    integrityKey: ANCHOR_KEY, initialize: true });
  let suppressFinalize = true;
  const leaveDurablePending = {
    snapshot: realAnchor.snapshot.bind(realAnchor), prepare: realAnchor.prepare.bind(realAnchor),
    markDurable: realAnchor.markDurable.bind(realAnchor),
    finalize(input) {
      if (suppressFinalize) { suppressFinalize = false; throw Object.assign(new Error("pause at durable"), { code: "SIMULATED_CRASH" }); }
      return realAnchor.finalize(input);
    }
  };
  assert.throws(() => adapter(filePath, context, leaveDurablePending).issueReceipt(request()),
    (error) => error.code === "SIMULATED_CRASH");
  let interleave = true;
  const interleavingAnchor = {
    snapshot() {
      const snapshot = realAnchor.snapshot();
      if (interleave && snapshot.pending?.phase === "DURABLE") {
        interleave = false;
        realAnchor.finalize({ expected: snapshot.current,
          next: { count: snapshot.pending.count, headHash: snapshot.pending.headHash }, commitment: snapshot.pending.commitment });
      }
      return snapshot;
    },
    prepare: realAnchor.prepare.bind(realAnchor), markDurable: realAnchor.markDurable.bind(realAnchor),
    finalize: realAnchor.finalize.bind(realAnchor)
  };
  const replayed = adapter(filePath, context, interleavingAnchor).replayReceipt(request());
  assert.equal(replayed.replayed, true);
  assert.equal(realAnchor.readPending(), null);
}));

test("full peer commit between ledger verification and anchor read retries instead of false rollback", () => withTemp((directory) => {
  const filePath = join(directory, "replay.ndjson");
  const context = provider();
  const realAnchor = new DurableHeadAnchor({ filePath: `${filePath}.head`, ledgerId: "secb-context-replay-ledger",
    integrityKey: ANCHOR_KEY, initialize: true });
  const writer = adapter(filePath, context, realAnchor);
  let snapshots = 0;
  const racingAnchor = {
    snapshot() {
      snapshots += 1;
      if (snapshots === 2) writer.issueReceipt(request());
      return realAnchor.snapshot();
    },
    prepare: realAnchor.prepare.bind(realAnchor), markDurable: realAnchor.markDurable.bind(realAnchor),
    finalize: realAnchor.finalize.bind(realAnchor)
  };
  const reader = adapter(filePath, context, racingAnchor);
  const replayed = reader.replayReceipt(request());
  assert.equal(replayed.replayed, true);
  assert.equal(reader.verify().count, 1);
}));

test("construction requires the trusted head collaborator", () => withTemp((directory) => {
  assert.throws(() => new DurableContextReplayAdapter({ filePath: join(directory, "replay.ndjson"),
    contextFederation: provider() }),
  (error) => error instanceof DurableContextReplayError && error.code === "INVALID_REPLAY_HEAD_ANCHOR");
}));

test("exhausted writer contention is retryable and reconciles on the next exact issue", () => withTemp((directory) => {
  const filePath = join(directory, "replay.ndjson");
  const context = provider();
  const replayAdapter = adapter(filePath, context);
  const anchorLock = `${filePath}.head.lock`;
  mkdirSync(anchorLock);
  assert.throws(() => replayAdapter.issueReceipt(request()), (error) => error.code === "REPLAY_RECEIPT_RETRYABLE");
  rmSync(anchorLock, { recursive: true, force: true });
  const recovered = replayAdapter.issueReceipt(request());
  assert.equal(recovered.receiptId, "receipt-1");
  assert.equal(replayAdapter.verify().count, 1);
}));

test("unsafe request graphs are denied before either provider operation", () => withTemp((directory) => {
  const context = provider();
  const replayAdapter = adapter(join(directory, "replay.ndjson"), context);
  const hostile = request();
  Object.defineProperty(hostile, "baseline", { enumerable: true, get() { throw new Error("getter ran"); } });
  assert.throws(() => replayAdapter.issueReceipt(hostile), (error) => error.code === "DENY_REPLAY_MALFORMED");
  const deep = request();
  let cursor = deep.document;
  for (let index = 0; index < 70; index += 1) { cursor.nested = {}; cursor = cursor.nested; }
  assert.throws(() => replayAdapter.issueReceipt(deep), (error) => error.code === "DENY_REPLAY_MALFORMED");
  assert.deepEqual(context.calls, { issue: 0, replay: 0 });
}));

function childResult(child) {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() }));
  });
}

test("two OS-process replay adapters converge on one durable receipt", async () => {
  const directory = mkdtempSync(join(tmpdir(), "secb-replay-process-"));
  try {
    const filePath = join(directory, "replay.ndjson");
    new DurableHeadAnchor({ filePath: `${filePath}.head`, ledgerId: "secb-context-replay-ledger",
      integrityKey: ANCHOR_KEY, initialize: true });
    const replayUrl = pathToFileURL(join(process.cwd(), "src/services/durable-context-replay-adapter.mjs")).href;
    const anchorUrl = pathToFileURL(join(process.cwd(), "src/ledger/durable-head-anchor.mjs")).href;
    const requestValue = request();
    const script = `
      import { DurableContextReplayAdapter } from ${JSON.stringify(replayUrl)};
      import { DurableHeadAnchor } from ${JSON.stringify(anchorUrl)};
      const filePath = process.argv[1];
      const anchor = new DurableHeadAnchor({ filePath: filePath + ".head", ledgerId: "secb-context-replay-ledger", integrityKey: Buffer.from(process.argv[2], "hex") });
      const result = { receiptId: "receipt-1", projectId: "project-1", version: 1, state: "ISSUED", boundWpVersion: 1, expiresAt: "2026-08-04T12:00:00.000Z", exclusions: [], replayed: false };
      const provider = { issueReceipt() { return structuredClone(result); }, replayReceipt() { return { ...structuredClone(result), replayed: true }; } };
      const adapter = new DurableContextReplayAdapter({ filePath, contextFederation: provider, headAnchor: anchor });
      for (let attempt = 0; attempt < 50; attempt += 1) {
        try { console.log(JSON.stringify(adapter.issueReceipt(${JSON.stringify(requestValue)}))); process.exit(0); }
        catch (error) { if (!["HEAD_ANCHOR_BUSY", "LEDGER_BUSY", "REPLAY_LEDGER_CHANGED", "REPLAY_LEDGER_ROLLBACK_DETECTED", "EBUSY", "EPERM"].includes(error.code)) throw error; await new Promise((resolve) => setTimeout(resolve, 2)); }
      }
      process.exit(2);
    `;
    const launch = () => spawn(process.execPath, ["--input-type=module", "-e", script, filePath, ANCHOR_KEY.toString("hex")],
      { stdio: ["ignore", "pipe", "pipe"] });
    const results = await Promise.all([childResult(launch()), childResult(launch())]);
    assert.deepEqual(results.map((result) => result.code), [0, 0], JSON.stringify(results));
    const restarted = adapter(filePath, provider());
    assert.equal(restarted.verify().count, 1);
    assert.equal(restarted.replayReceipt(request()).replayed, true);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
