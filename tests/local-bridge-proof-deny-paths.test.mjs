// The nine deny paths of the installation-proof validator that had never been
// shown to fire.
//
// WORK PACKAGE (Phase E, recorded here)
//
//   Objective    Demonstrate every deny path of a security-boundary validator
//                that this repository's own wiring put on the live surface.
//   Problem      437 DENY_ codes exist across src/; 45 on the LIVE surface are
//                named by no test. Nine of those belong to
//                local-bridge-installation-proof.mjs, whose validator IS called
//                six times by the existing suite — so it looked covered — while
//                nine of its fifteen deny paths had never been triggered.
//   Why mine     That module became part of the live surface in wiring slice 5,
//                which I performed. No wiring slice checked whether the deny
//                paths of a module it was exporting had ever been exercised.
//                Making a control reachable without demonstrating its refusals
//                is expanding the surface, not the coverage.
//   Scope        tests/ only. The validator is not modified.
//   Authority    AMD-002 §1 pre-authorized path.
//   Completion   Each of the nine is triggered and asserted by exact code, and
//                the ratchet in deny-path-coverage.test.mjs records the drop.
//
// Every case here asserts the EXACT deny code. Asserting only that a call threw
// would pass on the wrong refusal, and on a security boundary the difference
// between two denials is the whole content of the control.

import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

import { validateContract } from "../src/contracts/contract-validator.mjs";
import {
  LOCAL_BRIDGE_PROOF_MAX_TTL_MS,
  validateLocalBridgeInstallationProof
} from "../src/bridge/local-bridge-installation-proof.mjs";

const fixture = (rel) => JSON.parse(readFileSync(resolve(import.meta.dirname, "fixtures", rel), "utf8"));
const transcript = fixture("valid/local-bridge-handshake-transcript.json");
const proof = fixture("valid/local-bridge-installation-proof.json");

const validateProof = (c) => validateContract("localBridgeInstallationProof", c);
const validateTranscript = (c) => validateContract("localBridgeHandshakeTranscript", c);
const now = () => new Date("2026-07-31T08:02:15Z");

const options = Object.freeze({
  acceptedProofProfileIds: [proof.proof_profile_id],
  now,
  validateProof,
  validateTranscript
});

/** Assert the call refuses with EXACTLY this code. */
function denies(code, run) {
  let error = null;
  try {
    run();
  } catch (caught) {
    error = caught;
  }
  assert.ok(error, `expected ${code}, but the call returned instead of refusing`);
  assert.equal(error.code, code, `expected ${code}, got ${error.code ?? error.message}`);
}

test("DENY_PROOF_OPTIONS — options that are not an object, or carry an unknown key", () => {
  denies("DENY_PROOF_OPTIONS", () => validateLocalBridgeInstallationProof(proof, transcript, null));
  denies("DENY_PROOF_OPTIONS", () => validateLocalBridgeInstallationProof(proof, transcript, []));
  // An UNKNOWN key is refused rather than ignored. Silently dropping an option a
  // caller believed it had set is how a boundary is disabled by a typo.
  denies("DENY_PROOF_OPTIONS", () =>
    validateLocalBridgeInstallationProof(proof, transcript, { ...options, acceptedProofProfileIDs: [] })
  );
});

test("DENY_PROOF_INVALID — the proof fails its own contract", () => {
  const { proof_profile_id, ...missingProfile } = proof;
  denies("DENY_PROOF_INVALID", () =>
    validateLocalBridgeInstallationProof(missingProfile, transcript, options)
  );
});

test("DENY_PROOF_TRANSCRIPT_INVALID — the transcript fails its own contract", () => {
  const { authority_domain_id, ...missingDomain } = transcript;
  denies("DENY_PROOF_TRANSCRIPT_INVALID", () =>
    validateLocalBridgeInstallationProof(proof, missingDomain, options)
  );
});

test("DENY_PROOF_CLOCK_UNAVAILABLE — no clock, or a clock that does not yield a finite time", () => {
  denies("DENY_PROOF_CLOCK_UNAVAILABLE", () =>
    validateLocalBridgeInstallationProof(proof, transcript, { ...options, now: "2026-07-31T08:02:15Z" })
  );
  // A clock that throws or returns a non-Date must be indistinguishable from no
  // clock. A validator that fell back to Date.now() here would silently decide
  // time-sensitive questions with a clock the caller did not supply.
  denies("DENY_PROOF_CLOCK_UNAVAILABLE", () =>
    validateLocalBridgeInstallationProof(proof, transcript, { ...options, now: () => new Date("not a date") })
  );
});

test("DENY_PROOF_TTL_EXCEEDED — a validity window wider than the maximum", () => {
  const issued = Date.parse(proof.issued_at);
  const wide = {
    ...proof,
    expires_at: new Date(issued + LOCAL_BRIDGE_PROOF_MAX_TTL_MS + 1000).toISOString()
  };
  const wideTranscript = { ...transcript, expires_at: wide.expires_at };
  denies("DENY_PROOF_TTL_EXCEEDED", () =>
    validateLocalBridgeInstallationProof(wide, wideTranscript, options)
  );
});

test("DENY_PROOF_NOT_YET_VALID — presented before its issued_at", () => {
  const beforeIssue = () => new Date(Date.parse(proof.issued_at) - 1000);
  denies("DENY_PROOF_NOT_YET_VALID", () =>
    validateLocalBridgeInstallationProof(proof, transcript, { ...options, now: beforeIssue })
  );
});

test("DENY_PROOF_SERVICE_MISMATCH — the proof binds a different service than the transcript", () => {
  denies("DENY_PROOF_SERVICE_MISMATCH", () =>
    validateLocalBridgeInstallationProof(
      { ...proof, service_key_id: `${proof.service_key_id}-other` },
      transcript,
      options
    )
  );
});

test("DENY_PROOF_PROFILE_POLICY — the accepted-profile list is itself malformed", () => {
  // Distinct from DENY_PROOF_PROFILE_NOT_ACCEPTED, which is a well-formed list
  // that excludes the proof. This one is the list being unusable: not an array,
  // empty, holding a non-string, or holding a duplicate. A policy that cannot be
  // read must not be treated as a policy that permits.
  for (const bad of [null, "profile", [], [""], [123], [proof.proof_profile_id, proof.proof_profile_id]]) {
    denies("DENY_PROOF_PROFILE_POLICY", () =>
      validateLocalBridgeInstallationProof(proof, transcript, { ...options, acceptedProofProfileIds: bad })
    );
  }
});

test("DENY_PROOF_TRANSCRIPT_MISMATCH — a bound field other than installation or service differs", () => {
  // The binding loop reports installation and service mismatches under their own
  // codes; every other bound field falls through to this one. Asserting it by
  // exact code is what keeps the three from collapsing into one another.
  denies("DENY_PROOF_TRANSCRIPT_MISMATCH", () =>
    validateLocalBridgeInstallationProof(
      { ...proof, endpoint_binding_id: `${proof.endpoint_binding_id}-other` },
      transcript,
      options
    )
  );
});
