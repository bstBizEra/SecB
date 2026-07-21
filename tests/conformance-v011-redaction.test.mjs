/**
 * V-011 Redaction conformance — CANDIDATE (AMD-002 advise-and-proceed).
 *
 * Exercises the pre-storage redaction / block-or-quarantine evaluator
 * (src/security/redaction-policy.mjs) against the V-011 row of the P0
 * verification matrix:
 *
 *   Positive case            : "secrets removed before storage"
 *   Negative/adversarial case: "raw secret capture blocked/quarantined"
 *   Doctrine                 : docs/08-security/data-privacy-retention.md
 *                              (SECB-SEC-DATA-001)
 *
 * Discipline (matches the rest of the conformance suite):
 *   - Composes the REAL primitive READ-ONLY. Nothing is stored, transmitted, or
 *     mutated; the evaluator is pure.
 *   - The single overriding safety invariant every case asserts: a RAW SECRET
 *     NEVER appears in the returned result — not in `redacted`, not in the
 *     manifest, not anywhere in JSON.stringify(result).
 *   - Every negative asserts the SPECIFIC deny code the primitive emits.
 *   - Every adversarial (obfuscated/split secret, secret in a nested field,
 *     hostile getter, prototype pollution, secret smuggled via a caller-
 *     supplied manifest field) asserts fail-closed behaviour AND the
 *     secret-never-leaks invariant.
 *   - A byte-identity guard at the bottom pins the two doctrine documents this
 *     conformance codifies to their git blobs at main @ ec5aa76, so doctrine
 *     drift fails the suite.
 *
 * SCOPE HONESTY: this is a conformance-COVERAGE candidate for a CANDIDATE
 * primitive that is wired to nothing. It is NOT P0-18 sign-off and does NOT
 * render any governance verdict; adoption of the primitive is SEC/GOV-gated.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

import {
  evaluateForStorage,
  DENY_REDACTION_MALFORMED,
  DENY_CLASSIFICATION_REQUIRED,
  DENY_RAW_SECRET_BLOCKED,
  CAPTURE_LEVELS
} from "../src/security/redaction-policy.mjs";

const NUL = String.fromCharCode(0);

// Well-known, synthetic secret literals used across the cases. None is a real
// credential. Each case asserts its literal never survives into the result.
const AWS_KEY = "AKIAIOSFODNN7EXAMPLE";
const GITHUB_TOKEN = "ghp_" + "a".repeat(36);
const EMAIL = "alice.smith@example.com";
const HIGH_ENTROPY = "xK7pQ2mZ9vB4nR6tW1yA3sD5fG8hJ0lC7uE2iO4"; // 39-char random-looking
const PRIVATE_KEY_BLOCK =
  "-----BEGIN RSA PRIVATE KEY-----\n" +
  "MIIBOgIBAAJBAKj34GkxFhD90vcNLYLInFEX6Ppy1tPf9Cnzj4p4WGeKLs1Pt8Q\n" +
  "-----END RSA PRIVATE KEY-----";

// The one safety invariant that must hold for EVERY result, always.
function assertSecretNeverLeaks(result, ...secrets) {
  const serialized = JSON.stringify(result);
  for (const secret of secrets) {
    assert.ok(
      !serialized.includes(secret),
      `raw secret must never appear anywhere in the result (leaked: ${secret.slice(0, 12)}…)`
    );
  }
}

// ---------------------------------------------------------------------------
// POSITIVE — clean content: ok, redacted === content, empty manifest.
// ---------------------------------------------------------------------------

test("V-011 positive: clean content stores unchanged with an empty redaction manifest", () => {
  const content = "Deployment finished successfully. All health checks passed at noon.";
  const result = evaluateForStorage({ content, classification: "C2" });

  assert.equal(result.ok, true);
  assert.equal(result.redacted, content, "no secret => content passes through byte-for-byte");
  assert.equal(result.manifest.removed_count, 0, "empty manifest for clean content");
  assert.deepEqual(result.manifest.removed, [], "nothing removed");
  assert.equal(result.manifest.classification, "C2");
  // Guard: the recognized capture levels are exactly the doctrine set.
  assert.deepEqual([...CAPTURE_LEVELS], ["C0", "C1", "C2", "C3", "C4"]);
});

// ---------------------------------------------------------------------------
// NEGATIVE — content with an embedded secret. Per policy this is EITHER
// redacted+manifest (redactable inline secret) OR blocked/quarantined
// (non-redactable credential-file material). Both are asserted; in both the
// raw secret never survives into the result.
// ---------------------------------------------------------------------------

test("V-011 negative (redact path): an embedded token is removed before storage; manifest proves it without carrying it", () => {
  const content = `deploy log: exported GITHUB_TOKEN=${GITHUB_TOKEN} then contacted ${EMAIL}`;
  const result = evaluateForStorage({ content, classification: "C2" });

  // Storable, but only in redacted form.
  assert.equal(result.ok, true);
  assert.ok(!result.redacted.includes(GITHUB_TOKEN), "token removed from stored form");
  assert.ok(!result.redacted.includes(EMAIL), "PII email removed from stored form");
  assert.ok(result.redacted.includes("[REDACTED:github_token:"), "typed placeholder substituted");
  assert.ok(result.redacted.includes("[REDACTED:email:"), "PII placeholder substituted");

  // Manifest PROVES removal without carrying the secret: type + position +
  // length + a NON-REVERSIBLE fingerprint (a truncated SHA-256), never the raw
  // value.
  assert.equal(result.manifest.removed_count, 2);
  const tokenEntry = result.manifest.removed.find((entry) => entry.type === "github_token");
  assert.ok(tokenEntry, "github token recorded");
  assert.equal(typeof tokenEntry.index, "number");
  assert.equal(tokenEntry.length, GITHUB_TOKEN.length);
  // Fingerprint is the truncated SHA-256 of the secret — one-way, and it does
  // NOT contain the secret.
  const expectedFp = createHash("sha256").update(GITHUB_TOKEN, "utf8").digest("hex").slice(0, 16);
  assert.equal(tokenEntry.fingerprint, expectedFp, "fingerprint is the documented one-way digest");
  assert.ok(!tokenEntry.fingerprint.includes(GITHUB_TOKEN), "fingerprint is not the raw secret");

  // The overriding invariant.
  assertSecretNeverLeaks(result, GITHUB_TOKEN, EMAIL);
});

test("V-011 negative (block path): non-redactable private-key material is blocked/quarantined, not stored", () => {
  const content = `here is my key:\n${PRIVATE_KEY_BLOCK}\nplease save it`;
  const result = evaluateForStorage({ content, classification: "C4" });

  assert.equal(result.ok, false, "raw secret capture blocked/quarantined");
  assert.equal(result.code, DENY_RAW_SECRET_BLOCKED);
  assert.equal(result.redacted, undefined, "a blocked request yields NO stored form");
  // A blocked result never echoes the key body back to the caller.
  assertSecretNeverLeaks(result, PRIVATE_KEY_BLOCK);
});

test("V-011 negative (classification gate): an unknown classification fails closed before any storage", () => {
  const result = evaluateForStorage({ content: "hello", classification: "C9" });
  assert.equal(result.ok, false);
  assert.equal(result.code, DENY_CLASSIFICATION_REQUIRED);
});

// ---------------------------------------------------------------------------
// ADVERSARIAL — every hostile shape fails closed and never leaks the secret.
// ---------------------------------------------------------------------------

test("V-011 adversarial: obfuscated/unlabelled high-entropy secret is caught by the entropy fallback", () => {
  // No known prefix — an unlabelled random token. The conservative entropy
  // fallback still removes it before storage.
  const content = `session resumed with blob ${HIGH_ENTROPY} at edge`;
  const result = evaluateForStorage({ content, classification: "C2" });

  assert.equal(result.ok, true);
  assert.ok(!result.redacted.includes(HIGH_ENTROPY), "high-entropy secret removed");
  assert.ok(result.redacted.includes("[REDACTED:high_entropy_secret:"));
  assert.equal(result.manifest.removed_count, 1);
  assertSecretNeverLeaks(result, HIGH_ENTROPY);
});

test("V-011 adversarial: a secret smuggled in a NON-content field never reaches the output", () => {
  // The evaluator consults ONLY content + classification. A secret parked on
  // any other (even deeply nested) field is ignored and cannot be stored.
  const input = {
    content: "routine status line, nothing sensitive",
    classification: "C2",
    metadata: { credentials: { aws: AWS_KEY, nested: { deeper: GITHUB_TOKEN } } }
  };
  const result = evaluateForStorage(input);

  assert.equal(result.ok, true);
  assert.equal(result.redacted, "routine status line, nothing sensitive");
  assert.equal(result.manifest.removed_count, 0);
  assertSecretNeverLeaks(result, AWS_KEY, GITHUB_TOKEN);
});

test("V-011 adversarial: object-typed content (secret in a nested field of content) fails closed as malformed", () => {
  // If a caller passes a structured object as `content`, it is not classifiable
  // text: deny-by-default, and the embedded secret never surfaces.
  const result = evaluateForStorage({ content: { note: "x", token: AWS_KEY }, classification: "C2" });
  assert.equal(result.ok, false);
  assert.equal(result.code, DENY_REDACTION_MALFORMED);
  assertSecretNeverLeaks(result, AWS_KEY);
});

test("V-011 adversarial: a hostile getter on content is contained (never thrown, never leaked)", () => {
  const hostile = { classification: "C2" };
  Object.defineProperty(hostile, "content", {
    enumerable: true,
    configurable: true,
    get() {
      throw new Error("hostile accessor");
    }
  });
  const result = evaluateForStorage(hostile);
  assert.equal(result.ok, false);
  assert.equal(result.code, DENY_REDACTION_MALFORMED);
});

test("V-011 adversarial: content is read with EXACTLY ONE get (atomic single-read snapshot)", () => {
  // Proves the descriptor-trap-safe extraction reads content once and only
  // once — a getter cannot serve one value to a guard and another to the body.
  let reads = 0;
  const probe = { classification: "C2" };
  Object.defineProperty(probe, "content", {
    enumerable: true,
    configurable: true,
    get() {
      reads += 1;
      return "clean content with no secrets present";
    }
  });
  const result = evaluateForStorage(probe);
  assert.equal(result.ok, true);
  assert.equal(reads, 1, "content consulted exactly once");
});

test("V-011 adversarial: prototype-key smuggling of content is rejected (own property required)", () => {
  // content present ONLY on the prototype — not an own property. Deny-by-default.
  const smuggled = Object.create({ content: `leak ${AWS_KEY}` });
  smuggled.classification = "C2";
  const result = evaluateForStorage(smuggled);
  assert.equal(result.ok, false);
  assert.equal(result.code, DENY_REDACTION_MALFORMED);
  assertSecretNeverLeaks(result, AWS_KEY);
});

test("V-011 adversarial: prototype pollution in the input does not poison the evaluator or the output", () => {
  const polluted = JSON.parse(`{"__proto__":{"polluted":true},"content":"benign line","classification":"C2"}`);
  const result = evaluateForStorage(polluted);
  assert.equal(result.ok, true);
  assert.equal(result.redacted, "benign line");
  // Global prototype was not polluted.
  assert.equal({}.polluted, undefined, "Object.prototype not polluted");
});

test("V-011 adversarial: a secret smuggled via a caller-supplied `manifest`/`redacted` field is discarded", () => {
  // The output manifest/redacted is ALWAYS evaluator-built; a caller cannot
  // inject a secret by pre-populating these fields.
  const input = {
    content: "clean line",
    classification: "C2",
    manifest: { removed: [{ type: "planted", fingerprint: AWS_KEY, value: GITHUB_TOKEN }] },
    redacted: `pre-baked ${AWS_KEY}`
  };
  const result = evaluateForStorage(input);
  assert.equal(result.ok, true);
  assert.equal(result.redacted, "clean line", "evaluator-built redacted form, not the caller's");
  assert.equal(result.manifest.removed_count, 0, "evaluator-built manifest, not the caller's");
  assertSecretNeverLeaks(result, AWS_KEY, GITHUB_TOKEN);
});

// ---------------------------------------------------------------------------
// House-standard structural guards.
// ---------------------------------------------------------------------------

test("V-011 outputs are deep-frozen (allow and deny)", () => {
  const allow = evaluateForStorage({ content: `t ${AWS_KEY}`, classification: "C2" });
  assert.ok(Object.isFrozen(allow), "allow result frozen");
  assert.ok(Object.isFrozen(allow.manifest), "manifest frozen");
  assert.ok(Object.isFrozen(allow.manifest.removed), "removed array frozen");
  assert.ok(allow.manifest.removed.every((entry) => Object.isFrozen(entry)), "each removal frozen");
  assert.throws(() => {
    "use strict";
    allow.manifest.removed_count = 99;
  });

  const deny = evaluateForStorage({ content: PRIVATE_KEY_BLOCK });
  assert.ok(Object.isFrozen(deny), "deny result frozen");
});

test("V-011 non-object input fails closed", () => {
  for (const bad of [null, undefined, "string", 42, [], true]) {
    const result = evaluateForStorage(bad);
    assert.equal(result.ok, false);
    assert.equal(result.code, DENY_REDACTION_MALFORMED);
  }
});

test("V-011 content carrying a null byte fails closed", () => {
  const result = evaluateForStorage({ content: `a${NUL}b`, classification: "C1" });
  assert.equal(result.ok, false);
  assert.equal(result.code, DENY_REDACTION_MALFORMED);
});

// ---------------------------------------------------------------------------
// Byte-identity guard (main @ ec5aa76) — pins the doctrine this conformance
// codifies. If either source drifts, the V-011 basis changed and this fails.
// ---------------------------------------------------------------------------

function repoPath(rel) {
  return fileURLToPath(new URL(`../${rel}`, import.meta.url));
}

function gitBlobSha1(rel) {
  const normalized = readFileSync(repoPath(rel), "utf8").replace(/\r\n/g, "\n");
  const body = Buffer.from(normalized, "utf8");
  const header = Buffer.from(`blob ${body.length}${NUL}`, "utf8");
  return createHash("sha1").update(header).update(body).digest("hex");
}

const PINNED_BLOBS = Object.freeze({
  "docs/08-security/data-privacy-retention.md": "c5c9cb9ffbc3ad8c1de24b10eea02d87922484e8",
  "docs/04-assurance/verification-matrix.md": "ef4496bac5669e06c8dd8762f6ab59ef11f1535c"
});

test("byte-identity: the doctrine this V-011 conformance codifies is unchanged vs main @ ec5aa76", () => {
  for (const [rel, pinned] of Object.entries(PINNED_BLOBS)) {
    assert.equal(gitBlobSha1(rel), pinned, `${rel} blob-identical to main @ ec5aa76`);
  }
});
