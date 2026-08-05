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
- `OPEN_OR_UPDATE_PR` — create or update only the grant-named pull request; and
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
- repository provider and immutable repository ID;
- exactly one closed action, candidate ref, exact candidate commit and tree;
- target ref and expected-old target SHA;
- expected merge-result tree for merge actions;
- unique nonce, idempotency key, `max_uses: 1`, and initial `ACTIVE` state;
- immutable REV, QA, SEC, evidence-acceptance and human GOV references;
- authoritative revocation source and freshness checkpoint; and
- grant ledger and receipt ledger destinations.

A prompt assertion, local file, bearer credential, unsigned object,
self-issued object, moved target, unknown key, stale checkpoint, revoked,
expired or consumed grant is invalid.

## External enforcement sequence

The integration principal may not authorize or verify itself. Immediately
before remote mutation an independently administered policy decision point
must:

1. authenticate issuer and subject and verify the subject equals the grant;
2. verify signature and signed-payload digest against the trusted key registry;
3. resolve current revocation and monotonic freshness evidence;
4. bind repository, action, candidate ref/commit/tree, target ref and
   expected-old target SHA to live provider state;
5. verify every assurance and human disposition reference against its immutable
   object;
6. compute and compare the expected merge-result tree;
7. create a durable `PREPARED` receipt under the operation idempotency key; and
8. atomically consume the single-use grant and compare-and-swap the target from
   expected-old SHA as one provider-coordinated issuance fence.

Any unknown, mismatch, timeout, partial verification or stale state returns a
durable denial and performs no remote mutation.

## Receipt and recovery contract

Each attempt records an append-only hash-chained receipt with receipt ID,
idempotency key, grant ID/digest, issuer, subject, repository, action, candidate
commit/tree, target ref, before SHA, intended after SHA/result tree, provider
operation ID, revocation checkpoint, previous-entry hash, entry hash, state,
reason code and trusted timestamp.

States are `PREPARED`, `COMMITTED`, or `ABORTED`. A crash after provider
mutation must recover the same operation by grant ID and idempotency key,
corroborate provider state, and return the original `COMMITTED` binding. Replay
must never consume another grant or perform another mutation. Conflicting
provider state, ledger fork, stale head anchor or unverifiable receipt fails
closed for human recovery.

## Adoption and activation gates

This contract becomes policy-effective only with independent REV, QA and SEC,
explicit human GOV adoption through ADR-0009, and a human operator bootstrap
merge. Operational use additionally requires a separately reviewed external
policy decision point, trusted key/revocation provider, atomic consumption/CAS
adapter, durable receipt ledger, recovery probes and a human activation record.

Until every gate passes, the effective disposition is
`DENY_INTEGRATION_PRINCIPAL_INACTIVE`.
