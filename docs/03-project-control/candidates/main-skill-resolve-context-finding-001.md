# Finding for the MOD-SKILL owner — `secb_skill_resolve` accepts caller-asserted authorization context

**Document ID:** `SECB-FINDING-MAIN-SKILL-CTX-001`
**Status:** `RAISED — AWAITING OWNER RESPONSE`
**Addressed to:** the owner of `MOD-SKILL` on `main`
**Raised by:** Claude Code (worker agent) — raises the question, does not rule on it
**Raised at:** 2026-08-03
**Target:** `main` at `e8eb4ec`. **Not** a finding about `feat/secb-ruflo-command-center`.

> **Why this is a standalone record.** It was found while retiring a gate on an
> unrelated branch, and it belongs to `main`. Leaving it inside
> `SECB-SEC-GOV-DECISION-SKILLSHUB-G1-RETIRE-001` would file a `main` finding
> inside a SkillsHub retirement packet that the `MOD-SKILL` owner has no reason
> to open.

---

## 1. The observation

`main`, `src/mcp/secb-mcp-server.mjs`:

```js
case "secb_skill_resolve":
  return s.skillResolver.resolveSkill(args.skill_id, args.version, args.context ?? {});
```

`resolveSkill` reads three fields from that object and compares each against the
registered manifest (`src/registry/skill-resolver.mjs`):

| Line on `main` | Check |
|---|---|
| `:117` | `manifest.project_scopes.includes(projectId)` |
| `:120` | `manifest.supported_runtimes.includes(runtime)` |
| `:123` | requested data class vs `manifest.max_data_classification` |

*(Line numbers are `main`'s. The same three checks sit at `:207`, `:210` and
`:213` on `feat/secb-ruflo-command-center`, which carries the `WP-SK-R2` addition
above them. This reporter first cited the branch's numbers here and corrected
them against `main` before filing — noted because citing one tree's line numbers
for another is the exact error that closed the programme this finding came from.)*

All three inputs arrive in `args.context`. The caller therefore supplies the
project it claims to be acting for, the runtime it claims to be, and the data
class it claims to be cleared for — and the resolver compares the caller's own
assertions against the manifest, with nothing contradicting them.

A caller naming a project it is not scoped to, or a runtime it is not, is not
refused by this path. The resolver's fail-closed logic is intact; what is absent
is any binding between the asserted context and the caller's registered identity.

**This is a question, not an accusation.** The context may be derived by a caller
upstream of this dispatch that this reporter has not read. `resolveSkill`'s own
contract — it returns `DENY_UNBOUND_CONTEXT` when any field is blank — reads as
if it expects a *trusted* caller to assert on behalf of a subject. If that
trusted caller exists and is the only route to this dispatch, this finding is
closed by pointing at it.

## 2. Severity — latent, and the condition that makes it live

`main`, `tools/secb-mcp-server-wiring.mjs:225`:

```js
skillResolver: new SkillResolver({ decisionLookup: () => null })
```

With a null decision lookup, `registerSkill` refuses every `PUBLISHED` manifest,
so no skill resolves and the comparison at `:207`–`:213` is unreachable in the
wired server today. **Latent, not live.**

The condition that makes it live is already named on `main`, in
`src/ledger/skill-revocation-ledger.mjs`:

> `EXPLICITLY OUT OF SCOPE (component 3, operator-gated follow-up …):`
> `Resolution-time `resolveEffective` re-validation in `skill-resolver.mjs`
> (DENY_REVOKED / DENY_PROMOTION_LAPSED at resolution). That alters the LIVE
> resolver's runtime deny behavior and is left as a separate, operator-gated
> wiring step.`

Wiring component 3 means wiring a real decision lookup. At that moment skills
begin resolving and this path becomes reachable.

**The recommendation is a sequencing one:** treat the caller-context binding as a
precondition of component 3, not as a separate backlog item. Component 3 is the
change that converts this from unreachable to reachable, and shipping it first
would open the path in the same commit that makes the path useful.

## 3. Comparison with the branch this was found from

Offered because the difference is informative in both directions, not as a claim
that either is correct.

`feat/secb-ruflo-command-center` derives two of the three fields from the caller's
identity rather than accepting them:

```js
runtime: callerIdentity.runtime_product_id,
dataClassification: ceiling
```

The first is the property `main`'s path lacks — runtime is taken from the
registered identity, not from the request.

The second is a defect of its own, recorded there as `DEF-C3`: `ceiling` is the
caller's clearance *ceiling*, and passing it as the *requested* data class
inverts the comparison, so a caller with higher clearance is denied more. That
branch also carries a signed ruling requiring it be corrected, and it has not
been. `main` does not have this line at all.

So neither side is a model for the other: `main` should not adopt the second
line, and the branch's first line is the shape worth considering.

## 4. What would close this finding

Any one of:

1. **A pointer to the trusted caller.** If every route to `secb_skill_resolve`
   passes through a caller that derives `args.context` from a registered
   identity, name it and this finding is closed as already-handled.
2. **A statement that caller-asserted context is the intended contract**, with the
   trust boundary recorded where a reader of `secb-mcp-server.mjs` will find it.
   The resolver's doc comment says agents "receive only skill versions authorized
   for their project, runtime, and data class"; if the caller names those, that
   sentence needs a qualifier.
3. **A binding**, deriving project, runtime and data class from the caller's
   registered identity as component 3 is wired.

## 5. Provenance and what this reporter did not check

- Verified by reading `main` at `e8eb4ec` via `git show`. Not executed — `main`
  is not checked out in the reporter's working tree and was not run.
- **Not checked:** whether an upstream caller derives `args.context`. That is
  option 1 above and is the most likely disposition. The reporter searched the
  dispatch site only.
- **Not checked:** whether `secb_skill_resolve` is reachable from any transport
  in the wired server, or is dispatch-only today.
- **Context on the reporter.** This finding comes from a programme on
  `feat/secb-ruflo-command-center` that was closed on 2026-08-02 because its
  entire defect register was derived from a branch 296 commits behind `main`, and
  said so nowhere. This record therefore states its target ref in the header and
  its unchecked assumptions here. It should be read with that history in mind:
  the reporter's record on facts it computed is good and its record on facts it
  asserted is not.

**No approval authority. Nothing here rules on anything, and no change to `main`
is proposed by this record.**
