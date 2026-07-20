#!/usr/bin/env node
// P0-17 CLI. Usage:
//   node tools/generate-ops-report.mjs <eventLedger> <evidenceLedger> <outPath> [ceiling]
// Exit 0 on a normal report; exit 1 on an integrity-failure report or any
// error, so automation cannot mistake a red report for a green one.
import { generateReport } from "../src/ui/ops-report-generator.mjs";

const [eventLedgerPath, evidenceLedgerPath, outPath, classificationCeiling] = process.argv.slice(2);
if (!eventLedgerPath || !evidenceLedgerPath || !outPath) {
  console.error("usage: generate-ops-report <eventLedger> <evidenceLedger> <outPath> [ceiling]");
  process.exit(1);
}
try {
  const result = generateReport({
    eventLedgerPath, evidenceLedgerPath, outPath,
    ...(classificationCeiling ? { classificationCeiling } : {})
  });
  console.log(JSON.stringify(result));
  process.exit(result.ok ? 0 : 1);
} catch (error) {
  console.error(`${error.code ?? error.name}: ${error.message}`);
  process.exit(1);
}
