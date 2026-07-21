# MOD-LIVE S1 — TOCTOU/Proxy-Trap Bug Class Scope Disposition

**Record ID:** mod-live-s1-toctou-class-scope-disposition-001
**Status:** ADVISORY — scope decision, not a code change
**Author:** Claude-Sonnet5-Motor
**Date:** 2026-07-21
**Branch:** `bst/mod-live-s1-value-mutation-fix-001` (base `main` @ `f78c4fb`)
**Target:** `src/live/event-family-policy.mjs`, `assessEnvelopeConformance`

## Why this record exists

`assessEnvelopeConformance` has now been through four rounds of the same
underlying bug class, each found by a fresh independent review of the
previous fix:

| Round | Bug | Mechanism | Disposition |
|---|---|---|---|
| N1 | cross-field getter side effect | a plain getter on one field deletes/injects a sibling KEY mid-iteration | Fixed, merged to main (`4445cc3`) |
| N2 | Proxy `getOwnPropertyDescriptor`-trap side effect | the N1 fix's own descriptor-snapshot pass could itself be poisoned by a hostile trap | Fixed via single upfront `Reflect.ownKeys` structural snapshot (`cc63e9a`) |
| N3 | value-mutation, not key-mutation | `Reflect.ownKeys` protects presence only; an earlier field's getter could still mutate a LATER sibling's VALUE before its own turn, since values were read one-at-a-time in fixed order | Fixed via two-phase (descriptor-then-value) read, this branch (`24d5dcd`) |
| N4 | descriptor-redefine, not delete | Phase 1's own descriptor walk is STILL one-at-a-time; a hostile trap on an earlier field can redefine (not delete) a later sibling's descriptor before Phase 1 reaches it — a fully silent forge | **Scoped out, not fixed** (this record) |

Each fix closed the exact mechanism the prior review demonstrated, and each
time a fresh independent review found the same shape of bug one structural
layer deeper (descriptor-of-values → descriptor-of-descriptors). This
record's purpose is to stop that recursion deliberately, with an explicit
reason, rather than either (a) silently declaring "done" after N4 goes
unaddressed, or (b) burning further rounds on N5/N6/... that would recur in
exactly the same shape.

## The structural reason this recurs (and why it has no bottom)

Reading N named properties off a genuinely adversarial JavaScript Proxy
cannot be made atomic. Every mechanism JS offers for reading an object's own
properties or descriptors — `[[Get]]`, `[[GetOwnProperty]]`,
`Object.getOwnPropertyDescriptor`, `Object.getOwnPropertyDescriptors`,
`Reflect.ownKeys` — either (a) is itself a per-key trap invocation with no
multi-key-atomic variant, or (b) only protects the ONE thing it directly
returns (key set, or one descriptor) and says nothing about the state of any
other key at the moment it returns. Any fix that adds "read something about
every field first, in one dedicated pass, before making decisions" merely
moves the exploitable one-at-a-time boundary from whatever it used to
protect (values) to whatever the new pass reads instead (descriptors) —
it does not remove the one-at-a-time nature of the read itself. There is no
finite number of phases that converges to true atomicity against a fully
adversarial Proxy using only property-descriptor-level primitives.

## Disposition: SCOPE OUT, not silently drop

N4 is **disclosed** (inline in `event-family-policy.mjs` next to
`assessEnvelopeConformance`, and in the independent review that found it:
`docs/03-project-control/candidates/mod-live-s1-value-mutation-fix-independent-review-001.md`),
**not fixed**, on the following reasoning:

1. **Current blast radius is zero.** This module is PURE and UNWIRED — no
   live caller anywhere in the repo supplies any `envelope` value to this
   function, adversarial or otherwise (confirmed by the file's own header
   and every round's own verification). N4 (like N1-N3 before their fixes,
   and NOVEL-5 from the N2-round review) is only reachable if something
   supplies a hand-crafted adversarial Proxy — which requires a caller that
   does not exist yet.
2. **The right fix is structural exclusion, not deeper recursion.** The
   actual, convergent fix for this entire bug CLASS (not just N4) is to
   reject non-plain-data inputs at the boundary — e.g. require `envelope` to
   have passed through `JSON.parse` (or `structuredClone` of already-JSON-safe
   data) before it ever reaches this function, which makes Proxies and
   accessor properties structurally impossible to receive, collapsing N1-N4
   (and any Nx that would otherwise follow) to a single, non-recursive
   admission check. Retrofitting that check now, on a PURE+UNWIRED module
   with no real caller, would be speculative design against a caller that
   does not exist.
3. **This scoping is a gate on future wiring, not a closed door.** Whoever
   prepares the eventual live-wiring slice for this module (assessment §5
   #5, R3/operator-gated per the module's own header) MUST add that
   structural admission check — or an equivalent argument for why the real
   caller's envelope construction path can never produce an adversarial
   Proxy — as a PREREQUISITE of that wiring work, not an afterthought. This
   is now recorded in three places so it cannot be missed: this record, the
   inline code comment in `event-family-policy.mjs`, and (via this record's
   own citation) discoverable from the independent-review chain any future
   wiring producer will read.

## What this record does NOT do

- Does not change `assessEnvelopeConformance`'s code or behavior (N4 remains
  live/exploitable against a hand-crafted adversarial Proxy input; no such
  input exists in any current caller).
- Does not authorize wiring this module to any live path — that remains a
  separate, later, R3/operator-gated decision per the module's own header.
- Does not claim N1/N2/N3 are anything other than genuinely closed — they
  are, independently re-verified each round with fresh PoCs, not just
  producer claims.
- Does not itself constitute a Human GOV decision; it is advisory scope
  reasoning for whoever reviews this module next.

## Status fields

```yaml
truth_status: verified_true
authority_status: advisory_only
implementation_status: existing
risk_class: low
self_certification:
  agent_id: Claude-Sonnet5-Motor
  peer_agent_id: "independent REV b5989d1 (found N4, this record's own trigger)"
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```
