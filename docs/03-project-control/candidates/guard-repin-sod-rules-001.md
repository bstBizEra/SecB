# Two byte-identity guards are red, and the producer must not be the one to bless them

**Document ID:** `SECB-GUARD-REPIN-SOD-RULES-001`
**Status:** `AWAITING an independent re-pin. Two guards fail. The fix is four characters of hash on two lines, and the reason it is not done is not difficulty.`
**Prepared by:** Claude Code (worker agent — the producer of the change these guards caught)
**Prepared at:** 2026-08-07, baseline `405c158`
**Precedent:** main `d5a076b`

## 1. What is red

```
tests/knowledge-claim-service.test.mjs:467
tests/memory-gateway-service.test.mjs:309

  expected  e0670b8ded25e094f9988c343c72dca4aaf279f1546ad46acf5890c5ba430428
  actual    56f259e79c877a1fab0fdd55a538e1a14d359aa5712c1a39a4102abdcf152e1f
```

Both are the same guard, duplicated in two sibling modules: a SHA-256 over
`src/control/sod-rules.mjs`, CRLF-normalised, asserted against a hard-coded
constant. **On this branch the pin is STATIC.** It will not self-heal on merge
and it will not go green with time.

## 2. Why it went red

`9d4da11` changed `src/control/sod-rules.mjs` — the hardening that gates actor
ids on printable-ASCII admissibility, closing zero-width and Cyrillic-homoglyph
self-approval. The change was intended, reviewed, and landed with these two
guards deliberately left failing rather than quietly re-pinned in the same
commit.

**That is the guard working.** A wrap-not-modify pin exists precisely so that a
change to a protected primitive cannot pass unremarked. Re-pinning it in the
commit that broke it would have converted evidence into paperwork.

## 3. Why the producer will not re-pin it

The producer of `9d4da11` — this agent — is the party whose change the guard
caught. Blessing the new digest is accepting one's own work. This repository
committed at `405c158` to the opposite principle, in code: a promotion whose
producer also approved it is `DENY_SOD_VIOLATED`, and a grant that cannot name
its producer is `DENY_SOD_UNVERIFIABLE`.

Enforcing that on skills in the morning and self-approving a digest in the
afternoon is the same act with a smaller blast radius. The guard stays red until
someone who did not write the change reads it.

**This is not a request for a rubber stamp.** The reviewer's actual job is §5.

## 4. What main already decided about this exact situation

main hit the identical case: `b7988fe` hardened `sod-rules.mjs`, tripping six
guards, and `d5a076b` cleaned up after it. Its choices were not uniform, and the
distinction is the useful part:

| guard shape | main's choice |
|---|---|
| dynamic — diffs against whatever `main` is at run time | **EXCLUDE** — would show red on every branch until merge, so it is red for a reason unrelated to the change |
| static — hard-coded digest constant | **RE-PIN** |

`d5a076b` names `knowledge-claim-service.test.mjs` and
`memory-gateway-service.test.mjs` among its exclusions — but it is describing
*main's* copies, which by then were the dynamic "vs main" shape. **The copies on
this branch are static.** Checked, not inherited: line 467 and line 309 are
literal constants, and `d5a076b` is not an ancestor of this branch.

So main's precedent applies to this branch as **RE-PIN**, not exclude. A reviewer
who exclusion-lists them instead would be deleting a live guard on the strength
of a commit message about different code.

## 5. What the reviewer is actually being asked

Not "is `56f259e7…` the current digest" — that is arithmetic, and it is.
The question is:

> **Is the change to `src/control/sod-rules.mjs` between `d8ad7a0` and `9d4da11`
> one this guard should have stopped?**

Read `git diff d8ad7a0 9d4da11 -- src/control/sod-rules.mjs`. It is small. If the
change is legitimate, re-pin both lines to `56f259e7…` and say so. If it is not,
the guard has done its job and the change should come out — which is a live
option, not a formality.

The producer's disclosure, since it is an interested party: it believes the
change is correct and wants the pin moved. That belief is why it is not the one
moving it.

## 6. The two-line fix, once §5 is answered

```
tests/knowledge-claim-service.test.mjs:467
tests/memory-gateway-service.test.mjs:309

  e0670b8ded25e094f9988c343c72dca4aaf279f1546ad46acf5890c5ba430428
→ 56f259e79c877a1fab0fdd55a538e1a14d359aa5712c1a39a4102abdcf152e1f
```

Verify with the guard's own arithmetic — CRLF-normalised, so a checkout with
different line endings does not produce a different answer:

```
node -e "const{readFileSync}=require('fs'),{createHash}=require('crypto');
console.log(createHash('sha256').update(
  readFileSync('src/control/sod-rules.mjs','utf8').replace(/\r\n/g,'\n')
).digest('hex'))"
```

Expected after: full suite 1186 tests, 1179 pass, 7 skipped, **0 fail**.
Today it is 1177 pass / 2 fail, and these are the 2.

## 7. Provenance

Source — the guards failing in the suite run at `405c158`, and `d5a076b` on
`origin/main`. Timestamp — 2026-08-07. Agent ID — Claude Code, worker agent,
disqualified from ruling on this record by §3.
