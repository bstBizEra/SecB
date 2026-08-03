# Capability intake — `graphify`, filed as a capability rather than a skill

**Document ID:** `SECB-CAPABILITY-INTAKE-GRAPHIFY-001`
**Status:** `PREPARED — INCOMPLETE BY DESIGN. Two required fields cannot be filled honestly from the installed artefact; see §4.`
**Prepared by:** Claude Code (worker agent)
**Prepared at:** 2026-08-03, baseline `cfb4573`
**Contract:** `contracts/capability-record.schema.json`

## 1. Why this record exists

The skill audit found that `graphify` is the only package in
`.agents/skills/` containing executable instructions — 14 commands against 0
across all 22 governed packages and 0 in the other two ungoverned ones. It has no
`manifest.yaml`, so the audit could only report that it is ungoverned.

The operator then classified it correctly: **`graphify` is a tool, not a skill.**
That reframes the gap. It has no manifest not through negligence but because
`.agents/skills/` is the wrong drawer — a skill manifest has no field in which to
declare a network boundary or a credential handle, because a skill should not
have either.

SecB already carries the right contract. `capability-record.schema.json` requires
`filesystem_boundary`, `network_boundary` and `credential_handle` — which are
precisely the three dimensions that make `graphify` worth governing.

## 2. What is verifiable

Read from the installed distribution, not from its documentation.

| Field | Value | Source |
|---|---|---|
| distribution | `graphifyy` **0.9.25** | `graphifyy-0.9.25.dist-info/METADATA` |
| import name | `graphify` | `SKILL.md` uses `python -m graphify` |
| repository | `https://github.com/Graphify-Labs/graphify` | METADATA `Project-URL` |
| licence | Apache-2.0 | METADATA |
| installer | pip | `INSTALLER` |
| requires | Python >= 3.10 | METADATA |
| installed size | 307 recorded files, 80 `.py` | `RECORD` |
| RECORD digest | `c770dd090059d36abb091bf5146cc20f8b2a8ada5fb6c7cbe68e3968f1c2e950` | sha256 of `RECORD`, computed here |

**The distribution name and the import name differ.** `graphifyy` installs as
`graphify`. This is common and usually benign — `pyyaml` imports as `yaml`, and a
doubled letter most often means the plain name was already taken on PyPI. It is
recorded because a distribution/import mismatch is also the shape a typosquat
takes, and the cost of confirming it against the named repository is one lookup.
**This is a thing to check, not an accusation.**

## 3. The draft record

```jsonc
{
  "capability_id": "codegraph.query",
  "version": "0.9.25",
  "adapter_id": "graphify-mcp",
  "tool": "query_graph",
  "access": "external",
  "status": "CANDIDATE",

  "source_identity": {
    "maintainer": "Graphify-Labs",
    "repository": "https://github.com/Graphify-Labs/graphify",
    "namespace": "graphifyy"
  },

  "immutable_version": {
    "commit": "<CANNOT BE FILLED — see §4>",
    "tag_or_digest": "<CANNOT BE FILLED — see §4>"
  },

  "integrity": {
    "sha256": "c770dd090059d36abb091bf5146cc20f8b2a8ada5fb6c7cbe68e3968f1c2e950"
  },

  "tool_inventory": [
    "query_graph", "get_node", "get_neighbors", "shortest_path",
    "get_pr_impact", "list_prs", "triage_prs"
  ],

  "filesystem_boundary": "WRITES: graphify-out/ (36 MB at this baseline, gitignored) and .mcp.json in the target repository. INSTALLS: git hooks and a union-merge driver into .git/ via `hook install`. READS: the entire target tree.",

  "network_boundary": "OPTIONAL and OFF by default. `python -m graphify.serve` is stdio. With `--transport http --host 0.0.0.0 --port 8080` it binds ALL interfaces.",

  "credential_handle": "--api-key, documented as \"$SECRET\", supplied only on the HTTP transport",

  "intake_evidence_refs": [
    "docs/04-assurance/skill-audit/lens-prototype-001.md",
    "docs/03-project-control/candidates/wp-sk-audit-01-autonomous-skill-audit.work-package.yaml#delivery_record"
  ],

  "approvals": [],

  "revocation": { "revoked": false, "reason": null, "known_bad_versions": [] }
}
```

