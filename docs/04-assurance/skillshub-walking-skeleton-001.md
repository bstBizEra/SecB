# Walking skeleton — what makes SkillsHub non-zero, and what comes with it

**Document ID:** `SECB-ASSURANCE-SKILLSHUB-SKELETON-001`
**Status:** `EVIDENCE RECORD — reproduced by running, 2026-08-03`
**Produced by:** Claude Code (worker agent), acting as producer
**Baseline:** `feat/secb-ruflo-command-center` at `38169e1`
**Nothing was wired.** The run below used temporary ledgers outside the repository and left no state.

## Why this record exists

`SECB-PRD-SKILLSHUB-DEFECTS-001` calls `DEF-R1` "the most consequential finding
of this programme". Its evidence lived in a scratch directory that no longer
exists. A finding of that weight should not rest on a transcript.

It also answers a question asked repeatedly and never answered concretely: the
CLI reports `0 authorized skill(s)` and `25 withheld`. What would change that?

## The chain works, with the actors this project has

Three gates stand between a package on disk and a resolvable skill. **None of
them requires separation of duties on this branch:**

| Gate | What it enforces | SoD |
|---|---|---|
| `EvidenceLedger.appendEvidence` | contract, idempotency key | none |
| `DecisionLedger.appendDecision` | contract, validity window, idempotency, REVERSION consistency | none |
| `SkillResolver.registerSkill` | a `HUMAN_PROMOTION` that resolves as a `GOVERNANCE` decision, and every `evidence_refs` entry resolving to VERIFIED or ACCEPTED evidence | none |

The three-actor requirement found elsewhere in this session belongs to `main`'s
`MOD-SKILL` S2 promotion path (`approval-binding.mjs`), not to this branch's
resolver. They are different chains and only one of them is reachable here.

The registry gate that previously forbade populating the resolver was **retired
by operator ruling on 2026-08-03** (`SECB-SEC-GOV-DECISION-SKILLSHUB-G1-RETIRE-001`).

Result:

```
=== evidence -> decision -> register -> resolve ===
  resolve -> ALLOW   name: arc42-architecture-documentation
```

**One skill, consumable, with a single actor and no exception granted.** Nothing
technical stands between this branch and a non-zero count.

## What the same decision also authorizes

```
=== what else does that one decision authorize (DEF-R1) ===
  a completely unrelated skill              -> ALLOW
  self-widened scope + RESTRICTED class     -> ALLOW
```

The second manifest names a different skill entirely. The third widens its own
`project_scopes` to three projects and raises its own `max_data_classification`
to `RESTRICTED`. Both cite the same promotion decision, and both resolve.

**`DEF-R1` is no longer a description. This is a run.** One decision is a master
key: any skill, any version, any project set, any runtime, any data class.

That is why `WP-SK-VS-01` — the work package that would have produced the first
resolvable skill — was withdrawn before authorization earlier in this session.
At that time the reasoning was analytical. It is now reproduced.

## What the chain still refuses

The gates are not open, and this matters for judging what a fix must preserve:

```
=== control: what is still denied ===
  evidence that does not exist   -> DENY_UNVERIFIED_EVIDENCE
  decision that does not exist   -> DENY_UNAPPROVED_PUBLICATION
```

A skill cannot be published without real evidence and a real governed decision.
What is missing is not the requirement for a decision — it is any requirement
that the decision **name what it authorizes**.

## Reproduction

Runs against this branch unchanged. Writes only to a temp directory.

