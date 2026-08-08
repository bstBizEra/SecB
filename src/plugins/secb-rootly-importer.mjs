/**
 * SecB Rootly Graphify Importer Plugin
 * 
 * Transforms incident management data (incidents, alerts, services, team escalations)
 * into SecB `KnowledgeClaim` records (`KCLAIM-ROOTLY-*`) for governance analysis.
 */

import { readFileSync, existsSync } from "node:fs";

export class RootlyImporterError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "RootlyImporterError";
    this.code = code;
  }
}

/**
 * Parse incident data payload and convert to canonical SecB KnowledgeClaims.
 *
 * @param {object} payload - Incident/alert JSON payload or path to graph.json
 * @param {object} [opts]
 * @param {string} [opts.project_id="SECB"]
 * @returns {Array<object>} List of valid KnowledgeClaim envelopes
 */
export function parseRootlyKnowledgeClaims(payload, { project_id = "SECB" } = {}) {
  let raw = payload;
  if (typeof payload === "string") {
    if (!existsSync(payload)) {
      throw new RootlyImporterError("FILE_NOT_FOUND", `Rootly data file not found: ${payload}`);
    }
    raw = JSON.parse(readFileSync(payload, "utf8"));
  }

  const claims = [];
  const incidents = raw.incidents ?? raw.data?.incidents ?? [];
  const alerts = raw.alerts ?? raw.data?.alerts ?? [];
  const services = raw.services ?? raw.data?.services ?? [];

  // 1. Process Services
  for (const svc of services) {
    claims.push({
      schema_version: "1.0",
      claim_id: `KCLAIM-ROOTLY-SVC-${svc.id ?? svc.name}`,
      project_id,
      subject: String(svc.name ?? svc.id),
      predicate: "is_monitored_service",
      object: String(svc.tier ?? "production_service"),
      evidence_refs: ["rootly-api/services"],
      verification_status: "VERIFIED"
    });
  }

  // 2. Process Incidents
  for (const inc of incidents) {
    claims.push({
      schema_version: "1.0",
      claim_id: `KCLAIM-ROOTLY-INC-${inc.id}`,
      project_id,
      subject: String(inc.title ?? inc.id),
      predicate: "has_incident_severity",
      object: String(inc.severity ?? "SEV-2"),
      evidence_refs: [String(inc.url ?? `rootly-api/incidents/${inc.id}`)],
      verification_status: "VERIFIED"
    });

    if (inc.service_id || inc.service_name) {
      claims.push({
        schema_version: "1.0",
        claim_id: `KCLAIM-ROOTLY-EDGE-${inc.id}-${inc.service_id ?? inc.service_name}`,
        project_id,
        subject: String(inc.title ?? inc.id),
        predicate: "impacts_service",
        object: String(inc.service_name ?? inc.service_id),
        evidence_refs: ["rootly-api/incidents"],
        verification_status: "VERIFIED"
      });
    }
  }

  // 3. Process Alerts
  for (const alt of alerts) {
    claims.push({
      schema_version: "1.0",
      claim_id: `KCLAIM-ROOTLY-ALT-${alt.id}`,
      project_id,
      subject: String(alt.source ?? alt.id),
      predicate: "triggered_alert",
      object: String(alt.summary ?? alt.id),
      evidence_refs: ["rootly-api/alerts"],
      verification_status: "VERIFIED"
    });
  }

  return claims;
}
