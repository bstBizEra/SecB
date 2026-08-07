# SECB-GOV-001 Promotion Object — Independent SEC Re-Sweep (W2-G3, SEC-002)

| Field | Value |
|---|---|
| Artifact | `secb-gov-001-w2-g3-sec-review-002` |
| Executor identity | `claude-sec-w2-g3-02` (BST-SA Immune, advisory SEC lane — **G3 full re-sweep**) |
| Distinct from | producer `claude-motor-a2-recut-01` (bound-evidence-002); the original SEC lane `claude-sec-w2-g3-01` (SEC-001, bound to the OLD baseline `c2ec645`); and the parallel G1/G2 re-run lanes. No coordination; first-hand and independent. |
| Gap addressed | **G3** — "Completed SEC review for the R3/R4 activation-boundary controls and the `AGENTS.md`-replacement authority change, with residual risks recorded," re-bound to the operator-accepted RE-CUT baseline. |
| Wave / dispatch | Closure plan Wave 2 lane W2c, **re-cut successor** — operator-scoped as a **FULL re-sweep** (2026-07-22 selection), NOT delta-scoped. |
| **Evidence SHA (RUN binding)** | `3c439f787e9ff15ffe195d5675feb8a1d5621fbe` (operator-accepted RE-CUT baseline via PR #131) |
| **Evidence tree** | `39d006117c853ff0625f80a5d5d431c6b49bf1b8` |
| Record-authoring branch | `bst/w2-g3-sec-002`, cut from current `origin/main` @ `6a6e9de5` |
| Timestamp (UTC) | 2026-07-22 |
| Scope | Independent advisory SEC re-sweep of the whole promotion object at the accepted RE-CUT baseline. NOT a promotion, NOT an activation, NOT a P0-20 seal, NOT an acceptance of residual risk. |
| Authority | Advisory only. **Acceptance of residual risk stays with the operator/GOV.** |

> **Authority boundary of THIS record.** This is an Immune-lane advisory SEC
> re-sweep. It does not promote `SECB-GOV-001`, does not declare it effective,
> does not activate anything, does not seal P0-20, and does not accept residual
> risk on the operator's behalf. Restricted execution remains blocked; the
> promotion/activation decision is operator-only per AMD-002 retained hard gates
> and the P0-20 operator HOLD. The sealed human-GOV slot (`verdict: null`,
> `status: PENDING_HUMAN_GOV`, `producer_may_fill: false`) and the sealed G9
> slot are untouched by this review.

---

## 0. Separation-of-duties attestation

- This SEC lane executor `claude-sec-w2-g3-02` is **distinct** from: the re-cut
  producer `claude-motor-a2-recut-01` (who drafted bound-evidence-002 at this
  SHA); the original SEC lane `claude-sec-w2-g3-01` (whose SEC-001 verdict is
  bound to the OLD baseline `c2ec645` and is **void at this SHA** by its own
  binding clause); and the parallel G1/G2 re-run lanes. No coordination with any
  of them occurred; every scan, run, probe, and tamper below is first-hand.
- I read bound-evidence-002 and the SEC-001 form as **inputs to verify, not to
  trust** — I re-derived every number independently and record agreement/
  disagreement in §3.
- The SEC-001 record is bound to the superseded baseline; this record does not
  edit or delete it (extend-only). It supersedes SEC-001 **by reference only for
  the purpose of the accepted `3c439f7` baseline**.

## 1. Two-tree discipline (RUN vs RECORD)

- **RECORD tree** — this `.md` file is authored on branch `bst/w2-g3-sec-002`,
  cut from current `origin/main` @ `6a6e9de5`. No tracker/MANIFEST edits.
- **RUN tree** — every scan, test, validator run, `npm ci`, `npm audit`, the
  hostile-input probes, and the guard tamper-check were executed first-hand at a
  **detached checkout of `3c439f787e9ff15ffe195d5675feb8a1d5621fbe`** (tree
  `39d006117c853ff0625f80a5d5d431c6b49bf1b8`), verified byte-identical to the
  intended baseline (`git rev-parse HEAD` and `HEAD^{tree}` printed the exact
  SHAs above; `git status --short` clean before the run).

**Every finding and number below is bound to `3c439f7` / tree `39d0061`. It is
void if cited against any other SHA** — including the superseded `c2ec645`
baseline, any later main tip (`origin/main` @ `6a6e9de5` at authoring time), and
any branch merely containing `3c439f7` as an ancestor.

**Baseline delta context (informational).** `git diff --name-only 3c439f7 <local
main ancestor cc582e3>` touches guard-relevant paths (schema-alignment #129:
`contracts/project-contract.schema.json`, `src/contracts/contract-validator.mjs`,
integration-queue + memory-candidate + skill-revocation surfaces, and their
tests/fixtures) — i.e. this is NOT a docs-only delta from the prior baseline, so
the operator's FULL-re-sweep scoping is the correct call. I re-swept the whole
tree first-hand rather than reasoning from a byte-identity shortcut.

---

## 2. Security sweep results (per category, first-hand at `3c439f7`)

### 2a. Secret scan — **CLEAN** (full tree incl. NEW `.agents/` pack + #129 fixtures)

- **High-signal token/key sweep** (`AKIA…`, PEM private-key markers,
  `xox*`/`gh*`/`AIza…`/`sk-…`/`sk-ant-`/`sk-proj-` tokens, JWT triplets) across
  the **entire tracked tree**: **matches are all non-secret test fixtures /
  probe documentation** — the canonical AWS *documentation placeholder*
  `AKIAIOSFODNN7EXAMPLE`, PEM header strings, and `ghp_…`-shaped literals used as
  **inputs to redaction/detection/adversarial tests**
  (`tests/conformance-v011-redaction.test.mjs`, `tests/credential-broker.test.mjs`,
  `tests/mcp-gateway-core-adversarial.test.mjs`,
  `tests/conformance-p0-18-candidate.test.mjs`) and as documented probe rows in
  gate/module review docs. These are values the system is designed to **detect
  and deny**, not live credentials. JWT-triplet sweep: **0 matches.**
- **Assignment-pattern sweep** (`password|secret|api_key|token|private_key|
  access_key|client_secret = "<8+ chars>"`) across `src tools contracts .agents`
  (excluding schema/description/placeholder/test noise): **0 matches.**
- **NEW `.agents/` skills pack (163 files, present in this tree).** Scanned in
  full:
  - The four install scripts (`install-claude.sh`, `install-codex.sh`,
    `install-claude.ps1`, `install-codex.ps1`, 11–12 lines each) are **local
    file-copy installers only**: `set -euo pipefail` / `$ErrorActionPreference =
    "Stop"`, copy `../skills/*` into the target repo's `.claude/skills` (or
    `.agents/skills`), and **refuse to overwrite** an existing skill (explicit
    `exit 1` / `throw`). **No `curl`/`wget`/`iwr`/`Invoke-WebRequest`, no
    curl-pipe-to-shell, no `iex`/`Invoke-Expression`/`eval`/`DownloadString`, no
    base64-decode-exec, no network egress, no hardcoded credentials.**
  - The two Python scripts (`generate_manifest.py`, `validate_pack.py`) are
    local pack-integrity utilities (path walking + YAML validation); **no
    network, no `os.system`/`subprocess`/`urllib`/`requests`, no secrets.**
  - Credential-shaped scan across the whole `.agents/` pack: **0 real
    credentials** (only the fixture `credential_policy:
    TEMPORARY_PROVIDER_AUTH_ONLY_NO_AGENT_SECRET_ACCESS` policy string and
    `credential_handle: null` schema fields).
