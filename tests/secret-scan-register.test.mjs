// Every secret-shaped string in the tracked tree is registered, so the next one
// is loud.
//
// WORK PACKAGE (Phase E, recorded here)
//
//   Objective    Make a real leak distinguishable from the fixtures.
//   Problem      13 high-confidence matches exist across the tracked tree — AWS
//                key ids, PEM private-key headers, GitHub and Stripe token
//                shapes — and every one is legitimate negative-test material.
//                Nothing scanned for them, and nothing distinguished them from a
//                leak. A scanner introduced without a register returns 13 hits,
//                a reader learns they are known false positives, and the
//                fourteenth arrives into a report nobody reads carefully. That
//                is alarm fatigue engineered in, and it looks like coverage.
//   Verified     All 13 read before registration. `AKIAIOSFODNN7EXAMPLE` is AWS's
//                published documentation key; the PEM matches are bare headers in
//                lists the credential broker must REJECT; the tokens are
//                sequential placeholders (`ghp_0123456789abcdefghij`). Two of
//                this repository's own SEC review documents already classify the
//                AWS string as "the canonical AWS documentation placeholder".
//                NO REAL SECRET MATERIAL. No SECURITY_HOLD.
//   Scope        tools/ + tests/. Detects only; administers no credential, which
//                is out of Phase 0 scope.
//   Authority    AMD-002 §1 pre-authorized. Adds a control, removes none.
//   Completion   An unregistered digest fails; a registered digest that changes
//                fails.
//
// KEYED BY DIGEST, NOT BY SITE
//
// Six distinct strings account for all 13 matches — the AWS key alone appears
// six times. A site-keyed register would churn every time a review document
// quotes a fixture, which these documents legitimately do, and churn is how a
// register stops being read. A NEW digest is always a finding; the same reviewed
// string appearing in another review is not.
//
// Registered by digest rather than by literal for a second reason: an allowlist
// that quotes the material copies it into one more file. The point is fewer
// places carrying secret-shaped strings, not more.

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { PATTERNS, scan } from "../tools/secb-secret-scan.mjs";

/**
 * Secret-shaped strings that are reviewed test or documentation material.
 *
 * DO NOT ADD AN ENTRY TO SILENCE A FAILURE. A new line asserts that a human read
 * the material and found it safe. If you cannot say what the string is, it is
 * not registrable — it is a finding.
 */
const REGISTERED = Object.freeze({
  "1a5d44a2dca19669": {
    what: "AKIAIOSFODNN7EXAMPLE — AWS's own published documentation example key id",
    why: "Negative material for the redaction evaluator, the credential broker's plaintext screen, and the gateway's result screen. Also quoted by two SEC review documents that classify it as the canonical placeholder.",
    decider: "SEC review (secb-gov-001-w2-g3-sec-review-001/002)"
  },
  "8bcac7908eb95041": {
    what: "the string `-----BEGIN RSA PRIVATE KEY-----` — a PEM header, not a key",
    why: "Used as material the credential broker must reject and the redaction evaluator must catch. In credential-broker.test.mjs it is the bare header in a list of plaintexts expected to DENY_SEALER_INVALID.",
    decider: "SEC review"
  },
  "9ca870ebe12acf3d": {
    what: "ghp_0123456789abcdefghij — a sequential-digit GitHub token placeholder",
    why: "Adversarial gateway test: the token must be refused at the result screen.",
    decider: "SEC review"
  },
  "7a4316d11b9d17f7": {
    what: "github_pat_11ABCDEF0123456789ABCDEF — an alphabet-sequence fine-grained PAT placeholder",
    why: "Same adversarial gateway test, second token shape.",
    decider: "SEC review"
  },
  "342e20dec519556f": {
    what: "sk_live_0123456789abcdef — a sequential-digit Stripe key placeholder",
    why: "Same adversarial gateway test, third token shape.",
    decider: "SEC review"
  },
  "64ffc774543fdee4": {
    what: "ghp_abcdefgh12345678zzzz — an alphabet-sequence GitHub token placeholder",
    why: "P0-18 adversarial case: an adapter result carrying credential material must return DENY_RESULT_INVALID, proving secrets never cross the gateway boundary.",
    decider: "SEC review"
  }
});

test("no unregistered secret-shaped string is in the tracked tree", () => {
  const unregistered = scan()
    .filter((hit) => !(hit.sha256_16 in REGISTERED))
    .map((hit) => `${hit.pattern} ${hit.file}:${hit.line} sha256:${hit.sha256_16}`);

  assert.deepEqual(
    unregistered,
    [],
    "A secret-shaped string appeared that no one has classified. READ IT BEFORE REGISTERING IT. " +
      "If it is real credential material this is an incident: rotate first, then remove it from " +
      "history — deleting the file does not remove it from the tree it was committed in."
  );
});

test("every registered digest is still present, so the register describes the tree", () => {
  const present = new Set(scan().map((hit) => hit.sha256_16));
  const absent = Object.keys(REGISTERED).filter((d) => !present.has(d));
  assert.deepEqual(
    absent,
    [],
    "A registered digest is no longer anywhere in the tree. Remove the entry deliberately — a " +
      "register that lists material nobody can find teaches readers to skim it."
  );
});

test("every registration says what the string is and who reviewed it", () => {
  for (const [digest, entry] of Object.entries(REGISTERED)) {
    for (const field of ["what", "why", "decider"]) {
      assert.ok(
        typeof entry[field] === "string" && entry[field].trim().length > 0,
        `${digest}: ${field} is empty; an entry that cannot say what the string is registers nothing`
      );
    }
    assert.ok(
      !/\b(agent|claude|codex|worker)\b/i.test(entry.decider),
      `${digest}: an agent may not be the reviewer of record for secret material`
    );
  }
});

test("the scanner still carries the patterns it claims", () => {
  // A register is only as good as what the scanner looks for. Silently dropping
  // a pattern would empty the findings and read as an improvement.
  const names = PATTERNS.map(([name]) => name).sort();
  assert.deepEqual(names, [
    "aws-access-key-id",
    "github-token",
    "google-api-key",
    "jwt",
    "npm-token",
    "private-key-block",
    "slack-token",
    "stripe-key"
  ]);
});

test("the scanner detects material it has never seen", () => {
  // Proves the scanner can fire at all, against a string constructed here rather
  // than one already in the tree. A detector that only ever matches its own
  // fixtures has not been shown to work.
  const [, awsPattern] = PATTERNS.find(([name]) => name === "aws-access-key-id");
  awsPattern.lastIndex = 0;
  assert.ok(awsPattern.test(`AKIA${"Q".repeat(16)}`), "the AWS pattern does not match a well-formed key id");

  const [, jwtPattern] = PATTERNS.find(([name]) => name === "jwt");
  jwtPattern.lastIndex = 0;
  assert.ok(jwtPattern.test("eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NSJ9.dBjftJeZ4CVPmB92K27u"), "the JWT pattern is inert");
});
