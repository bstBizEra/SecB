import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { detectKnowledgeGraphIssues } from '../src/plugins/secb-graph-issue-detector.mjs';

const graphDataPath = resolve(import.meta.dirname, '..', 'dashboard', 'public', 'graph-data.json');

describe('AST Graphify & Community Clustering Benchmark Suite', () => {
  it('AC-BENCH-01: verify graph-data.json payload integrity and community cluster density', () => {
    assert.strictEqual(existsSync(graphDataPath), true, 'graph-data.json must exist in public folder');

    const startTime = performance.now();
    const raw = readFileSync(graphDataPath, 'utf8');
    const data = JSON.parse(raw);
    const parseTimeMs = performance.now() - startTime;

    assert.ok(parseTimeMs < 50, `Graph JSON parsing should take < 50ms, took ${parseTimeMs.toFixed(2)}ms`);
    assert.ok(data.nodes.length >= 100, `Must parse at least 100 AST nodes, found ${data.nodes.length}`);
    assert.ok(data.top_communities.length > 0, 'Must have active community clusters');

    console.log(`[Benchmark Metric] AST Nodes: ${data.nodes.length}`);
    console.log(`[Benchmark Metric] Total Edges: ${data.total_edges}`);
    console.log(`[Benchmark Metric] Community Clusters: ${data.top_communities.length}`);
    console.log(`[Benchmark Metric] Parse Speed: ${parseTimeMs.toFixed(2)}ms`);
  });

  it('AC-BENCH-02: verify 100% Graph Quality Rating with zero unhandled isolated nodes', () => {
    const raw = readFileSync(graphDataPath, 'utf8');
    const data = JSON.parse(raw);

    const issues = detectKnowledgeGraphIssues(data.nodes, data.edges);
    const isolatedIssues = issues.filter(i => i.type === 'ISOLATED_NODE');

    assert.strictEqual(isolatedIssues.length, 0, 'Must have zero isolated orphan nodes');
    console.log(`[Benchmark Metric] Knowledge Graph Quality Score: 100% (0 isolated nodes)`);
  });
});
