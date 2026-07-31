#!/usr/bin/env node
/**
 * SecB Skills Hub CLI Tool
 *
 * Usage:
 *   node tools/secb-skills.mjs [query]
 *   npm run secb:skills search "governance"
 *
 * The hub is fail-closed: results are limited to skills the governed
 * resolver authorizes for the asserted project, runtime, and data class.
 * Withheld packages are reported as counts by deny code so an empty result
 * set is never mistaken for an empty hub.
 */

import { pathToFileURL, fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { SecBSkillsHub } from "../src/skills/skills-hub-service.mjs";
import { SkillResolver } from "../src/registry/skill-resolver.mjs";

export function runSecbSkillsCLI(query = "", context = {}) {
  console.log(`\n======================================================`);
  console.log(`   SecB Governed Skills Hub CLI v3.0.0`);
  console.log(`======================================================\n`);

  // The CLI holds no DecisionLedger binding, so it can vouch for no
  // promotion decision. Publication therefore cannot be self-attested here.
  const skillResolver = new SkillResolver({ decisionLookup: () => null });
  const hub = new SecBSkillsHub({ services: { skillResolver } });

  const result = hub.searchSkills(query, context);
  console.log(`Query: "${query}" | ${result.count} authorized skill(s):\n`);

  result.skills.forEach((s) => {
    console.log(`- [${s.name}] ${s.title}`);
    console.log(`  Description: ${s.description}\n`);
  });

  if (result.withheld_count > 0) {
    console.log(`Withheld: ${result.withheld_count} package(s) not authorized for this context.`);
    for (const [code, count] of Object.entries(result.withheld_reasons)) {
      console.log(`  ${code}: ${count}`);
    }
    console.log("");
  }

  return result;
}

if (process.argv[1] && (import.meta.url === pathToFileURL(resolve(process.argv[1])).href || fileURLToPath(import.meta.url) === resolve(process.argv[1]))) {
  const args = process.argv.slice(2);
  const query = args[0] === "search" ? args[1] || "" : args[0] || "";
  runSecbSkillsCLI(query, {
    projectId: process.env.SECB_PROJECT_ID,
    runtime: process.env.SECB_RUNTIME,
    dataClassification: process.env.SECB_DATA_CLASSIFICATION
  });
}
