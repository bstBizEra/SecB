/**
 * SecB Agent Config Parser (Pure JS ESM)
 * Parses .secb/agent-config.toml into hardened, frozen configuration objects.
 */

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export function parseTomlKeyValue(content) {
  const result = {};
  let currentSection = result;

  const lines = content.split(/\r?\n/);
  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith("#")) continue;

    // Section header: [section] or [section.sub]
    if (line.startsWith("[") && line.endsWith("]")) {
      const path = line.slice(1, -1).trim().split(".");
      let target = result;
      for (const part of path) {
        if (!target[part] || typeof target[part] !== "object") {
          target[part] = {};
        }
        target = target[part];
      }
      currentSection = target;
      continue;
    }

    // Key-value pair: key = "value" or key = [val1, val2]
    const eqIdx = line.indexOf("=");
    if (eqIdx !== -1) {
      const key = line.slice(0, eqIdx).trim();
      let rawVal = line.slice(eqIdx + 1).trim();

      let parsedVal;
      if (rawVal.startsWith("[") && rawVal.endsWith("]")) {
        // Simple array parsing
        const arrayItems = rawVal.slice(1, -1).split(",").map(s => s.trim().replace(/^"|"$/g, '').replace(/^'|'$/g, ''));
        parsedVal = arrayItems.filter(Boolean);
      } else if (rawVal === "true") {
        parsedVal = true;
      } else if (rawVal === "false") {
        parsedVal = false;
      } else if (!isNaN(rawVal)) {
        parsedVal = Number(rawVal);
      } else {
        // String literal
        parsedVal = rawVal.replace(/^"|"$/g, '').replace(/^'|'$/g, '');
      }

      currentSection[key] = parsedVal;
    }
  }

  return deepFreeze(result);
}