```js
import { mkdtempSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EvidenceLedger } from "<repo>/src/ledger/governed-ledgers.mjs";
import { DecisionLedger } from "<repo>/src/ledger/temporal-ledgers.mjs";
import { SkillResolver } from "<repo>/src/registry/skill-resolver.mjs";

const dir = mkdtempSync(join(tmpdir(), "secb-skeleton-"));
const now = "2026-08-03T00:00:00Z";
const base = { version: 1, project_id: "prj_secb_local", work_package_id: "WP-SK-VS-02",
               session_id: "sess-skeleton", actor_id: "claude-code" };
const sha = (s) => createHash("sha256").update(s).digest("hex");

const ev = new EvidenceLedger({ filePath: join(dir, "e.ndjson") });
ev.appendEvidence({ ...base, evidence_id: "ev-skill-1", evidence_type: "evaluation-result",
  source: "local run", observed_at: now, procedure: "executed the skill's eval suite",
  result: "PASS", exit_status: 0, limitations: ["one run"], content_hash: sha("ev-skill-1"),
  verification_status: "VERIFIED", classification: "INTERNAL", retention_policy: "90d" },
  { expectedSequence: 0, idempotencyKey: "k-ev" });

const dl = new DecisionLedger({ filePath: join(dir, "d.ndjson") });
dl.appendDecision({ ...base, decision_id: "dec-promote-1", decision_type: "GOVERNANCE",
  outcome: "PROMOTE_SKILL", rationale: "eval passed, evidence verified",
  authority_ref: "operator", evidence_refs: ["ev-skill-1"], decided_at: now,
  valid_from: now, valid_until: "2026-11-03T00:00:00Z" },
  { expectedSequence: 0, idempotencyKey: "k-dec" });

const resolver = new SkillResolver({
  decisionLookup: (ref, at) => dl.resolveEffective(ref, { at: at ?? now }).decision,
  evidenceLookup: (ref) => ev.read().find((r) => r.entry.entryId === ref)?.entry.payload ?? null,
  now: () => now
});

const manifest = (id, name) => ({
  skill_id: id, version: "1.0.0", name, status: "PUBLISHED", owner: "SKILL",
  source: { repository: "SecB", commit_sha: "a".repeat(40), licence: "internal" },
  purpose: "walking skeleton", supported_runtimes: ["claude-code"],
  project_scopes: ["prj_secb_local"], max_data_classification: "INTERNAL",
  evidence_refs: ["ev-skill-1"],
  approval_history: [{ decision_id: "dec-promote-1", decision_type: "HUMAN_PROMOTION",
                       approved_by: "operator", approved_at: now }],
  revocation_conditions: ["regression"]
});
const ctx = { projectId: "prj_secb_local", runtime: "claude-code", dataClassification: "INTERNAL" };

resolver.registerSkill(manifest("SKILL-ARC42", "arc42-architecture-documentation"));
resolver.resolveSkill("SKILL-ARC42", "1.0.0", ctx);            // ALLOW

resolver.registerSkill(manifest("SKILL-UNRELATED", "a-completely-different-skill"));
resolver.resolveSkill("SKILL-UNRELATED", "1.0.0", ctx);        // ALLOW  <- DEF-R1

const wide = manifest("SKILL-WIDE", "self-widened");
wide.project_scopes = ["prj_secb_local", "prj_someone_else", "prj_anything"];
wide.max_data_classification = "RESTRICTED";
resolver.registerSkill(wide);
resolver.resolveSkill("SKILL-WIDE", "1.0.0", { ...ctx, dataClassification: "RESTRICTED" });  // ALLOW

rmSync(dir, { recursive: true, force: true });
```

## The three routes, and what each costs

Recorded as options, not as a recommendation. The producer has none to give here:
it is the party that would benefit from the capability being switched on.

| | What it needs | What it costs |
|---|---|---|
| **Close `DEF-R1` first** | a typed `subject` on `contracts/decision-record.schema.json`, optional in the schema and mandatory at the resolver | one field, ~15 resolver lines, **0 existing decisions invalidated**. The ARCHI analysis is complete; its packet was withdrawn only because `main` solved it independently |
| **Adopt `main`'s mechanism** | `skill-promotion.schema.json` already binds `bound_action` and `bound_object_version` and carries a producer/review/governance triple | closes `DEF-R1` structurally, and needs a REV — which the operator ruled fail-closed on 2026-08-03 |
| **Wire it as it stands** | nothing | the first decision becomes a master key for every skill registered after it. Defensible ONLY under a recorded limit — one decision, one skill, never reused — and that limit is a promise, not a control |

## What this record does not do

- **It wires nothing.** No production `decisionLookup` was changed; both remain
  `() => null`.
- **It does not argue for switching SkillsHub on.** It answers what would, and
  shows what arrives with it.
- **It does not reopen `SECB-PRD-SKILLSHUB-001`.** That programme is superseded
  and this changes nothing about that.
- **It is not a test.** Making it one means adding to `tests/`, which needs a
  work package. Until then it is a reproduction anyone can run, recorded where it
  can be found rather than in a scratch directory.
