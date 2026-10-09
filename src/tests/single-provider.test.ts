import { expect } from "chai";

import { Events, RunWithModuleContext } from "../modules";
import { AsyncProxy, RegisteringProxy } from "..";

describe("single-provider proxies", () => {
  it("queues calls until its provider attaches, then replays them", async () => {
    const proxy = new AsyncProxy<(value: string) => string>();
    const pending = proxy.call("queued");
    RunWithModuleContext({ module: "provider" }, () => {
      proxy.onCall((value) => `served ${value}`);
    });

    expect(await pending).to.equal("served queued");
  });

  it("keeps its state on the proxy, apart from another proxy declared with the same identity", async () => {
    const first = new AsyncProxy<() => string>("test.same-identity");
    const second = new AsyncProxy<() => string>("test.same-identity");
    RunWithModuleContext({ module: "provider-a" }, () => {
      first.onCall(() => "a");
    });
    RunWithModuleContext({ module: "provider-b" }, () => {
      second.onCall(() => "b");
    });

    expect(await Promise.all([first.call(), second.call()])).to.deep.equal([
      "a",
      "b",
    ]);
  });

  it("serves calls from the provider's newest generation once the old one is destroyed", async () => {
    const proxy = new AsyncProxy<() => string>();
    RunWithModuleContext({ module: "provider", owner: "provider#1" }, () => {
      proxy.onCall(() => "old");
    });
    RunWithModuleContext({ module: "provider", owner: "provider#2" }, () => {
      proxy.onCall(() => "new");
    });

    RunWithModuleContext({ module: "provider", owner: "provider#1" }, () => {
      Events.ModuleDestroyed.emit("provider");
    });

    expect(
      await RunWithModuleContext({ module: "consumer" }, () => proxy.call()),
    ).to.equal("new");
  });

  it("registers and unregisters through its provider's handlers", () => {
    const proxy = new RegisteringProxy<(id: string) => void>();
    const calls: string[] = [];
    RunWithModuleContext({ module: "provider" }, () => {
      proxy.onHandlers(
        (id) => calls.push(`register:${id}`),
        (id) => calls.push(`unregister:${id}`),
      );
    });

    RunWithModuleContext({ module: "consumer" }, () => {
      proxy.register("item");
      proxy.unregister("item");
    });

    expect(calls).to.deep.equal(["register:item", "unregister:item"]);
  });
});
