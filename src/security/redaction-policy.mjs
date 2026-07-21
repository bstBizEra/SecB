// MOD-SECURITY V-011 (verification-matrix.md row V-011 "Redaction":
// "secrets removed before storage" / "raw secret capture blocked/quarantined";
// doctrine docs/08-security/data-privacy-retention.md, SECB-SEC-DATA-001):
// pre-storage redaction / block-or-quarantine EVALUATOR. PURE + UNWIRED.
//
// CANDIDATE (AMD-002 advise-and-proceed). This is a security-boundary primitive.
// It is wired to NOTHING: no capture pipeline, no ledger, no durable store, no
// live path consults it yet. Adoption (making any capture/append path call this
// BEFORE writing) is separately SEC/GOV-gated work and is OUT OF SCOPE here.
//
// WHAT IT DOES
// `evaluateForStorage({ content, classification? })` answers exactly one
// question a caller must ask BEFORE it durably stores a piece of content:
// "is it safe to store this, and if so, in what redacted form?" It returns
// EITHER
//   - a REDACTED result  { ok: true, redacted, manifest }  — the content is
//     storable once the located secrets/PII are removed; `redacted` is the
//     content with every located secret replaced by a typed placeholder, and
//     `manifest` is the REDACTION MANIFEST that preserves PROOF that content was
//     removed (doctrine "redaction manifest preserving proof that content was
//     removed") WITHOUT itself carrying the secret; OR
//   - a DENY / QUARANTINE { ok: false, code, message }      — the content
//     cannot be safely stored at all and must be blocked/quarantined rather than
//     silently persisted (doctrine "Do not persist raw secrets, private keys,
//     tokens, credential files").
//
// It performs NO I/O and touches NO real storage. It is a policy EVALUATOR the
// caller consults; it never itself appends, mints, or mutates anything.
//
// HARD BOUNDARY: this evaluator DECIDES redaction/blocking only. It does not
// capture, transmit, encrypt, persist, or quarantine anything — those are the
// caller's separately-governed actuations. Deny-by-default throughout: any
// content this evaluator cannot reason about safely is DENIED, never stored.
//
// DOCTRINE MAPPING (docs/08-security/data-privacy-retention.md):
//   - "secret and personal-data redaction before durable storage"  -> the
//     redact path replaces located API keys / tokens / cloud keys / JWTs /
//     high-entropy secrets / emails (PII) with placeholders before returning a
//     storable form.
//   - "Do not persist raw secrets, private keys, tokens, credential files"     ->
//     private-key / credential-file material is NON-redactable: its presence
//     means the artifact IS a credential file, so the whole storage request is
//     blocked/quarantined (DENY_RAW_SECRET_BLOCKED), not redacted-and-stored.
//   - "classification and purpose before collection"              -> when a
//     `classification` is supplied it must be a recognized capture level
//     (C0..C4); an unrecognized classification fails closed
//     (DENY_CLASSIFICATION_REQUIRED) — content is never stored under an
//     unknown classification.
//   - "redaction manifest preserving proof that content was removed"           ->
//     the manifest records, per removal, the secret TYPE, its POSITION (index)
//     in the original content, its LENGTH, and a NON-REVERSIBLE FINGERPRINT (a
//     truncated SHA-256 of the secret) — enough to PROVE a specific secret was
//     removed, never enough to RECOVER it.
//
// FAIL-CLOSED ATOMIC EXTRACTION (house standard; descriptor-trap-safe variant):
// the two consulted fields (`content`, `classification`) are captured in a
// single atomic snapshot — ONE `Reflect.ownKeys(input)` structural read decides
// key PRESENCE (prototype-key smuggling ignored; inherited keys are not own),
// then each present field's VALUE is read with exactly ONE `[[Get]]` and stored
// immediately into a local. No field is ever re-read, and NO per-field
// `getOwnPropertyDescriptor` probe is used (a hostile `getOwnPropertyDescriptor`
// trap is therefore never even invoked). A throwing accessor / Proxy trap lands
// in the surrounding try/catch and becomes the structured malformed denial —
// it never crashes the evaluator and never returns one value to a guard and
// another to the body.
//
// House style (matches access-mode-policy.mjs, overlap-policy.mjs,
// event-family-policy.mjs): structured denials { ok: false, code, message },
// deny-by-default on malformed/unknown/ambiguous input, DEEP-FROZEN outputs,
// no I/O, no clock.

