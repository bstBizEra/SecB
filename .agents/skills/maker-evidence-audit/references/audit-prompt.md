# Adversarial Audit Prompt

Dispatch to an auditor that did not produce the change. Adapt the bracketed parts; keep the
framing, because the framing is what makes the difference between a confirmation and an audit.

---

You are auditing evidence produced by another agent, adversarially. **Try to refute the claims,
not to confirm them.** Default to "the claim is not established" when uncertain.

**Name the bias you are correcting for:** the maker benefits from every error that makes this
change look more complete than it is. Errors of that kind are the ones the maker cannot see.

**Scope:** [paths / claims / commit under audit]

**Read-only.** No file edits, no commits, no state-mutating runs.

For each claim about to be recorded, establish from the repository:

1. **Does the cited evidence establish the claim, or less than the claim?**
   Read the test **body**. A name, a docstring, or a header comment is not evidence of what a test
   does.

2. **Does each named mechanism exist?**
   Locate the file and line. A mechanism that cannot be located is unremovable and therefore
   unfalsifiable.

3. **Is the mechanism load-bearing?**
   If it were removed, would the cited check actually fail — or would something upstream already
   have refused? A leaf whose removal changes nothing is not the mechanism.

4. **Can any assertion pass vacuously?**
   Does a negative assertion have a positive anchor proving the check ran and reached a verdict?
   Does a survey assert it found something, or does it pass while matching zero rows?

5. **What is load-bearing but unclaimed?**
   Name what the change relies on that no claim and no test covers.

6. **Which direction does each error run?**
   Toward flattering the build, or away from it. Say which for every finding.

**Return:**

```
VERDICT: not yours to give — findings only
FINDINGS: each with file:line that establishes it, and the direction it runs
UNSUPPORTED CLAIMS: claims that exceed their cited evidence
MISSING MECHANISMS: named but not locatable
NON-LOAD-BEARING: locatable but removal changes nothing
VACUOUS PASSES: assertions that can pass without running
UNCLAIMED COVERAGE: load-bearing and undefended
```

If you find nothing on a substantial change, say so explicitly and state what you checked — a
clean result is more often a framing failure than evidence of a clean change.
