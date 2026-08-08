/**
 * Offline Local Ollama & DeepSeek Security Scanner Service
 * Performs fast, local LLM security audits on AST nodes with zero cloud latency.
 */

/**
 * @typedef {Object} VulnerabilityScanResult
 * @property {string} nodeId
 * @property {string} symbolName
 * @property {'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'} riskLevel
 * @property {string} vulnerabilityType
 * @property {string} description
 * @property {string} remediation
 */

export class OllamaSecurityScanner {
  /**
   * @param {string} [endpoint='http://localhost:11434']
   * @param {string} [model='deepseek-r1']
   */
  constructor(endpoint = 'http://localhost:11434', model = 'deepseek-r1') {
    this.endpoint = endpoint;
    this.model = model;
  }

  /**
   * Scan an AST node for security vulnerabilities using local Ollama / DeepSeek REST API
   * (falls back to local heuristic static rules if local Ollama daemon is offline).
   *
   * @param {{ id: string; name: string; file: string; type: string }} node
   * @returns {Promise<VulnerabilityScanResult | null>}
   */
  async scanNode(node) {
    const prompt = `Perform security audit on codebase symbol: ${node.name} in file ${node.file}. Identify vulnerabilities like hardcoded credentials, un-sanitized input, or unsafe shell calls. Output JSON.`;

    try {
      const response = await fetch(`${this.endpoint}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          prompt: prompt,
          stream: false,
          format: 'json'
        }),
        signal: AbortSignal.timeout(1500)
      });

      if (response.ok) {
        const payload = await response.json();
        return JSON.parse(payload.response);
      }
    } catch (_err) {
      // Local Ollama offline: Fall back to fast local static security heuristics
    }

    return this.runStaticHeuristicScan(node);
  }

  /**
   * Local static security heuristic scan for offline environment
   *
   * @param {{ id: string; name: string; file: string; type: string }} node
   * @returns {VulnerabilityScanResult | null}
   */
  runStaticHeuristicScan(node) {
    const lowerName = node.name.toLowerCase();
    const lowerFile = node.file.toLowerCase();

    if (lowerName.includes('eval') || lowerName.includes('exec_shell')) {
      return {
        nodeId: node.id,
        symbolName: node.name,
        riskLevel: 'HIGH',
        vulnerabilityType: 'UNSAFE_COMMAND_EXECUTION',
        description: `Symbol '${node.name}' in ${node.file} performs arbitrary command execution.`,
        remediation: 'Sanitize command arguments using strict whitelist validation.'
      };
    }

    if (lowerFile.includes('secret') || lowerName.includes('api_key')) {
      return {
        nodeId: node.id,
        symbolName: node.name,
        riskLevel: 'CRITICAL',
        vulnerabilityType: 'HARDCODED_CREDENTIAL_RISK',
        description: `Potential hardcoded key or secret in ${node.file}.`,
        remediation: 'Move sensitive credentials to environment variables or secret manager.'
      };
    }

    return null;
  }
}
