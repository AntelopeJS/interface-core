import { expect } from "chai";

import { RegisteringProxy } from "..";
import { Events, RunWithModuleContext } from "../modules";
import {
  captureModuleContext,
  internal,
  runWithCapturedModuleContext,
} from "../internal";

describe("teardown under the destroyed module's own context", () => {
  let reported: unknown[];

  beforeEach(() => {
    reported = [];
    internal.runtimeErrorReporter = (error) => reported.push(error);
  });

  afterEach(() => {
    internal.runtimeErrorReporter = undefined;
  });

  it("lets a register cleanup call an interface function bound to that module", () => {
    const pages = new RegisteringProxy<(id: string) => void>(
      "teardown.RegisterPage",
    );
    const routes = new Set<string>();
    let unregisterRoute: ((id: string) => void) | undefined;

    RunWithModuleContext(
      { module: "dms", owner: "dms#1", provider: "dms" },
      () =>
        pages.onHandlers(
          (id) => {
            routes.add(id);
          },
          (id) => unregisterRoute?.(id),
        ),
    );

    RunWithModuleContext(
      { module: "playground", owner: "playground#1" },
      () => {
        const captured = captureModuleContext();
        if (captured === undefined) throw new Error("no module context");
        unregisterRoute = (id) =>
          runWithCapturedModuleContext(captured, () => {
            routes.delete(id);
          });
        pages.register("/modules/demo/pages/contact");
      },
    );

    expect([...routes]).to.deep.equal(["/modules/demo/pages/contact"]);

    RunWithModuleContext({ module: "playground", owner: "playground#1" }, () =>
      Events.ModuleDestroyed.emit("playground"),
    );

    expect(reported).to.deep.equal([]);
    expect([...routes]).to.deep.equal([]);
  });

  it("still invalidates the context once teardown is done", () => {
    const captures: NonNullable<ReturnType<typeof captureModuleContext>>[] = [];
    RunWithModuleContext({ module: "gone", owner: "gone#1" }, () => {
      const context = captureModuleContext();
      if (context !== undefined) captures.push(context);
    });
    const [captured] = captures;
    if (captured === undefined) throw new Error("no module context");

    RunWithModuleContext({ module: "gone", owner: "gone#1" }, () =>
      Events.ModuleDestroyed.emit("gone"),
    );

    expect(() =>
      runWithCapturedModuleContext(captured, () => undefined),
    ).to.throw(/invalidated/);
  });
});
