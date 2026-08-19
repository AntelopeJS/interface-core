import { expect } from "chai";
import {
  AsyncProxy,
  EventProxy,
  GetInterfaceProxyIdentity,
  RegisteringProxy,
} from "..";
import { internal } from "../internal";
import { Events, RunWithModuleContext } from "../modules";

describe("generation-owned cleanup", () => {
  afterEach(() => {
    internal.testStubMode = false;
  });

  it("keeps a same-module and provider replacement after stale cleanup", async () => {
    const proxy = new AsyncProxy<() => string>("generation.async");
    const identity = GetInterfaceProxyIdentity(proxy) as string;
    let oldLease: ReturnType<typeof proxy.onCall> | undefined;
    RunWithModuleContext(
      { module: "shared", owner: "shared#old", provider: "shared" },
      () => {
        oldLease = proxy.onCall(() => "old");
      },
    );
    RunWithModuleContext(
      { module: "shared", owner: "shared#new", provider: "shared" },
      () => proxy.onCall(() => "new"),
    );

    proxy.detach(oldLease);
    RunWithModuleContext(
      { module: "shared", owner: "shared#old", provider: "shared" },
      () => {
        Events.ModuleDestroyed.emit("shared");
        Events.ModuleDestroyed.emit("shared");
      },
    );

    expect(internal.knownAsync.has("shared#old")).to.equal(false);
    expect(internal.knownAsync.has("shared#new")).to.equal(true);
    expect(
      await RunWithModuleContext(
        {
          module: "consumer",
          owner: "consumer#1",
          providerRoutes: { [identity]: "shared" },
        },
        () => proxy.call(),
      ),
    ).to.equal("new");
  });

  it("keeps registering replacements after old automatic cleanup", () => {
    const proxy = new RegisteringProxy<(id: string) => void>(
      "generation.registering",
    );
    const calls: string[] = [];
    RunWithModuleContext(
      { module: "shared", owner: "shared-register#old", provider: "shared" },
      () =>
        proxy.onHandlers(
          (id) => calls.push(`old:${id}`),
          () => undefined,
        ),
    );
    RunWithModuleContext(
      { module: "shared", owner: "shared-register#new", provider: "shared" },
      () =>
        proxy.onHandlers(
          (id) => calls.push(`new:${id}`),
          () => undefined,
        ),
    );
    RunWithModuleContext(
      { module: "shared", owner: "shared-register#old", provider: "shared" },
      () => Events.ModuleDestroyed.emit("shared"),
    );

    expect(internal.knownRegisters.has("shared-register#old")).to.equal(false);
    expect(internal.knownRegisters.has("shared-register#new")).to.equal(true);
    proxy.register("item");

    expect(calls).to.deep.equal(["new:item"]);
  });

  it("cleans only registrations and events from the destroyed owner", () => {
    const registrations = new RegisteringProxy<(id: string) => void>(
      "generation.consumer-registering",
    );
    const event = new EventProxy<() => void>("generation.consumer-event");
    const calls: string[] = [];
    registrations.onHandlers(
      () => undefined,
      (id) => calls.push(`remove:${id}`),
      true,
    );
    RunWithModuleContext({ module: "consumer", owner: "consumer#old" }, () => {
      registrations.register("old");
      event.register(() => calls.push("old-event"));
    });
    RunWithModuleContext({ module: "consumer", owner: "consumer#new" }, () => {
      registrations.register("new");
      event.register(() => calls.push("new-event"));
    });
    RunWithModuleContext({ module: "consumer", owner: "consumer#old" }, () => {
      Events.ModuleDestroyed.emit("consumer");
    });

    event.emit();

    expect(calls).to.deep.equal(["remove:old", "new-event"]);
  });
});