### Why `access: "external"`

The enum offers `read`, `mutate`, `destructive`, `external`. `graphify` writes
into the target repository and installs git hooks, which is at least `mutate`;
serving over HTTP on all interfaces is `external`. **The highest applicable value
is the honest one.** A record claiming `read` for a tool that installs a merge
driver would be the self-attestation this contract exists to prevent.

Note this is the *documented* capability of the tool, not an observation of what
any invocation did. The record governs what the tool CAN do.

### Why `filesystem_boundary` names the git hook explicitly

`hook install` writes into `.git/`, outside any workspace lease. That belongs in
the headline of the boundary rather than in a footnote, because a reader
approving a "code graph tool" would not otherwise expect it to modify how merges
resolve.

## 4. Two fields that cannot be filled honestly

`immutable_version` requires `commit` and `tag_or_digest`, both `minLength: 1`.

The package was installed from a PyPI wheel. There is no `direct_url.json`, no
`.git`, and no commit anywhere in the distribution — a wheel does not carry the
source revision it was built from. **Nothing in the installed artefact can supply
either field.**

Writing `"unknown"` would satisfy the schema and defeat it. The contract asks for
an immutable version so a future reader can obtain exactly this artefact again;
a placeholder that validates is worse than an empty record, because it converts a
gap into a false assurance.

**What would close it,** in increasing order of strength:

1. The PyPI wheel digest for `graphifyy==0.9.25`, as `tag_or_digest`. Obtainable
   from the index; pins the artefact but not its source.
2. The upstream commit at that tag from `Graphify-Labs/graphify`, as `commit`.
   Pins the source, and confirms the repository named in METADATA is real and
   carries this release — which also settles §2's naming question.
3. A vendored copy under `repo_sources/`, per the operator's own standing rule
   that runtime production code is never taken from an unvendored source.

**Until 1 and 2 exist this record cannot be completed, and that is the finding.**
A tool whose provenance cannot be pinned should not be promoted past CANDIDATE,
and the contract surfaced that without anyone having to think of it.

## 5. What this record does NOT claim

- **Not that `graphify` is unsafe.** It backs `tools/secb-graph.mjs`, which runs
  today and exits 0. The boundaries above are declarations of capability, not
  incidents.

  On the figures it produces: two runs minutes apart, across a few commits of
  this branch, gave 6438 then 6440 AST nodes, 7206 then 7207 edges, and 1306
  then 1304 communities. The graph tracks the tree, so **no node count is a fact
  about SecB — it is a fact about a tree state, and the output records no ref it
  was built from.** That is a real gap in the graph pipeline rather than an
  inconsistency in this record, and it is the reason a freshness signal belongs
  on the CodeGraph work rather than being assumed. A figure quoted from it should
  name the commit or not be quoted.
- **Not that it has been used to install hooks or serve on 0.0.0.0.** Nobody
  checked. `invocationLog` exists and is fail-closed but has never been written
  to, so there is no behavioural record either way.
- **Not that filing this record governs it.** `access: external` and
  `status: CANDIDATE` mean it is admitted for evaluation, not approved. The
  `approvals` array is empty and stays that way until someone with authority
  fills it.
- **Not a proposal to move or remove the package.** Where `graphify` should live
  is a separate decision; this record only says what it is.

## 6. Ruling

```
Accept this capability record as CANDIDATE:   [ ] yes   [ ] no

immutable_version:  [ ] obtain the wheel digest and upstream commit
                    [ ] vendor under repo_sources/ instead
                    [ ] accept as permanently unpinnable, with reason: ____________

Distribution/import name (graphifyy -> graphify) confirmed against
https://github.com/Graphify-Labs/graphify :   [ ] confirmed   [ ] not checked

Decided by: ____________   Role: ____________   Date: ____________
```

**Authority statement.** This record was prepared by an agent from the installed
artefact and from the package's own documentation. It approves nothing and
promotes nothing. Two required fields are deliberately left unfilled rather than
guessed, and the record is invalid against the contract until they are supplied —
which is the intended behaviour, not a defect in the record.
