# P0-18 V-011 Redaction — CANDIDATE (advisory)

**Document ID:** SECB-P0-18-V011-REDACTION-CAND-001
**Status:** CANDIDATE / NOT EFFECTIVE / NOT P0-18 SIGN-OFF
**Base:** main @ `ec5aa76`
**Authority mode:** AMD-002 advise-and-proceed (candidate preparation only)
**Producer:** claude-motor (BST-SA motor)

## Advisory status fields

- `truth_status`: verified_true (positive/negative/adversarial cases run green in the full suite)
- `authority_status`: execution_requires_operator (wiring/adoption is SEC/GOV-gated)
- `implementation_status`: candidate (primitive exists; wired to nothing)
- `risk_class`: high (security-boundary primitive; adoption governs durable-storage safety)

## What the primitive does

`evaluateForStorage({ content, classification? })`
([../../../src/security/redaction-policy.mjs](../../../src/security/redaction-policy.mjs))
is a **pure, unwired** policy evaluator a caller consults **before** it durably
stores content. It answers one question — "is this safe to store, and in what
form?" — and returns EITHER:

- a **REDACTED** result `{ ok: true, redacted, manifest }` — the content is
  storable once located secrets/PII are removed; `redacted` is the content with
  each located secret replaced by a typed placeholder, and `manifest` is the
  **redaction manifest** that preserves PROOF of removal without carrying the
  secret; OR
- a **DENY / QUARANTINE** `{ ok: false, code, message }` — the content cannot be
  safely stored and must be blocked/quarantined rather than silently persisted.

It performs no I/O, touches no real storage, mints nothing, and mutates nothing.
Outputs are deep-frozen. It is the "consult-before-append" evaluator the V-011
control needs; it is **not** a capture pipeline or a store.

### Deny / quarantine codes

- `DENY_REDACTION_MALFORMED` — deny-by-default on structurally unusable input
  (not a plain object; `content` not an own property; `content` not a string;
  `content` carrying a null byte; a contained hostile accessor / Proxy trap).
- `DENY_CLASSIFICATION_REQUIRED` — doctrine "classification and purpose before
  collection": a supplied `classification` is not a recognized capture level
  (C0..C4). Content is never stored under an unknown classification.
- `DENY_RAW_SECRET_BLOCKED` — doctrine "Do not persist raw secrets, private
  keys, tokens, credential files": non-redactable credential-file material
  (a PEM private-key block) blocks the whole storage request. This is the
  "raw secret capture blocked/quarantined" half of V-011.

### Redaction manifest (proof without the secret)

Per removal the manifest records the secret **type**, its **index** (position)
and **length** in the original content, and a **non-reversible fingerprint** —
a truncated (16 hex chars) SHA-256 of the secret. This proves a specific secret
was removed while making recovery infeasible; the raw secret value never enters
the manifest. Clean content yields an empty manifest (`removed_count: 0`).

## Detection set and its limits

**Redactable (removed inline, recorded in the manifest):**

- AWS access key id (`AKIA`/`ASIA` + 16 upper-alnum)
- GitHub tokens (`ghp_`/`gho_`/`ghu_`/`ghs_`/`ghr_` + ≥36)
- Slack tokens (`xox[baprs]-…`)
- Google API key (`AIza…`)
- JSON Web Tokens (three base64url segments)
- Email addresses (PII per doctrine)
- High-entropy fallback: an unbroken ≥32-char secret-charset run whose Shannon
  entropy is ≥ 4.0 bits/char (catches unlabelled random secrets)

**Non-redactable — blocked/quarantined:**

- PEM private-key blocks (`-----BEGIN … PRIVATE KEY-----`) — credential-file
  material; redacting the body still yields a credential file, so the artifact
  is blocked in whole.

**Limits (honest):** the detection set is conservative pattern/entropy
heuristics. It will MISS novel/obfuscated formats that match no pattern and
fall under the entropy threshold; the entropy fallback can occasionally flag a
long non-secret blob (over-redaction — the fail-SAFE direction). Secrets
deliberately SPLIT across whitespace/fields are not reassembled — but the
fail-closed posture guarantees the invariant that matters: a raw secret value
never survives into the returned result. This primitive is a filter, not a
proof of secret-freeness; adoption must layer it with classification/purpose
controls at the capture boundary.

## V-011 coverage

Doctrine: [../../08-security/data-privacy-retention.md](../../08-security/data-privacy-retention.md)
(SECB-SEC-DATA-001). Matrix row:
[../../04-assurance/verification-matrix.md](../../04-assurance/verification-matrix.md)
(V-011). Conformance:
[../../../tests/conformance-v011-redaction.test.mjs](../../../tests/conformance-v011-redaction.test.mjs)
(runs in the `tests/*.test.mjs` glob).

- **Positive** ("secrets removed before storage"): clean content → `ok`,
  `redacted === content`, empty manifest.
- **Negative** ("raw secret capture blocked/quarantined"): embedded token →
  redacted + manifest with a one-way fingerprint (secret absent from output and
  manifest); private-key block → `DENY_RAW_SECRET_BLOCKED`; unknown
  classification → `DENY_CLASSIFICATION_REQUIRED`.
- **Adversarial**: obfuscated/unlabelled high-entropy secret, secret in a
  non-content nested field, object-typed content, hostile getter, atomic
  single-read (exactly one `[[Get]]`), prototype-key smuggling, prototype
  pollution, and a secret smuggled via caller-supplied `manifest`/`redacted`
  fields — all fail closed; the raw secret never leaks to the output.

House standards observed: atomic single-read extraction (one
`Reflect.ownKeys` presence snapshot + a single `[[Get]]` per consulted field;
no per-field `getOwnPropertyDescriptor`, so a hostile descriptor trap is never
invoked), accessor-attack containment, deep-frozen outputs, and a byte-identity
guard pinning the doctrine documents to their blobs at main @ `ec5aa76`.

## Scope and boundary

This is a **candidate** only. The primitive is wired to **nothing** — no capture
level, ledger, live path, or store consults it. Making any capture/append path
call `evaluateForStorage` before writing is **separately SEC/GOV-gated** work
and is **out of scope** here. This document is **not** P0-18 sign-off and renders
no governance verdict.

## self_certification

```yaml
self_certification:
  agent_id: claude-motor
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```
