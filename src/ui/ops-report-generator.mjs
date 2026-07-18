// P0-17 Live Operations report generator (GOV-P017-01: option A).
// Static, read-only, zero network surface. verify() precedes read()
// unconditionally; any LedgerError yields a full-stop integrity-failure
// report (GOV-P017-03), never a normal or partial one. The generated
// artifact is NOT evidence (GOV-P017-06); its CSP forbids all remote
// loads so injected markup has nowhere to go even if escaping slipped.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import { LedgerError } from "../ledger/durable-ledger.mjs";
import { EventLedger, EvidenceLedger } from "../ledger/governed-ledgers.mjs";
import { CLASSIFICATION_ORDER, integritySummary, projectEvents, projectEvidence } from "./report-projections.mjs";

export class OpsReportError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "OpsReportError";
    this.code = code;
  }
}

function esc(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const CSP = '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'">';

function page(title, banner, body) {
  return `<!doctype html><html><head><meta charset="utf-8">${CSP}<title>${esc(title)}</title>
<style>body{font-family:system-ui,sans-serif;margin:24px;color:#1b2530}table{border-collapse:collapse;width:100%}
td,th{border:1px solid #ccd;padding:4px 8px;font-size:13px;text-align:left}code{font-family:ui-monospace,monospace;font-size:12px}
.banner{background:#eef2f5;border:1px solid #ccd;padding:10px 14px;margin-bottom:18px}
.withheld{color:#8a6d1a;font-style:italic}.fail{background:#fbeaea;border:1px solid #d99;padding:12px}</style>
</head><body>${banner}${body}
<p><small>This report is not evidence and never asks for credentials. "Verified" attests internal chain consistency, not provenance. Re-verify the head hash against the ledger before acting.</small></p>
</body></html>`;
}

function rows(items) {
  return items.map((item) => `<tr><td>${item.sequence}</td><td><code>${esc(item.entryId)}</code></td><td>${esc(item.type)}</td>
<td>${esc(item.actorId)}</td><td>${esc(item.timestamp)}</td><td>${esc(item.classification)}</td>
<td>${item.payloadRendered ? esc(item.payload) : `<span class="withheld">payload withheld: ${esc(item.withheldReason)}</span>`}</td>
<td><code>${esc(item.contentHash)}</code></td></tr>`).join("");
}

function assertOutPath(outPath, ledgerPaths) {
  const out = resolve(outPath);
  for (const ledgerPath of ledgerPaths) {
    const target = resolve(ledgerPath);
    if (out === target || out.startsWith(target + sep)) {
      throw new OpsReportError("DENY_OUT_PATH_COLLISION", "outPath must not be a ledger path");
    }
  }
}

export function generateReport({ eventLedgerPath, evidenceLedgerPath, outPath, classificationCeiling = "INTERNAL", now = () => new Date() }) {
  if (!CLASSIFICATION_ORDER.includes(classificationCeiling)) {
    throw new OpsReportError("DENY_UNKNOWN_CEILING", `Unknown classification ceiling: ${classificationCeiling}`);
  }
  assertOutPath(outPath, [eventLedgerPath, evidenceLedgerPath]);
  const generatedAt = now().toISOString();

  let events, evidence, eventSummary, evidenceSummary;
  try {
    const eventLedger = new EventLedger({ filePath: eventLedgerPath });
    const evidenceLedger = new EvidenceLedger({ filePath: evidenceLedgerPath });
    eventSummary = integritySummary("events", eventLedger.verify());
    evidenceSummary = integritySummary("evidence", evidenceLedger.verify());
    events = projectEvents(eventLedger.read(), classificationCeiling);
    evidence = projectEvidence(evidenceLedger.read(), classificationCeiling);
  } catch (error) {
    if (!(error instanceof LedgerError)) throw error;
    // Full-stop failure report: typed code only, no entry contents.
    const banner = `<div class="banner"><b>LEDGER INTEGRITY FAILURE</b> · generated ${esc(generatedAt)}</div>`;
    const body = `<div class="fail"><p>Code: <code>${esc(error.code)}</code></p><p>${esc(error.message)}</p>
<p>No ledger content is rendered past this point. Resolve the integrity question before acting on any view.</p></div>`;
    writeFileSync(resolve(outPath), page("SecB Ops Report — INTEGRITY FAILURE", banner, body), "utf8");
    return Object.freeze({ ok: false, code: error.code, generatedAt, outPath: resolve(outPath) });
  }

  const banner = `<div class="banner"><b>SecB Live Operations Report</b> · snapshot only — re-verify head hash before acting<br>
generated ${esc(generatedAt)} · ceiling <b>${esc(classificationCeiling)}</b> (report handles as ${esc(classificationCeiling)}) ·
events ${eventSummary.count} @ <code>${esc(eventSummary.headHash)}</code> ·
evidence ${evidenceSummary.count} @ <code>${esc(evidenceSummary.headHash)}</code></div>`;
  const header = "<tr><th>#</th><th>id</th><th>type</th><th>actor</th><th>recorded at (ledger claim)</th><th>class</th><th>payload</th><th>content hash</th></tr>";
  const body = `<h2>Events (${events.length})</h2><table>${header}${rows(events)}</table>
<h2>Evidence (${evidence.length})</h2><table>${header}${rows(evidence)}</table>`;
  writeFileSync(resolve(outPath), page("SecB Ops Report", banner, body), "utf8");
  return Object.freeze({
    ok: true, generatedAt, outPath: resolve(outPath),
    events: { count: eventSummary.count, headHash: eventSummary.headHash },
    evidence: { count: evidenceSummary.count, headHash: evidenceSummary.headHash }
  });
}

export function readReport(outPath) {
  return readFileSync(resolve(outPath), "utf8");
}
