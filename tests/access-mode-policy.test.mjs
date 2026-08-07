// MOD-LIVE S2 — tests for src/live/access-mode-policy.mjs.
//
// Sections:
//   1. Doc-parity fixtures (SECB-LIVE-CONTROL-001): a THREE-WAY parity
//      (mirroring LIVE-S1's three-way parity) — the codified ladder is
//      cross-checked against (a) the "## Access Modes" table in
//      intervention-and-replay.md and (b) the arrow sequence in
//      01-live-operations.md, both parsed from the ACTUAL doctrine markdown at
//      test runtime; the two docs must also agree with each other. The gated
//      modes' `requiresExplicitAuthorization` derivation is pinned to the
//      verbatim doctrine phrase. Any code/doc drift fails the suite.
//   2. Ladder evaluation: allow when requested <= granted at every rank pair;
//      DENY_ACCESS_ESCALATION when requested > granted.
//   3. Explicit-authorization gate (Control/Emergency): risk-class
//      short-circuit (approval-binding precedent), explicit attestation, and
//      deny-by-default.
//   4. Malformed + unknown denials, deny-by-default.
//   5. Accessor-attack regressions (WSPACE-S1 fail-closed extraction):
//      throwing getters, Proxy traps, invocation-count === 1.
//   6. Frozen outputs + mutation tests.
//   7. risk-registry behavioral parity pin.
//   8. Byte-identity guards: every pre-existing file read while producing this
//      slice is asserted byte-identical to its blob at main @ adfeb8e
//      (MANIFEST.json excluded — intentionally modified by this slice).

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  ACCESS_MODES,
  ACCESS_MODE_ORDER,
  DENY_ACCESS_MODE_MALFORMED,
  DENY_ACCESS_MODE_UNKNOWN,
  DENY_ACCESS_ESCALATION,
  DENY_ACCESS_AUTHORIZATION_REQUIRED,
  evaluateAccessRequest
} from "../src/live/access-mode-policy.mjs";
import { RISK_CLASSES } from "../src/control/risk-registry.mjs";

const NUL = String.fromCharCode(0);

function repoPath(rel) {
  return fileURLToPath(new URL(`../${rel}`, import.meta.url));
}

function readRepoFile(rel) {
  return readFileSync(repoPath(rel), "utf8");
}

const TABLE_DOC = "docs/05-live-operations/intervention-and-replay.md";
const ARROW_DOC = "docs/17-operations/01-live-operations.md";

// ---------------------------------------------------------------------------
// 1. Doc-parity fixtures (SECB-LIVE-CONTROL-001) — three-way
// ---------------------------------------------------------------------------

// Parse the "## Access Modes" markdown table: return [{ mode, capability }] in
// the doc's row order (header + separator rows skipped).
function accessModesFromTable(markdown) {
  const section = markdown.slice(markdown.indexOf("## Access Modes"));
  const end = section.indexOf("\n## ", 3);
  const body = end === -1 ? section : section.slice(0, end);
  const rows = body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|"))
    .map((line) => line.slice(1, line.endsWith("|") ? -1 : undefined).split("|").map((cell) => cell.trim()));
  // Drop the header row (Mode | Capability) and the |---|---| separator.
  return rows
    .filter((cells) => cells.length === 2 && cells[0] !== "Mode" && !/^-+$/.test(cells[0]))
    .map((cells) => ({ mode: cells[0], capability: cells[1] }));
}

// Parse the backticked arrow ladder `A → B → C …` from the arrow doc.
function laddderFromArrow(markdown) {
  const match = markdown.match(/`([A-Za-z]+(?:\s*→\s*[A-Za-z]+)+)`/);
  assert.ok(match, "backticked arrow ladder found in arrow doc");
  return match[1].split("→").map((token) => token.trim());
}

test("doc-parity #1: codified ladder matches the intervention-and-replay '## Access Modes' table (mode + capability, in order)", () => {
  const tableModes = accessModesFromTable(readRepoFile(TABLE_DOC));
  assert.equal(tableModes.length, 6, "doctrine table names exactly six modes");
  assert.deepEqual(
    ACCESS_MODES.map((entry) => ({ mode: entry.mode, capability: entry.capability })),
    tableModes,
    "codified modes+capabilities are the table's rows, 1:1 and in order"
  );
});

test("doc-parity #2: codified ladder matches the 01-live-operations arrow sequence, in order", () => {
  const arrowLadder = laddderFromArrow(readRepoFile(ARROW_DOC));
  assert.deepEqual(ACCESS_MODE_ORDER, arrowLadder, "codified ladder order == arrow ladder");
});

