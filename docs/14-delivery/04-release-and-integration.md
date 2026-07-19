# Release and Integration

## Integration queue

```text
Candidate submitted
→ Workspace frozen
→ Candidate sealed
→ Independent review
→ Queue against latest integration head
→ Merge simulation
→ Composite build/test/scan
→ Evidence acceptance
→ Human or delegated integration decision
→ Protected-branch merge
→ Release candidate
```

## Branch policy

- no routine agent mutation in the authoritative local checkout;
- no direct agent push to protected branches;
- pull request or Integration Candidate required;
- required REV, QA, security and SecB evidence statuses;
- one authorized integration identity;
- reproducible baseline and dependency lock state;
- rollback and release receipt for activation.

Integration success does not automatically authorize production activation.
