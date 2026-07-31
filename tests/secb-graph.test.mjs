import { describe, it } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { executeSecbGraphCommand } from '../tools/secb-graph.mjs';

describe('SecB Knowledge Graph Command Engine', () => {
  it('AC-SECB-GRAPH-01: executes graph generation and quality inspection', async () => {
    // writeAssets:false — this suite previously rewrote the tracked file
    // dashboard/public/graph-data.json on every run, so `npm test` left the
    // working tree dirty and a clean checkout could never stay clean.
    const dir = mkdtempSync(join(tmpdir(), 'secb-graph-fixture-'));
    const graphPath = join(dir, 'graph.json');
    writeFileSync(graphPath, JSON.stringify({
      graph: { communities: 1 },
      nodes: [
        { id: 'a', label: 'A', community: 0, source_file: 'a.mjs' },
        { id: 'b', label: 'B', community: 0, source_file: 'b.mjs' }
      ],
      links: [{ source: 'a', target: 'b', relationship: 'depends_on' }]
    }));
    let payload;
    try {
      payload = await executeSecbGraphCommand({ extract: false, autoRepair: true, writeAssets: false, syncMemory: false, graphPath });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }

    assert.ok(payload.total_nodes > 0, 'Must contain AST nodes');
    assert.ok(payload.total_edges > 0, 'Must contain total edges');
    assert.ok(payload.communities_count > 0, 'Must contain community clusters');
  });
});
