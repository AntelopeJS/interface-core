import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { expect } from "chai";
import * as declarations from "..";
import * as modules from "../modules";
import * as runtime from "../runtime";

const PACKAGE_ROOT = resolve(__dirname, "..", "..");
const FRESH_PROCESS_CONTRACT = `
const assert = require("node:assert/strict");
const path = require("node:path");
const root = process.env.INTERFACE_CORE_ROOT;
const entries = {
  root: path.join(root, "dist"),
  modules: path.join(root, "dist", "modules.js"),
  runtime: path.join(root, "dist", "runtime.js"),
};
const loaded = Object.fromEntries(
  process.env.INTERFACE_CORE_ORDER.split(",").map((entry) => [entry, require(entries[entry])]),
);
const core = loaded.root;
const modules = loaded.modules;
const runtime = loaded.runtime;
assert.equal(core.Events, modules.Events);
assert.equal(core.ListModules, modules.ListModules);
assert.equal(core.GetModuleInfo, modules.GetModuleInfo);
assert.equal(core.GetRuntimeInfo, runtime.GetRuntimeInfo);
assert.equal(core.RegisterDevServer, runtime.RegisterDevServer);
assert.equal(core.BindToCurrentModuleContext, undefined);
assert.equal(core.GetModuleContext, undefined);
assert.equal(core.RunWithModuleContext, undefined);
assert.equal(typeof modules.BindToCurrentModuleContext, "function");
assert.equal(typeof modules.GetModuleContext, "function");
assert.equal(typeof modules.RunWithModuleContext, "function");
assert.equal(core.IsInterfaceProxy(core.ListModules.proxy), true);
assert.equal(core.IsInterfaceProxy(core.GetRuntimeInfo.proxy), true);
assert.equal(core.GetInterfaceProxyIdentity(core.ListModules.proxy), "async:modules.ListModules");
assert.equal(core.GetInterfaceProxyIdentity(core.GetRuntimeInfo.proxy), "async:runtime.GetRuntimeInfo");
`;

function runFreshProcess(order: string): void {
  execFileSync(process.execPath, ["-e", FRESH_PROCESS_CONTRACT], {
    env: {
      ...process.env,
      INTERFACE_CORE_ORDER: order,
      INTERFACE_CORE_ROOT: PACKAGE_ROOT,
    },
  });
}

describe("root interface declarations", () => {
  it("exports the canonical runtime proxies", () => {
    expect(declarations.GetRuntimeInfo).to.equal(runtime.GetRuntimeInfo);
    expect(declarations.RegisterDevServer).to.equal(runtime.RegisterDevServer);
  });

  it("exports the canonical module proxies", () => {
    expect(declarations.Events).to.equal(modules.Events);
    expect(declarations.ListModules).to.equal(modules.ListModules);
    expect(declarations.GetModuleInfo).to.equal(modules.GetModuleInfo);
  });

  it("keeps execution context APIs on the modules subpath", () => {
    expect("BindToCurrentModuleContext" in declarations).to.equal(false);
    expect("GetModuleContext" in declarations).to.equal(false);
    expect("RunWithModuleContext" in declarations).to.equal(false);
    expect(modules.BindToCurrentModuleContext).to.be.a("function");
    expect(modules.GetModuleContext).to.be.a("function");
    expect(modules.RunWithModuleContext).to.be.a("function");
  });

  it("loads complete canonical declarations when the root loads first", () => {
    runFreshProcess("root,runtime,modules");
  });

  it("loads complete canonical declarations when subpaths load first", () => {
    runFreshProcess("modules,runtime,root");
  });
});
