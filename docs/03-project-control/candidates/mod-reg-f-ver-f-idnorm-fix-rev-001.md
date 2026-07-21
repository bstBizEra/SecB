# MOD-REG F-VER / F-IDNORM Fix — Independent Cross-Provider Review

- record_id: mod-reg-f-ver-f-idnorm-fix-rev-001
- status: CANDIDATE (advisory independent review; operator ratification required — no push, no merge, no execution authority exercised)
- reviewer_identity: claude-immune-rev-regfix-01 (BST-SA Immune worker agent)
- review_type: independent cross-provider gate review of a producer-verified fix
- producer_record: `docs/03-project-control/candidates/mod-reg-f-ver-f-idnorm-fix-producer-verification-001.md`
- producer_identity_as_recorded: claude-producer-mod-reg-fver-idnorm-01 (commit trailer `Co-Authored-By: Claude Sonnet 5`)
- target_branch: `bst/mod-reg-f-ver-f-idnorm-fix-001`
- reviewed_commit: `a4c342eaa7cad016bbd6286aade0a67225af94df` (single commit)
- base_commit: `fc29f583892a51f080c5726a590fec90fba7671e`
- current_main_at_review: `71b9d4139e00ce1e8ec3ea856e41982e73dfc4d3`
- worktree: isolated agent worktree; primary checkout untouched
- date: 2026-07-21

---

## VERDICT: APPROVE_WITH_NOTES

The fix delivers exactly the two declared fixes, nothing beyond declared scope, with correct
fail-closed behavior, a full green test suite, a clean merge onto current main, and validator
exit 0. Merge is recommended. The notes below are residual-risk / forward-looking observations
(low / informational) that do not block merge and are candidates for a separate hardening ticket.

---

## 1. Scope conformance (nothing beyond declared scope)

`git show a4c342e --stat` — exactly 5 files, matching the producer's declared file set:

| File | Change | Verified content |
| --- | --- | --- |
| `src/registry/runtime-registry.mjs` | +17 / -1 | local `normalizeIdentifierForComparison` helper; `#normalizedIds` parallel index; duplicate check now consults raw OR normalized. The single deleted line is the old raw-only `if (this.#entries.has(...))` guard, replaced in place. |
| `tools/secb-mcp-server-wiring.mjs` | +27 / -3 | `seedRegistry` threads `expectedVersion` through approve/activate; the 3 deleted lines are the original untracked `register()`/`transitionEvaluation()`/`transitionLifecycle()` calls, replaced with version-threading equivalents. |
| `tests/runtime-registry.test.mjs` | +62 / -0 | 5 F-IDNORM tests, additive only. |
| `tests/mcp-server-deployment.test.mjs` | +59 / -0 | 2 F-VER tests + 1 import line, additive only. |
| producer record | +124 / -0 | new advisory record. |

Deleted-line audit (the `-4` across source files): all four deletions are the original statements
replaced in place — no assertion weakened, no existing test edited, no gate removed. `transitionEvaluation`
and `transitionLifecycle` already contained the `expectedVersion` OCC check (lines 135-137, 158-160);
the fix only wires the previously-unused opt-in through the real caller. No drive-by edits. Confirmed
`src/registry/runtime-registry.mjs` and `tools/secb-mcp-server-wiring.mjs` are byte-identical between
`fc29f58` (base) and `71b9d41` (current main), so the fix applies to live mainline code.

## 2. Fix correctness

- **F-VER**: `register()` returns `{ version: 1 }`; `seedRegistry` captures it and threads `expectedVersion`
  into the approve call (→ version 2) and the activate call (→ version 2). The OCC guard uses
  `expectedVersion !== undefined && entry._version !== expectedVersion` — a stale write fails closed with
  `DENY_VERSION_CONFLICT`, wrapped by the caller as `DENY_SEED_REGISTER`. No new denial surface in the
  normal single-writer path; the version passed always equals actual during synchronous seeding (zero
  behavior change today), and the forward-looking lost-update gap is closed.
- **F-IDNORM**: duplicate guard now rejects when the raw ID OR its normalized form (`trim` → `NFC` →
  `toLowerCase`) already exists. Storage (`#entries`) remains keyed on the caller's original raw ID, so
  `get()`/`resolve()`/`transition*()`/`listBy*()` lookup semantics are unchanged — locked down by an
  explicit negative-control test.

## 3. Adversarial probe results (throwaway probes, not committed)

