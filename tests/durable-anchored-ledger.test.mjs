import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { DurableAnchoredLedger, DurableHeadAnchor } from "../src/index.mjs";

const LEDGER_ID = "memory-context-bindings";
const KEY = Buffer.alloc(32, 0x71);
const entry = (id = "binding-1") => ({
  entryId: id, projectId: "project-1", workPackageId: "wp-1", sessionId: "session-1",
  actorId: "actor-1", type: "MEMORY_CONTEXT_LIFECYCLE_BINDING_PREPARED",
  payload: { binding: id }, timestamp: "2026-08-03T12:00:00.000Z", idempotencyKey: id
});

function fixture(directory, initialize = true, anchorOverride) {
  const filePath = join(directory, "bindings.jsonl");
  const anchorPath = join(directory, "bindings-head.json");
  const anchor = anchorOverride ?? new DurableHeadAnchor({ filePath: anchorPath, ledgerId: LEDGER_ID,
    integrityKey: KEY, initialize });
  return { filePath, anchorPath, anchor,
    ledger: new DurableAnchoredLedger({ filePath, ledgerId: LEDGER_ID, headAnchor: anchor }) };
}

function crashAfterPrepare(anchor) {
  return {
    snapshot: (...args) => anchor.snapshot(...args),
    prepare(input) { const result = anchor.prepare(input); throw Object.assign(new Error("crash"), { code: "SIMULATED_CRASH", result }); },
    markDurable: (...args) => anchor.markDurable(...args),
    finalize: (...args) => anchor.finalize(...args)
  };
}

test("anchored ledger recovers exact PREPARED metadata after restart", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "secb-anchored-ledger-crash-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const base = fixture(directory);
  const crashing = new DurableAnchoredLedger({ filePath: base.filePath, ledgerId: LEDGER_ID,
    headAnchor: crashAfterPrepare(base.anchor) });
  assert.throws(() => crashing.append(entry(), { expectedSequence: 0 }), (error) => error.code === "SIMULATED_CRASH");
  const restarted = fixture(directory, false);
  const receipt = restarted.ledger.append(entry(), { expectedSequence: 0 });
  assert.equal(receipt.replayed, true);
  assert.deepEqual(restarted.ledger.verifyTrusted(), { valid: true, ledgerId: LEDGER_ID, count: 1, headHash: receipt.recordHash });
  assert.equal(restarted.anchor.snapshot().pending, null);
});

test("trusted read rejects ledger rollback and a competing fork", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "secb-anchored-ledger-fork-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const accepted = fixture(directory);
  const first = accepted.ledger.append(entry(), { expectedSequence: 0 });
  const savedPath = join(directory, "saved.jsonl");
  copyFileSync(accepted.filePath, savedPath);
  accepted.ledger.append(entry("binding-2"), { expectedSequence: 1 });
  copyFileSync(savedPath, accepted.filePath);
  assert.throws(() => accepted.ledger.verifyTrusted(), (error) => error.code === "ANCHORED_LEDGER_ROLLBACK_DETECTED");
  writeFileSync(accepted.filePath, `${JSON.stringify({ ...first, replayed: undefined })}\n`, "utf8");
  assert.throws(() => accepted.ledger.read(), /ledger|Ledger|rollback|integrity/i);
});
