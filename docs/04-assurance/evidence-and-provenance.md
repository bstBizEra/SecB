# Evidence and Provenance Architecture

**Document ID:** SECB-EVIDENCE-001
**Version:** 1.0.0-draft
**Status:** DRAFT / NOT EFFECTIVE

## Evidence Classes

| Class | Example | Trust treatment |
|---|---|---|
| Provider assertion | model/tool reports success | requires corroboration for material claims |
| Host observation | process, filesystem, Git, exit code | independent operational observation |
| Deterministic validation | schema, test, build, hash, policy check | strongest when environment and inputs are sealed |
| Human attestation | approval or review | requires identity, scope, version, and non-replay |
| External source | regulator, vendor, research source | requires provenance and freshness |
| Inference | impact analysis or recommendation | must be labelled and linked to supporting evidence |

## Canonical Envelope

Evidence includes identity, scope, source, classification, timestamps, procedure, result, limitations, hashes, signatures, prior-event linkage, verification status, retention, and access policy.

## Integrity Controls

- append-only evidence index;
- content-addressed objects;
- hash chains or Merkle manifests for ordered packages;
- server-issued timestamps and sequence numbers;
- signed verification and acceptance records;
- replay-resistant approvals bound to object version and action;
- immutable accepted evidence; corrections create superseding records;
- periodic integrity verification and legal-hold support.

## Acceptance Rule

Evidence is accepted only when relevant, authentic, complete enough for the claim, within validity, produced by an allowed mechanism, independently verified where required, and free of unresolved integrity defects.
