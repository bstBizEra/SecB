/**
 * Lazily loaded Ajv.
 *
 * Work-package item U1. Loading the Ajv package costs 2,459ms here — it is 107
 * files, and this repository lives on /mnt/c, where each open crosses the WSL
 * filesystem boundary. Five modules imported it at top level, so every entry
 * point paid that once before doing anything: it was 2.5s of the MCP server's
 * ~3.9s time-to-first-response, spent before answering a handshake that
 * validates nothing.
 *
 * `createRequire` rather than dynamic `import()` on purpose. Ajv ships CommonJS,
 * so it can be required SYNCHRONOUSLY at the moment of first use. A dynamic
 * import would return a promise and force validateContract — and every caller
 * above it, up to SecBMcpServer.handle — to become async, which is a large
 * change to the shape of the code in exchange for the same saving.
 *
 * The cost is not avoided, only moved to the first caller that actually
 * validates something. Nothing here is a cache of validation RESULTS; only the
 * library and the compiled schema objects are memoised.
 */

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

let ajvCtor = null;
let addFormatsFn = null;

function interop(mod) {
  // Ajv's CJS build assigns both module.exports and .default depending on the
  // build; take whichever is callable.
  return typeof mod === "function" ? mod : mod?.default;
}

export function getAjv2020() {
  if (ajvCtor === null) ajvCtor = interop(require("ajv/dist/2020.js"));
  return ajvCtor;
}

export function getAddFormats() {
  if (addFormatsFn === null) addFormatsFn = interop(require("ajv-formats"));
  return addFormatsFn;
}

/**
 * Build an Ajv 2020 instance, loading the library on first call.
 * `formats: false` skips ajv-formats for schemas that declare no formats.
 */
export function createAjv({ formats = true, ...options } = {}) {
  const Ajv2020 = getAjv2020();
  const ajv = new Ajv2020(options);
  if (formats) getAddFormats()(ajv);
  return ajv;
}
