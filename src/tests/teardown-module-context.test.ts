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
    // The shape that broke DMS hot reload: a page registered with one module
    // is taken down by calling another module's unregister function, through
    // a facade the core bound to the module that did the registering. That
    // call is the dying module's own last work — invalidating its context
    // before running it turned every teardown step into an error and left the
    // route registered in the provider for the life of the process.
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
        // What the resolver hands a consumer: the provider's function pinned to
        // the context that imported it.
        const captured = captureModuleContext();
        expect(captured).to.not.equal(undefined);
        unregisterRoute = (id) =>
          runWithCapturedModuleContext(captured!, () => {
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
    let captured: ReturnType<typeof captureModuleContext>;
    RunWithModuleContext({ module: "gone", owner: "gone#1" }, () => {
      captured = captureModuleContext();
    });

    RunWithModuleContext({ module: "gone", owner: "gone#1" }, () =>
      Events.ModuleDestroyed.emit("gone"),
    );

    expect(() =>
      runWithCapturedModuleContext(captured!, () => undefined),
    ).to.throw(/invalidated/);
  });
});