test("doc-parity #3: the table doc and the arrow doc agree with each other (transitive)", () => {
  const tableModes = accessModesFromTable(readRepoFile(TABLE_DOC)).map((entry) => entry.mode);
  const arrowLadder = laddderFromArrow(readRepoFile(ARROW_DOC));
  assert.deepEqual(tableModes, arrowLadder, "both doctrine docs describe the identical ladder");
});

test("doc-parity: the explicit-authorization gate phrase is present verbatim and the derivation matches", () => {
  const arrowDoc = readRepoFile(ARROW_DOC);
  const phrase =
    "Writable terminal control and emergency intervention require explicit authorization";
  assert.ok(arrowDoc.includes(phrase), "gate phrase present verbatim in arrow doc");
  // Derivation: exactly Control and Emergency are gated. Control's capability
  // is the "writable terminal control" the phrase names ("Enter terminal or
  // runtime input"); Emergency is "emergency intervention".
  const gated = ACCESS_MODES.filter((entry) => entry.requiresExplicitAuthorization).map((entry) => entry.mode);
  assert.deepEqual(gated, ["Control", "Emergency"], "exactly Control and Emergency require explicit authorization");
  const control = ACCESS_MODES.find((entry) => entry.mode === "Control");
  assert.ok(control.capability.includes("terminal"), "Control is the writable terminal-control mode");
});

test("doc-parity: 'Each higher mode requires separate authority' is present verbatim (ladder-check rationale)", () => {
  const tableDoc = readRepoFile(TABLE_DOC);
  assert.ok(
    tableDoc.includes("Each higher mode requires separate authority"),
    "separate-authority rule present verbatim in table doc"
  );
});

// ---------------------------------------------------------------------------
// 2. Ladder evaluation
// ---------------------------------------------------------------------------

// A granted authority high enough that no gated mode is even reached when we
// only exercise the ladder (Steer is the highest non-gated mode).
test("ladder: request allowed when requested rank <= granted rank (non-gated modes)", () => {
  const nonGated = ["Observe", "Annotate", "Approve", "Steer"];
  for (let g = 0; g < nonGated.length; g += 1) {
    for (let r = 0; r <= g; r += 1) {
      const result = evaluateAccessRequest({ requestedMode: nonGated[r], grantedMode: nonGated[g] });
      assert.equal(result.ok, true, `${nonGated[r]} <= ${nonGated[g]} allowed`);
      assert.equal(result.mode, nonGated[r]);
      assert.equal(result.rank, r);
      assert.equal(result.grantedRank, g);
      assert.equal(result.requiresExplicitAuthorization, false);
      assert.equal(result.authorizationSatisfiedBy, "not-required");
    }
  }
});

test("ladder: same mode requested and granted is allowed (equality, non-gated)", () => {
  for (const mode of ["Observe", "Annotate", "Approve", "Steer"]) {
    const result = evaluateAccessRequest({ requestedMode: mode, grantedMode: mode });
    assert.equal(result.ok, true, `${mode} == ${mode} allowed`);
  }
});

test("ladder: DENY_ACCESS_ESCALATION when requested rank > granted rank", () => {
  for (let r = 0; r < ACCESS_MODE_ORDER.length; r += 1) {
    for (let g = 0; g < r; g += 1) {
      const result = evaluateAccessRequest({
        requestedMode: ACCESS_MODE_ORDER[r],
        grantedMode: ACCESS_MODE_ORDER[g],
        // supply full authorization so escalation is the ONLY possible deny
        explicitAuthorization: true
      });
      assert.equal(result.ok, false, `${ACCESS_MODE_ORDER[r]} > ${ACCESS_MODE_ORDER[g]} denied`);
      assert.equal(result.code, DENY_ACCESS_ESCALATION);
      assert.ok(Object.isFrozen(result));
    }
  }
});

// ---------------------------------------------------------------------------
// 3. Explicit-authorization gate (Control / Emergency)
// ---------------------------------------------------------------------------

test("gate: a gated mode with sufficient grant but NO authorization is DENY_ACCESS_AUTHORIZATION_REQUIRED", () => {
  for (const mode of ["Control", "Emergency"]) {
    const result = evaluateAccessRequest({ requestedMode: mode, grantedMode: mode });
    assert.equal(result.ok, false, `${mode} without authorization denied`);
    assert.equal(result.code, DENY_ACCESS_AUTHORIZATION_REQUIRED);
  }
});

