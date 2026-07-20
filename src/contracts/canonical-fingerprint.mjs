import { createHash } from "node:crypto";

// TE-H4: single canonicalization/fingerprint implementation shared by the
// TransitionEngine, the WorkPackage service, and future consumers (P0-10
// context federation, P0-13 evidence sealing). Divergent copies of this
// logic would fracture replay semantics across services.

export function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

export function canonicalFingerprint(value) {
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}