import { createHash } from "node:crypto";

// --- Deny codes -------------------------------------------------------------

// The request is structurally unusable: input not a plain object, `content` not
// an own property, `content` not a string (a nested object / binary blob is not
// classifiable text and fails closed here), `content` carries a null byte, or a
// contained extraction threw (hostile getter / Proxy trap). Deny-by-default.
export const DENY_REDACTION_MALFORMED = "DENY_REDACTION_MALFORMED";

// Doctrine ("classification and purpose before collection"): a `classification`
// was supplied but is not one of the recognized capture levels (C0..C4).
// Fail-closed — content is never stored under an unknown/ambiguous
// classification.
export const DENY_CLASSIFICATION_REQUIRED = "DENY_CLASSIFICATION_REQUIRED";

// Doctrine ("Do not persist raw secrets, private keys, tokens, credential
// files"): the content contains material whose CLASS is non-redactable — a
// private key / credential-file block. Redacting the body would still leave a
// credential-file artifact, so the ENTIRE storage request is blocked and must
// be quarantined instead of stored. This is the "raw secret capture
// blocked/quarantined" half of V-011.
export const DENY_RAW_SECRET_BLOCKED = "DENY_RAW_SECRET_BLOCKED";

// --- Doctrine data ----------------------------------------------------------

// Recognized capture levels (docs/08-security/data-privacy-retention.md
// "## Capture Levels"). A supplied classification MUST be one of these.
export const CAPTURE_LEVELS = Object.freeze(["C0", "C1", "C2", "C3", "C4"]);

// U+0000. Built via fromCharCode so no raw control byte lives in this file.
const NULL_BYTE = String.fromCharCode(0);

// Placeholder version / policy identifiers surfaced in the manifest.
const REDACTION_MANIFEST_VERSION = 1;
const REDACTION_POLICY_ID = "SECB-SEC-DATA-001-redaction";

// Length of the non-reversible fingerprint (hex chars) recorded per removal.
// A truncated SHA-256; enough to bind proof to a specific secret, far too short
// and one-way to recover it.
const FINGERPRINT_HEX_LENGTH = 16;

// --- Detection set ----------------------------------------------------------
//
// NON-REDACTABLE (must block/quarantine the whole artifact). A PEM private-key
// block is credential-file material: its very presence makes the artifact a
// credential file, which doctrine forbids persisting even in redacted form.
// Matched leniently (any BEGIN..END PRIVATE KEY envelope) because we only need
// to know one is PRESENT to block — we never store or fingerprint its body.
const BLOCK_PATTERNS = Object.freeze([
  Object.freeze({
    type: "private_key_block",
    // -----BEGIN [ANYTHING ]PRIVATE KEY----- ... (RSA/EC/OPENSSH/PGP/plain)
    regex: /-----BEGIN(?:[A-Z0-9 ]+)? PRIVATE KEY-----/
  })
]);

// REDACTABLE inline secrets / PII. Conservative, well-known formats. Order is
// priority order for overlap resolution (earlier wins on a tie). Every pattern
// is anchored on structural markers to keep false positives low.
const REDACT_PATTERNS = Object.freeze([
  // AWS access key id (AKIA/ASIA + 16 upper-alnum).
  Object.freeze({ type: "aws_access_key_id", regex: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g }),
  // GitHub personal/OAuth/app/refresh tokens (ghp_/gho_/ghu_/ghs_/ghr_ + >=36).
  Object.freeze({ type: "github_token", regex: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g }),
  // Slack tokens (xoxb-/xoxa-/xoxp-/xoxr-/xoxs- + body).
  Object.freeze({ type: "slack_token", regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g }),
  // Google API key (AIza + 35 url-safe).
  Object.freeze({ type: "google_api_key", regex: /\bAIza[0-9A-Za-z_-]{35}\b/g }),
  // JSON Web Token (three base64url segments).
  Object.freeze({ type: "jwt", regex: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g }),
  // Email address (PII).
  Object.freeze({ type: "email", regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g })
]);