test("gate: a gated mode is allowed with explicit explicitAuthorization === true", () => {
  for (const mode of ["Control", "Emergency"]) {
    const result = evaluateAccessRequest({ requestedMode: mode, grantedMode: "Emergency", explicitAuthorization: true });
    assert.equal(result.ok, true, `${mode} with explicit authorization allowed`);
    assert.equal(result.requiresExplicitAuthorization, true);
    assert.equal(result.authorizationSatisfiedBy, "explicit-authorization");
  }
});

test("gate: only the strict boolean true satisfies the attestation (everything else fail-closed)", () => {
  for (const value of [1, "true", "yes", {}, [], "TRUE", 0, "", null]) {
    const result = evaluateAccessRequest({
      requestedMode: "Emergency",
      grantedMode: "Emergency",
      explicitAuthorization: value
    });
    assert.equal(result.ok, false, `explicitAuthorization=${JSON.stringify(value)} denied`);
    assert.equal(result.code, DENY_ACCESS_AUTHORIZATION_REQUIRED);
  }
});

test("gate: a riskClass whose humanApproval is EXPLICIT false short-circuits the gate (approval-binding precedent)", () => {
  // R0/R1/R2 carry humanApproval:false in the registry.
  for (const riskClass of ["R0", "R1", "R2"]) {
    assert.equal(RISK_CLASSES[riskClass].humanApproval, false, `${riskClass} precondition`);
    const result = evaluateAccessRequest({ requestedMode: "Emergency", grantedMode: "Emergency", riskClass });
    assert.equal(result.ok, true, `${riskClass} short-circuits the gate`);
    assert.equal(result.authorizationSatisfiedBy, "risk-class-no-human-gate");
  }
});

test("gate: a riskClass whose humanApproval is true does NOT short-circuit; attestation still required (fail-closed)", () => {
  for (const riskClass of ["R3", "R4"]) {
    assert.equal(RISK_CLASSES[riskClass].humanApproval, true, `${riskClass} precondition`);
    const denied = evaluateAccessRequest({ requestedMode: "Emergency", grantedMode: "Emergency", riskClass });
    assert.equal(denied.ok, false, `${riskClass} does not short-circuit`);
    assert.equal(denied.code, DENY_ACCESS_AUTHORIZATION_REQUIRED);
    // ...but an explicit attestation still allows it.
    const allowed = evaluateAccessRequest({
      requestedMode: "Emergency",
      grantedMode: "Emergency",
      riskClass,
      explicitAuthorization: true
    });
    assert.equal(allowed.ok, true);
    assert.equal(allowed.authorizationSatisfiedBy, "explicit-authorization");
  }
});

