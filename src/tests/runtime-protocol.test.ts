import { expect } from "chai";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { RunWithModuleContext } from "../modules";
import { AsyncProxy, RunWithResponsibleModule } from "..";

/** Evaluates this package's modules a second time, as a second installed copy would, then restores the shared module cache. */
async function loadSecondCopy(): Promise<typeof import("..")> {
  const packageRoot = join(__dirname, "..");
  const testsRoot = join(packageRoot, "tests");
  const cache = new Map(Object.entries(require.cache));
  const packageModules = [...cache.keys()].filter(
    (path) => path.startsWith(packageRoot) && !path.startsWith(testsRoot),
  );
  for (const path of packageModules) {
    delete require.cache[path];
  }
  try {
    return await import("..");
  } finally {
    for (const path of packageModules) {
      require.cache[path] = cache.get(path);
    }
  }
}

describe("global runtime protocol", () => {
  it("keeps each physical copy's proxies apart, while sharing module ownership", async () => {
    const foreign = await loadSecondCopy();
    expect(foreign.AsyncProxy).not.to.equal(AsyncProxy);
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
    const foreignResult: unknown = await Promise.race([
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
