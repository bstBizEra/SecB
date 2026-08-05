# Integration Principal Control Contract

**Document ID:** SECB-INTEGRATION-PRINCIPAL-CONTRACT-001

**Version:** 0.1.0-draft

**Status:** DRAFT / NOT EFFECTIVE

**Owner:** Human GOV

**Last updated:** 2026-08-05

## Purpose and boundary

This contract defines the only prospective path by which a server-derived
non-human `INTEGRATION_PRINCIPAL` may mutate remote repository integration
state. It grants no present authority. Production or environment activation,
release, deployment, evidence acceptance, risk acceptance, policy exceptions,
and changes to this authority basis are out of scope and remain human A5 gates.

The closed action set is:

- `PUSH_CANDIDATE_BRANCH` — update only the grant-named unprotected candidate
  ref to the exact candidate commit;
- `OPEN_PR` — create exactly one pull request from a grant-bound creation
  fingerprint when no matching pull request exists;
- `UPDATE_PR` — conditionally update only grant-enumerated fields on one
  immutable pull-request ID and expected provider version; and
- `MERGE_EXACT_HEAD_TO_MAIN` — create a merge commit through the protected-branch
  provider while preserving the reviewed candidate as an ancestor.

Direct push to `main` or any protected ref, force push, deletion, squash,
rebase, tag mutation and environment activation are always denied.

## Operation grant

The external authority service must issue a signed grant containing all of:

- immutable grant ID, version, issued-at, effective-from and expires-at;
- authenticated issuer ID, issuer role, trust-root/key ID, signature algorithm,
  signature and signed-payload digest;
- server-derived subject principal ID, integration role and session/workload
  attestation reference;
- subject authority ceiling `A4`, effective Project Contract and authorized
  Work Package references;
- repository provider and immutable repository ID;
- exactly one closed action and the complete action-specific binding from the
  table below;
- unique nonce, idempotency key, `max_uses: 1`, and initial `ACTIVE` state;
- immutable REV, QA, SEC, evidence-acceptance and per-operation human GOV
  references plus one composite digest over those references, candidate
  commit/tree, target expectations, branch-protection policy and required-check
  set;
- authoritative revocation source and freshness checkpoint; and
- grant ledger and receipt ledger destinations.

A prompt assertion, local file, bearer credential, unsigned object,
self-issued object, moved target, unknown key, stale checkpoint, revoked,
expired or consumed grant is invalid.

## Action-specific binding and atomicity

| Action | Exact mutation object | Required expected state | Intended state | Atomic fence |
|---|---|---|---|---|
| `PUSH_CANDIDATE_BRANCH` | unprotected candidate ref and immutable repository ID | expected-old candidate-ref SHA; ref is not protected | exact candidate commit/tree | provider compare-and-swap of that candidate ref only |
| `OPEN_PR` | creation fingerprint over repository, base ref, head ref and approved title/body/metadata digest | no open or closed PR exists for the fingerprint; live head/base match grant | one provider PR ID with exact approved payload | idempotent create-if-absent keyed by fingerprint and grant idempotency key |
| `UPDATE_PR` | immutable provider PR ID | expected provider version/ETag, state, base, head and current payload digest | only the enumerated permitted fields and approved payload digest | conditional update on provider version/ETag |
| `MERGE_EXACT_HEAD_TO_MAIN` | immutable provider PR ID and protected target ref | PR version/state, exact head commit/tree, exact base ref, expected-old target SHA, branch-protection digest and required-check-set digest | provider-observed after SHA whose tree equals expected merge-result tree and preserves candidate ancestry | provider merge transaction plus target-ref expected-old compare-and-swap |

For each action, fields belonging to another action are forbidden. The
candidate ref is the CAS object only for `PUSH_CANDIDATE_BRANCH`; the PR object
is the conditional object for `OPEN_PR`/`UPDATE_PR`; the protected target ref is
the CAS object only for `MERGE_EXACT_HEAD_TO_MAIN`.

## External enforcement sequence

The integration principal may not authorize or verify itself. Immediately
before remote mutation an independently administered policy decision point
must:

1. authenticate issuer and subject and verify the subject equals the grant;
2. verify signature and signed-payload digest against the trusted key registry;
3. resolve current revocation and monotonic freshness evidence;
4. validate the complete action-specific binding and expected state against live
   provider state;
5. verify Project Contract, Work Package, subject A4 ceiling, assurance and
   per-operation human disposition references, then reproduce the composite
   evidence digest;
6. revalidate branch protection and required checks and, for merge, compute and
   compare the expected merge-result tree;
7. create a durable `PREPARED` receipt under the operation idempotency key; and
8. atomically consume the single-use grant and apply the table's action-specific
   conditional mutation as one provider-coordinated issuance fence.

Any unknown, mismatch, timeout, partial verification or stale state returns a
durable denial and performs no remote mutation.

## Receipt and recovery contract

Each attempt records an append-only hash-chained receipt with receipt ID,
idempotency key, grant ID/digest, issuer, subject, repository, action, candidate
commit/tree, target ref, before SHA, intended after SHA/result tree, provider
operation ID, revocation checkpoint, previous-entry hash, entry hash, state,
reason code, trusted timestamp, actual provider response digest, actual
provider-observed object version, after ref/SHA/tree and ancestry result.

The only legal transitions are `PREPARED -> COMMITTED` and
`PREPARED -> ABORTED`. `COMMITTED` and `ABORTED` are immutable terminal states.
A verified failure or crash before provider mutation resolves the original
receipt to `ABORTED`. A crash after provider mutation must recover the same
operation by grant ID and idempotency key, corroborate the provider response and
actual state, and resolve the original receipt to the same `COMMITTED` binding.
Replay must return the terminal disposition and never consume another grant or
perform another mutation. An indeterminate partial fence, conflicting provider
state, ledger fork, stale head anchor or unverifiable receipt fails closed for
human recovery without guessing `COMMITTED` or retrying mutation.

## Adoption and activation gates

This contract becomes policy-effective only with independent REV, QA and SEC,
explicit human GOV adoption through ADR-0009, and a human operator bootstrap
merge. Operational use additionally requires a separately reviewed external
policy decision point, trusted key/revocation provider, atomic consumption/CAS
adapter, aligned executable A4 registry, durable receipt ledger, recovery probes
and a human activation record.

Until every gate passes, the effective disposition is
`DENY_INTEGRATION_PRINCIPAL_INACTIVE`.
