/**
 * SecB CLI dispatcher — routing, pass-through, and closed failure.
 *
 * The dispatcher exists to remove a public-registry resolution path from the
 * MCP registration, so the properties that matter are narrow and structural:
 *
 *   1. It routes to the tool that already owns each behaviour, and never
 *      reimplements one. The routing table is asserted against files that
 *      actually exist, so a rename cannot leave a dangling command.
 *   2. Arguments after the subcommand are forwarded verbatim — a dispatcher
 *      that swallowed or reordered flags would quietly change what the
 *      underlying tool was asked to do.
 *   3. An unknown command fails closed with the known set named (working rule
 *      8), rather than guessing a default or falling through to a shell.
 *
 * `runCommand` is exercised with an injected spawn so no child process is
 * created; the real spawn's only job is stdio inheritance, which is asserted
 * on the options object rather than by starting a server.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { EventEmitter } from "node:events";
import { accessSync, constants } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  COMMANDS,
  SecbCliError,
  knownCommands,
  resolveCommand,
  runCommand
} from "../tools/secb.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("every routed command points at a file that exists", () => {
  const walk = (node) => {
    for (const value of Object.values(node)) {
      if (typeof value === "string") {
        // Throws if absent — a renamed tool must break here, not at first use.
        accessSync(resolve(ROOT, value), constants.R_OK);
      } else {
        walk(value);
      }
    }
  };
  walk(COMMANDS);
});

test("knownCommands lists nested groups as space-separated paths", () => {
  const known = knownCommands();
  assert.ok(known.includes("graph"));
  assert.ok(known.includes("mcp serve"));
  assert.ok(known.includes("mcp doctor"));
  // Groups themselves are not invocable — only their leaves.
  assert.ok(!known.includes("mcp"));
});

test("a top-level command resolves to its tool", () => {
  const { script, args, command } = resolveCommand(["graph"]);
  assert.equal(command, "graph");
  assert.equal(script, resolve(ROOT, "tools/secb-graph.mjs"));
  assert.deepEqual(args, []);
});

test("a nested command resolves to its tool", () => {
  const { script, command } = resolveCommand(["mcp", "doctor"]);
  assert.equal(command, "mcp doctor");
  assert.equal(script, resolve(ROOT, "tools/secb-mcp-doctor.mjs"));
});

test("arguments after the subcommand are forwarded verbatim", () => {
  const { args } = resolveCommand(["mcp", "config", "--format", "claude", "--host", "wsl"]);
  assert.deepEqual(args, ["--format", "claude", "--host", "wsl"]);
});

test("routing stops at the first flag so flags are never read as commands", () => {
  // "--doctor" must reach the tool as an argument, not be mistaken for a route.
  const { command, args } = resolveCommand(["mcp", "config", "--doctor"]);
  assert.equal(command, "mcp config");
  assert.deepEqual(args, ["--doctor"]);
});

test("an unknown command fails closed and names the known set", () => {
  assert.throws(
    () => resolveCommand(["nope"]),
    (error) => {
      assert.ok(error instanceof SecbCliError);
      assert.match(error.message, /unknown command 'nope'/);
      assert.match(error.message, /mcp serve/); // the known set is shown
      return true;
    }
  );
});

test("an inherited Object property is not a command", () => {
  // `node[word]` on a plain object also finds Object.prototype members, so
  // "constructor" and "toString" resolve to functions rather than undefined and
  // slip past the unknown-command branch. Two consequences, both wrong: the
  // caller gets a "needs a subcommand" error naming an empty known set, and a
  // polluted `Object.prototype.<name> = "some/path.mjs"` would be spawned as a
  // script. This file exists to close an arbitrary-code path, not to open one.
  for (const inherited of ["constructor", "toString", "valueOf", "hasOwnProperty"]) {
    assert.throws(
      () => resolveCommand([inherited]),
      (error) => {
        assert.ok(error instanceof SecbCliError);
        assert.match(error.message, new RegExp(`unknown command '${inherited}'`));
        assert.match(error.message, /mcp serve/);
        return true;
      },
      `'${inherited}' must fail closed as an unknown command`
    );
  }
});

test("an inherited property is not a command inside a group either", () => {
  assert.throws(
    () => resolveCommand(["mcp", "constructor"]),
    (error) => {
      assert.ok(error instanceof SecbCliError);
      assert.match(error.message, /unknown command 'mcp constructor'/);
      return true;
    }
  );
});

test("a group without a subcommand fails closed rather than defaulting", () => {
  // Silently picking a default here would mean `secb mcp` started a server the
  // operator never asked for.
  assert.throws(
    () => resolveCommand(["mcp"]),
    (error) => {
      assert.ok(error instanceof SecbCliError);
      assert.match(error.message, /'mcp' needs a subcommand/);
      assert.match(error.message, /mcp serve/);
      return true;
    }
  );
});

test("runCommand inherits stdio so the MCP stdio protocol is not corrupted", async () => {
  let seen = null;
  const fakeSpawn = (exe, argv, options) => {
    seen = { exe, argv, options };
    const child = new EventEmitter();
    queueMicrotask(() => child.emit("close", 0, null));
    return child;
  };

  const code = await runCommand(resolveCommand(["mcp", "serve"]), { spawnFn: fakeSpawn });

  assert.equal(code, 0);
  assert.equal(seen.options.stdio, "inherit");
  assert.equal(seen.exe, process.execPath);
  assert.equal(seen.argv[0], resolve(ROOT, "tools/run-secb-mcp-server.mjs"));
});

test("the child's exit code is the dispatcher's exit code", async () => {
  const fakeSpawn = () => {
    const child = new EventEmitter();
    // 2 is the gate's refusal code from run-secb-mcp-server.mjs; the dispatcher
    // must report it unchanged rather than flattening it to a generic failure.
    queueMicrotask(() => child.emit("close", 2, null));
    return child;
  };
  const code = await runCommand(resolveCommand(["mcp", "serve"]), { spawnFn: fakeSpawn });
  assert.equal(code, 2);
});

test("a spawn failure is reported as non-zero, never as success", async () => {
  const fakeSpawn = () => {
    const child = new EventEmitter();
    queueMicrotask(() => child.emit("error", new Error("ENOENT")));
    return child;
  };
  const code = await runCommand(resolveCommand(["graph"]), { spawnFn: fakeSpawn });
  assert.notEqual(code, 0);
});

test("a child killed by a signal is non-zero", async () => {
  const fakeSpawn = () => {
    const child = new EventEmitter();
    queueMicrotask(() => child.emit("close", null, "SIGTERM"));
    return child;
  };
  const code = await runCommand(resolveCommand(["graph"]), { spawnFn: fakeSpawn });
  assert.notEqual(code, 0);
});
