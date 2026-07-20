# Parallel Execution

## Permitted models

1. **Partitioned build** — agents own different files, symbols or layers.
2. **Competitive variants** — independent alternatives from one frozen baseline.
3. **Producer-assurance parallelism** — implementation runs alongside independent test, security, documentation and review preparation.

## Overlap policy

| Class | Overlap | Control |
|---|---|---|
| O0 | Separate modules/files | Parallel |
| O1 | Same module, separate files/symbols | Declared ownership |
| O2 | Same file, separate regions | Reservation and conflict forecast |
| O3 | Same symbol/API/schema | Variant or serialize |
| O4 | Lockfile/migration/generated/global config | Single writer |
| O5 | Protected branch/release/prod config | Serialized and human authorized |

## Required lane contract

Every lane receives:

- frozen baseline;
- workspace lease;
- agent/harness identity;
- declared write set and prohibited paths;
- context receipt;
- command/tool/network policy;
- evidence destination;
- checkpoint and expiry policy.

## Integration rule

Parallel production ends at immutable Integration Candidates. A single controlled queue rebases or merges each candidate against the latest integration head, runs composite verification and obtains independent verdicts before protected-branch integration.
