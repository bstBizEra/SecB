# Codex work package — SecB MCP operator tooling (Phase 4)

Repo: `C:\laragon\www\SecB`
Branch: `feat/secb-ruflo-command-center` (do NOT merge to `main`, do NOT push)
Governance: follow `AGENTS.md` in the repo root. `src/**`, `tests/**`, `tools/**`, `contracts/**`
are pre-authorized. Report exact check results after the final change (working rule 6).

Claude is working **in parallel** on Phase 3 (the proxy runtime) in a different set of files.
Stay inside your lane below or we will conflict.

---

## Your lane — files you own

Create these. Nobody else will touch them:

| File | Purpose |
|---|---|
| `tools/secb-mcp-config.mjs` | Generate MCP client config from the upstream registry |
| `tools/secb-mcp-doctor.mjs` | Probe declared upstreams, report health |
| `tests/secb-mcp-config.test.mjs` | Tests for the generator |
| `tests/secb-mcp-doctor.test.mjs` | Tests for the doctor |

## Files you must NOT edit

Claude owns these this round — edits will collide:

- `MANIFEST.json` — do not touch. List the files you added at the end of your report; Claude merges them.
- `tools/validate-foundation.mjs` — do not touch. If you add a `contracts/*.schema.json`, say so in your report instead of wiring it yourself.
- `src/mcp/tool-catalog.mjs`, `src/mcp/secb-mcp-server.mjs`, `src/mcp/jsonrpc-stdio.mjs`
- `src/mcp/upstream-client.mjs`, `src/mcp/upstream-proxy.mjs` (Claude is creating these now)
- `.secb/mcp-upstreams.json` — read it, never write it

## Shared dependency (read-only for you)

`src/mcp/upstream-registry.mjs` is already built, tested (31 tests), and frozen for this round.
Import from it; do not modify it. Exports you need:

```js
import {
  loadUpstreamRegistry,   // (path) -> validated registry document, throws typed UpstreamRegistryError
  resolveRegistry,        // (registry, { host }) -> { registry_id, host, total, reachable, unreachable, upstreams: [...] }
  resolveUpstream,        // (upstream, { host, wslDistro }) -> one resolution verdict
  detectHost,             // () -> "windows" | "wsl" | "linux"
} from "../src/mcp/upstream-registry.mjs";
```

A resolution verdict is either:
```js
{ id, transport, runtime, host, reachable: true, command, args, env, bridged? }   // stdio
{ id, transport, runtime, host, reachable: true, url }                            // sse/http
{ id, transport, runtime, host, reachable: false, reason, detail }                // reason:
      // "DISABLED" | "HOST_UNREACHABLE" | "LOOPBACK_ACROSS_BOUNDARY"
```

Registry path: `<repo>/.secb/mcp-upstreams.json` (17 upstreams migrated from the old
`bizera-win-mcp-hub/config/servers.yaml`; 8 enabled, 9 carried disabled with reasons).

---

## Task 1 — `tools/secb-mcp-config.mjs`

Replaces `bizera-win-mcp-hub/scripts/install.ps1`.

Read the upstream registry, resolve it for a target host, and emit a ready-to-paste MCP client
config. Support these output formats via `--format`:

- `codex` — TOML fragment for `~/.codex/config.toml`, i.e. `[mcp_servers.<id>]` blocks with
  `command`, `args`, optional `[mcp_servers.<id>.env]`, and `startup_timeout_sec`.
- `claude` — JSON for `claude_desktop_config.json`, i.e. `{ "mcpServers": { "<id>": { command, args, env } } }`
- `json` — the raw resolution projection (useful for debugging)

CLI shape:
```
node tools/secb-mcp-config.mjs --format codex [--host windows|wsl] [--include-unreachable]
```

Requirements:
- Default `--host` to `detectHost()`.
- **Skip unreachable upstreams by default.** With `--include-unreachable`, emit them commented
  out (TOML `#`) or under a separate `"_unreachable"` key (JSON) with the deny reason — never
  emit a config line that is known not to work.
- TOML string escaping matters: Windows paths contain backslashes. Use single-quoted TOML
  literal strings for paths/commands (`command = 'wsl.exe'`), matching how the user's real
  `~/.codex/config.toml` already writes Windows paths.
- Write to stdout only. Do **not** write into `~/.codex/` or any user config — printing is the
  whole deliverable. AGENTS.md working rule 5 forbids deploy/activation without operator
  authorization, and writing a live client config is activation.
- Pure and deterministic: no clock, no network, no spawning.

## Task 2 — `tools/secb-mcp-doctor.mjs`

Replaces `bizera-win-mcp-hub/scripts/verify_install.py`.

For each declared upstream, check whether its target actually exists, and print a table.

```
node tools/secb-mcp-doctor.mjs [--host windows|wsl] [--json]
```

Checks per transport:
- `stdio` — is the resolved `command` on PATH? For `npx`/`uvx` entries, check the launcher
  binary, not the package. If args contain an absolute path (e.g. `/opt/bst_Intel_VC`), check
  that the path exists.
- `sse` / `http` — do **not** make a network request in the default mode; report the URL and
  the resolution verdict only. Add `--probe` to opt into a single short-timeout HEAD/GET.
  Network access must be opt-in, never the default.

Output a per-upstream verdict: `ok` / `unreachable` / `disabled` / `unknown`, plus a summary
line. Exit code 0 always in report mode (this is a diagnostic, not a gate).

Note: the registry already carries a `verified_status` field per upstream recording what was
observed on 2026-07-30. Treat it as advisory provenance only — report what YOU observe now, and
flag entries where your observation disagrees with the recorded `verified_status`. Do not
rewrite the registry file.

---

## Acceptance

1. `npm test` passes with exact counts reported (baseline before your work: 693 tests, 688 pass,
   0 fail, 5 skipped). Your new tests should raise the total; nothing should start failing.
2. Both CLIs run from **WSL** and produce sane output. If you can also run them from Windows
   PowerShell, do — Claude could not (WSL interop is off in Claude's environment), so a Windows
   run is genuinely new information worth reporting.
3. Tests must be hermetic: build registry documents inline in the test rather than depending on
   `.secb/mcp-upstreams.json` contents staying fixed, except for one smoke test that loads the
   real file and asserts only that it validates.

## Report back with

- Exact `npm test` output counts
- The list of files you created (for MANIFEST merge)
- Any `contracts/*.schema.json` you added (Claude wires the validator)
- Sample output of both CLIs
- Anything you found broken that you did not fix
