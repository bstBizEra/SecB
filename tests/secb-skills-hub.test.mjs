import { describe, it } from 'node:test';
import assert from 'node:assert';
import { SecBSkillsHub } from '../src/skills/skills-hub-service.mjs';
import { SkillResolver } from '../src/registry/skill-resolver.mjs';
import { runSecbSkillsCLI } from '../tools/secb-skills.mjs';

describe('SecBSkillsHub Module & Governance Resolution', () => {
  it('AC-SKILLS-HUB-01: indexes local skills and performs token-efficient search', () => {
    const skillResolver = new SkillResolver({ decisionLookup: () => ({ id: "dec-1", type: "HUMAN_PROMOTION" }) });
    const hub = new SecBSkillsHub({ services: { skillResolver } });

    const result = hub.searchSkills('');
    assert.equal(result.ok, true);
    assert.ok(result.count > 0, 'Must index local .agents/skills');
    assert.ok(result.skills[0].snippet !== undefined, 'Snippet must be returned');
    assert.ok(result.skills[0].snippet.length <= 450, 'Snippet must be concise for token savings');
  });

  it('AC-SKILLS-HUB-02: executes CLI search cleanly', () => {
    const result = runSecbSkillsCLI('graphify');
    assert.equal(result.ok, true);
  });

  it('AC-SKILLS-HUB-03: enforces governance policy ceiling check via SkillResolver', () => {
    const mockSkillResolver = {
      resolveSkill: (name) => {
        if (name === 'restricted-skill') {
          return { verdict: 'DENY', deny_code: 'DENY_POLICY_CEILING' };
        }
        return { verdict: 'ALLOW' };
      }
    };

    const hub = new SecBSkillsHub({ services: { skillResolver: mockSkillResolver } });
    hub.registerSkill({ name: 'restricted-skill', title: 'Restricted Skill', description: 'Restricted' });
    const denied = hub.getSkill('restricted-skill');
    assert.equal(denied.ok, false);
    assert.equal(denied.deny_code, 'DENY_POLICY_CEILING');
  });
});
