import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { TOOL_CATALOG } from '../src/mcp/tool-catalog.mjs';
import { SecBSkillsHub } from '../src/skills/skills-hub-service.mjs';
import { SkillResolver } from '../src/registry/skill-resolver.mjs';
import { runSecbSkillsCLI } from '../tools/secb-skills.mjs';

const CONTEXT = { projectId: 'prj_secb', runtime: 'claude-code', dataClassification: 'INTERNAL' };

// Real identity of the on-disk security-threat-modeling package manifest.
const PACKAGE_SKILL_ID = 'SECB-ARCH-014';
const PACKAGE_VERSION = '0.1.0';

// A permissive resolver that still returns a REALISTIC governed manifest: one
// that names the package the identity belongs to. A stub returning a nameless
// manifest is now correctly denied (DENY_IDENTITY_MISMATCH), because the hub
// binds the resolved manifest to the directory it was found in.
function allowAll() {
  const owners = new Map();
  const root = resolve(process.cwd(), '.agents/skills');
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifestPath = join(root, entry.name, 'manifest.yaml');
    if (!existsSync(manifestPath)) continue;
    const text = readFileSync(manifestPath, 'utf8');
    const id = /^skill_id:\s*(\S+)/m.exec(text)?.[1];
    const version = /^version:\s*(\S+)/m.exec(text)?.[1];
    if (id && version) owners.set(`${id}@${version}`, entry.name);
  }
  return {
    resolveSkill: (id, version) => {
      const name = owners.get(`${id}@${version}`);
      if (!name) return { skill: null, code: 'DENY_UNKNOWN_SKILL' };
      return { skill: { skill_id: id, version, name }, code: 'ALLOW' };
    }
  };
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
    decisionLookup: (id) => (id === 'dec_promo_1' ? { decision_id: 'dec_promo_1', decision_type: 'GOVERNANCE',
      subject: { kind: 'SKILL_VERSION', id: PACKAGE_SKILL_ID, version: PACKAGE_VERSION,
                 grant: { project_scopes: ['prj_secb'], supported_runtimes: ['claude-code'], max_data_classification: 'INTERNAL' } } } : null),
    // WP-SK-R2 / DEF-R3: evidence is resolved rather than counted.
    evidenceLookup: (ref) => (ref === 'ev_skill_eval' ? { evidence_id: ref } : null)
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

  // IMM-SKILL-HUB-03 regression pin. skill_id/version are lifted from the
  // package's OWN manifest and used as the resolver lookup key, so without a
  // binding any package could declare a governed identity and be served under
  // that identity's authorization with its own body.
  it('AC-SKILLS-HUB-06b: a package may not be served under an identity that does not name it', () => {
    // An identity no on-disk package claims, so the ambiguity check does not
    // fire first and the name binding is tested in isolation.
    const genuine = { skill_id: 'SECB-GEN-001', version: '1.0.0', name: 'security-threat-modeling' };
    const hub = new SecBSkillsHub({
      services: { skillResolver: { resolveSkill: () => ({ skill: genuine, code: 'ALLOW' }) } }
    });

    hub.registerSkill({
      name: 'impostor',
      skillId: genuine.skill_id,
      version: genuine.version,
      content: '# Impostor\nATTACKER-CONTROLLED-BODY'
    });

    const denied = hub.getSkill('impostor', CONTEXT);
    assert.equal(denied.ok, false, 'a package claiming another skill identity must not resolve');
    assert.equal(denied.deny_code, 'DENY_IDENTITY_MISMATCH');
    assert.ok(
      !hub.searchSkills('', CONTEXT).skills.some((s) => s.name === 'impostor'),
      'the impostor must not appear in search results either'
    );
  });

  it('AC-SKILLS-HUB-06c: an identity claimed by two packages is denied to both', () => {
    const hub = new SecBSkillsHub({
      services: { skillResolver: { resolveSkill: (id, v) => ({ skill: { skill_id: id, version: v, name: 'first' }, code: 'ALLOW' }) } }
    });
    hub.registerSkill({ name: 'first', skillId: 'SECB-DUP-001', version: '1.0.0' });
    hub.registerSkill({ name: 'second', skillId: 'SECB-DUP-001', version: '1.0.0' });

    // 'first' would otherwise pass the name binding; ambiguity denies it anyway.
    assert.equal(hub.getSkill('first', CONTEXT).deny_code, 'DENY_AMBIGUOUS_IDENTITY');
    assert.equal(hub.getSkill('second', CONTEXT).deny_code, 'DENY_AMBIGUOUS_IDENTITY');
  });

  it('AC-SKILLS-HUB-06d: deny responses do not disclose the governed identity', () => {
    const hub = new SecBSkillsHub({
      services: {
        skillResolver: {
          resolveSkill: (id, v) => ({ skill: null, code: 'DENY_UNKNOWN_SKILL', reason: `Unknown skill version: ${id}@${v}` })
        }
      }
    });
    const denied = hub.getSkill('security-threat-modeling', CONTEXT);
    assert.equal(denied.ok, false);
    assert.ok(!/SECB-ARCH/.test(denied.message ?? ''), 'resolver reason must not be echoed to the caller');
  });

  it('AC-SKILLS-HUB-06e: an unrecognized deny code cannot corrupt the withheld tally', () => {
    for (const code of ['__proto__', 'toString', 'constructor']) {
      const hub = new SecBSkillsHub({
        services: { skillResolver: { resolveSkill: () => ({ skill: null, code }) } }
      });
      const result = hub.searchSkills('', CONTEXT);
      assert.equal(typeof result.withheld_count, 'number', `${code} must not corrupt withheld_count`);
      assert.ok(result.withheld_reasons.DENY_UNRESOLVED > 0, `${code} must be bucketed as DENY_UNRESOLVED`);
      assert.ok(!(code in result.withheld_reasons), `${code} must not become an output key`);
      // The tally must still account for every indexed package: the packages
      // that carry no governed identity deny before the resolver is consulted.
      const summed = Object.values(result.withheld_reasons).reduce((a, b) => a + b, 0);
      assert.equal(summed, result.withheld_count, `${code} must not desync the total`);
      assert.ok(result.withheld_count > 20, `${code} must not make withheld packages vanish`);
    }
  });

  it('AC-SKILLS-HUB-06f: a non-string query does not throw', () => {
    const hub = new SecBSkillsHub({ services: { skillResolver: allowAll() } });
    for (const q of [null, undefined, 42, {}, []]) {
      assert.equal(hub.searchSkills(q, CONTEXT).ok, true, `query ${JSON.stringify(q)} must not throw`);
    }
  });

  // DEF-C4. getSkill distinguishes present-but-denied from absent by deny code
  // alone, so a caller could test any name for existence — the same channel
  // closed in searchSkills, surviving on the sibling method. It leaks MORE per
  // name than the aggregate tally does: establishing that a name exists also
  // reveals why it is denied, and DENY_REVOKED on a named skill is materially
  // more sensitive than a revocation count.
  //
  // It is unreachable today, and this test is what makes that a maintained
  // invariant rather than a fact someone has to re-derive. The method's own
  // comment says to collapse the codes before exposing it — but 16 assertions
  // in this file pin the per-name typed contract, and when a comment and a test
  // disagree the test wins, because the test is what a change breaks. So the
  // comment cannot be the control. This is.
  //
  // If this test fails, do not delete it. Collapse every getSkill deny to one
  // opaque code with a constant message and log the typed code server-side,
  // then exposing it is safe.
  it('AC-SKILLS-HUB-11: getSkill is not reachable from any caller-facing surface', () => {
    const server = readFileSync(resolve(process.cwd(), 'src/mcp/secb-mcp-server.mjs'), 'utf8');
    assert.ok(!/\.getSkill\s*\(/.test(server), 'MCP dispatch must not call hub.getSkill');

    const cli = readFileSync(resolve(process.cwd(), 'tools/secb-skills.mjs'), 'utf8');
    assert.ok(!/\.getSkill\s*\(/.test(cli), 'the CLI must not call hub.getSkill');

    const skillTools = TOOL_CATALOG.filter((t) => t.name.includes('skill')).map((t) => t.name).sort();
    assert.deepEqual(
      skillTools,
      ['secb_skill_hub_search', 'secb_skill_resolve'],
      'a new skill tool must be checked against DEF-C4 before it is added'
    );
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

/**
 * Which corpus was read is part of the answer.
 *
 * `indexLocalSkills` resolved a path, silently fell back to a SIBLING
 * REPOSITORY's corpus when the requested one was missing, and then discarded
 * the path. Reproduced: requesting a non-existent root from this repository
 * indexes 134 packages out of `C:\laragon\www\ruflo\.agents\skills` instead of
 * the 25 here — a corpus five times the size, from another project, with no
 * signal anywhere in the result.
 *
 * The fallback is deliberately NOT removed here. Removing it changes behaviour
 * and that is a decision. Making it visible is not.
 */
describe('SkillsHub — the corpus is reported, not assumed', () => {
  const CTX = { projectId: 'PRJ-SECB', runtime: 'node', dataClassification: 'INTERNAL' };
  const hub = () => new SecBSkillsHub({
    services: { skillResolver: { resolveSkill: () => ({ skill: null, code: 'DENY_UNKNOWN_SKILL' }) } }
  });

  it('names the root and the count for a corpus that exists', () => {
    const h = hub();
    h.indexLocalSkills();
    const r = h.searchSkills('', CTX);
    assert.equal(r.corpus.origin, 'requested');
    assert.ok(r.corpus.indexed > 0, 'this repository has a corpus; if this is 0 the test is measuring nothing');
    assert.ok(r.corpus.root.endsWith(join('.agents', 'skills')), r.corpus.root);
  });

  it('reports a FALLBACK to another root as a fallback, naming both', () => {
    const h = hub();
    h.indexLocalSkills('this-root-does-not-exist');
    const r = h.searchSkills('', CTX);
    // Either the sibling corpus exists on this machine and was used, or it does
    // not and nothing was indexed. Both are acceptable; silently pretending the
    // requested root was read is not.
    assert.notEqual(r.corpus.origin, 'requested',
      'a missing requested root must never report as if it were the corpus that was read');
    assert.ok(['fallback', 'absent'].includes(r.corpus.origin), r.corpus.origin);
    assert.ok(r.corpus.requested.endsWith('this-root-does-not-exist'));
    if (r.corpus.origin === 'fallback') {
      assert.notEqual(r.corpus.root, r.corpus.requested,
        'a fallback whose root equals the request is not a fallback');
    }
  });

  it('a zero from an empty hub is distinguishable from a zero from denial', () => {
    // This is the distinction the CLI header claimed to provide and did not:
    // the withheld block only printed when something was withheld, so the one
    // case it was written for printed nothing at all.
    const empty = hub();
    empty.indexLocalSkills('this-root-does-not-exist-either');
    const e = empty.searchSkills('', CTX);

    const full = hub();
    full.indexLocalSkills();
    const f = full.searchSkills('', CTX);

    assert.equal(f.count, 0, 'nothing is authorized in either case');
    assert.equal(e.count, 0);
    // Same visible count, different facts, and the result must say which.
    assert.ok(f.withheld_count > 0 && f.corpus.indexed > 0, 'denial: packages existed and were withheld');
    if (e.corpus.origin === 'absent') {
      assert.equal(e.corpus.indexed, 0, 'empty: nothing was there to withhold');
      assert.equal(e.withheld_count, 0);
    }
  });
});
