import { expect } from "chai";

import { ReleaseOwner, RunWithModuleContext } from "../modules";
import { AsyncProxy, EventProxy, RegisteringProxy } from "..";

describe("ReleaseOwner", () => {
  it("releases what an owner attached and registered, as a module destruction does", async () => {
    const proxy = new AsyncProxy<() => string>();
    const registry = new RegisteringProxy<(id: string) => void>();
    const event = new EventProxy<() => void>();
    const unregistered: string[] = [];
    let handled = 0;
    RunWithModuleContext({ module: "provider" }, () => {
      registry.onHandlers(
        () => undefined,
        (id) => unregistered.push(id),
      );
    });
    RunWithModuleContext(
      { module: "instance", owner: "instance#instance" },
      () => {
        proxy.onCall(() => "served");
        registry.register("entry");
        event.register(() => {
          handled += 1;
        });
      },
    );

    ReleaseOwner("instance#instance");

    event.emit();
    const pending = await Promise.race([
      proxy.call(),
      new Promise((resolve) => setTimeout(() => resolve("unattached"), 20)),
    ]);
    expect(pending).to.equal("unattached");
    expect(unregistered).to.deep.equal(["entry"]);
    expect(handled).to.equal(0);
  });
});
