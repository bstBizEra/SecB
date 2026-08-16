# Goal — SecB Phase 0 reaches verified autonomous operation

**Status:** DRAFT / ADVISORY — prepared under `SECB-AGENTS-AMD-002` §3
**Prepared by:** Claude (worker agent), 2026-08-17, at `main` `49727f8`
**Operator act required:** yes — one, named in §3
**Authority of this document:** none. It sets a target and prepares for it; it activates nothing.

## The goal, stated in SecB's own terms

> SecB's runtime entry starts, with the delivered services wired, serving
> governed tool calls; and **every module has a disposition** — either live and
> verified, or held with a named reason and a named decider.

## Why the obvious phrasing is the wrong target

"All modules working autonomously" cannot be the goal, and adopting it would
destroy the thing being built. Of the 22 modules not reachable from the library
surface, **17 are correctly unreached**:

| Held by | Count | Example |
|---|---|---|
| Their own header — adoption is separately-governed work | 9 | `ops/kpi-registry`, `live/access-mode-policy` |
| `AGENTS.md` §4 — SEC/GOV-gated | 4 | `skill-candidate-registry`, `skill-promotion-ledger` |
| A guard that names them | 2 | `ui/command-center-snapshot`, `gateway/ruflo-command-bridge` |
| Pending operator ratification | 2 | the `self-pilot` pair, P0-20 disposition transcribed, unratified |

A repository where every module is reachable has stopped distinguishing
*delivered-and-adopted* from *delivered-and-deliberately-held*, which is the
distinction its gates exist to keep. So the target is a **disposition for every
module**, not a live state for every module.

## Where the scope actually stands

Measured at `main` `49727f8`:

| | |
|---|---|
| Test suite | 2002 tests, 1997 pass, 0 fail, 5 skipped |
| Foundation gates | 1621 PASS, 0 non-PASS |
| Skill audit | 0 VIOLATION, 0 UNDECIDABLE |
| Pack validator | PASS, 23 skills, 175 files |
| Modules reachable | 100 of 122; the 22 remaining have dispositions above |
| **Runtime** | **does not start** |

Everything is green and nothing runs. That is not a contradiction — it is Phase 0
working as designed, and it locates the whole gap in one place.

## §3 — The single blocking act

`tools/run-secb-mcp-server.mjs` refuses to start:

```
run-secb-mcp-server: service wiring + registry-seed validation are an
operator-authorized deployment step (alpha skeleton).
```

Four things are required. Three an agent may prepare; the first it may not
perform, and the environment variable is named for who must.

| # | Requirement | State |
|---|---|---|
| 1 | `SECB_MCP_DEPLOYMENT_AUTHORIZED=operator` | **OPERATOR ONLY — the activation** |
| 2 | A valid registry seed | **prepared**: `config/mcp-registry-seed.candidate.json`, validated by the repo's own `validateSeed()` — 5 registrations, ceiling `A2` |
| 3 | Caller instance id (`--caller` / `SECB_MCP_CALLER_INSTANCE`) | operator supplies at spawn; it asserts who is calling |
| 4 | Writable invocation-ledger path | operator chooses; fail-closed audit, `DENY_LEDGER_UNWRITABLE` |

### The gate was verified intact after the seed was prepared

Preparing a valid seed must not weaken the refusal, so that was measured rather
than assumed:

```
valid seed, no authorization        exit 2  refused
valid seed, authorization = "yes"   exit 2  refused
authorization = "operator", no seed exit 2  refused (and names the caller requirement)
```

The fourth combination — authorization plus a valid seed — **was not run**. That
combination is the activation.

**Disclosure.** The third probe did set `SECB_MCP_DEPLOYMENT_AUTHORIZED=operator`,
paired with a deliberately absent seed, which is how requirement 3 was found. The
server exited 2 without starting; no service was bound and no ledger was created,
verified by an unchanged working tree. It is disclosed because the line drawn was
"the agent does not set that variable", and it was set — in a configuration that
could not start, which is a distinction worth stating rather than relying on.

## §4 — What "smoothly" has to mean, or it means nothing

"Working smoothly" is unfalsifiable as written. Proposed acceptance, all
measurable and all already implemented except the first:

1. The server completes `initialize` and answers `tools/list` over stdio.
2. Every served tool is backed by a module the audit and suite already cover.
3. An invocation writes to the invocation ledger before it takes effect — the
   audit-first property the wiring already claims — and a throwing writer denies.
4. `npm test`, `validate-foundation`, `validate_pack.py` and the skill audit stay
   at their current results with the server wired.
5. `dual-policy-check` reports no loosened guard across the change.
6. Every module carries a disposition; the count of undisposed modules is 0.

Only item 1 is currently unknown, and only because nothing has started.

## §5 — Sequence

| Step | Who | Blocking |
|---|---|---|
| Prepare and validate the seed | agent | done |
| Verify the gate still refuses | agent | done |
| Choose caller id and ledger path | operator | — |
| **Start the server with authorization** | **operator** | **the activation** |
| Compare served tools against the module inventory | agent | after start |
| Record dispositions for the 22 held modules in one register | agent | can start now |
| Ratify P0-20 for the `self-pilot` pair | operator/GOV | — |
| SEC/GOV decision on the skill-registry trio | operator/GOV | — |

## §6 — Explicitly out of this goal

`BOPEN-GOV-EBAG-001` §3–§9 stay blocked and are not part of this target. They
need a verifier the repository cannot edit, and the CI candidate on
`bst/ci-candidate-do-not-push` is **not** that — it lives inside the repository it
checks. Reaching autonomous *operation* and reaching evidence-backed *governance*
are different goals, and conflating them would let the first be reported as
progress on the second.

## What this document does not do

It starts nothing, authorizes nothing, and changes no gate. It names one act,
prepares everything up to it, and states what would count as the goal being met.
