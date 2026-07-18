import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { EventLedger, EvidenceLedger } from "../src/ledger/governed-ledgers.mjs";
import { classificationDecision, projectEvents } from "../src/ui/report-projections.mjs";
import { OpsReportError, generateReport, readReport } from "../src/ui/ops-report-generator.mjs";

function event(overrides = {}) {
  return {
    event_id: `evt_${Math.abs(overrides.__n ?? 1)}`,
    version: 1,
    project_id: "prj_p017",
    work_package_id: "wp_p017",
    session_id: "ses_p017",
    actor_id: "host-observer",
    event_type: "host.observed",
    occurred_at: "2026-07-19T10:00:00+07:00",
    observed_fact: { note: "routine observation" },
    source: "host-runtime",
    idempotency_key: `idem_${overrides.__n ?? 1}`,
    classification: "INTERNAL",
    content_hash: "a".repeat(64),
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== "__n"))
  };
}

function evidence(overrides = {}) {
  return {
    evidence_id: "ev_p017_1",
    version: 1,
    project_id: "prj_p017",
    work_package_id: "wp_p017",
    session_id: "ses_p017",
    actor_id: "qa-actor",
    evidence_type: "test-run",
    source: "npm-test",
    observed_at: "2026-07-19T10:05:00+07:00",
    procedure: "npm test",
    result: "all suites green",
    exit_status: 0,
    limitations: [],
    content_hash: "b".repeat(64),
    verification_status: "VERIFIED",
    classification: "INTERNAL",
    retention_policy: "retain-12-months",
    ...overrides
  };
}

