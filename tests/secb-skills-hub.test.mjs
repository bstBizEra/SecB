import { describe, it } from 'node:test';
import assert from 'node:assert';
import { SecBSkillsHub } from '../src/skills/skills-hub-service.mjs';
import { SkillResolver } from '../src/registry/skill-resolver.mjs';
import { runSecbSkillsCLI } from '../tools/secb-skills.mjs';

const CONTEXT = { projectId: 'prj_secb', runtime: 'claude-code', dataClassification: 'INTERNAL' };

// Real identity of the on-disk security-threat-modeling package manifest.
const PACKAGE_SKILL_ID = 'SECB-ARCH-014';
const PACKAGE_VERSION = '0.1.0';

function allowAll() {
  return { resolveSkill: () => ({ skill: { skill_id: 'stub' }, code: 'ALLOW' }) };
}

function governedManifest(overrides = {}) {
  return {
    skill_id: PACKAGE_SKILL_ID,
    version: PACKAGE_VERSION,
    name: 'security-threat-modeling',
    status: 'PUBLISHED',
    owner: 'SEC',
    source: { repository: 'local:.agents/skills', commit_sha: 'a'.repeat(40), licence: 'internal' },
    purpose: 'Threat modeling for governed systems',
    supported_runtimes: ['claude-code'],
    project_scopes: ['prj_secb'],
    max_data_classification: 'INTERNAL',
    evidence_refs: ['ev_skill_eval'],
    approval_history: [
      { decision_id: 'dec_promo_1', decision_type: 'HUMAN_PROMOTION', approved_by: 'human-gov', approved_at: '2026-07-30T00:00:00Z' }
    ],
    revocation_conditions: ['upstream drift'],
    ...overrides
  };
}

function governedResolver() {
  const resolver = new SkillResolver({
    decisionLookup: (id) => (id === 'dec_promo_1' ? { decision_id: 'dec_promo_1', decision_type: 'GOVERNANCE' } : null)
  });
  resolver.registerSkill(governedManifest());
  return resolver;
}

describe('SecBSkillsHub discovery metadata', () => {
  it('AC-SKILLS-HUB-01: parses SKILL.md frontmatter instead of reading the delimiter as the title', () => {
    const hub = new SecBSkillsHub({ services: { skillResolver: allowAll() } });
    const result = hub.searchSkills('', CONTEXT);

    assert.equal(result.ok, true);
    assert.ok(result.count > 0, 'Must index local .agents/skills');
    for (const skill of result.skills) {
      assert.notEqual(skill.title, '---', `title for ${skill.name} must not be the frontmatter delimiter`);
      assert.ok(!skill.description.startsWith('---'), `description for ${skill.name} must not leak frontmatter`);
      assert.ok(!skill.snippet.startsWith('---'), `snippet for ${skill.name} must not leak frontmatter`);
      assert.ok(skill.snippet.length <= 400, 'Snippet must be concise for token savings');
    }
  });

  it('AC-SKILLS-HUB-02: packages without a governed manifest are discoverable but never authorized', () => {
    const hub = new SecBSkillsHub({ services: { skillResolver: allowAll() } });

    for (const name of ['graphify', 'worktree', 'secb-project-registry']) {
      const denied = hub.getSkill(name, CONTEXT);
      assert.equal(denied.ok, false, `${name} carries no manifest.yaml and must not resolve`);
      assert.equal(denied.deny_code, 'DENY_UNGOVERNED_PACKAGE');
    }
    assert.ok(hub.searchSkills('', CONTEXT).withheld_reasons.DENY_UNGOVERNED_PACKAGE >= 3);
  });
});

