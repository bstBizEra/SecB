import { describe, it } from 'node:test';
import assert from 'node:assert';
import { parseTomlKeyValue } from '../src/config/agent-config-parser.mjs';
import { SecBAgentRegistry } from '../src/gateway/secb-agent-registry.mjs';

describe('SecBAgentRegistry & Config Engine', () => {
  it('AC-REGISTRY-01: parses TOML agent configuration cleanly', () => {
    const toml = `
[core]
project_id = "test-project"

[agents.coder]
type = "coder"
permitted_roles = ["ENGIN"]
max_classification = "INTERNAL"

[agents.security_architect]
type = "security-architect"
permitted_roles = ["GOV", "independent_review"]
max_classification = "RESTRICTED"
`;
    const parsed = parseTomlKeyValue(toml);

    assert.equal(parsed.core.project_id, 'test-project');
    assert.equal(parsed.agents.coder.type, 'coder');
    assert.deepEqual(parsed.agents.coder.permitted_roles, ['ENGIN']);
    assert.equal(parsed.agents.security_architect.max_classification, 'RESTRICTED');
  });

  it('AC-REGISTRY-02: registers agent and appends AGENT_REGISTERED event to eventLedger', () => {
    const events = [];
    const mockServices = {
      eventLedger: {
        append: (evt) => events.push(evt)
      }
    };

    const registry = new SecBAgentRegistry({ services: mockServices });
    const identity = registry.registerAgent('coder', 'coder-inst-1', 'swarm-abc-123');

    assert.equal(identity.agent_instance_id, 'coder-inst-1');
    assert.equal(identity.workload_identity_ref, 'ruflo-swarm:swarm-abc-123');
    assert.equal(events.length, 1);
    assert.equal(events[0].eventType, 'AGENT_REGISTERED');
    assert.equal(events[0].payload.agent_type, 'coder');
  });

  it('AC-REGISTRY-03: resolves capability for registered and unregistered agent types', () => {
    const registry = new SecBAgentRegistry({ services: { eventLedger: { append: () => {} } } });
    
    const coderCap = registry.resolveCapability('coder');
    assert.equal(coderCap.ok, true);
    assert.equal(coderCap.agent_type, 'coder');
    assert.equal(coderCap.max_data_classification, 'INTERNAL');

    const unknownCap = registry.resolveCapability('nonexistent-agent');
    assert.equal(unknownCap.ok, false);
    assert.equal(unknownCap.deny_code, 'DENY_UNREGISTERED_AGENT');
  });
});