function harness() {
  const dir = mkdtempSync(join(tmpdir(), "secb-p017-"));
  const eventLedgerPath = join(dir, "events.ndjson");
  const evidenceLedgerPath = join(dir, "evidence.ndjson");
  const events = new EventLedger({ filePath: eventLedgerPath });
  const evidenceLedger = new EvidenceLedger({ filePath: evidenceLedgerPath });
  const outPath = join(dir, "report.html");
  const run = (overrides = {}) => generateReport({
    eventLedgerPath, evidenceLedgerPath, outPath,
    now: () => new Date("2026-07-19T12:00:00Z"),
    ...overrides
  });
  const sha = (path) => {
    try { return createHash("sha256").update(readFileSync(path)).digest("hex"); }
    catch { return "absent"; }
  };
  return { dir, eventLedgerPath, evidenceLedgerPath, events, evidenceLedger, outPath, run, sha, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test("happy path: full verified chain renders with banner, head hashes, and byte-identical ledgers", () => {
  const h = harness();
  try {
    h.events.appendEvent(event({ __n: 1 }), { expectedSequence: 0 });
    h.events.appendEvent(event({ __n: 2, event_id: "evt_2", idempotency_key: "idem_2" }), { expectedSequence: 1 });
    h.evidenceLedger.appendEvidence(evidence(), { expectedSequence: 0, idempotencyKey: "idem_ev_1" });
    const before = [h.sha(h.eventLedgerPath), h.sha(h.evidenceLedgerPath)];

    const result = h.run();
    assert.equal(result.ok, true);
    assert.equal(result.events.count, 2);
    assert.equal(result.evidence.count, 1);

    const html = readReport(h.outPath);
    assert.ok(html.includes("evt_1") && html.includes("evt_2") && html.includes("ev_p017_1"));
    assert.ok(html.includes(result.events.headHash));
    assert.ok(html.includes("snapshot only"));
    assert.ok(html.includes("2026-07-19T12:00:00.000Z"));
    assert.deepEqual([h.sha(h.eventLedgerPath), h.sha(h.evidenceLedgerPath)], before);
  } finally { h.cleanup(); }
});

test("tampered and corrupt ledgers yield full-stop failure reports with no content past the break", () => {
  const h = harness();
  try {
    h.events.appendEvent(event({ __n: 1 }), { expectedSequence: 0 });
    const original = readFileSync(h.eventLedgerPath, "utf8");
    writeFileSync(h.eventLedgerPath, original.replace('"host-observer"', '"host-tampered"'), "utf8");
    const tampered = h.run();
    assert.equal(tampered.ok, false);
    assert.equal(tampered.code, "LEDGER_INTEGRITY_FAILURE");
    const failHtml = readReport(h.outPath);
    assert.ok(failHtml.includes("LEDGER INTEGRITY FAILURE"));
    assert.ok(!failHtml.includes("evt_1"));

    appendFileSync(h.eventLedgerPath, "not-json\n");
    assert.equal(h.run().code, "LEDGER_CORRUPT");
  } finally { h.cleanup(); }
});

test("empty ledgers produce a valid empty report, visibly stated", () => {
  const h = harness();
  try {
    const result = h.run();
    assert.equal(result.ok, true);
    assert.equal(result.events.count, 0);
    const html = readReport(h.outPath);
    assert.ok(html.includes("Events (0)"));
    assert.ok(html.includes("snapshot only"));
  } finally { h.cleanup(); }
});

test("hostile ledger content renders inert: no raw markup, handlers, or loadable URLs", () => {
  const h = harness();
  try {
    const hostile = JSON.parse(readFileSync(join(import.meta.dirname, "fixtures", "hostile", "event-envelope-injection.json"), "utf8"));
    h.events.appendEvent(hostile, { expectedSequence: 0 });
    const result = h.run();
    assert.equal(result.ok, true);
    const html = readReport(h.outPath);
    for (const raw of ["<script", "<img", "<form", "<iframe", 'href="http', 'src="http', 'style="']) {
      assert.ok(!html.includes(raw), `raw construct leaked: ${raw}`);
    }
    // hostile url(...) survives only as inert escaped TEXT: quotes are
    // escaped so it can never reach an attribute/style context
    assert.ok(html.includes("&lt;script&gt;"));
  } finally { h.cleanup(); }
});

test("classification floor: above-ceiling and unrecognized payloads are withheld fail-closed", () => {
  const h = harness();
  try {
    h.events.appendEvent(event({ __n: 1, classification: "RESTRICTED", observed_fact: { secret: "TOPSECRET-PAYLOAD" } }), { expectedSequence: 0 });
    h.events.appendEvent(event({ __n: 2, event_id: "evt_2", idempotency_key: "idem_2", classification: "internal ", observed_fact: { secret: "SNEAKY-PAYLOAD" } }), { expectedSequence: 1 });
    h.events.appendEvent(event({ __n: 3, event_id: "evt_3", idempotency_key: "idem_3", classification: "CONFIDENTIAL", observed_fact: { note: "CONF-PAYLOAD" } }), { expectedSequence: 2 });

    h.run();
    const atInternal = readReport(h.outPath);
    assert.ok(!atInternal.includes("TOPSECRET-PAYLOAD") && !atInternal.includes("SNEAKY-PAYLOAD") && !atInternal.includes("CONF-PAYLOAD"));
    assert.ok(atInternal.includes("ABOVE_CEILING") && atInternal.includes("UNRECOGNIZED_CLASSIFICATION"));

    h.run({ classificationCeiling: "CONFIDENTIAL" });
    const atConfidential = readReport(h.outPath);
    assert.ok(atConfidential.includes("CONF-PAYLOAD"));
    assert.ok(!atConfidential.includes("TOPSECRET-PAYLOAD"));

    assert.deepEqual(classificationDecision("PUBLIC", "INTERNAL"), { render: true, reason: null });
    assert.equal(classificationDecision("Restricted", "RESTRICTED").reason, "UNRECOGNIZED_CLASSIFICATION");
    assert.throws(() => h.run({ classificationCeiling: "TOP" }), (error) => error instanceof OpsReportError && error.code === "DENY_UNKNOWN_CEILING");
  } finally { h.cleanup(); }
});

test("out-path collision with a ledger path is refused and nothing is written", () => {
  const h = harness();
  try {
    h.events.appendEvent(event({ __n: 1 }), { expectedSequence: 0 });
    const before = h.sha(h.eventLedgerPath);
    assert.throws(
      () => h.run({ outPath: h.eventLedgerPath }),
      (error) => error instanceof OpsReportError && error.code === "DENY_OUT_PATH_COLLISION"
    );
    assert.equal(h.sha(h.eventLedgerPath), before);
  } finally { h.cleanup(); }
});

test("zero interactivity, import surface, and determinism", () => {
  const h = harness();
  try {
    h.events.appendEvent(event({ __n: 1 }), { expectedSequence: 0 });
    h.run();
    const html = readReport(h.outPath);
    assert.ok(!/<(form|button|input|select|textarea)/i.test(html));
    assert.ok(!/\son\w+=/i.test(html));

    for (const file of ["report-projections.mjs", "ops-report-generator.mjs"]) {
      const source = readFileSync(join(import.meta.dirname, "..", "src", "ui", file), "utf8");
      assert.ok(!/node:https?|node:net/.test(source), `${file} imports network modules`);
      assert.ok(!/appendEvent|appendEvidence|\.append\(/.test(source), `${file} references append paths`);
    }

    const first = readReport(h.outPath);
    h.run();
    assert.equal(readReport(h.outPath), first);

    const view = projectEvents([], "INTERNAL");
    assert.throws(() => { view.push({}); }, TypeError);
  } finally { h.cleanup(); }
});
