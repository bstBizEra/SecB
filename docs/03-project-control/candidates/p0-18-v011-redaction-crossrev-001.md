# P0-18 V-011 Redaction — Immune Cross-Review 001

**Document ID:** SECB-P0-18-V011-REDACTION-CROSSREV-001
**Status:** CROSS-REVIEW / ADVISORY — NOT SIGN-OFF, NOT THE P0-20 VERDICT
**Reviewer:** `claude-immune-crossrev-v011-01` (BST-SA Immune, advisory)
**Review target:** branch `bst/p0-18-v011-redaction` @ `38b140f`
(`[P0-18-V011-REDACTION-CANDIDATE]`)
**Base:** main @ `ec5aa76` (`ec5aa76cdc404ffbecfb5ca9de07a0c943da29b1`)
**Producer under review:** `claude-motor` (BST-SA motor)
**Governance mode:** AMD-002 advise-and-proceed (cross-review packet on a branch)

---

## Verdict

**APPROVE_FOR_MERGE**

`src/security/redaction-policy.mjs` is a pure, unwired pre-storage
redaction / block-or-quarantine evaluator (`evaluateForStorage`). The overriding
security invariant — **a raw secret it LOCATES never survives into the returned
result, in any field** — holds under first-hand adversarial re-testing. Every
located secret is removed from `redacted` and represented in the manifest only by
a one-way, non-reversible fingerprint (truncated SHA-256), never by its value.
The private-key path **quarantines the whole artifact** (`DENY_RAW_SECRET_BLOCKED`)
rather than redact-and-store. Deny-by-default and fail-closed hold on every
malformed / unknown / hostile input. The atomic single-read snapshot reads
`content` with exactly one `[[Get]]` and invokes **zero** per-field
`getOwnPropertyDescriptor`. The packet honestly discloses its heuristic limits and
does not claim to be a proof of secret-freeness. Only the four declared files are
touched; no other `src/` primitive changes; the doctrine byte-identity pins are
correct; the full suite and validator are green; the branch merges clean vs main.

No blocking findings. Non-blocking advisory notes (forward-looking, for the
separately-gated adoption/wiring step) are recorded at the end.

---

## Explicit rulings (task-mandated)

### R1 — SECRET-NEVER-LEAKS — **PASS** (rebuilt first-hand)

Independent harness (29 assertions, all green) fed real-format secrets — AWS
access-key id `AKIA…`, 40-char AWS secret key, GitHub `ghp_…`, JWT, PEM private
key, email, high-entropy blob — in multiple positions (start / middle / end,
multi-secret, multi-line, secret glued via nested field). For every REDACT-path
case `JSON.stringify(result)` contained the raw secret literal **nowhere**: not
in `redacted`, not in `manifest.removed[*]` (no `value` field exists on removal
entries), not in any deny message.

- Redaction reconstruction (`content.slice` between non-overlapping kept spans +
  typed placeholder `[REDACTED:type:fp]`) provably excludes each located span;
  `resolveOverlaps` guarantees non-overlapping, index-monotone rebuild.
- Deny messages interpolate only `spec.type` (`"private_key_block"`) /
  fixed strings — never `content`, never the classification value.

### R2 — MANIFEST FINGERPRINT NON-REVERSIBLE — **PASS**

`fingerprint(secret) = SHA-256(secret).hex.slice(0,16)`. Verified first-hand that
the recorded fingerprint (a) equals the documented one-way digest, (b) is **not**
base64 / base64url of the secret, (c) is **not** a hex prefix of the secret, and
(d) is not a substring of the secret. Manifest removal entries carry
`{type, index, length, fingerprint}` only — no `value`, no reversible encoding.
Index/length are position metadata that cannot reconstruct the removed bytes.
Attempts to smuggle a secret out via a caller-supplied `manifest`/`redacted`
field are discarded: the output manifest/redacted is always evaluator-built.

### R3 — DENY-BY-DEFAULT / FAIL-CLOSED — **PASS**

- `DENY_REDACTION_MALFORMED`: non-object input, `content` absent / not own /
  non-string / null-byte-bearing, and hostile getter/Proxy trap (thrown into the
  surrounding catch) — all fail closed; no leak.
- `DENY_CLASSIFICATION_REQUIRED`: any supplied classification outside `C0..C4`
  fails closed; verified the deny message does not reflect an attacker-controlled
  classification value.
- `DENY_RAW_SECRET_BLOCKED`: PEM private-key material causes the **whole**
  storage request to be blocked (`ok:false`, no `redacted` field) — quarantine,
  **not** redact-and-store. The BLOCK phase precedes and short-circuits the
  REDACT phase. Key body is never echoed or fingerprinted.

### R4 — ATOMIC SNAPSHOT (N4 lesson) — **PASS** (descriptor trap fires 0×)

Proxy-instrumented input confirmed, first-hand:
`getOwnPropertyDescriptor` trap count = **0**; `content` `[[Get]]` count = **1**;
`ownKeys` count = **1**. A TOCTOU getter that would serve a benign value to a
guard and a secret to the body is defeated — `content` is read exactly once into
a local and never re-read, so the second-serve secret never leaks. A throwing
accessor becomes a structured malformed deny, never a crash. Prototype-key
smuggling (`content` only on the prototype) is rejected (own-key required);
prototype pollution (`__proto__` payload) is inert and does not poison
`Object.prototype` or the output.

