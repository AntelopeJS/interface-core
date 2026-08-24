import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repository = dirname(dirname(fileURLToPath(import.meta.url)));
const temporary = mkdtempSync(join(tmpdir(), "interface-core-consumer-"));

function run(command, args, cwd, env = process.env) {
  execFileSync(command, args, { cwd, env, stdio: "inherit" });
}

function createConsumer(tarball) {
  writeFileSync(
    join(temporary, "package.json"),
    JSON.stringify({
      name: "interface-core-package-consumer",
      packageManager: "pnpm@10.6.5",
      private: true,
      dependencies: {
        "@antelopejs/interface-core": `file:${tarball}`,
      },
    }),
  );
  writeFileSync(
    join(temporary, "contract-root-first.cjs"),
    createConsumerSource(rootFirstImports),
  );
  writeFileSync(
    join(temporary, "contract-subpaths-first.cjs"),
    createConsumerSource(subpathsFirstImports),
  );
  writeFileSync(join(temporary, "contract.ts"), typeConsumerSource);
}

const typeConsumerSource = `
import {
  GetRuntimeInfo,
  ListModules,
  type InterfaceConnection,
} from "@antelopejs/interface-core";
import {
  BindToCurrentModuleContext,
  GetModuleContext,
  type ModuleExecutionContext,
  RunWithModuleContext,
} from "@antelopejs/interface-core/modules";

const connection: InterfaceConnection = {
  path: "example",
  provider: "provider",
  selected: true,
};
const context: ModuleExecutionContext = {
  module: "provider",
  owner: "provider#1",
};
void connection;
void context;
void BindToCurrentModuleContext;
void GetModuleContext;
void GetRuntimeInfo;
void ListModules;
void RunWithModuleContext;
`;

const rootFirstImports = `
const core = require("@antelopejs/interface-core");
const modules = require("@antelopejs/interface-core/modules");
const runtime = require("@antelopejs/interface-core/runtime");
`;

const subpathsFirstImports = `
const modules = require("@antelopejs/interface-core/modules");
const runtime = require("@antelopejs/interface-core/runtime");
const core = require("@antelopejs/interface-core");
`;

function createConsumerSource(imports) {
  return `
const assert = require("node:assert/strict");
${imports}
const { internal } = require("@antelopejs/interface-core/internal");

assert.equal(core.GetRuntimeInfo, runtime.GetRuntimeInfo);
assert.equal(core.RegisterDevServer, runtime.RegisterDevServer);
assert.equal(core.ListModules, modules.ListModules);
assert.equal(core.Events, modules.Events);
assert.equal(core.BindToCurrentModuleContext, undefined);
assert.equal(core.GetModuleContext, undefined);
assert.equal(core.RunWithModuleContext, undefined);
assert.equal(typeof modules.BindToCurrentModuleContext, "function");
assert.equal(typeof modules.GetModuleContext, "function");
assert.equal(typeof modules.RunWithModuleContext, "function");
assert.equal(core.IsInterfaceProxy(core.GetRuntimeInfo.proxy), true);
assert.equal(core.IsInterfaceProxy(core.ListModules.proxy), true);
assert.equal(core.GetInterfaceProxyIdentity(core.GetRuntimeInfo.proxy), "async:runtime.GetRuntimeInfo");
assert.equal(core.GetInterfaceProxyIdentity(core.ListModules.proxy), "async:modules.ListModules");

const proxy = core.InterfaceFunction("package-consumer.context");
const identity = core.GetInterfaceProxyIdentity(proxy.proxy);
const providerContext = { module: "provider", owner: "provider#old", provider: "provider" };
const consumerContext = {
  module: "consumer",
  owner: "consumer#1",
  providerRoutes: { [identity]: "provider" },
};

modules.RunWithModuleContext(providerContext, () => {
  core.ImplementInterface({ GetValue: proxy }, {
    GetValue: async () => {
      await Promise.resolve();
      return modules.GetModuleContext();
    },
  });
});

(async () => {
  const oldContext = await modules.RunWithModuleContext(consumerContext, () => proxy());
  assert.equal(oldContext.module, "provider");
  assert.equal(oldContext.owner, "provider#old");
  assert.equal(oldContext.provider, "provider");

  modules.RunWithModuleContext(
    { module: "provider", owner: "provider#new", provider: "provider" },
    () => core.ImplementInterface({ GetValue: proxy }, {
      GetValue: () => modules.GetModuleContext().owner,
    }),
  );
  modules.RunWithModuleContext(providerContext, () => {
    modules.Events.ModuleDestroyed.emit("provider");
  });
  const replacement = await modules.RunWithModuleContext(consumerContext, () => proxy());
  assert.equal(replacement, "provider#new");

  internal.interfaceConnections.consumer = {
    example: [{ path: "example", provider: "provider", selected: true }],
  };
  const metadata = modules.RunWithModuleContext(consumerContext, () =>
    core.GetInterfaceInstances("example"),
  );
  assert.deepEqual(metadata, [
    { path: "example", provider: "provider", selected: true },
  ]);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
`;
}

try {
  run("corepack", ["pnpm", "run", "build"], repository);
  run(
    "corepack",
    ["pnpm", "pack", "--pack-destination", temporary],
    repository,
    { ...process.env, npm_config_ignore_scripts: "true" },
  );
  const tarball = join(
    temporary,
    readdirSync(temporary).find((entry) => entry.endsWith(".tgz")),
  );
  createConsumer(tarball);
  run(
    "corepack",
    ["pnpm", "install", "--ignore-workspace", "--frozen-lockfile=false"],
    temporary,
  );
  run(
    join(repository, "node_modules", ".bin", "tsc"),
    [
      "--noEmit",
      "--strict",
      "--skipLibCheck",
      "--target",
      "ES2022",
      "--module",
      "commonjs",
      "--moduleResolution",
      "node",
      "contract.ts",
    ],
    temporary,
  );
  run(process.execPath, ["contract-root-first.cjs"], temporary);
  run(process.execPath, ["contract-subpaths-first.cjs"], temporary);
} finally {
  rmSync(temporary, { force: true, recursive: true });
}
