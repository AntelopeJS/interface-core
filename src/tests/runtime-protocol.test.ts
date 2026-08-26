import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect } from "chai";
import { AsyncProxy, RunWithResponsibleModule } from "..";
import { runWithModuleContext } from "../internal";

interface ForeignCore {
  AsyncProxy: new (
    identity?: string,
  ) => {
    call(): Promise<string>;
  };
  ImplementInterface(
    declaration: Record<string, unknown>,
    implementation: Record<string, unknown>,
  ): unknown;
  GetResponsibleModule(): string | undefined;
}

interface ForeignContext {
  owner?: string;
}

interface ForeignModules {
  GetModuleContext(): ForeignContext | undefined;
}

describe("global runtime protocol", () => {
  let copyPath: string | undefined;

  afterEach(() => {
    if (copyPath) {
      rmSync(dirname(copyPath), { force: true, recursive: true });
      copyPath = undefined;
    }
  });

  it("converges compatible physical copies and accepts foreign proxy brands", async () => {
    const temporary = mkdtempSync(join(process.cwd(), ".interface-core-copy-"));
    copyPath = join(temporary, "dist");
    cpSync(join(__dirname, ".."), copyPath, { recursive: true });
    const foreign = require(join(copyPath, "index.js")) as ForeignCore;
    const foreignModules = require(
      join(copyPath, "modules.js"),
    ) as ForeignModules;
    const localProxy = new AsyncProxy<() => string>("test.cross-copy");
    const foreignProxy = new foreign.AsyncProxy("test.cross-copy");

    expect(foreignProxy).not.to.be.instanceOf(AsyncProxy);
    expect(
      RunWithResponsibleModule("shared-owner", () =>
        foreign.GetResponsibleModule(),
      ),
    ).to.equal("shared-owner");
    runWithModuleContext(
      { module: "provider", owner: "provider#copy", provider: "provider" },
      () =>
        foreign.ImplementInterface(
          { proxy: localProxy },
          {
            proxy: () => foreignModules.GetModuleContext()?.owner ?? "missing",
          },
        ),
    );

    expect(
      await runWithModuleContext(
        {
          module: "consumer",
          owner: "consumer#copy",
          providerRoutes: { "async:test.cross-copy": "provider" },
        },
        () => foreignProxy.call(),
      ),
    ).to.equal("provider#copy");
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