- **#129 fixtures** (`tests/fixtures/{valid,invalid}/project-contract-rich*.json`,
  integration-queue, memory-record): credential-shaped fields are policy strings
  and `null` handles; no live secret material. Tracked-filename sweep for
  `.env`/`.pem`/`.pfx`/`.p12`/`id_rsa`/`*.key`/`credentials`: **0 files.**
- Verdict: **no real credentials in the promotion object, including the new
  `.agents/` pack and #129 fixtures.**

### 2b. Authority-boundary audit — **PASS**

- **Sealed P0-20 slot.**
  `docs/03-project-control/candidates/secb-gov-001-human-gov-decision-001.yaml`
  at `3c439f7`: `status: PENDING_HUMAN_GOV`, `producer_may_fill: false`,
  `codex_may_activate: false`, `project_contract_effective: false`,
  `mutation_authority: false`. The slot is **null/unfillable**; agent fill is a
  declared violation.
- **NEW W4-G9 decision vehicle §5 slot — bound-scope note.** The G9 decision
  vehicle (`secb-gov-001-w4-g9-decision-vehicle-001.md`) is **NOT present at the
  `3c439f7` tree** — it was merged to main *after* this baseline (it appears in
  `origin/main` @ `6a6e9de5` but not in the accepted baseline). I verified its §5
  slot on the current-main copy for completeness: `slot: G9_PROMOTION_DECISION`,
  `status: PENDING_HUMAN_GOV`, `verdict: null`, `decided_by: null`,
  `effective: false`, `activation_authorized: false`, `producer_may_fill: false`,
  `codex_may_activate: false`, `claude_may_activate: false`,
  `agent_fill_is_a_violation: true` — structurally identical discipline to the
  P0-20 sealed slot. **Honest bound-scope statement:** the G9 vehicle is
  out-of-scope for the `3c439f7` SEC binding because it is not in that tree; its
  §5 slot is sealed and unfilled on main, and this review does not (and cannot)
  fill it.