### R5 — DETECTION-SET HONESTY — **PASS** (no over-claim)

The candidate packet ("Detection set and its limits") explicitly states the set
is "conservative pattern/entropy heuristics," that it "will MISS novel/obfuscated
formats," that the entropy fallback "can occasionally flag a long non-secret blob
(over-redaction — the fail-SAFE direction)," that deliberately split secrets are
"not reassembled," and — critically — that it "is a filter, **not** a proof of
secret-freeness; adoption must layer it with classification/purpose controls."
No claim of completeness or proof is made anywhere in the primitive header, the
candidate doc, or the test file (which scopes itself to conformance-coverage for a
candidate wired to nothing). Honest.

---

## Independent verification evidence

| Check | Result |
|---|---|
| Secret-leak attempts (my harness, 29 assertions) | **0 leaks** — all green |
| Manifest fingerprint reversibility | **non-reversible** — sha256 slice, not base64/hex of secret |
| Descriptor-trap probe (`getOwnPropertyDescriptor`) | fires **0×** |
| `content` `[[Get]]` count / `ownKeys` count | **1 / 1** |
| TOCTOU second-serve getter | defeated — single read, no leak |
| PEM private key | **quarantined** (`DENY_RAW_SECRET_BLOCKED`), not redacted-and-stored |
| `tests/conformance-v011-redaction.test.mjs` (standalone) | **16 / 16 pass** |
| In-glob (`tests/*.test.mjs`) | **yes** — file at `tests/` root, runs in full suite |
| `npm test` (full suite) | **1131 tests / 1129 pass / 0 fail / 2 skip** (base 1115 + 16 = 1131) |
| `npm run validate` | **exit 0** — all PASS; `schemas.count` = 7 canonical + 10 governed = **17** |
| Doctrine byte-identity pins vs main `ec5aa76` | **exact** — `data-privacy-retention.md` `c5c9cb9f…`, `verification-matrix.md` `ef4496ba…` |
| `src/` scope | **1 new file only** (`src/security/redaction-policy.mjs`); no other src touched |
| Declared-files-only | **yes** — 4 files (src, test, candidate doc, MANIFEST); nothing else |
| Merge-cleanliness vs main `ec5aa76` (scratch `merge-tree`) | **CLEAN, 0 conflicts** (merge-base = main tip; fast-forwardable) |

**Claim-to-source binding:** every doctrine mapping in the primitive header binds
to a real line of `docs/08-security/data-privacy-retention.md` (SECB-SEC-DATA-001):
Capture Levels C0..C4, "Do not persist raw secrets, private keys, tokens,
credential files", "classification and purpose before collection", "secret and
personal-data redaction before durable storage", "redaction manifest preserving
proof that content was removed". V-011 matrix row confirmed: "secrets removed
before storage" / "raw secret capture blocked/quarantined".

---

## Advisory notes (non-blocking — for the SEC/GOV-gated adoption step, not this merge)

1. **Word-boundary / sub-32-char gap.** A redactable-format secret glued to
   adjacent word characters (defeating `\b` anchors) and shorter than the 32-char
   entropy floor can pass through un-redacted. This is an inherent heuristic
   limit, **disclosed** in the packet. It does not violate the secret-never-leaks
   invariant for LOCATED secrets, but adoption must not treat this evaluator as a
   sole control.
2. **Block-pattern header variance.** A private-key artifact whose header does not
   match `-----BEGIN … PRIVATE KEY-----` (e.g. exotic/whitespace-mangled PEM,
   PKCS#12/DER binary) would fall to the REDACT path and be redacted-and-stored
   rather than quarantined. Disclosed as a heuristic limit; a wiring gate should
   pair this with content-type/credential-file detection at the capture boundary.
3. **Adoption remains SEC/GOV-gated.** The primitive is wired to nothing; this
   cross-review certifies the candidate's correctness and honesty only, and does
   **not** authorize wiring it into any capture/append path.

These notes restate limits the producer already disclosed; none blocks merge of
this unwired candidate.

---

## Advisory status fields

- `truth_status`: verified_true (secret-never-leaks, manifest non-reversibility,
  fail-closed, atomic single-read with descriptor-trap-0×, detection honesty,
  byte-identity, full-suite/validator green, and clean merge all independently
  reproduced first-hand).
- `authority_status`: advisory_only — does not authorize merge, does not declare
  production, does not authorize wiring/adoption.
- `implementation_status`: existing (the candidate primitive is complete for its
  declared unwired scope); adoption = candidate/blocked (SEC/GOV-gated).
- `risk_class`: low while PURE + UNWIRED; rises to high at adoption (it then
  governs durable-storage safety) — where notes 1–2 must be addressed.

```yaml
self_certification:
  agent_id: claude-immune-crossrev-v011-01
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

> Cross-lane immune advisory only. Both lanes can self-certify; neither can
> self-authorize. Merge, wiring/adoption, and production remain operator authority.
