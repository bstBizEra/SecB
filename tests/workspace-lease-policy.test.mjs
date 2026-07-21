import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  mintLease,
  evaluateLease,
  renewLease,
  WORKSPACE_LEASE_DENY_CODES
} from "../src/control/workspace-lease-policy.mjs";
import { evaluateWriteSet } from "../src/control/write-set-policy.mjs";

const root = resolve(import.meta.dirname, "..");
// The commit this dispatch branched from; every guarded existing file must be
// byte-identical to it (workspace-lease-policy is a pure-additive slice).
const BASE = "332b7ab";

// Canonical valid inputs reused across cases.
const T0 = 1_000_000; // an injected epoch-ms reading
const TTL = 60_000;
const validMintInput = () => ({
  leaseId: "wl-001",
  sessionId: "sess-1",
  actorId: "claude-motor-wspace-s2-01",
  writeSet: ["src/control", "tests"],
  issuedAt: T0,
  ttl: TTL
});
const mintOk = (over = {}) => {
  const res = mintLease({ ...validMintInput(), ...over });
  assert.equal(res.ok, true, `expected mint ok, got ${JSON.stringify(res)}`);
  return res.lease;
};

// ---------------------------------------------------------------------------
// mintLease — happy path, shape, and the derived expiry.
// ---------------------------------------------------------------------------

test("mintLease: mints a frozen candidate with derived expiresAt = issuedAt + ttl", () => {
  const res = mintLease(validMintInput());
  assert.equal(res.ok, true);
  assert.deepEqual(res.lease, {
    leaseId: "wl-001",
    sessionId: "sess-1",
    actorId: "claude-motor-wspace-s2-01",
    writeSet: ["src/control", "tests"],
    issuedAt: T0,
    ttl: TTL,
    expiresAt: T0 + TTL
  });
});

test("mintLease: envelope and nested writeSet are deep-frozen; the source array is copied", () => {
  const source = ["src/control"];
  const res = mintLease({ ...validMintInput(), writeSet: source });
  assert.equal(Object.isFrozen(res), true);
  assert.equal(Object.isFrozen(res.lease), true);
  assert.equal(Object.isFrozen(res.lease.writeSet), true);
  assert.throws(() => { "use strict"; res.lease.issuedAt = 0; }, TypeError);
  assert.throws(() => { "use strict"; res.lease.writeSet.push("x"); }, TypeError);
  // Mutating the caller's original array does not reflect into the frozen copy.
  source.push("tests");
  assert.deepEqual(res.lease.writeSet, ["src/control"]);
});

// ---------------------------------------------------------------------------
// mintLease — deny-by-default on every malformed field.
// ---------------------------------------------------------------------------

test("mintLease: DENY_LEASE_MALFORMED for non-object input", () => {
  for (const bad of [null, undefined, "x", 7, [], ["src"]]) {
    const res = mintLease(bad);
    assert.equal(res.ok, false, `input ${JSON.stringify(bad)}`);
    assert.equal(res.code, "DENY_LEASE_MALFORMED");
    assert.equal(Object.isFrozen(res), true);
  }
});

test("mintLease: DENY_LEASE_MALFORMED for blank identity fields", () => {
  for (const field of ["leaseId", "sessionId", "actorId"]) {
    for (const bad of ["", "   ", 42, null, undefined, {}]) {
      assert.equal(mintLease({ ...validMintInput(), [field]: bad }).code, "DENY_LEASE_MALFORMED", `${field}=${String(bad)}`);
    }
  }
});

