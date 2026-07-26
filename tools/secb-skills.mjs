#!/usr/bin/env node
/**
 * SecB Skills Hub CLI Tool
 * 
 * Usage:
 *   node tools/secb-skills.mjs [query]
 *   npm run secb:skills search "governance"
 */

import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { SecBSkillsHub } from "../src/skills/skills-hub-service.mjs";
import { SkillResolver } from "../src/registry/skill-resolver.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

export function runSecbSkillsCLI(query = "") {
  console.log(`\n======================================================`);
  console.log(`   SecB Governed Skills Hub CLI v3.0.0`);
  console.log(`======================================================\n`);

  const skillResolver = new SkillResolver({ decisionLookup: () => ({ id: "dec-cli", type: "HUMAN_PROMOTION" }) });
  const hub = new SecBSkillsHub({ services: { skillResolver } });

  const result = hub.searchSkills(query);
  console.log(`Query: "${query}" | Found ${result.count} Governed Skills:\n`);

  result.skills.forEach(s => {
    console.log(`- [${s.name}] ${s.title}`);
    console.log(`  Description: ${s.description}\n`);
  });

  return result;
}

if (process.argv[1] && (import.meta.url === pathToFileURL(resolve(process.argv[1])).href || fileURLToPath(import.meta.url) === resolve(process.argv[1]))) {
  const args = process.argv.slice(2);
  const query = args[0] === "search" ? args[1] || "" : args[0] || "";
  runSecbSkillsCLI(query);
}
