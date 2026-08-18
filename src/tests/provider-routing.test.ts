import { expect } from "chai";
import {
  AmbiguousProviderError,
  AsyncProxy,
  GetInterfaceProxyIdentity,
  MissingProviderError,
  RegisteringProxy,
} from "..";
import { Events, RunWithModuleContext } from "../modules";

describe("provider routing and leases", () => {
  it("routes providers through async module execution context", async () => {
    const proxy = new AsyncProxy<() => string>("test.provider-routing");
    RunWithModuleContext({ module: "owner-a", provider: "provider-a" }, () => {
      proxy.onCall(() => "a");
    });
    RunWithModuleContext({ module: "owner-b", provider: "provider-b" }, () => {
      proxy.onCall(() => "b");
    });

    expect(
      await RunWithModuleContext(
        { module: "consumer", provider: "provider-a" },
        () => proxy.call(),
      ),
    ).to.equal("a");
    expect(
      await RunWithModuleContext(
        { module: "consumer", provider: "provider-b" },
        () => proxy.call(),
      ),
    ).to.equal("b");
    const error = await proxy.call().then(
      () => undefined,
      (reason: unknown) => reason,
    );
    expect(error).to.be.instanceOf(AmbiguousProviderError);
  });

  it("rejects an explicit route that has no attached provider", async () => {
    const proxy = new AsyncProxy<() => string>("test.missing-route");
    RunWithModuleContext({ module: "owner", provider: "available" }, () => {
      proxy.onCall(() => "ok");
    });

    const result = RunWithModuleContext(
      { module: "consumer", provider: "missing" },
      () => proxy.call(),
    );
    const error = await result.then(
      () => undefined,
      (reason: unknown) => reason,
    );
    expect(error).to.be.instanceOf(MissingProviderError);
  });

  it("supports per-proxy provider bindings in one module context", async () => {
    const first = new AsyncProxy<() => string>("test.route-map.first");
    const second = new AsyncProxy<() => string>("test.route-map.second");
    RunWithModuleContext({ module: "owner-a", provider: "provider-a" }, () => {
      first.onCall(() => "first-a");
      second.onCall(() => "second-a");
    });
    RunWithModuleContext({ module: "owner-b", provider: "provider-b" }, () => {
      first.onCall(() => "first-b");
      second.onCall(() => "second-b");
    });
    const firstIdentity = GetInterfaceProxyIdentity(first) as string;
    const secondIdentity = GetInterfaceProxyIdentity(second) as string;

    const values = await RunWithModuleContext(
      {
        module: "consumer",
        providerRoutes: {
          [firstIdentity]: "provider-a",
          [secondIdentity]: "provider-b",
        },
      },
      () => Promise.all([first.call(), second.call()]),
    );

    expect(values).to.deep.equal(["first-a", "second-b"]);
  });

  it("routes registrations and unregisters to the bound provider", () => {
    const proxy = new RegisteringProxy<(id: string) => void>(
      "test.registering-routes",
    );
    const calls: string[] = [];
    RunWithModuleContext({ module: "owner-a", provider: "provider-a" }, () => {
      proxy.onHandlers(
        (id) => calls.push(`register-a:${id}`),
        (id) => calls.push(`unregister-a:${id}`),
      );
    });
    RunWithModuleContext({ module: "owner-b", provider: "provider-b" }, () => {
      proxy.onHandlers(
        (id) => calls.push(`register-b:${id}`),
        (id) => calls.push(`unregister-b:${id}`),
      );
    });

    RunWithModuleContext({ module: "consumer", provider: "provider-b" }, () => {
      proxy.register("item");
      proxy.unregister("item");
    });

    expect(calls).to.deep.equal(["register-b:item", "unregister-b:item"]);
  });

  it("does not let an old owner lease detach a newer provider generation", async () => {
    const proxy = new AsyncProxy<() => string>("test.provider-lease");
    RunWithModuleContext({ module: "owner-a", provider: "shared" }, () => {
      proxy.onCall(() => "old");
    });
    RunWithModuleContext({ module: "owner-b", provider: "shared" }, () => {
      proxy.onCall(() => "new");
    });

    Events.ModuleDestroyed.emit("owner-a");

    expect(
      await RunWithModuleContext(
        { module: "consumer", provider: "shared" },
        () => proxy.call(),
      ),
    ).to.equal("new");
  });
});
