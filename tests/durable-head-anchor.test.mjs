import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { DurableHeadAnchor, DurableHeadAnchorError } from "../src/ledger/durable-head-anchor.mjs";
import { DurableLedger } from "../src/ledger/durable-ledger.mjs";

const KEY = Buffer.alloc(32, 0x57);
const LEDGER_ID = "memory-test-ledger";
const ZERO = "0".repeat(64);
const head = (character, count = 1) => ({ count, headHash: character.repeat(64) });

const withTemp = (run) => {
  const directory = mkdtempSync(join(tmpdir(), "secb-head-anchor-"));
  try { return run(directory); } finally { rmSync(directory, { recursive: true, force: true }); }
};

test("authenticated checkpoint persists across provider restart", () => withTemp((directory) => {
  const filePath = join(directory, "head.json");
  const first = new DurableHeadAnchor({ filePath, ledgerId: LEDGER_ID, integrityKey: KEY });
  assert.deepEqual(first.read(), { count: 0, headHash: ZERO });
  assert.equal(first.compareAndSet({ expected: first.read(), next: head("a") }), true);
  const restarted = new DurableHeadAnchor({ filePath, ledgerId: LEDGER_ID, integrityKey: KEY });
  assert.deepEqual(restarted.read(), head("a"));
}));

test("stale, skipped, and regressed checkpoints fail closed", () => withTemp((directory) => {
  const anchor = new DurableHeadAnchor({ filePath: join(directory, "head.json"), ledgerId: LEDGER_ID, integrityKey: KEY });
  const zero = anchor.read();
  assert.equal(anchor.compareAndSet({ expected: zero, next: head("a") }), true);
  assert.equal(anchor.compareAndSet({ expected: zero, next: head("b") }), false);
  assert.throws(() => anchor.compareAndSet({ expected: head("a"), next: head("c", 3) }),
    (error) => error instanceof DurableHeadAnchorError && error.code === "DENY_HEAD_ANCHOR_NON_MONOTONIC");
  assert.throws(() => anchor.compareAndSet({ expected: head("a"), next: { count: 0, headHash: ZERO } }),
    (error) => error.code === "DENY_HEAD_ANCHOR_NON_MONOTONIC");
}));

test("tamper, wrong trust key, and ledger-id substitution are detected", () => withTemp((directory) => {
  const filePath = join(directory, "head.json");
  const anchor = new DurableHeadAnchor({ filePath, ledgerId: LEDGER_ID, integrityKey: KEY });
  anchor.compareAndSet({ expected: anchor.read(), next: head("a") });
  assert.throws(() => new DurableHeadAnchor({ filePath, ledgerId: LEDGER_ID,
    integrityKey: Buffer.alloc(32, 0x58) }).read(), (error) => error.code === "HEAD_ANCHOR_AUTHENTICITY_FAILURE");
  assert.throws(() => new DurableHeadAnchor({ filePath, ledgerId: "other-ledger",
    integrityKey: KEY }).read(), (error) => error.code === "HEAD_ANCHOR_INTEGRITY_FAILURE");
  const stored = JSON.parse(readFileSync(filePath, "utf8"));
  stored.head_hash = "b".repeat(64);
  writeFileSync(filePath, `${JSON.stringify(stored)}\n`);
  assert.throws(() => anchor.read(), (error) => error.code === "HEAD_ANCHOR_AUTHENTICITY_FAILURE");
}));

test("trusted checkpoint distinguishes a competing ledger fork", () => withTemp((directory) => {
  const anchor = new DurableHeadAnchor({ filePath: join(directory, "head.json"), ledgerId: LEDGER_ID, integrityKey: KEY });
  const leftPath = join(directory, "left.ndjson");
  const rightPath = join(directory, "right.ndjson");
  const left = new DurableLedger({ filePath: leftPath, ledgerId: LEDGER_ID });
  const entry = (id, payload) => ({ entryId: id, projectId: "project-1", workPackageId: "wp-1", sessionId: "session-1",
    actorId: "actor-1", type: "TEST", payload: { value: payload }, timestamp: "2026-08-03T12:00:00.000Z", idempotencyKey: id });
  const first = left.append(entry("first", "shared"), { expectedSequence: 0 });
  assert.equal(anchor.compareAndSet({ expected: anchor.read(), next: { count: 1, headHash: first.recordHash } }), true);
  copyFileSync(leftPath, rightPath);
  const right = new DurableLedger({ filePath: rightPath, ledgerId: LEDGER_ID });
  const accepted = left.append(entry("left", "accepted"), { expectedSequence: 1 });
  assert.equal(anchor.compareAndSet({ expected: anchor.read(), next: { count: 2, headHash: accepted.recordHash } }), true);
  const fork = right.append(entry("right", "fork"), { expectedSequence: 1 });
  assert.notEqual(fork.recordHash, accepted.recordHash);
  assert.deepEqual(anchor.read(), { count: 2, headHash: accepted.recordHash });
  assert.notDeepEqual(anchor.read(), { count: right.verify().count, headHash: right.verify().headHash });
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

test("two OS processes cannot both advance the same expected checkpoint", async () => {
  const directory = mkdtempSync(join(tmpdir(), "secb-head-anchor-process-"));
  try {
    const filePath = join(directory, "head.json");
    const moduleUrl = pathToFileURL(join(process.cwd(), "src/ledger/durable-head-anchor.mjs")).href;
    const script = `
      import { DurableHeadAnchor } from ${JSON.stringify(moduleUrl)};
      const anchor = new DurableHeadAnchor({ filePath: process.argv[1], ledgerId: ${JSON.stringify(LEDGER_ID)}, integrityKey: Buffer.from(process.argv[2], "hex") });
      const expected = { count: 0, headHash: "0".repeat(64) };
      const next = { count: 1, headHash: process.argv[3].repeat(64) };
      for (let attempt = 0; attempt < 50; attempt += 1) {
        try { console.log(anchor.compareAndSet({ expected, next })); process.exit(0); }
        catch (error) { if (error.code !== "HEAD_ANCHOR_BUSY") throw error; await new Promise((resolve) => setTimeout(resolve, 2)); }
      }
      process.exit(2);
    `;
    const launch = (character) => spawn(process.execPath,
      ["--input-type=module", "-e", script, filePath, KEY.toString("hex"), character], { stdio: ["ignore", "pipe", "pipe"] });
    const results = await Promise.all([childResult(launch("a")), childResult(launch("b"))]);
    assert.deepEqual(results.map((result) => result.code), [0, 0]);
    assert.deepEqual(results.map((result) => result.stdout).sort(), ["false", "true"]);
    const anchored = new DurableHeadAnchor({ filePath, ledgerId: LEDGER_ID, integrityKey: KEY }).read();
    assert.equal(anchored.count, 1);
    assert.ok(["a".repeat(64), "b".repeat(64)].includes(anchored.headHash));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
