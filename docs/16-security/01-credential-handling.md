# Credential Handling

## Policy

Agents may initiate authentication but must not receive reusable secret values in model context.

```text
Agent requests authentication
→ SecB validates project, work package, destination and purpose
→ User enters secret in masked secure control
→ Credential Broker stores/encrypts secret
→ Session-bound Credential Lease issued
→ Runtime injects secret into authorized process
→ Lease expires or is revoked
```

## Prohibited locations

Passwords, tokens, private keys and recovery codes must not appear in:

- ordinary chat;
- prompts or model context;
- terminal commands or process arguments;
- URLs or Git remotes;
- repository files or commits;
- logs, traces, screenshots or replay;
- evidence, memory, knowledge or skills.

## Local administrator bootstrap

Username may be entered in the bootstrap form. Password must use a masked field, be immediately converted to an approved modern password hash and never be provided to an agent runtime. Build and external-service credentials remain separate in the Credential Broker.
