# MOD-EVID-S3 Independent Gate Review (REV + SEC)

- gate_id: mod-evid-s3-gate-001
- reviewer_identity: claude-immune-gate-evid-s3
- role: immune (combined REV + SEC gate)
- team_id: BST-SA
- target_branch: bst/mod-evid-s3-resolver
- target_commit: ca397b4
- base_commit: 554fae4 (main tip at review time)
- authorization: OPERATOR R3 AUTHORIZATION (tracker-recorded) — this gate is the mandated independent REV + SEC review preceding the operator's ratifying merge
- review_date: 2026-07-21
- verdict: GATE_CLOSED_READY_FOR_OPERATOR_MERGE

## Verdict

GATE_CLOSED_READY_FOR_OPERATOR_MERGE. All five gate-scope areas verified first-hand in an isolated worktree after `npm ci`. Scope is exactly the three declared files; both real consumers are byte-identical base↔target (the resolver adapts to existing ports, it does not edit them); the SEC status-projection question resolves honest and non-forgeable; every resolver denial reproduces; my own fresh-actor end-to-end rebuild admits accepted / denies sealed at BOTH consumers; adversarial QUARANTINED and accepted-then-tampered probes deny as required; measured totals match producer claims exactly (651/646/0/5). No findings at HIGH or CRITICAL. No blocking findings.

## 1. Scope — CONFIRMED (exactly 3 files, no kernel/ledger/schema edits)

`git diff --name-only 554fae4 ca397b4` returns exactly: `MANIFEST.json`, `src/services/evidence-envelope-service.mjs`, `tests/evidence-provenance-chain.test.mjs`. The service diff is purely additive (a new `resolveAccepted` + `toEvidenceLookup` block appended after `resolveAcceptedStatus`; no existing line touched). Independent `git rev-parse <commit>:<path>` blob SHAs, base (554fae4) vs target (ca397b4):

| File | blob (base == target) | result |
|------|-----------------------|--------|
| src/control/authority-engine.mjs | 05706bd0d47e588c1cd78e6e13841fadbe5c5e58 | IDENTICAL |
| src/control/sod-rules.mjs | 4ffbc2019aae88178ecf0e5e6d2aa6b1e4aa9530 | IDENTICAL |
| src/control/state-machine.mjs | 3e57b4a18bec64c3af0afd1a2c2a46b5e6315d93 | IDENTICAL |
| src/ledger/durable-ledger.mjs | 38d26f8421845e80c9a2a893ad675105f30191f5 | IDENTICAL |
| src/ledger/temporal-ledgers.mjs | c1e6579b3879cb9abe2a2fd7d50a53cb220d24fe | IDENTICAL |
| src/services/knowledge-claim-service.mjs | a9ffafb1c4ccdf05de57b97ee1f2047b6d96a1d9 | IDENTICAL |
| contracts/evidence-envelope.schema.json | 8afc1cec9dad7f10c3612e67a0cb1350976de6cf | IDENTICAL |
| docs/MANIFEST.json | 4d357c04963f7b8f6246761e1bc4896d63474fc1 | IDENTICAL |

The kernel (authority-engine, sod-rules, state-machine), both ledgers, the evidence schema, and the second consumer (knowledge-claim-service) are all byte-for-byte unchanged. MANIFEST delta = +1 (the new test file, `tests/evidence-provenance-chain.test.mjs`). Both real consumers being byte-identical is the strongest form of the producer's "against BOTH real consumers" claim: the resolver conforms to pre-existing ports, it does not bend them.

## 2. Status-projection honesty — the SEC question — HONEST, NON-FORGEABLE

The resolver returns the stored envelope with `verification_status` overwritten by the live status: `{ ...structuredClone(accepted.envelope), verification_status: ACCEPTED_STATE }` (service line 597).

