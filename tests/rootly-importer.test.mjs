/**
 * SecB Rootly Importer Plugin Unit Tests
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { parseRootlyKnowledgeClaims } from "../src/plugins/secb-rootly-importer.mjs";

test("AC-ROOTLY-01: parseRootlyKnowledgeClaims converts incidents, alerts, services to KnowledgeClaims", () => {
  const mockPayload = {
    services: [
      { id: "svc-auth", name: "AuthService", tier: "TIER-1" }
    ],
    incidents: [
      { id: "inc-101", title: "Auth Latency Spike", severity: "SEV-1", service_name: "AuthService" }
    ],
    alerts: [
      { id: "alt-500", source: "Datadog", summary: "High P99 HTTP 500" }
    ]
  };

  const claims = parseRootlyKnowledgeClaims(mockPayload, { project_id: "SECB" });
  assert.equal(claims.length, 4);

  const svcClaim = claims.find(c => c.subject === "AuthService");
  assert.equal(svcClaim.predicate, "is_monitored_service");

  const incClaim = claims.find(c => c.subject === "Auth Latency Spike" && c.predicate === "has_incident_severity");
  assert.equal(incClaim.object, "SEV-1");

  const edgeClaim = claims.find(c => c.predicate === "impacts_service");
  assert.equal(edgeClaim.subject, "Auth Latency Spike");
  assert.equal(edgeClaim.object, "AuthService");
});