test("mintLease: DENY_LEASE_MALFORMED for invalid issuedAt / ttl", () => {
  for (const bad of [-1, 1.5, NaN, Infinity, "1000", null, undefined, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(mintLease({ ...validMintInput(), issuedAt: bad }).code, "DENY_LEASE_MALFORMED", `issuedAt=${String(bad)}`);
  }
  for (const bad of [0, -1, 1.5, NaN, Infinity, "60000", null, undefined]) {
    assert.equal(mintLease({ ...validMintInput(), ttl: bad }).code, "DENY_LEASE_MALFORMED", `ttl=${String(bad)}`);
  }
  // issuedAt + ttl must not overflow the safe-integer range.
  assert.equal(mintLease({ ...validMintInput(), issuedAt: Number.MAX_SAFE_INTEGER - 1, ttl: 10 }).code, "DENY_LEASE_MALFORMED");
});

test("mintLease: DENY_LEASE_MALFORMED for a writeSet that is not a clean, canonical, non-empty set", () => {
  for (const bad of [
    [],                        // empty -> grants nothing
    "src/control",             // not an array
    ["src/../secret"],         // traversal
    ["/etc/passwd"],           // absolute
    ["C:\\x"],                 // drive-letter
    ["src//control"],          // non-canonical alias
    ["src/control", ""],       // blank entry
    ["src/control", 9]         // non-string entry
  ]) {
    const res = mintLease({ ...validMintInput(), writeSet: bad });
    assert.equal(res.ok, false, `writeSet=${JSON.stringify(bad)}`);
    assert.equal(res.code, "DENY_LEASE_MALFORMED", `writeSet=${JSON.stringify(bad)}`);
  }
  // The detail carries the underlying write-set code for observability.
  assert.equal(mintLease({ ...validMintInput(), writeSet: [] }).detail, "DENY_WRITE_SET_EMPTY");
  assert.equal(mintLease({ ...validMintInput(), writeSet: ["src/../x"] }).detail, "DENY_WRITE_SET_TRAVERSAL");
});

// ---------------------------------------------------------------------------
// evaluateLease — allow, expiry, containment, precedence.
// ---------------------------------------------------------------------------

test("evaluateLease: allow when unexpired and requested set is within the lease", () => {
  const lease = mintOk();
  const res = evaluateLease(lease, {
    now: T0 + 1000,
    requestedWriteSet: ["src/control/workspace-lease-policy.mjs", "tests/workspace-lease-policy.test.mjs"]
  });
  assert.deepEqual(res, { ok: true });
});

test("evaluateLease: DENY_LEASE_EXPIRED at or after issuedAt + ttl (fail-closed boundary)", () => {
  const lease = mintOk();
  // Exactly at expiry is dead (>=).
  const atExpiry = evaluateLease(lease, { now: T0 + TTL, requestedWriteSet: ["src/control/x.mjs"] });
  assert.equal(atExpiry.ok, false);
  assert.equal(atExpiry.code, "DENY_LEASE_EXPIRED");
  assert.equal(atExpiry.expiresAt, T0 + TTL);
  // Well past expiry.
  assert.equal(evaluateLease(lease, { now: T0 + TTL + 1, requestedWriteSet: ["src/control/x.mjs"] }).code, "DENY_LEASE_EXPIRED");
  // One ms before expiry is still live.
  assert.equal(evaluateLease(lease, { now: T0 + TTL - 1, requestedWriteSet: ["src/control/x.mjs"] }).ok, true);
});

test("evaluateLease: DENY_LEASE_WRITE_SET_EXCEEDED when requested paths escape the lease", () => {
  const lease = mintOk();
  const res = evaluateLease(lease, { now: T0 + 1, requestedWriteSet: ["docs/readme.md"] });
  assert.equal(res.ok, false);
  assert.equal(res.code, "DENY_LEASE_WRITE_SET_EXCEEDED");
  assert.equal(res.detail, "DENY_WRITE_SET_OUTSIDE_ALLOWED");
  // Traversal / absolute / empty requests all surface as write-set excess with detail.
  assert.equal(evaluateLease(lease, { now: T0 + 1, requestedWriteSet: ["src/../etc"] }).detail, "DENY_WRITE_SET_TRAVERSAL");
  assert.equal(evaluateLease(lease, { now: T0 + 1, requestedWriteSet: ["/etc/passwd"] }).detail, "DENY_WRITE_SET_ABSOLUTE");
  assert.equal(evaluateLease(lease, { now: T0 + 1, requestedWriteSet: [] }).detail, "DENY_WRITE_SET_EMPTY");
});

test("evaluateLease: expiry precedence — an expired lease denies EXPIRED even with an out-of-scope request", () => {
  const lease = mintOk();
  const res = evaluateLease(lease, { now: T0 + TTL + 5, requestedWriteSet: ["docs/readme.md"] });
  assert.equal(res.code, "DENY_LEASE_EXPIRED");
});

test("evaluateLease: DENY_LEASE_MALFORMED for invalid now / non-array requestedWriteSet / bad options", () => {
  const lease = mintOk();
  for (const bad of [-1, 1.5, NaN, Infinity, "1000", null, undefined]) {
    assert.equal(evaluateLease(lease, { now: bad, requestedWriteSet: ["src/control/x"] }).code, "DENY_LEASE_MALFORMED", `now=${String(bad)}`);
  }
  assert.equal(evaluateLease(lease, { now: T0 + 1, requestedWriteSet: "src/control/x" }).code, "DENY_LEASE_MALFORMED");
  for (const bad of [null, undefined, "x", 7, []]) {
    assert.equal(evaluateLease(lease, bad).code, "DENY_LEASE_MALFORMED", `options=${JSON.stringify(bad)}`);
  }
});

test("evaluateLease: DENY_LEASE_MALFORMED for a malformed lease record", () => {
  const good = mintOk();
  const opts = { now: T0 + 1, requestedWriteSet: ["src/control/x"] };
  for (const bad of [null, undefined, "x", 7, []]) {
    assert.equal(evaluateLease(bad, opts).code, "DENY_LEASE_MALFORMED", `lease=${JSON.stringify(bad)}`);
  }
  // Field-level tampering of a reloaded record fails closed.
  assert.equal(evaluateLease({ ...good, issuedAt: -1 }, opts).code, "DENY_LEASE_MALFORMED");
  assert.equal(evaluateLease({ ...good, ttl: 0 }, opts).code, "DENY_LEASE_MALFORMED");
  assert.equal(evaluateLease({ ...good, leaseId: "" }, opts).code, "DENY_LEASE_MALFORMED");
  assert.equal(evaluateLease({ ...good, writeSet: ["src/../escape"] }, opts).code, "DENY_LEASE_MALFORMED");
  assert.equal(evaluateLease({ ...good, writeSet: "src/control" }, opts).code, "DENY_LEASE_MALFORMED");
});

// ---------------------------------------------------------------------------
// renewLease — new candidate, immutability of the original, least-privilege.
// ---------------------------------------------------------------------------

test("renewLease: returns a NEW re-anchored candidate; the original is never mutated", () => {
  const original = mintOk();
  const snapshot = JSON.parse(JSON.stringify(original));
  const res = renewLease(original, { renewedAt: T0 + 30_000, ttl: 90_000 });
  assert.equal(res.ok, true);
  assert.notEqual(res.lease, original, "renewal must be a new object");
  assert.deepEqual(res.lease, {
    leaseId: "wl-001",
    sessionId: "sess-1",
    actorId: "claude-motor-wspace-s2-01",
    writeSet: ["src/control", "tests"],
    issuedAt: T0 + 30_000,
    ttl: 90_000,
    expiresAt: T0 + 30_000 + 90_000
  });
  // Original object is byte-for-byte unchanged.
  assert.deepEqual(original, snapshot);
  assert.equal(Object.isFrozen(res.lease), true);
  assert.equal(Object.isFrozen(res.lease.writeSet), true);
});

test("renewLease: ttl is optional and carries the original ttl forward", () => {
  const original = mintOk();
  const res = renewLease(original, { renewedAt: T0 + 10_000 });
  assert.equal(res.ok, true);
  assert.equal(res.lease.ttl, TTL);
  assert.equal(res.lease.expiresAt, T0 + 10_000 + TTL);
});

test("renewLease: preserves identity and writeSet — a renewal can never widen scope", () => {
  const original = mintOk();
  const res = renewLease(original, { renewedAt: T0 + 5, ttl: 120_000 });
  // Even though options carry no writeSet, the renewed lease keeps exactly the original's.
  assert.deepEqual(res.lease.writeSet, original.writeSet);
  assert.equal(res.lease.leaseId, original.leaseId);
  assert.equal(res.lease.sessionId, original.sessionId);
  assert.equal(res.lease.actorId, original.actorId);
  // A renewed lease is itself evaluable and live at its new anchor.
  assert.equal(evaluateLease(res.lease, { now: T0 + 6, requestedWriteSet: ["src/control/x.mjs"] }).ok, true);
});

test("renewLease: DENY_LEASE_MALFORMED for a malformed original, bad renewedAt/ttl, or backward renewal", () => {
  const original = mintOk();
  for (const bad of [null, undefined, "x", 7, []]) {
    assert.equal(renewLease(bad, { renewedAt: T0 + 1 }).code, "DENY_LEASE_MALFORMED", `lease=${JSON.stringify(bad)}`);
  }
  assert.equal(renewLease({ ...original, ttl: 0 }, { renewedAt: T0 + 1 }).code, "DENY_LEASE_MALFORMED");
  for (const bad of [-1, 1.5, NaN, "1000", null, undefined]) {
    assert.equal(renewLease(original, { renewedAt: bad }).code, "DENY_LEASE_MALFORMED", `renewedAt=${String(bad)}`);
  }
  for (const bad of [0, -1, 1.5, NaN, "x", null]) {
    assert.equal(renewLease(original, { renewedAt: T0 + 1, ttl: bad }).code, "DENY_LEASE_MALFORMED", `ttl=${String(bad)}`);
  }
  // Backward-in-time renewal (renewedAt < original.issuedAt) is rejected.
  assert.equal(renewLease(original, { renewedAt: T0 - 1 }).code, "DENY_LEASE_MALFORMED");
  // Renewing exactly at the original issuedAt is allowed (monotonic non-strict).
  assert.equal(renewLease(original, { renewedAt: T0 }).ok, true);
  // Bad options object.
  for (const bad of [null, undefined, "x", 7, []]) {
    assert.equal(renewLease(original, bad).code, "DENY_LEASE_MALFORMED", `options=${JSON.stringify(bad)}`);
  }
});

// ---------------------------------------------------------------------------
// Accessor-probe / fail-closed extraction — hostile lease, options, and input
// objects must be CONTAINED into DENY_LEASE_MALFORMED, never propagate, and each
// field getter must be invoked at most once.
// ---------------------------------------------------------------------------

function throwingGetter(field) {
  const obj = {};
  Object.defineProperty(obj, field, { enumerable: true, get() { throw new Error(`boom ${field}`); } });
  return obj;
}

test("accessor-probe: a throwing getter on any mintLease field -> MALFORMED, never throws", () => {
  for (const field of ["leaseId", "sessionId", "actorId", "writeSet", "issuedAt", "ttl"]) {
    const base = validMintInput();
    delete base[field];
    const input = Object.assign(throwingGetter(field), base);
    let res;
    assert.doesNotThrow(() => { res = mintLease(input); }, `mint field ${field}`);
    assert.equal(res.code, "DENY_LEASE_MALFORMED", field);
    assert.equal(Object.isFrozen(res), true);
  }
});

test("accessor-probe: throwing getters on lease, options, and requestedWriteSet in evaluateLease -> MALFORMED", () => {
  const lease = mintOk();
  // Hostile lease object.
  assert.equal(evaluateLease(throwingGetter("writeSet"), { now: T0, requestedWriteSet: ["src/a"] }).code, "DENY_LEASE_MALFORMED");
  // Hostile options object.
  let res;
  assert.doesNotThrow(() => { res = evaluateLease(lease, throwingGetter("now")); });
  assert.equal(res.code, "DENY_LEASE_MALFORMED");
  assert.doesNotThrow(() => { res = evaluateLease(lease, throwingGetter("requestedWriteSet")); });
  assert.equal(res.code, "DENY_LEASE_MALFORMED");
});

test("accessor-probe: throwing getters in renewLease (lease + options) -> MALFORMED", () => {
  const lease = mintOk();
  assert.equal(renewLease(throwingGetter("issuedAt"), { renewedAt: T0 + 1 }).code, "DENY_LEASE_MALFORMED");
  let res;
  assert.doesNotThrow(() => { res = renewLease(lease, throwingGetter("renewedAt")); });
  assert.equal(res.code, "DENY_LEASE_MALFORMED");
});

test("accessor-probe: Proxy with throwing get/has traps -> MALFORMED, never throws", () => {
  const trap = { get() { throw new Error("get trap"); }, has() { throw new Error("has trap"); } };
  assert.equal(mintLease(new Proxy({}, trap)).code, "DENY_LEASE_MALFORMED");
  assert.equal(evaluateLease(new Proxy({}, trap), { now: T0, requestedWriteSet: ["src/a"] }).code, "DENY_LEASE_MALFORMED");
  assert.equal(renewLease(new Proxy({}, trap), { renewedAt: T0 }).code, "DENY_LEASE_MALFORMED");
});

test("accessor-probe: each field getter is invoked EXACTLY ONCE (no retry amplification)", () => {
  const counts = {};
  const values = validMintInput();
  const input = {};
  for (const field of Object.keys(values)) {
    counts[field] = 0;
    Object.defineProperty(input, field, {
      enumerable: true,
      get() { counts[field] += 1; return values[field]; }
    });
  }
  const res = mintLease(input);
  assert.equal(res.ok, true);
  for (const field of Object.keys(values)) {
    assert.equal(counts[field], 1, `${field} read exactly once`);
  }
});

test("accessor-probe: a getter returning different values per read cannot influence the decision", () => {
  let n = 0;
  const input = { ...validMintInput() };
  Object.defineProperty(input, "writeSet", {
    enumerable: true,
    get() { n += 1; return n === 1 ? ["src/control"] : ["src/../escape"]; }
  });
  const res = mintLease(input);
  assert.equal(n, 1, "writeSet read exactly once");
  assert.equal(res.ok, true, "decision reflects only the single first snapshot");
  assert.deepEqual(res.lease.writeSet, ["src/control"]);
});

// F3 hardening (mod-wspace-lease-primitive-rev-001): element-level TOCTOU. The
// prior test covers only the object-PROPERTY level (writeSet read once). This
// covers the array-INDEX level: a value-varying index getter must be read
// EXACTLY ONCE by the single upfront snapshot, so the STORED set is provably the
// set the self-check validated (rev-001 F3 probe 4e: stored differing from the
// validated candidate). Under the pre-fix code the caller array was read 2-3x
// (evaluateWriteSet self-check as candidate + allowed, then freezeLease's
// spread), so the stored set could diverge from the validated one.
test("F3 regression: a value-varying writeSet INDEX getter is read once; stored set === validated set", () => {
  let reads = 0;
  const writeSet = ["placeholder"];
  Object.defineProperty(writeSet, 0, {
    enumerable: true,
    configurable: true,
    get() { reads += 1; return reads === 1 ? "src/control" : "tests"; }
  });
  const res = mintLease({ ...validMintInput(), writeSet });
  assert.equal(res.ok, true, `expected ok, got ${JSON.stringify(res)}`);
  assert.equal(reads, 1, "writeSet index getter read exactly once by the single snapshot");
  // The stored set is exactly the first-read snapshot the self-check validated.
  assert.deepEqual(res.lease.writeSet, ["src/control"]);
});

test("F3 regression: each writeSet index is read exactly once at mint (multi-element snapshot)", () => {
  const counts = [0, 0];
  const writeSet = ["a", "b"];
  Object.defineProperty(writeSet, 0, { enumerable: true, configurable: true, get() { counts[0] += 1; return "src/control"; } });
  Object.defineProperty(writeSet, 1, { enumerable: true, configurable: true, get() { counts[1] += 1; return "tests"; } });
  const res = mintLease({ ...validMintInput(), writeSet });
  assert.equal(res.ok, true, `expected ok, got ${JSON.stringify(res)}`);
  assert.deepEqual(counts, [1, 1], "each index read exactly once");
  assert.deepEqual(res.lease.writeSet, ["src/control", "tests"]);
});

// ---------------------------------------------------------------------------
// Deny-code closed set.
// ---------------------------------------------------------------------------

test("WORKSPACE_LEASE_DENY_CODES is the frozen closed set actually emitted", () => {
  assert.equal(Object.isFrozen(WORKSPACE_LEASE_DENY_CODES), true);
  assert.deepEqual([...WORKSPACE_LEASE_DENY_CODES].sort(), [
    "DENY_LEASE_EXPIRED",
    "DENY_LEASE_MALFORMED",
    "DENY_LEASE_WRITE_SET_EXCEEDED"
  ]);
});

// ---------------------------------------------------------------------------
// evaluateWriteSet PARITY PIN — evaluateLease's containment verdict must equal a
// direct evaluateWriteSet call over the same (requestedWriteSet, leaseWriteSet)
// pair (with an empty prohibited set), so the reused primitive cannot drift from
// the lease-plane wrapper. Restricted to unexpired leases so the write-set leg is
// the deciding factor.
// ---------------------------------------------------------------------------

test("parity: evaluateLease containment agrees with evaluateWriteSet for every row", () => {
  const table = [
    { req: ["src/control/x.mjs"], ws: ["src/control"] },
    { req: ["src/control"], ws: ["src/control"] },
    { req: ["src/foobar/x"], ws: ["src/foo"] },
    { req: ["src/a", "tests/b"], ws: ["src", "tests"] },
    { req: ["src/a", "docs/b"], ws: ["src", "tests"] },
    { req: ["docs/readme.md"], ws: ["src", "tests"] },
    { req: ["src/../secret"], ws: ["src"] },
    { req: ["/etc/passwd"], ws: ["src"] },
    { req: [], ws: ["src"] }
  ];
  let allowRows = 0;
  let denyRows = 0;
  for (const { req, ws } of table) {
    const lease = mintOk({ writeSet: ws });
    const leaseVerdict = evaluateLease(lease, { now: T0 + 1, requestedWriteSet: req }).ok;
    const direct = evaluateWriteSet({ candidatePaths: req, allowedPaths: ws, prohibitedPaths: [] }).ok;
    assert.equal(leaseVerdict, direct, `parity mismatch for ${JSON.stringify({ req, ws })}`);
    direct ? (allowRows += 1) : (denyRows += 1);
  }
  assert.ok(allowRows >= 3, `expected several allow rows, got ${allowRows}`);
  assert.ok(denyRows >= 3, `expected several deny rows, got ${denyRows}`);
});

// ---------------------------------------------------------------------------
// Byte-identity guard — this pure-additive slice must not modify any existing
// file it read. Compare each working-tree blob hash to the base commit 332b7ab.
// write-set-policy.mjs is load-bearing (its evaluateWriteSet is reused
// byte-identically); mcp-gateway-core.mjs must stay untouched (B5: it still
// consumes workspace_lease_id opaquely).
// ---------------------------------------------------------------------------

test(`byte-identity: files read but not modified are unchanged vs ${BASE}`, () => {
  const guarded = [
    "src/control/write-set-policy.mjs",
    "src/gateway/mcp-gateway-core.mjs"
  ];
  for (const rel of guarded) {
    const baseBlob = execFileSync("git", ["rev-parse", `${BASE}:${rel}`], { cwd: root, encoding: "utf8" }).trim();
    const worktreeBlob = execFileSync("git", ["hash-object", resolve(root, rel)], { cwd: root, encoding: "utf8" }).trim();
    assert.equal(worktreeBlob, baseBlob, `${rel} blob differs from ${BASE}`);
  }
  // Sanity: the guarded gateway source still consumes workspace_lease_id as the
  // opaque required field this slice deliberately does NOT wire.
  const gw = readFileSync(resolve(root, "src/gateway/mcp-gateway-core.mjs"), "utf8");
  assert.ok(gw.includes("workspace_lease_id"), "gateway still references workspace_lease_id");
  // Sanity: the reused evaluateWriteSet is still present in the guarded source.
  const wsp = readFileSync(resolve(root, "src/control/write-set-policy.mjs"), "utf8");
  assert.ok(wsp.includes("export function evaluateWriteSet"), "evaluateWriteSet present in guarded source");
});
