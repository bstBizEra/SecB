import { describe, it } from 'node:test';
import assert from 'node:assert';
import { executeSecbGraphCommand } from '../tools/secb-graph.mjs';

describe('SecB Knowledge Graph Command Engine', () => {
  it('AC-SECB-GRAPH-01: executes graph generation and quality inspection', async () => {
    // writeAssets:false — this suite previously rewrote the tracked file
    // dashboard/public/graph-data.json on every run, so `npm test` left the
    // working tree dirty and a clean checkout could never stay clean.
    const payload = await executeSecbGraphCommand({ extract: false, autoRepair: true, writeAssets: false });

    assert.ok(payload.total_nodes > 0, 'Must contain AST nodes');
    assert.ok(payload.total_edges > 0, 'Must contain total edges');
    assert.ok(payload.communities_count > 0, 'Must contain community clusters');
  });
});