- **V-020 conformance present + passing.**
  `tests/conformance-v020-governance.test.mjs` ran first-hand: **8 tests / 7 pass
  / 0 fail / 1 skipped.** The single skip is the control working — the positive
  case "requires a real human GOV decision + operator activation … covering it
  here would self-authorize activation — a hard block." The adversarial **S1**
  case (slot structurally unfillable, injection-proof) passes; **S2** (PDP cannot
  self-grant human approval → `DENY_HUMAN_APPROVAL_REQUIRED`), **S4**
  (self-approval / collapsed-SoD rejected), **S5** (authority-engine denies an
  agent-granted Project activation lacking the human GOV role), and the byte-
  identity primitive guard all pass.
- **No agent-activation path.** Grep across `src tools` for any code flipping
  `effective`/`activation_authorized`/`activation_authority`/`producer_may_fill`/
  `codex_may_activate`/`project_contract_effective` to `true`: **0 matches** — no
  such code path exists in the runtime substrate.
- **Adversarial slot-injection attempt — contained (own first-hand probe).** I
  loaded `src/control/authority-engine.mjs` and:
  1. Attempted to mutate the frozen `REQUIRED_ROLE` map to downgrade
     `Project:*->ACTIVE` from `GOV` to `ENGIN` → after the injection attempt the
     map still reads `GOV` (**`Object.freeze` held**).
  2. Constructed an agent grant with roles `['ENGIN']` and
     `allowedTransitions: ['Project:DRAFT->ACTIVE']`, then called `authorize({…
     requestedState: 'ACTIVE'})` → **`{ allowed: false, code: "DENY_AUTHORITY" }`**
     ("Authority grant was not found" — the ENGIN role does not satisfy the
     required GOV role for `Project->ACTIVE`).
  3. An agent grant that *tried* to hold multiple roles to smuggle authority
     (`['ENGIN','REV','QA']`) was rejected by SoD at construction:
     **"combines conflicting roles ENGIN/REV."**
  Conclusion: **an agent cannot self-render or self-authorize a Project
  activation**; the GOV gate and SoD are enforced fail-closed and the frozen role
  map resists in-process injection. **V-020 conformance passes; zero
  activation-flip paths in `src`/`tools`.**

### 2c. Injection / hostile-input posture — **PASS** (incl. #129-revised schema surface)

Spot-verified 3 governance-critical handlers first-hand, including the #129 surface:

| Handler | Own probes | Result |
|---|---|---|
| `src/contracts/contract-validator.mjs` + **#129 revised `contracts/project-contract.schema.json`** (Ajv2020 `strict:true`, `allErrors:true`; top-level `oneOf` keeps narrow/rich disjoint; `additionalProperties:false` at every object level) | H1 rich + rich-v2r3 fixtures → **ACCEPT** (sanity). H2 **extra field at a nested object** (`memory_policy.exfil_channel`, `owners.shadow_owner`) → **DENY_CONTRACT_INVALID**. N4 object smuggled into `activation_restrictions[]` → **DENY**. H3 **mixed narrow/rich** (rich doc + narrow-only `risk_class`) → **DENY_CONTRACT_INVALID** (the `oneOf` disjointness bites). H4 top-level extra field → **DENY**. H5 deep type violation (`project_id` → object) → **DENY**. H6 `__proto__` key smuggle → **DENY**, and `({}).polluted === false` (no prototype pollution). Unknown kind / path-traversal kind → **DENY_UNKNOWN_CONTRACT**. | **Fail-closed on every hostile shape, incl. extra fields at nested points and mixed narrow/rich.** |
| `src/ledger/skill-revocation-ledger.mjs` (prior handler) | P1 `null` request → **DENY_REVOKE_MALFORMED**. P2 **double-read Proxy trap** (getter returns benign `skill-x` on read 1, hostile `../../etc/passwd` on read 2; hostile `getOwnPropertyDescriptor`) → **DENY_REVOKE_MALFORMED** (single-read `structuredClone` snapshot defeats the trap; non-`skillId` fields snapshot as `undefined`). P3 `__proto__` smuggle + missing idempotency → **DENY_REVOKE_MALFORMED**; `({}).admin === false`. | **Single-read snapshot discipline holds; descriptor/double-read trap contained; fail-closed with typed deny.** |
| `src/control/authority-engine.mjs` (see §2b) | frozen-map injection + non-GOV activation + SoD-conflict grant | **All denied fail-closed.** |