| # | Attack | Outcome | Assessment |
| --- | --- | --- | --- |
| Case variant (`INST_CLAUDE_001`) | in-scope | **DENY_DUPLICATE_INSTANCE** | Caught ✓ |
| Whitespace-padded (`  inst_claude_001  `) | in-scope | **DENY_DUPLICATE_INSTANCE** | Caught ✓ |
| NFC/NFD-confusable twin (U+00E9 vs U+0065 U+0301) | in-scope | **DENY_DUPLICATE_INSTANCE** | Caught ✓ |
| Genuinely distinct ID (negative control) | in-scope | REGISTERED | Correct (no over-collapse) ✓ |
| Prototype-pollution keys (`__proto__`, `constructor`) | security | REGISTERED then dedup DENY; `({}).polluted === undefined` | Safe — `Map` storage, no pollution ✓ |
| OCC stale write (`expectedVersion=1`, actual 2) | bypass | **DENY_VERSION_CONFLICT** | Fail-closed ✓ |
| OCC falsy `expectedVersion=0` (actual 1) | bypass | **DENY_VERSION_CONFLICT** | `!== undefined` correctly honors 0 ✓ |
| Omitted `expectedVersion` | bypass | ACCEPTED | Documented opt-in design, not a regression ✓ |
| **Cyrillic homoglyph** (`а` U+0430 vs `a` U+0061) | confusable | **REGISTERED (not caught)** | See Note N1 — outside disclosed scope |
| **NFKC compatibility** (ligature `ﬀ` U+FB00; fullwidth `ａｂｃ`) | confusable | **REGISTERED (not caught)** | See Note N1 — outside disclosed scope |

## 4. Regression + validator + merge-cleanliness

- `node --test tests/runtime-registry.test.mjs` → tests **41**, pass **41**, fail **0**, skip **0**.
- `node --test tests/mcp-server-deployment.test.mjs` → tests **18**, pass **18**, fail **0**, skip **0**.
- `npm test` (full suite) → tests **710**, pass **705**, fail **0**, skip **5**. Matches the producer's
  claimed 710/705/0/5 exactly. The +59/+62 new test lines run and pass.
- `npm run validate` → **exit 0**.
- Merge-cleanliness: `git merge-tree --write-tree --messages 71b9d41 a4c342e` → tree
  `6892779b21c23d05ed50339b2c5994417036a47e`, **no conflict messages, exit 0**. Clean merge onto current
  main. No file overlap between the fix's touched files and main's advance since base.

## 5. Fail-closed check

All deny paths return structured `RegistryError`/`DeploymentError` objects carrying a stable `.code`
(`DENY_DUPLICATE_INSTANCE`, `DENY_VERSION_CONFLICT`, `DENY_SEED_REGISTER`) and a message. The seed loop's
`try/catch` re-throws every registry denial as `DENY_SEED_REGISTER` wrapping the underlying code — no
weakened gate anywhere in the diff. The new fail-closed F-VER test proves a simulated concurrent lost
update is rejected rather than silently overwritten (the version check fires before transition-legality).

## Notes (non-blocking)

- **N1 (low / informational, residual identity-collision risk)**: normalization is `trim` + `NFC` +
  `toLowerCase` only. It does NOT fold Unicode homoglyph confusables (e.g. Cyrillic `а` U+0430 vs Latin
  `a`) or NFKC compatibility forms (ligatures, fullwidth). Such "same-looking" IDs still register as
  distinct. This is consistent with the disclosed F-IDNORM finding (QA demonstrated only case / whitespace
  / NFC-NFD) and the producer's documented, deliberate NFC scope choice — NFKC and UTS-39 skeleton folding
  carry their own false-positive tradeoffs. Not a regression and not a defect against declared scope;
  recommend a separate hardening ticket if stronger anti-spoofing on `agent_instance_id` is desired.
- **N2 (informational, forward-looking)**: there is no `unregister`/`delete` method today, so `#normalizedIds`
  cannot drift from `#entries`. If a removal method is added later, it must delete from BOTH maps or the
  normalized index will retain stale entries and falsely reject re-registration. Worth a code comment on
  the index.

## Advisory fields

- truth_status: verified_true (all diff, probe, test-count, validator, and merge results verified
  first-hand in an isolated worktree in this pass)
- authority_status: advisory_only (review is complete; merge ratification is an operator action — this
  record does not authorize merge, execution, or production declaration)
- implementation_status: existing (fix implemented and tested on the target branch)
- risk_class: low

## Self-certification

```yaml
self_certification:
  agent_id: claude-immune
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

> Advisory only. This record certifies the independent cross-provider review of the F-VER / F-IDNORM fix
> on branch `bst/mod-reg-f-ver-f-idnorm-fix-001` at commit `a4c342e`. It recommends APPROVE_WITH_NOTES.
> It does not authorize merge, execution, production declaration, or bypass of the operator queue.