test("gate: an UNKNOWN riskClass never short-circuits (deny-by-default, everything-else-fail-closed)", () => {
  const result = evaluateAccessRequest({
    requestedMode: "Control",
    grantedMode: "Control",
    riskClass: "R9"
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, DENY_ACCESS_AUTHORIZATION_REQUIRED);
});

test("gate: escalation is checked BEFORE the authorization gate (insufficient grant denies as escalation)", () => {
  const result = evaluateAccessRequest({
    requestedMode: "Emergency",
    grantedMode: "Control",
    explicitAuthorization: true
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, DENY_ACCESS_ESCALATION, "requested Emergency > granted Control denies as escalation");
});

// ---------------------------------------------------------------------------
// 4. Malformed + unknown denials
// ---------------------------------------------------------------------------

test("malformed: non-object inputs are DENY_ACCESS_MODE_MALFORMED (deny-by-default)", () => {
  for (const input of [undefined, null, "Observe", 42, true, ["Observe"]]) {
    const result = evaluateAccessRequest(input);
    assert.equal(result.ok, false);
    assert.equal(result.code, DENY_ACCESS_MODE_MALFORMED, `input ${JSON.stringify(input)} malformed`);
    assert.ok(Object.isFrozen(result));
  }
});

test("malformed: missing required keys and prototype-key smuggling are malformed", () => {
  assert.equal(evaluateAccessRequest({}).code, DENY_ACCESS_MODE_MALFORMED);
  assert.equal(evaluateAccessRequest({ requestedMode: "Observe" }).code, DENY_ACCESS_MODE_MALFORMED);
  assert.equal(evaluateAccessRequest({ grantedMode: "Observe" }).code, DENY_ACCESS_MODE_MALFORMED);
  const smuggled = Object.assign(Object.create({ requestedMode: "Observe" }), { grantedMode: "Observe" });
  assert.equal(
    evaluateAccessRequest(smuggled).code,
    DENY_ACCESS_MODE_MALFORMED,
    "inherited requestedMode not honoured"
  );
});

test("malformed: non-string, blank, and null-byte mode values are malformed", () => {
  for (const bad of [42, null, undefined, {}, ["Observe"], "", "   ", `Obs${NUL}erve`]) {
    assert.equal(
      evaluateAccessRequest({ requestedMode: bad, grantedMode: "Observe" }).code,
      DENY_ACCESS_MODE_MALFORMED,
      `requestedMode ${String(bad)} malformed`
    );
    assert.equal(
      evaluateAccessRequest({ requestedMode: "Observe", grantedMode: bad }).code,
      DENY_ACCESS_MODE_MALFORMED,
      `grantedMode ${String(bad)} malformed`
    );
  }
});

test("unknown: well-formed but unmapped mode tokens are DENY_ACCESS_MODE_UNKNOWN — never guessed or lowercased", () => {
  for (const bad of ["observe", "OBSERVE", "Observer", "Emergncy", "control ", "annotate"]) {
    const result = evaluateAccessRequest({ requestedMode: bad, grantedMode: "Emergency" });
    assert.equal(result.ok, false);
    assert.equal(result.code, DENY_ACCESS_MODE_UNKNOWN, `"${bad}" unknown, not guessed`);
    assert.equal(result.mode, undefined, "no mode ever guessed on a denial");
  }
  // Unknown grantedMode also denies unknown.
  assert.equal(
    evaluateAccessRequest({ requestedMode: "Observe", grantedMode: "superuser" }).code,
    DENY_ACCESS_MODE_UNKNOWN
  );
});

// ---------------------------------------------------------------------------
// 5. Accessor-attack regressions (WSPACE-S1 fail-closed extraction)
// ---------------------------------------------------------------------------

test("attack: a throwing requestedMode getter yields the malformed denial, not a throw", () => {
  const hostile = { grantedMode: "Observe" };
  Object.defineProperty(hostile, "requestedMode", {
    enumerable: true,
    get() {
      throw new Error("hostile getter");
    }
  });
  const result = evaluateAccessRequest(hostile);
  assert.equal(result.ok, false);
  assert.equal(result.code, DENY_ACCESS_MODE_MALFORMED);
});

test("attack: each consulted property is read exactly once (single contained read — no guard/body double-read)", () => {
  const counts = { requestedMode: 0, grantedMode: 0, riskClass: 0, explicitAuthorization: 0 };
  const probe = {};
  Object.defineProperty(probe, "requestedMode", {
    enumerable: true,
    get() {
      counts.requestedMode += 1;
      return "Emergency";
    }
  });
  Object.defineProperty(probe, "grantedMode", {
    enumerable: true,
    get() {
      counts.grantedMode += 1;
      return "Emergency";
    }
  });
  Object.defineProperty(probe, "riskClass", {
    enumerable: true,
    get() {
      counts.riskClass += 1;
      return "R3"; // humanApproval true -> no short-circuit
    }
  });
  Object.defineProperty(probe, "explicitAuthorization", {
    enumerable: true,
    get() {
      counts.explicitAuthorization += 1;
      return true;
    }
  });
  const result = evaluateAccessRequest(probe);
  assert.equal(result.ok, true);
  assert.equal(result.authorizationSatisfiedBy, "explicit-authorization");
  assert.equal(counts.requestedMode, 1, "requestedMode read exactly once");
  assert.equal(counts.grantedMode, 1, "grantedMode read exactly once");
  assert.equal(counts.riskClass, 1, "riskClass read exactly once");
  assert.equal(counts.explicitAuthorization, 1, "explicitAuthorization read exactly once");
});

test("attack: Proxy get / getOwnPropertyDescriptor traps that throw yield the malformed denial", () => {
  const getTrap = new Proxy(
    { requestedMode: "Observe", grantedMode: "Observe" },
    {
      get() {
        throw new Error("hostile get trap");
      }
    }
  );
  assert.equal(evaluateAccessRequest(getTrap).code, DENY_ACCESS_MODE_MALFORMED);

  const descriptorTrap = new Proxy(
    { requestedMode: "Observe", grantedMode: "Observe" },
    {
      getOwnPropertyDescriptor() {
        throw new Error("hostile descriptor trap");
      }
    }
  );
  assert.equal(evaluateAccessRequest(descriptorTrap).code, DENY_ACCESS_MODE_MALFORMED);
});

test("attack: a poisoned Symbol.iterator on the request is inert (evaluator never iterates the input)", () => {
  const poisoned = { requestedMode: "Observe", grantedMode: "Observe" };
  poisoned[Symbol.iterator] = () => {
    throw new Error("poisoned iterator");
  };
  const result = evaluateAccessRequest(poisoned);
  assert.equal(result.ok, true, "evaluator does not consume the input's iterator");
});

// ---------------------------------------------------------------------------
// 6. Frozen outputs + mutation tests
// ---------------------------------------------------------------------------

test("frozen: allow result is deeply frozen and mutation attempts throw", () => {
  const result = evaluateAccessRequest({ requestedMode: "Observe", grantedMode: "Steer" });
  assert.ok(Object.isFrozen(result));
  assert.throws(() => {
    result.mode = "Emergency";
  }, TypeError);
  assert.throws(() => {
    result.injected = true;
  }, TypeError);
});

test("frozen: deny result is frozen; exported doctrine data is deeply frozen", () => {
  const denial = evaluateAccessRequest({ requestedMode: "Emergency", grantedMode: "Observe" });
  assert.ok(Object.isFrozen(denial));
  assert.throws(() => {
    denial.code = "spoofed";
  }, TypeError);
  assert.ok(Object.isFrozen(ACCESS_MODES));
  assert.ok(Object.isFrozen(ACCESS_MODE_ORDER));
  for (const entry of ACCESS_MODES) {
    assert.ok(Object.isFrozen(entry));
    assert.throws(() => {
      entry.requiresExplicitAuthorization = false;
    }, TypeError);
  }
});

test("purity: identical inputs yield deeply equal results", () => {
  assert.deepEqual(
    evaluateAccessRequest({ requestedMode: "Approve", grantedMode: "Control" }),
    evaluateAccessRequest({ requestedMode: "Approve", grantedMode: "Control" })
  );
  assert.deepEqual(
    evaluateAccessRequest({ requestedMode: "Emergency", grantedMode: "Emergency", riskClass: "R2" }),
    evaluateAccessRequest({ requestedMode: "Emergency", grantedMode: "Emergency", riskClass: "R2" })
  );
});

// ---------------------------------------------------------------------------
// 7. risk-registry behavioral parity pin
// ---------------------------------------------------------------------------

test("risk-registry parity: the short-circuit reflects the registry's humanApproval table exactly", () => {
  for (const [riskClass, entry] of Object.entries(RISK_CLASSES)) {
    const result = evaluateAccessRequest({ requestedMode: "Control", grantedMode: "Control", riskClass });
    if (entry.humanApproval === false) {
      assert.equal(result.ok, true, `${riskClass} (humanApproval false) short-circuits`);
      assert.equal(result.authorizationSatisfiedBy, "risk-class-no-human-gate");
    } else {
      assert.equal(result.ok, false, `${riskClass} (humanApproval ${entry.humanApproval}) does not short-circuit`);
      assert.equal(result.code, DENY_ACCESS_AUTHORIZATION_REQUIRED);
    }
  }
});

// ---------------------------------------------------------------------------
// 8. Byte-identity guards (main @ adfeb8e)
// ---------------------------------------------------------------------------

// Every pre-existing repo file read while producing this slice, pinned to its
// git blob hash at main @ adfeb8e511d71b0e3acdabe7761095f86ea3a8c2.
// MANIFEST.json is excluded because this slice intentionally appends its two
// new file entries there (the only pre-existing file this slice modifies).
const PINNED_BLOBS = Object.freeze({
  "docs/05-live-operations/intervention-and-replay.md": "2b0be978ded8a04ece704c36ce132a787cfc8095",
  "docs/17-operations/01-live-operations.md": "67089d84c2ab6529c11c73e604de1ea5d11568b0",
  "src/control/risk-registry.mjs": "b8ee7f9b979fdb3c5d5261ad0e116ecd7c6a1816"
});

// git blob hash: sha1("blob <byteLength>\x00" + content). CRLF is normalized
// to LF first, replicating git's core.autocrlf clean filter on this Windows
// checkout — the pinned hashes are what `git rev-parse adfeb8e:<file>` reports.
function gitBlobSha1(rel) {
  const normalized = readRepoFile(rel).replace(/\r\n/g, "\n");
  const body = Buffer.from(normalized, "utf8");
  const header = Buffer.from(`blob ${body.length}${NUL}`, "utf8");
  return createHash("sha1").update(header).update(body).digest("hex");
}

test("byte-identity: every pre-existing file read for this slice is unchanged vs main @ adfeb8e", () => {
  for (const [rel, pinned] of Object.entries(PINNED_BLOBS)) {
    assert.equal(gitBlobSha1(rel), pinned, `${rel} blob-identical to main @ adfeb8e`);
  }
});