- **Can a non-ACCEPTED envelope ever be projected as ACCEPTED?** No. The projection is reached only after `accepted = matches.find((r) => r.status === ACCEPTED_STATE)` succeeds (line 566). `record.status` is the authoritative lifecycle field, set to `ACCEPTED` **only** by `acceptEvidence`, which itself requires the full SEALED→VERIFICATION_PENDING→VERIFIED→ACCEPTED ladder, two SoD gates (acceptor ≠ producer, acceptor ≠ verifier), a non-empty approvals list, and an audit-before-effect ledger append. The projected literal `ACCEPTED` therefore always equals the true status — it is a re-statement of verified state, never an elevation. A VERIFIED-only record returns DENY_NOT_ACCEPTED (stricter than the ledger's own VERIFIED-or-ACCEPTED boundary); a SEALED/QUARANTINED record likewise.

- **Version shadowing (SEALED v2 vs ACCEPTED v1, and the reverse) — which binds, and is it honest?** `matches.sort((a,b) => b.version - a.version)` then `.find(status===ACCEPTED)` binds the **highest-versioned ACCEPTED** record. Reproduced first-hand (§4 probe 6): ACCEPTED v1 + SEALED v2 → binds v1 (the newer sealed-but-unaccepted v2 does NOT shadow the accepted v1, and is NOT projected as accepted); SEALED v1 + ACCEPTED v2 → binds v2. Honest in both directions: a bare id resolves to the latest *accepted* envelope and never to a superseded/older one while a newer accepted one exists, and never to a newer *unaccepted* one. A newer SEALED version cannot masquerade as the accepted evidence.

- **Can the projected envelope be fed back into a write path to forge state?** No. The returned object is deep-`frozenClone`d (immutable). Fed to `registerEnvelope`, it is denied twice over: (a) its `content_hash` was computed over the CAPTURED body, so recomputation over the now-`ACCEPTED` body mismatches → DENY_CONTENT_HASH_MISMATCH (fires first, service line 125); and (b) the forge-on-entry guard rejects any non-entry status → DENY_STATUS_FORGERY (line 133). Reproduced first-hand (§4 probe 5) on both the originating service and a fresh service — denied every time. Registration's identity-binding (content_hash over the exact stored body) is precisely what makes the live-status projection safe: the projection exists only on the *read* boundary and cannot round-trip into a *write*.

- **Ledger identity binding.** KnowledgeLedger asserts `evidence.evidence_id === ref` and `verification_status ∈ {VERIFIED, ACCEPTED}` (temporal-ledgers lines 127-131). The resolver only ever binds records where `envelope.evidence_id === ref` and projects that same bare id, so the identity check always holds and is never a lie. The projection makes the ledger read the *true* lifecycle state instead of the frozen CAPTURED registration marker — which is the whole correctness point of S3, and it is discharged honestly.

## 3. Resolver denials — ALL REPRODUCE

Deny vocabulary is non-throwing and fail-closed (structured return, never an exception into the citing pipeline):

| Denial | Trigger | Observed |
|---|---|---|
| DENY_UNKNOWN_EVIDENCE | blank / non-string / unregistered ref | returned, `ok:false` (probe 8) |
| DENY_NOT_ACCEPTED | id exists, no ACCEPTED version | returned WITH actual `status` (SEALED probe 2, QUARANTINED probe 3) |
| DENY_CHAIN_BROKEN | ledger tampered after acceptance | returned; `toEvidenceLookup` → undefined (probe 4) |
| highest-ACCEPTED-version binding | multi-version id | binds highest accepted, both directions (probe 6) |

DENY_NOT_ACCEPTED carries the latest version's actual current status (`SEALED`, `QUARANTINED`), confirmed first-hand — the denial is diagnostic, not opaque.

## 4. End-to-end reproduction (independent, fresh actors/ids) — 8/8 as required

Rebuilt the provenance chain myself with fresh distinct actors (`actor-gate-producer` / `-requester` / `-verifier` / `-acceptor`) and fresh ids, over the REAL `EvidenceEnvelopeService`, REAL `DurableLedger`, REAL `KnowledgeLedger`, and the REAL `knowledge-claim-service` facade (no doubles on either side of the boundary):

| # | Probe | Expected | Observed |
|---|---|---|---|
| 1 | distinct-actor ladder → resolveAccepted → KnowledgeLedger direct AND knowledge-claim-service port | both ADMIT | appendClaim seq≥1; proposeClaim decision=ALLOW |
| 2 | sealed-only citation | ledger verbatim deny + port structured deny | `DENY_EVIDENCE_CHAIN "Evidence reference does not resolve: <id>"`; port `DENY_NOT_ACCEPTED` |
| 3 | QUARANTINED evidence (fail verdict) resolve | DENY_NOT_ACCEPTED (status QUARANTINED); lookup undefined | as expected |
| 4 | accepted-then-tampered ledger (mutate a seal-entry payload on disk) resolve | DENY_CHAIN_BROKEN; lookup undefined | green before tamper, DENY_CHAIN_BROKEN after |
| 5 | feed ACCEPTED-projected envelope back to registerEnvelope | denied (no state forgery) | DENY_CONTENT_HASH_MISMATCH on both originating and fresh service |
| 6 | version shadowing both directions | binds highest ACCEPTED | ACC v1 + SEAL v2 → v1; SEAL v1 + ACC v2 → v2 |
| 7 | SoD: producer attempts to verify own evidence | denied; no single-actor path to ACCEPTED | DENY_VERIFIER_IS_PRODUCER; resolve stays not-accepted |
| 8 | unknown / blank / null ref | DENY_UNKNOWN_EVIDENCE, never throws | as expected; lookup undefined |

(The mission named "revoke" as an adversarial vector; confirmed no revocation transition exists on the Evidence machine — `ACCEPTED:[SUPERSEDED,QUARANTINED]` only — so the QUARANTINED and tampered-chain probes stand in as the mandated substitutes, per the gate brief.) The sealed-only citation denies verbatim at the ledger boundary and structurally at the port, matching the producer's claim word-for-word.

## 5. Totals — EXACT vs claims

- Full suite `node --test tests/*.test.mjs` @ target ca397b4: **tests 651, pass 646, fail 0, skipped 5, todo 0** — matches producer claim 651/646/0/5 exactly.
- `npm run validate` (foundation validator) exit 0 at target, and exit 0 after adding this record to MANIFEST.
- My independent adversarial harness: 8/8 pass (temp file removed; working tree left clean).
- MANIFEST delta on target = +1 (the new provenance-chain test file); confirmed by diff.

## Findings by severity

- CRITICAL: none
- HIGH: none
- MEDIUM: none
- LOW: none
- INFO-1: `resolveAccepted` calls `verifyChain(ref)`, which re-verifies EVERY stored version of the ref (not just the accepted one). A tampered or broken chain on an *unaccepted* sibling version therefore fail-closes the resolution of a legitimately accepted version (DENY_CHAIN_BROKEN). This is the safe direction (deny, never over-admit) and is arguably correct — a broken durable chain for the id is a real integrity signal — but it means an unaccepted sibling can withhold an accepted citation. Noted for awareness only; not blocking.
- INFO-2: The resolver resolves ACCEPTED only, while the ledger boundary admits VERIFIED-or-ACCEPTED. The resolver is therefore strictly stricter than its consumer — safe, and consistent with the `resolveAccepted` name. No action.

## Advisory fields

- truth_status: verified_true
- authority_status: execution_requires_operator
- implementation_status: existing
- risk_class: low

## self_certification

```yaml
self_certification:
  agent_id: claude-immune
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

> Advisory only. This gate certifies the independent REV + SEC review is complete and the slice is ready for the operator's ratifying merge. It does not itself authorize, merge, or push. Operator authority remains the sole merge authority.