- **No silent fallback.** Every hostile probe above resolved to a typed
  `DENY_*`/`DENY_AUTHORITY`/`DENY_CONTRACT_INVALID` or a thrown typed error — no
  catch block converted a deny/throw into a permit; no prototype pollution
  occurred.
- Corroborating suite runs (first-hand): `contract-validator.test.mjs` +
  `project-contract-schema-alignment.test.mjs` (the #129 surface) and
  `skill-revocation-ledger.test.mjs` all pass within the full green suite (§3).

### 2d. Supply-chain floor — **PASS** (finding cleared vs SEC-001)

- **Lockfile present** (`package-lock.json`). `npm ci` reproducibly installed
  **6 packages** from the lockfile, exit 0, no warnings.
- **No install-lifecycle hooks.** `package.json` declares only `validate` and
  `test` scripts; **no** `preinstall`/`install`/`postinstall`/`prepare`/
  `prepublish`. Direct deps: **2** (`ajv@^8.20.0`, `ajv-formats@^3.0.1`), **0
  devDependencies**, `type: module`.
- **`npm audit --omit=dev --registry=https://registry.npmjs.org`** (the
  configured registry npmmirror does not implement the audit endpoint, so run
  honestly against the official registry): **`found 0 vulnerabilities`, exit 0.**
  - This is the **post-remediation** state. SEC-001 found 1 HIGH (`fast-uri`
    3.1.3, GHSA-v2hh-gcrm-f6hx, transitive via ajv); PR #125 bumped the lockfile.
    I verified the lockfile now pins **`fast-uri@3.1.4`** (patched). The SEC-001
    supply-chain NOTE is **cleared at this baseline**.
- **NEW `.agents/` pack has NO node deps of its own.** `find .agents -name
  package.json -o -name node_modules` → **0 hits.** The pack is docs/skills/
  schemas/YAML + shell/ps1/py utilities; it adds no npm dependency surface to the
  promotion object.

### 2e. The guard net — **PASS** (tamper-check verified; distinct file from evidence-002)

- **Guard-net inventory at this tree:** **23 test files** carry git-based
  byte/blob-identity guards (mechanism: `git rev-parse <ref>:<path>` /
  `git hash-object <worktree>` comparison, or `PINNED_BLOBS` in the conformance
  suites), spanning `approval-binding` (F4 protected-source + contracts-set),
  `conformance-v020-governance` (primitive byte-identity), `write-set-policy`,
  `skill-promotion`/`skill-revocation` byte-identity, `integration-queue-ledger`,
  `workspace-lease-*`, `kpi-registry`, `overlap`/`cadence`/`event-family`
  policies, `scorecard`/`replay` assemblers, `memory-gateway-service`,
  `knowledge-claim-service`, and more. The mechanism compares the working-tree
  blob against a pinned baseline blob.
- **Tamper-check (clean → fail → restore → green), first-hand at `3c439f7`.** I
  deliberately picked a guarded file **distinct** from bound-evidence-002's pick
  (`src/control/authority-engine.mjs`) and SEC-001's pick
  (`src/control/sod-rules.mjs`):
  1. **Baseline:** `F4 byte-identity: protected source files … byte-identical to
     main @ beebfe8 AND @ 71b9d41` (`approval-binding.test.mjs`) → **PASS (green).**
  2. **Tamper:** appended one comment line
     (`// TAMPER-PROBE-G3-02 claude-sec-w2-g3-02`) to the guarded source
     `src/control/policy-decision-point.mjs` → the guard **tripped**:
     `AssertionError [ERR_ASSERTION]: src/control/policy-decision-point.mjs
     drifted from main @ beebfe8` (**1 test / 0 pass / 1 fail**).
  3. **Restore:** `git checkout -- src/control/policy-decision-point.mjs` →
     `git status --short` clean → re-run guard → **PASS (green)** again.
  - The guard net detects a single-line drift of governance-critical source and
    fails closed. Working, honestly demonstrated on a **third, independent**
    guarded file. Tree confirmed clean at `3c439f7` / `39d0061` after restore.

---

## 3. Independent acceptance run (full suite + validator) — own numbers

Executed at the detached `3c439f7` checkout after `npm ci`:

| Check | Result (this lane, first-hand) | Exit | evidence-002 reported | Agree? |
|---|---|---|---|---|
| `node --test tests/*.test.mjs` | **1331 tests / 1328 pass / 0 fail / 0 cancelled / 3 skipped / 0 todo** | 0 | 1331 / 1328 / 0 / 3 | **YES — identical** |
| `node tools/validate-foundation.mjs` | status **PASS**, **898 checks / 0 non-PASS**, version `0.3.0-alpha.0`, schemas.count **20** (7 canonical + 13 governed) | 0 | PASS, 898/898, schemas 20 | **YES — identical** |
| `ls contracts/*.schema.json` | **20** files (consistent with validator schema count) | — | 20 | **YES** |
| `npm audit --omit=dev` (official registry) | **0 vulnerabilities** | 0 | 0 vulnerabilities | **YES** |

- **Agreement with bound-evidence-002.** This SEC lane **independently
  reproduces** every headline number in the A2 producer's evidence record
  (1331/1328/0/3; validator PASS 898/898; audit 0). The evidence is now
  independently corroborated by a distinct Immune executor, not merely
  self-reported by the producer. **No disagreement found.**

---

## 4. Activation-boundary subject matter (recorded for operator)

Unchanged in substance from SEC-001, re-confirmed at `3c439f7`:

1. **Governance-substrate swap (R3/R4).** Making `SECB-GOV-001` effective adopts
   OM v0.1 as normative and adopts
   `docs/00-governance/agents-instructions-om-v0.1-candidate.md` as the
   replacement for root `AGENTS.md`. Its **§19 ports amendment SECB-AGENTS-AMD-002
   rev 2 forward verbatim** (only relative link targets rebased), so adopting the
   candidate does not revoke the operator's 2026-07-19 standing-authorization
   grant; the retained hard gates are restated and declared to win over any §19
   latitude. **Verified present and self-describing at this tree** (see PD-2).
2. **`ACTIVE_READ_ONLY_CONTROLLED_ACTIVATION` boundary.** The requested
   activation is bounded (local read-only; `mutation_authority: false`;
   network/remote/deploy/release/stable denied) — blast radius contained — but
   *declaring anything `ACTIVE`* crosses the retained hard gate requiring SEC
   review + explicit human GOV.
3. **Reversibility precondition.** Superseding the legacy constitution + root
   `AGENTS.md` moves the source-of-truth; rollback requires a governed demotion
   path (see PD-1 status below).

**SEC posture on the boundary controls:** at `3c439f7` the activation boundary is
enforced fail-closed and is **not agent-crossable** — the P0-20 slot is
structurally unfillable (§2b), no activation-flip code path exists (§2b), the
adversarial injection is contained (§2b), and the guard net protects the boundary
source from silent drift (§2e). The boundary *controls* pass SEC review. The
*acceptance* of the residual (AMD-002 port-forward completeness; the rollback
policy) is an operator/GOV act, not this review's.

---

## 5. SEC VERDICT (bound to `3c439f7` / tree `39d0061`)

### `SEC_PASS`

The promotion object at the operator-accepted RE-CUT baseline is
**security-sound for the operator to weigh a promotion decision on**, and the
one supply-chain NOTE that made SEC-001 a `PASS_WITH_NOTES` is now **remediated**
at this baseline. First-hand at `3c439f7`: no secrets (including the new 163-file
`.agents/` pack and #129 fixtures); an intact, injection-proof, SoD-enforced
authority boundary with zero activation-flip paths; fail-closed hostile-input
handlers (incl. the #129-revised schema surface) with no silent fallbacks and no
prototype pollution; a working byte-identity guard net (tamper-proven on a third
independent file); a clean production audit (0 vulnerabilities, `fast-uri`
patched to 3.1.4); and a full green suite + validator that this lane
independently reproduced and **agrees** with bound-evidence-002.

I upgrade from SEC-001's `SEC_PASS_WITH_NOTES` to **`SEC_PASS`** because the sole
NOTE-bearing security finding (the `fast-uri` transitive HIGH) is cleared at this
baseline, and the remaining item is a policy dependency, not a vulnerability in
the object (recorded separately below).

### Findings by severity (actual security findings)

| Sev | Finding | Disposition |
|---|---|---|
| Critical | — | none found |
| High | — | none found (the SEC-001 `fast-uri` 3.1.3 HIGH is **cleared**: lockfile pins `fast-uri@3.1.4`; `npm audit --omit=dev` = 0) |
| Medium | — | none found |
| Low | Secret-scan matches are all test fixtures / probe docs (AWS placeholder + PEM markers + `ghp_…`-shaped literals used as detection/redaction inputs). `.agents/` install scripts are local copy-only, overwrite-refusing, no network/exec. | Informational; no action. |

**No BLOCKER, no CRITICAL, no HIGH, no code-level finding in the promotion
object at `3c439f7`.**

### Policy-dependency flags (NOT vulnerabilities — listed separately)

| Flag | Nature | Status at `3c439f7` | Owner |
|---|---|---|---|
| **PD-1** | STABLE/demotion + rollback policy adoption (the reversibility precondition for any future effectiveness change). | **RESOLVED (per task context): G8 adopted #122.** A `secb-gov-001-stable-demotion-rollback-policy-001.md` artifact exists on current main. Noted as resolved; adoption/weight-bearing use remains an operator/GOV record, not this review's to certify. | Operator/GOV |
| **PD-2** | AMD-002 §19 port-forward acceptance — the `AGENTS.md`-replacement carries the amendment forward. | **OPEN (operator-authority act).** The port-forward **artifact is present and verifiable** at this tree: `docs/00-governance/agents-instructions-om-v0.1-candidate.md` §19 states it ports SECB-AGENTS-AMD-002 rev 2 verbatim (only links rebased), restates the retained hard gates, and declares the gates win over §19 latitude and that the file stays DRAFT/NOT EFFECTIVE until operator merge. **Verifying and accepting** that port-forward is the operator's authority act, gated behind the P0-20 HOLD. Not a vulnerability; flagged as a governance dependency. | Operator/GOV |

These flags are listed **separately** from the actual security findings by
design; they feed the operator's G8/G9 judgments, not the SEC verdict.

---

## 6. What this review does NOT do

- Closes **no** gate by authority: G3's SEC re-sweep *exists* now at the accepted
  baseline, but its *acceptance* (of any residual) and the promotion decision
  remain operator/GOV.
- Performs **no** promotion, effectiveness declaration, activation, or P0-20 seal;
  does **not** touch the sealed P0-20 GOV slot (`verdict: null`), the sealed G9
  slot (not in this tree), or the operator HOLD.
- Invents **no** policy — PD-1 is recorded as resolved per task context; PD-2 is
  flagged as an operator-authority dependency with the artifact verified present.
- Edits **no** tracker and **no** MANIFEST. Changes **zero** files under `src/`,
  `contracts/`, `tools/`, or `tests/` (the §2e tamper was fully reverted; tree
  clean at `3c439f7`).

---

## 7. Advisory status fields

```yaml
truth_status: verified_true        # every scan, run, count, hostile probe, and the tamper-check executed first-hand at 3c439f7 / tree 39d0061
authority_status: advisory_only    # SEC re-sweep is advisory; residual-risk acceptance + promotion are operator/GOV
implementation_status: existing    # the reviewed controls exist and pass at the accepted baseline; the SEC re-sweep artifact now exists bound to 3c439f7
risk_class: high                   # subject matter is the governance-substrate swap; contained at 3c439f7 by unmet gates + fail-closed boundary
```

## 8. Self-certification

```yaml
self_certification:
  agent_id: claude-sec-w2-g3-02
  peer_agent_id: claude-motor-a2-recut-01
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

> Certified: this W2-G3 SEC **full re-sweep** is complete as an advisory work
> product, operator-scoped as FULL (not delta), with every scan (incl. the new
> `.agents/` 163-file pack and #129 fixtures), the full suite + validator, the
> `npm audit`, the adversarial authority-boundary probes, the hostile-input
> probes against the #129-revised schema surface and the skill-revocation ledger,
> and the guard tamper-check (fully reverted) executed first-hand at
> `3c439f787e9ff15ffe195d5675feb8a1d5621fbe` (tree
> `39d006117c853ff0625f80a5d5d431c6b49bf1b8`). Verdict **`SEC_PASS`** bound to
> that SHA (void elsewhere). It carries no execution or approval authority;
> acceptance of the PD-2 governance dependency and the promotion/activation
> decision itself remain with the operator/GOV.