// High-entropy fallback: a long unbroken token of secret-like characters whose
// Shannon entropy is high enough to be an unlabeled secret (random key/token)
// rather than ordinary prose. Deliberately conservative — length >= 32 AND
// entropy >= 4.0 bits/char — so it rarely fires on normal text; over-redaction,
// if it ever happens, is the fail-SAFE direction.
const HIGH_ENTROPY_REGEX = /[A-Za-z0-9+/=_-]{32,}/g;
const HIGH_ENTROPY_MIN_BITS_PER_CHAR = 4.0;

// --- Internals --------------------------------------------------------------

function deny(code, message) {
  return Object.freeze({ ok: false, code, message });
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// Non-reversible fingerprint of a located secret: truncated SHA-256 hex. The
// raw secret NEVER appears in the manifest — only this one-way digest does.
function fingerprint(secret) {
  return createHash("sha256").update(secret, "utf8").digest("hex").slice(0, FINGERPRINT_HEX_LENGTH);
}

// Shannon entropy (bits per character) of a string.
function shannonBitsPerChar(text) {
  const counts = new Map();
  for (const ch of text) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  let bits = 0;
  for (const count of counts.values()) {
    const p = count / text.length;
    bits -= p * Math.log2(p);
  }
  return bits;
}

// Collect every redactable match (typed patterns + high-entropy fallback) as
// { type, index, length, value } ranges over the ORIGINAL content.
function collectRedactableMatches(content) {
  const matches = [];
  for (const spec of REDACT_PATTERNS) {
    const regex = new RegExp(spec.regex.source, spec.regex.flags);
    let m;
    while ((m = regex.exec(content)) !== null) {
      if (m[0].length === 0) {
        regex.lastIndex += 1;
        continue;
      }
      matches.push({ type: spec.type, index: m.index, length: m[0].length, value: m[0] });
    }
  }
  const entropyRegex = new RegExp(HIGH_ENTROPY_REGEX.source, HIGH_ENTROPY_REGEX.flags);
  let em;
  while ((em = entropyRegex.exec(content)) !== null) {
    if (em[0].length === 0) {
      entropyRegex.lastIndex += 1;
      continue;
    }
    if (shannonBitsPerChar(em[0]) >= HIGH_ENTROPY_MIN_BITS_PER_CHAR) {
      matches.push({ type: "high_entropy_secret", index: em.index, length: em[0].length, value: em[0] });
    }
  }
  return matches;
}

// Resolve overlaps: sort by start index (earlier first), then by longer span,
// then by pattern discovery order. Keep a match only if it does not overlap an
// already-kept one. This guarantees each byte of the original is redacted at
// most once and prevents double-counting the same secret found by two patterns.
function resolveOverlaps(matches) {
  const sorted = matches
    .map((match, order) => ({ ...match, order }))
    .sort((a, b) => a.index - b.index || b.length - a.length || a.order - b.order);
  const kept = [];
  let coveredUntil = -1;
  for (const match of sorted) {
    if (match.index >= coveredUntil) {
      kept.push(match);
      coveredUntil = match.index + match.length;
    }
  }
  return kept;
}

// --- evaluateForStorage -----------------------------------------------------
//
// Pure pre-storage redaction EVALUATOR (V-011). Input:
//   { content, classification? }
//
//   content         — required string. The candidate content a caller wants to
//                     durably store. A non-string (nested object / binary) is
//                     unclassifiable text and fails closed
//                     (DENY_REDACTION_MALFORMED). Only THIS field and
//                     `classification` are ever consulted; any other property
//                     on the input (including a caller-supplied `manifest` or
//                     `redacted`) is IGNORED and can never reach the output.
//   classification? — optional capture level (C0..C4). If present it must be
//                     recognized (DENY_CLASSIFICATION_REQUIRED otherwise). If
//                     absent, resolves to null and the scan is the safety net.
//
// Returns EITHER
//   Object.freeze({ ok: true, redacted, manifest })  — storable; `redacted` is
//     content with located secrets replaced; `manifest` proves what was removed
//     (empty removed[] for clean content), OR
//   Object.freeze({ ok: false, code, message })      — blocked/quarantined or
//     malformed. Never throws. Mints nothing, mutates nothing, wired to nothing.
export function evaluateForStorage(input) {
  if (!isPlainObject(input)) {
    return deny(DENY_REDACTION_MALFORMED, "input must be a plain object carrying content");
  }

  let content;
  let classification;
  try {
    // ONE structural snapshot of own keys — presence decided from this set
    // alone; inherited (prototype) keys are never treated as own, so
    // prototype-key smuggling is ignored.
    const ownKeys = new Set(Reflect.ownKeys(input));
    if (!ownKeys.has("content")) {
      return deny(DENY_REDACTION_MALFORMED, "content must be an own property of the input");
    }
    // Exactly ONE [[Get]] per consulted field, captured immediately. No field
    // is re-read; no getOwnPropertyDescriptor probe is used (descriptor-trap
    // never invoked). A hostile accessor throws into the catch below.
    content = input.content;
    classification = ownKeys.has("classification") ? input.classification : null;
  } catch {
    return deny(DENY_REDACTION_MALFORMED, "content extraction failed (hostile accessor contained)");
  }

  if (typeof content !== "string") {
    return deny(DENY_REDACTION_MALFORMED, "content must be a string");
  }
  if (content.includes(NULL_BYTE)) {
    return deny(DENY_REDACTION_MALFORMED, "content must not contain null bytes");
  }

  // Doctrine: classification-before-collection. A supplied classification must
  // be a recognized capture level; unknown => fail closed. (null = none supplied.)
  if (classification !== null && classification !== undefined) {
    if (typeof classification !== "string" || !CAPTURE_LEVELS.includes(classification)) {
      return deny(
        DENY_CLASSIFICATION_REQUIRED,
        "classification, when supplied, must be one of the SECB-SEC-DATA-001 capture levels (C0..C4)"
      );
    }
  }
  const resolvedClassification = typeof classification === "string" ? classification : null;

  // BLOCK phase (precedes redaction): non-redactable credential-file material
  // means the entire artifact is blocked/quarantined, not redacted-and-stored.
  for (const spec of BLOCK_PATTERNS) {
    if (spec.regex.test(content)) {
      return deny(
        DENY_RAW_SECRET_BLOCKED,
        `content contains non-redactable ${spec.type} material and must be blocked/quarantined, not stored`
      );
    }
  }

  // REDACT phase: locate every redactable secret/PII, resolve overlaps, rebuild
  // the content once, and record proof-of-removal in the manifest.
  const kept = resolveOverlaps(collectRedactableMatches(content));
  kept.sort((a, b) => a.index - b.index);

  const removed = [];
  let redacted = "";
  let cursor = 0;
  for (const match of kept) {
    const fp = fingerprint(match.value);
    redacted += content.slice(cursor, match.index);
    redacted += `[REDACTED:${match.type}:${fp}]`;
    cursor = match.index + match.length;
    removed.push(
      Object.freeze({
        type: match.type,
        index: match.index,
        length: match.length,
        fingerprint: fp
      })
    );
  }
  redacted += content.slice(cursor);

  const manifest = deepFreeze({
    redaction_manifest_version: REDACTION_MANIFEST_VERSION,
    policy_id: REDACTION_POLICY_ID,
    classification: resolvedClassification,
    removed_count: removed.length,
    removed
  });

  return Object.freeze({ ok: true, redacted, manifest });
}