describe('SecBSkillsHub fail-closed authorization', () => {
  it('AC-SKILLS-HUB-03: an unwired resolver denies every package rather than skipping the check', () => {
    const hub = new SecBSkillsHub();
    const result = hub.searchSkills('', CONTEXT);

    assert.equal(result.count, 0);
    assert.equal(result.skills.length, 0);
    assert.ok(result.withheld_count > 0, 'withheld packages must be reported, not silently dropped');
    assert.equal(result.withheld_reasons.DENY_NO_RESOLVER, result.withheld_count);
    assert.equal(hub.getSkill('security-threat-modeling', CONTEXT).deny_code, 'DENY_NO_RESOLVER');
  });

  // Regression pin: the previous gate only recognized `verdict === "DENY"` or
  // DENY_POLICY_CEILING, so every other typed deny below was read as an allow
  // and the skill content was returned.
  it('AC-SKILLS-HUB-04: every typed resolver deny code withholds the skill', () => {
    const codes = [
      'DENY_UNKNOWN_SKILL',
      'DENY_NOT_PUBLISHED',
      'DENY_REVOKED',
      'DENY_PROJECT_SCOPE',
      'DENY_RUNTIME',
      'DENY_DATA_CLASSIFICATION',
      'DENY_UNBOUND_CONTEXT',
      'DENY_POLICY_CEILING'
    ];

    for (const code of codes) {
      const hub = new SecBSkillsHub({
        services: { skillResolver: { resolveSkill: () => ({ skill: null, code }) } }
      });
      const denied = hub.getSkill('security-threat-modeling', CONTEXT);
      assert.equal(denied.ok, false, `${code} must not be read as an allow`);
      assert.equal(denied.deny_code, code);
      assert.equal(hub.searchSkills('', CONTEXT).count, 0);
    }
  });

  it('AC-SKILLS-HUB-05: an unrecognized or throwing resolver verdict denies', () => {
    const malformed = new SecBSkillsHub({
      services: { skillResolver: { resolveSkill: () => ({ verdict: 'ALLOW' }) } }
    });
    assert.equal(malformed.getSkill('security-threat-modeling', CONTEXT).deny_code, 'DENY_UNRESOLVED');

    const throwing = new SecBSkillsHub({
      services: { skillResolver: { resolveSkill: () => { throw new Error('ledger unavailable'); } } }
    });
    assert.equal(throwing.getSkill('security-threat-modeling', CONTEXT).deny_code, 'DENY_RESOLVER_ERROR');
  });

  it('AC-SKILLS-HUB-06: a package self-asserting PUBLISHED status does not authorize itself', () => {
    const hub = new SecBSkillsHub({
      services: { skillResolver: { resolveSkill: () => ({ skill: null, code: 'DENY_NOT_PUBLISHED' }) } }
    });
    hub.registerSkill({
      name: 'self-attested',
      skillId: 'SECB-FAKE-001',
      version: '9.9.9',
      packageStatus: 'published'
    });

    const denied = hub.getSkill('self-attested', CONTEXT);
    assert.equal(denied.ok, false);
    assert.equal(denied.deny_code, 'DENY_NOT_PUBLISHED');
  });

  // IMM-SKILL-HUB-02 regression pin. The withheld tally previously counted only
  // packages matching the caller's query, so an unauthorized caller could probe
  // it for package existence and recover the corpus by name. The tally must not
  // vary with the query.
  it('AC-SKILLS-HUB-06a: withheld counts do not vary with the caller query', () => {
    const hub = new SecBSkillsHub();
    const probe = (q) => hub.searchSkills(q, CONTEXT);

    const baseline = probe('');
    assert.ok(baseline.withheld_count > 1, 'fixture must withhold more than one package');

    for (const q of ['threat', 'graphify', 'worktree', 'zzzz-no-such-package', 'a', 'z']) {
      const probed = probe(q);
      assert.equal(
        probed.withheld_count,
        baseline.withheld_count,
        `query "${q}" must not change the withheld count`
      );
      assert.deepEqual(
        probed.withheld_reasons,
        baseline.withheld_reasons,
        `query "${q}" must not change the withheld breakdown`
      );
    }
  });

  it('AC-SKILLS-HUB-07: unknown skill names return a typed not-found deny', () => {
    const hub = new SecBSkillsHub({ services: { skillResolver: allowAll() } });
    assert.equal(hub.getSkill('no-such-skill', CONTEXT).deny_code, 'DENY_SKILL_NOT_FOUND');
  });
});

describe('SecBSkillsHub against the governed SkillResolver', () => {
  it('AC-SKILLS-HUB-08: resolves a package by its manifest identity, not a hardcoded version', () => {
    const hub = new SecBSkillsHub({ services: { skillResolver: governedResolver() } });

    const allowed = hub.getSkill('security-threat-modeling', CONTEXT);
    assert.equal(allowed.ok, true, 'published, in-scope package must resolve');
    assert.ok(allowed.content.includes('threat'), 'skill body must be returned');

    // Only the manifest-declared identity is registered; a hub that guessed
    // "1.0.0" would have produced DENY_UNKNOWN_SKILL above.
    const search = hub.searchSkills('threat', CONTEXT);
    assert.equal(search.count, 1);
    assert.equal(search.skills[0].name, 'security-threat-modeling');
  });

  it('AC-SKILLS-HUB-09: out-of-scope callers are denied by the resolver contract', () => {
    const hub = new SecBSkillsHub({ services: { skillResolver: governedResolver() } });

    assert.equal(hub.getSkill('security-threat-modeling', { ...CONTEXT, projectId: 'prj_other' }).deny_code, 'DENY_PROJECT_SCOPE');
    assert.equal(hub.getSkill('security-threat-modeling', { ...CONTEXT, runtime: 'python-runner' }).deny_code, 'DENY_RUNTIME');
    assert.equal(hub.getSkill('security-threat-modeling', { ...CONTEXT, dataClassification: 'RESTRICTED' }).deny_code, 'DENY_DATA_CLASSIFICATION');
    assert.equal(hub.getSkill('security-threat-modeling', {}).deny_code, 'DENY_UNBOUND_CONTEXT');
  });

  it('AC-SKILLS-HUB-10: CLI reports the withheld count instead of an empty hub', () => {
    const result = runSecbSkillsCLI('graphify');
    assert.equal(result.ok, true);
    assert.equal(result.count, 0);
    assert.ok(result.withheld_count >= 1);
  });
});
