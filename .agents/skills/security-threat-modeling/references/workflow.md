# Detailed Workflow — Security and Agentic Threat Modeling

## Preconditions

- Confirm: system context.
- Confirm: trust boundaries.
- Confirm: data flows.
- Confirm: asset and identity inventory.
- Confirm: risk tolerance.

## Detailed checks

- Identify assets, safety or business impacts, adversaries, entry points, and trust boundaries.
- Enumerate threats across spoofing, tampering, repudiation, disclosure, denial, privilege escalation, and agentic-specific failure modes.
- Cover prompt injection, memory poisoning, skill supply chain, tool abuse, delegation escalation, agent impersonation, false evidence, approval replay, and reviewer collusion.
- Assess likelihood, impact, detectability, blast radius, and reversibility.
- Design preventive, detective, responsive, and recovery controls.
- Trace controls to owners, policies, tests, telemetry, evidence, and incident procedures.
- Record accepted residual risk only when an authorized human decision exists.

## Anti-patterns

- Starting implementation before the architecture scope and authority are established.
- Treating plausible inference as verified fact.
- Hiding uncertainty or adverse consequences.
- Using a framework mechanically when it does not answer the stakeholder question.
- Declaring approval, conformance, or activation outside assigned authority.
- Passing secrets, hidden reasoning, or unrestricted context through handoffs.

## Handoff minimum

- Source and destination role
- Objective, scope, baseline, and status
- Artifacts and evidence references
- Decisions and assumptions
- Risks, limitations, and unresolved items
- Required next action and acceptance criteria
