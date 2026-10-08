import { expect } from "chai";

import { Events, GetModuleContext, RunWithModuleContext } from "../modules";
import {
  AsyncProxy,
  EventProxy,
  ModuleContextInvalidatedError,
  RegisteringProxy,
} from "..";

type Callback = () => string | undefined;

function currentModule(): string | undefined {
  return GetModuleContext()?.module;
}

describe("caller functions keep their caller's context", () => {
  it("runs an event handler in the context of the module that registered it", () => {
    const event = new EventProxy<() => void>();
    const seen: Array<string | undefined> = [];
    RunWithModuleContext({ module: "consumer" }, () => {
      event.register(() => seen.push(currentModule()));
    });

    RunWithModuleContext({ module: "provider" }, () => event.emit());

    expect(seen).to.deep.equal(["consumer"]);
  });

  it("unregisters an event handler by the function that was registered", () => {
    const event = new EventProxy<() => void>();
    let calls = 0;
    const handler = () => {
      calls += 1;
    };
    RunWithModuleContext({ module: "consumer" }, () => {
      event.register(handler);
      event.unregister(handler);
    });

    event.emit();

    expect(calls).to.equal(0);
  });

  it("runs a function passed to an interface call in the caller's context", async () => {
    const proxy = new AsyncProxy<(callback: Callback) => string | undefined>();
    RunWithModuleContext({ module: "provider" }, () => {
      proxy.onCall((callback) => callback());
    });

    const result = await RunWithModuleContext({ module: "consumer" }, () =>
      proxy.call(currentModule),
    );

    expect(result).to.equal("consumer");
  });

  it("runs a function held in a plain object passed to register in the registrant's context", () => {
    const proxy = new RegisteringProxy<
      (id: string, options: { handler: Callback }) => void
    >();
    const seen: Array<string | undefined> = [];
    RunWithModuleContext({ module: "provider" }, () => {
      proxy.onHandlers(
        (_id, options) => seen.push(options.handler()),
        () => undefined,
      );
    });

    RunWithModuleContext({ module: "consumer" }, () => {
      proxy.register("route", { handler: currentModule });
    });

    expect(seen).to.deep.equal(["consumer"]);
  });
});

describe("values crossing a proxy call", () => {
  it("passes plain data, cyclic data and class instances through unchanged", async () => {
    class Instance {
      public readonly callback = currentModule;
    }
    const cyclic: Record<string, unknown> = { value: 1 };
    cyclic.self = cyclic;
    const data = { list: [1, 2], nested: { value: "x" } };
    const instance = new Instance();
    const received: unknown[] = [];
    const proxy = new AsyncProxy<(...values: unknown[]) => void>();
    RunWithModuleContext({ module: "provider" }, () => {
      proxy.onCall((...values) => {
        received.push(...values);
      });
    });

    await RunWithModuleContext({ module: "consumer" }, () =>
      proxy.call(data, cyclic, instance),
    );

    expect(received[0]).to.equal(data);
    expect(received[1]).to.equal(cyclic);
    expect(received[2]).to.equal(instance);
  });

  it("hands the provider one binding for a function passed twice, so later calls can pair it", () => {
    const proxy = new RegisteringProxy<
      (id: string, callback: Callback) => void
    >();
    const received: Callback[] = [];
    RunWithModuleContext({ module: "provider" }, () => {
      proxy.onHandlers(
        (_id, callback) => received.push(callback),
        () => undefined,
      );
    });

    RunWithModuleContext({ module: "consumer" }, () => {
      proxy.register("first", currentModule);
      proxy.register("second", currentModule);
    });

    expect(received[0]).to.equal(received[1]);
  });

  it("keeps a function's first caller context when another module passes it on", async () => {
    const outer = new AsyncProxy<
      (callback: Callback) => Promise<string | undefined>
    >();
    const inner = new AsyncProxy<(callback: Callback) => string | undefined>();
    RunWithModuleContext({ module: "inner-provider" }, () => {
      inner.onCall((callback) => callback());
    });
    RunWithModuleContext({ module: "outer-provider" }, () => {
      outer.onCall((callback) => inner.call(callback));
    });

    const result = await RunWithModuleContext({ module: "consumer" }, () =>
      outer.call(currentModule),
    );

    expect(result).to.equal("consumer");
  });

  it("refuses to run a caller function once its module generation is destroyed", async () => {
    const proxy = new AsyncProxy<(callback: Callback) => void>();
    let kept: Callback | undefined;
    RunWithModuleContext({ module: "provider" }, () => {
      proxy.onCall((callback) => {
        kept = callback;
      });
    });
    await RunWithModuleContext(
      { module: "consumer", owner: "consumer#1" },
      () => proxy.call(currentModule),
    );

    RunWithModuleContext({ module: "consumer", owner: "consumer#1" }, () => {
      Events.ModuleDestroyed.emit("consumer");
    });

    expect(() => kept?.()).to.throw(ModuleContextInvalidatedError);
  });
});
