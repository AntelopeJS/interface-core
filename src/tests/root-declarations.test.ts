import { expect } from "chai";
import * as declarations from "..";
import * as modules from "../modules";
import * as runtime from "../runtime";

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
});
