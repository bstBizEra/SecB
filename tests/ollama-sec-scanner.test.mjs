import { describe, it } from 'node:test';
import assert from 'node:assert';
import { OllamaSecurityScanner } from '../src/plugins/ollama-sec-scanner.mjs';

describe('Local Ollama & DeepSeek Security Scanner', () => {
  const scanner = new OllamaSecurityScanner();

  it('AC-OLLAMA-01: detects unsafe command execution heuristics', async () => {
    const node = { id: 'node-eval-1', name: 'eval_user_command', file: 'src/utils/exec.ts', type: 'function' };
    const result = await scanner.scanNode(node);

    assert.notStrictEqual(result, null, 'Must detect vulnerability');
    assert.strictEqual(result?.riskLevel, 'HIGH');
    assert.strictEqual(result?.vulnerabilityType, 'UNSAFE_COMMAND_EXECUTION');
  });

  it('AC-OLLAMA-02: detects hardcoded secret heuristics', async () => {
    const node = { id: 'node-secret-1', name: 'api_key_header', file: 'src/config/secrets.json', type: 'variable' };
    const result = await scanner.scanNode(node);

    assert.notStrictEqual(result, null, 'Must detect secret risk');
    assert.strictEqual(result?.riskLevel, 'CRITICAL');
    assert.strictEqual(result?.vulnerabilityType, 'HARDCODED_CREDENTIAL_RISK');
  });

  it('AC-OLLAMA-03: returns null for safe nodes', async () => {
    const node = { id: 'node-safe-1', name: 'AuthorityEngine', file: 'src/core/authority-engine.ts', type: 'class' };
    const result = await scanner.scanNode(node);

    assert.strictEqual(result, null, 'Safe nodes must return null');
  });
});
