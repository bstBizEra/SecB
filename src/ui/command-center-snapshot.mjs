// MOD-UI S1 successor: pure, unwired Command Center snapshot composer.
// Composes already-verified projections; never reads ledgers, authority,
// clocks, files, processes, or networks and exposes no action surface.

import { types as utilTypes } from "node:util";

export const COMMAND_CENTER_SECTIONS = Object.freeze([
  "events", "evidence", "goals", "runtime", "workspace", "operations", "replay"
]);
export const COMMAND_CENTER_SOURCE_STATUSES = Object.freeze(["AVAILABLE", "DEGRADED", "UNAVAILABLE"]);
export const COMMAND_CENTER_DENY_CODES = Object.freeze([
  "DENY_SNAPSHOT_MALFORMED", "DENY_PROJECT_SCOPE_MISMATCH"
]);

const INPUT_KEYS = Object.freeze(["projectId", "generatedAt", "sections"]);
const SOURCE_KEYS = Object.freeze([
  "status", "project_id", "source_version", "observed_at", "integrity_ref", "data", "reason"
]);
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isNonBlank = (value) => typeof value === "string" && value.trim().length > 0;

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

const deny = (code, message) => Object.freeze({ ok: false, code, message });

function snapshotClosedObject(value, allowedKeys) {
  if (!isObject(value) || utilTypes.isProxy(value)) throw new TypeError("plain object required");
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) throw new TypeError("custom prototype denied");
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== "string" || !allowedKeys.includes(key))) {
    throw new TypeError("unknown or symbolic key");
  }
  const snapshot = {};
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor)) throw new TypeError("accessor denied");
    Object.defineProperty(snapshot, key, {
      value: descriptor.value, enumerable: true, writable: true, configurable: true
    });
  }
  return snapshot;
}

function cloneJsonValue(value, ancestors = new Set()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("non-finite number denied");
    return value;
  }
  if (typeof value !== "object" || utilTypes.isProxy(value) || ancestors.has(value)) {
    throw new TypeError("non-JSON or cyclic value denied");
  }

  const next = new Set(ancestors).add(value);
  if (Array.isArray(value)) {
    const keys = Reflect.ownKeys(value);
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
    if (!lengthDescriptor || !Number.isSafeInteger(lengthDescriptor.value) || lengthDescriptor.value < 0) {
      throw new TypeError("invalid array length");
    }
    const length = lengthDescriptor.value;
    const allowed = new Set(["length", ...Array.from({ length }, (_, index) => String(index))]);
    if (keys.some((key) => typeof key !== "string" || !allowed.has(key)) || keys.length !== length + 1) {
      throw new TypeError("sparse, decorated, or symbolic array denied");
    }
    const output = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !("value" in descriptor)) throw new TypeError("array accessor denied");
      output.push(cloneJsonValue(descriptor.value, next));
    }
    return output;
  }

  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) throw new TypeError("non-plain object denied");
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== "string")) throw new TypeError("symbol key denied");
  const output = {};
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor)) throw new TypeError("object accessor denied");
    Object.defineProperty(output, key, {
      value: cloneJsonValue(descriptor.value, next), enumerable: true, writable: true, configurable: true
    });
  }
  return output;
}

function unavailableSection(sectionId, reason = "SOURCE_NOT_PROVIDED") {
  return deepFreeze({
    section_id: sectionId, status: "UNAVAILABLE", project_id: null,
    source_version: null, observed_at: null, integrity_ref: null, data: null, reason
  });
}

function snapshotSource(sectionId, source, projectId) {
  const item = snapshotClosedObject(source, SOURCE_KEYS);
  const { status, project_id: sourceProjectId, source_version: sourceVersion,
    observed_at: observedAt, integrity_ref: integrityRef, data, reason } = item;
  if (!COMMAND_CENTER_SOURCE_STATUSES.includes(status)) throw new TypeError("unknown source status");
  if (status === "UNAVAILABLE") {
    if (!isNonBlank(reason)) throw new TypeError("unavailable source requires reason");
    return unavailableSection(sectionId, reason);
  }
  if (!isNonBlank(sourceProjectId) || !isNonBlank(sourceVersion)
    || !isNonBlank(observedAt) || !isNonBlank(integrityRef) || !Object.hasOwn(item, "data")) {
    throw new TypeError("available source metadata incomplete");
  }
  if (sourceProjectId !== projectId) {
    return deny("DENY_PROJECT_SCOPE_MISMATCH", `section ${sectionId} does not match snapshot project`);
  }
  return deepFreeze({
    section_id: sectionId, status, project_id: sourceProjectId, source_version: sourceVersion,
    observed_at: observedAt, integrity_ref: integrityRef, data: cloneJsonValue(data),
    reason: status === "DEGRADED" ? (isNonBlank(reason) ? reason : "SOURCE_DECLARED_DEGRADED") : null
  });
}

export function composeCommandCenterSnapshot(input) {
  let top;
  try { top = snapshotClosedObject(input, INPUT_KEYS); }
  catch { return deny("DENY_SNAPSHOT_MALFORMED", "snapshot input extraction failed"); }
  const { projectId, generatedAt, sections } = top;
  if (!isNonBlank(projectId) || !isNonBlank(generatedAt) || !isObject(sections)) {
    return deny("DENY_SNAPSHOT_MALFORMED", "projectId, generatedAt, and sections are required");
  }

  let supplied;
  try { supplied = snapshotClosedObject(sections, COMMAND_CENTER_SECTIONS); }
  catch { return deny("DENY_SNAPSHOT_MALFORMED", "section map extraction failed"); }

  const outputSections = {};
  const findings = [];
  try {
    for (const sectionId of COMMAND_CENTER_SECTIONS) {
      const section = Object.hasOwn(supplied, sectionId)
        ? snapshotSource(sectionId, supplied[sectionId], projectId)
        : unavailableSection(sectionId);
      if (section.ok === false) return section;
      outputSections[sectionId] = section;
      if (section.status !== "AVAILABLE") {
        findings.push(Object.freeze({ section_id: sectionId, status: section.status, reason: section.reason }));
      }
    }
  } catch {
    return deny("DENY_SNAPSHOT_MALFORMED", "source projection extraction failed");
  }

  return deepFreeze({
    ok: true, data_untrusted: true, snapshot_version: "1", project_id: projectId,
    generated_at: generatedAt, overall_status: findings.length === 0 ? "COMPLETE" : "DEGRADED",
    sections: outputSections, findings
  });
}
