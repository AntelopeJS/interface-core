import { expect } from "chai";
import {
  AsyncProxy,
  EventProxy,
  GetInterfaceProxyIdentity,
  RegisteringProxy,
} from "..";
import { internal, runWithModuleContext } from "../internal";
import { Events } from "../modules";

describe("generation-owned cleanup", () => {
  afterEach(() => {
    internal.testStubMode = false;
  });

  it("keeps a same-module and provider replacement after stale cleanup", async () => {
    const proxy = new AsyncProxy<() => string>("generation.async");
    const identity = GetInterfaceProxyIdentity(proxy) as string;
    let oldLease: ReturnType<typeof proxy.onCall> | undefined;
    runWithModuleContext(
      { module: "shared", owner: "shared#old", provider: "shared" },
      () => {
        oldLease = proxy.onCall(() => "old");
      },
    );
    runWithModuleContext(
      { module: "shared", owner: "shared#new", provider: "shared" },
      () => proxy.onCall(() => "new"),
    );

    proxy.detach(oldLease);
    runWithModuleContext(
      { module: "shared", owner: "shared#old", provider: "shared" },
      () => {
        Events.ModuleDestroyed.emit("shared");
        Events.ModuleDestroyed.emit("shared");
      },
    );

    expect(internal.knownAsync.has("shared#old")).to.equal(false);
    expect(internal.knownAsync.has("shared#new")).to.equal(true);
    expect(
      await runWithModuleContext(
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
    runWithModuleContext(
      { module: "shared", owner: "shared-register#old", provider: "shared" },
      () =>
        proxy.onHandlers(
          (id) => calls.push(`old:${id}`),
          () => undefined,
        ),
    );
    runWithModuleContext(
      { module: "shared", owner: "shared-register#new", provider: "shared" },
      () =>
        proxy.onHandlers(
          (id) => calls.push(`new:${id}`),
          () => undefined,
        ),
    );
    runWithModuleContext(
      { module: "shared", owner: "shared-register#old", provider: "shared" },
      () => Events.ModuleDestroyed.emit("shared"),
    );

    expect(internal.knownRegisters.has("shared-register#old")).to.equal(false);
    expect(internal.knownRegisters.has("shared-register#new")).to.equal(true);
    proxy.register("item");

    expect(calls).to.deep.equal(["new:item"]);
  });

  it("keeps split handlers owned by their replacement generation", () => {
    const proxy = new RegisteringProxy<(id: string) => void>(
      "generation.split-registering",
    );
    const calls: string[] = [];
    runWithModuleContext(
      { module: "shared", owner: "split#old", provider: "shared" },
      () => proxy.onRegister((id) => calls.push(`old-register:${id}`)),
    );
    runWithModuleContext(
      { module: "shared", owner: "split#new", provider: "shared" },
      () => proxy.onUnregister((id) => calls.push(`new-unregister:${id}`)),
    );
    proxy.register("item");

    expect(calls).to.deep.equal(["old-register:item"]);

    runWithModuleContext(
      { module: "shared", owner: "split#old", provider: "shared" },
      () => {
        Events.ModuleDestroyed.emit("shared");
        Events.ModuleDestroyed.emit("shared");
      },
    );
    proxy.unregister("item");

    expect(calls).to.deep.equal(["old-register:item", "new-unregister:item"]);
    expect(internal.knownRegisters.has("split#old")).to.equal(false);
    expect(internal.knownRegisters.has("split#new")).to.equal(true);

    runWithModuleContext(
      { module: "shared", owner: "split#new", provider: "shared" },
      () => {
        Events.ModuleDestroyed.emit("shared");
        Events.ModuleDestroyed.emit("shared");
      },
    );
    internal.testStubMode = true;

    expect(() => proxy.register("detached")).to.throw();
    expect(internal.knownRegisters.has("split#new")).to.equal(false);
  });

  it("keeps reverse split handlers until their owner is destroyed", () => {
    const proxy = new RegisteringProxy<(id: string) => void>(
      "generation.reverse-split-registering",
    );
    const calls: string[] = [];
    runWithModuleContext(
      { module: "shared", owner: "reverse#old", provider: "shared" },
      () => proxy.onUnregister((id) => calls.push(`old-unregister:${id}`)),
    );
    runWithModuleContext(
      { module: "shared", owner: "reverse#new", provider: "shared" },
      () => proxy.onRegister((id) => calls.push(`new-register:${id}`)),
    );
    proxy.register("active");
    proxy.unregister("active");
    proxy.register("survivor");

    expect(calls).to.deep.equal([
      "new-register:active",
      "old-unregister:active",
      "new-register:survivor",
    ]);

    runWithModuleContext(
      { module: "shared", owner: "reverse#old", provider: "shared" },
      () => {
        Events.ModuleDestroyed.emit("shared");
        Events.ModuleDestroyed.emit("shared");
      },
    );
    proxy.unregister("survivor");
    proxy.register("replacement");

    expect(calls.at(-1)).to.equal("new-register:replacement");
    expect(internal.knownRegisters.has("reverse#old")).to.equal(false);
    expect(internal.knownRegisters.has("reverse#new")).to.equal(true);

    runWithModuleContext(
      { module: "shared", owner: "reverse#new", provider: "shared" },
      () => {
        Events.ModuleDestroyed.emit("shared");
        Events.ModuleDestroyed.emit("shared");
      },
    );
    internal.testStubMode = true;

    expect(() => proxy.register("detached")).to.throw();
    expect(internal.knownRegisters.has("reverse#new")).to.equal(false);
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
    runWithModuleContext({ module: "consumer", owner: "consumer#old" }, () => {
      registrations.register("old");
      event.register(() => calls.push("old-event"));
    });
    runWithModuleContext({ module: "consumer", owner: "consumer#new" }, () => {
      registrations.register("new");
      event.register(() => calls.push("new-event"));
    });
    runWithModuleContext({ module: "consumer", owner: "consumer#old" }, () => {
      Events.ModuleDestroyed.emit("consumer");
    });

    event.emit();

    expect(calls).to.deep.equal(["remove:old", "new-event"]);
  });
});
