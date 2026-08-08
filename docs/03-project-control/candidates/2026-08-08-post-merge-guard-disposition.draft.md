# Post-Merge Guard Disposition — Advisory Packet

## Document Control

| Field | Value |
|---|---|
| Artifact ID | SECB-ADV-GUARD-DISPOSITION-001 |
| Version | 1.0.0-draft |
| Status | DRAFT / NOT EFFECTIVE — advisory only, no authority conferred |
| Date | 2026-08-08 |
| Author | Claude (Motor Agent) |
| Subject | The 18 red guards after merge commit `61940ac` |
| Branch | `feat/secb-ruflo-command-center` |

**Nothing in this packet has been re-pinned.** Every guard listed below is still
red in the tree, on purpose. Re-pinning tamper detection to an artifact the
branch produced would make the branch read as mergeable while removing the only
signal that it is not — the standing rule this packet exists to respect. The
disposition is the operator's; this is the evidence for it.

---

## 1. Measured state

`npm test` after `61940ac`:

```text
tests 1975 · pass 1952 · fail 18 · skipped 5
```

`node tools/validate-foundation.mjs`: PASS (exit 0).

All 18 failures are byte-identity or wrap-not-modify guards. **No functional
test fails.** The merge changed no behaviour; what is red is a set of guards
from main's slices reporting that this branch carries changes to files they pin.

Before the merge the branch stood at `1188 · pass 1177 · fail 2`. Main brought
+787 tests, and with them the guards.

---

## 2. Root causes: seven files and one structural case

The 18 failures reduce to seven files plus one guard that cannot run at all.
Counts are instances, taken from the assertion messages rather than inferred:

| # | File | Guards | Class |
|---|---|---|---|
| 5 | `package.json` | `cadence-policy`, `kpi-registry`, `overlap-policy`, `scorecard-assembler`, `write-set-policy` | A |
| 4 | `src/control/sod-rules.mjs` | `knowledge-claim-service`, `memory-gateway-service`, `conformance-v020-governance` @ `ec5aa76`, `skill-revocation-ledger` @ `0aa13f8` | B |
| 2 | `tools/validate-foundation.mjs` | pins @ `c52db71`, @ `280d32c` | A |
| 2 | `src/contracts/contract-validator.mjs` | pins @ `ec5aa76`, @ `4abfff2` | A |
| 2 | `contracts/agent-registration.schema.json` | pins @ `beebfe8`, @ `385ac65` | A |
| 1 | `src/registry/skill-resolver.mjs` | `skill-candidate-registry` ("must remain untouched in S1") | A |
| 1 | `src/registry/runtime-registry.mjs` | pin @ `385ac65` | A |
| 1 | `contracts/agent-enrollment-request.schema.json` | `workspace-lease-ledger` @ `0c0f3d2` | C |

**Correction to an earlier count.** An automated pass over the test sources put
this at five files. That pass matched only `src/`, `contracts/` and `tools/`
paths and therefore missed `package.json` entirely — the single largest cause,
at five of the eighteen. The table above is built from the assertion messages
the suite actually emitted, not from parsing the tests.

---

## 3. Class A — disclosed branch changes awaiting a re-pin

Each file below was changed by this branch in a commit that says what it changed
and why. The guards are correct to be red: the changes are real and unratified.
What they need is an authorized slice that re-pins them and then demonstrates the
re-pin still bites.

| File | Authorizing commits on this branch |
|---|---|
| `package.json` | `c4025c5`, `fe64aac`, `31ddfef`, `cbe93cb`, `80c6cac` |
| `tools/validate-foundation.mjs` | `7eb7941`, `249c798`, `f3ac99a`, `405c158`, `c4025c5`, `61940ac` |
| `src/contracts/contract-validator.mjs` | `61940ac` (union of both parents' registration maps) and earlier branch work |
| `contracts/agent-registration.schema.json` | `c8f2c1d`, `5a8367e`, `a1742ad`, `42c2190` |
| `src/registry/skill-resolver.mjs` | `e0e556a`, `f3ac99a`, `44285f8` |
| `src/registry/runtime-registry.mjs` | `61940ac` (kept both parents' checks) and earlier branch work |

Two of these — `contract-validator.mjs` and `runtime-registry.mjs` — were last
touched by the merge itself, and in both cases the resolution was a proven union
that dropped nothing from either parent. That is recorded in `61940ac`'s message
with the counts.

---

## 4. Class B — deliberately red, already queued

`src/control/sod-rules.mjs` was changed at `9d4da11`, whose subject says so in
capitals: *"LANDS WITH TWO GUARDS RED, ON PURPOSE"*. `f161746` put the two
guards in the queue. Four guards now name this file rather than two, because the
merge brought two more pins covering it.

Main excludes this file from its own wrap-not-modify guard under
`mod-gov-s1-sod-rules-hardening-fix-001`. **That exclusion was deliberately not
inherited.** It authorizes main's cross-cutting fix to the primitive; this
branch made a separate change to the same file that no one has ratified.
Adopting the exclusion would have silenced this branch's signal under main's
rationale.

Main's *mechanism* was adopted: the guard now compares against
`git show main:<path>` rather than a hardcoded digest, so it cannot go stale the
way the old pins did. A side effect worth recording — under that comparison
`src/ledger/temporal-ledgers.mjs` **passes**. It matches main. The earlier
reading that it had drifted was a CRLF artifact, which the guard normalises away.
One file carries an unratified change here, not two.

---

## 5. Class C — a pin that cannot run

`tests/workspace-lease-ledger.test.mjs` does not fail an assertion. It crashes:

```text
Error: Command failed: git rev-parse 0c0f3d2:contracts/agent-enrollment-request.schema.json
fatal: path 'contracts/agent-enrollment-request.schema.json' exists on disk,
       but not in '0c0f3d2'
```

`0c0f3d2` is *Merge pull request #51 from bstBizEra/claude/rev/mod-wspace-completion*.
The guard enumerates the contracts present on disk and rev-parses each against
that commit. This branch added contracts that did not exist then, so the guard
aborts before it can compare anything.

This one **cannot be fixed by re-pinning a blob.** The guard's file-set logic has
to decide what an absent-at-ref contract means — most likely "not covered by this
pin", since a contract that postdates the pinned commit was never in its remit.
Leaving it as a crash is the worst option: a guard that errors reports nothing,
and reports it indistinguishably from a guard that passed.

---

## 6. What an authorized slice must do

1. Re-pin Class A only, and only after confirming each file's current content is
   the reviewed content — not merely the content that happens to be there.
2. For every re-pinned guard, **prove it still bites**: drift the file again,
   confirm the guard fails, revert. A re-pin without that demonstration is a
   re-pin to nothing.
3. Leave Class B red until `9d4da11`'s change to `sod-rules.mjs` is itself
   ratified. It is queued, not forgotten.
4. Treat Class C as a logic fix to the guard, not a pin update, and say in the
   test what an absent-at-ref path means.
5. Do not widen any pin's exemption list to make a red guard green. Main's
   `sod-rules` exemption is the worked example of an exemption that is correct
   for its own change and wrong for anyone else's.

---

## 7. Status fields

```yaml
truth_status: verified_true      # counts and attributions read from the suite
                                 # output and git log, not inferred
authority_status: advisory_only
implementation_status: candidate
risk_class: medium               # 18 guards are red; none is a functional
                                 # failure, and all are disclosed
```
