import { expect } from "chai";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync } from "node:fs";

import { RunWithModuleContext } from "../modules";
import { AsyncProxy, RunWithResponsibleModule } from "..";

interface ForeignCore {
  AsyncProxy: new (identity?: string) => {
    call(): Promise<string>;
  };
  ImplementInterface(
    declaration: Record<string, unknown>,
    implementation: Record<string, unknown>,
  ): unknown;
  GetResponsibleModule(): string | undefined;
}

describe("global runtime protocol", () => {
  let copyPath: string | undefined;

  afterEach(() => {
    if (copyPath) {
      rmSync(dirname(copyPath), { force: true, recursive: true });
      copyPath = undefined;
    }
  });

  it("keeps each physical copy's proxies apart, while sharing module ownership", async () => {
    const temporary = mkdtempSync(join(process.cwd(), ".interface-core-copy-"));
    copyPath = join(temporary, "dist");
    cpSync(join(__dirname, ".."), copyPath, { recursive: true });
    const foreign = require(join(copyPath, "index.js")) as ForeignCore;
    const localProxy = new AsyncProxy<() => string>("test.cross-copy");
    const foreignProxy = new foreign.AsyncProxy("test.cross-copy");

    expect(
      RunWithResponsibleModule("shared-owner", () =>
        foreign.GetResponsibleModule(),
      ),
    ).to.equal("shared-owner");
    RunWithModuleContext({ module: "provider" }, () =>
      foreign.ImplementInterface(
        { proxy: localProxy },
        { proxy: () => "local" },
      ),
    );

    expect(await localProxy.call()).to.equal("local");
    const foreignResult = await Promise.race([
      foreignProxy.call(),
      new Promise((resolve) => setTimeout(() => resolve("unattached"), 20)),
    ]);
    expect(foreignResult).to.equal("unattached");
  });

  it("fails clearly when a realm already contains an incompatible protocol", () => {
    const internalPath = join(__dirname, "..", "internal.js");
    const script = `
      globalThis[Symbol.for("@antelopejs/interface-core/runtime")] = { protocol: 999 };
      require(${JSON.stringify(internalPath)});
    `;
    const result = spawnSync(process.execPath, ["-e", script], {
      encoding: "utf8",
    });

    expect(result.status).not.to.equal(0);
    expect(result.stderr).to.include(
      "Incompatible @antelopejs/interface-core runtime protocol",
    );
  });
});
