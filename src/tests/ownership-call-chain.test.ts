import { expect } from "chai";

import {
  Events,
  GetModuleContext,
  ReleaseOwner,
  RunWithModuleContext,
} from "../modules";
import {
  AsyncProxy,
  EventProxy,
  GetResponsibleModule,
  ModuleContextInvalidatedError,
  RegisteringProxy,
} from "..";

type Register = (id: string, ...values: unknown[]) => void;

function inModule<T>(module: string, owner: string, callback: () => T): T {
  return RunWithModuleContext({ module, owner }, callback);
}

function destroy(module: string, owner: string) {
  inModule(module, owner, () => Events.ModuleDestroyed.emit(module));
}

function attachRegistry(
  proxy: RegisteringProxy<Register>,
  entries: Set<string>,
  module: string,
  owner: string,
) {
  inModule(module, owner, () =>
    proxy.onHandlers(
      (id) => entries.add(id),
      (id) => entries.delete(id),
    ),
  );
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function outcomeOf(promise: Promise<unknown>) {
  return promise.then(
    () => "resolved",
    (error: PromiseRejectedResult["reason"]) => error,
  );
}

describe("call chain: a module serving a call owns what it registers", () => {
  it("keeps a registration made by B's provider when A is destroyed, and drops it with B", async () => {
    const b = new AsyncProxy<() => void>();
    const c = new RegisteringProxy<Register>();
    const entries = new Set<string>();
    attachRegistry(c, entries, "c", "c#1");
    inModule("b", "b#1", () => b.onCall(() => c.register("from-b")));

    await inModule("a", "a#1", () => b.call());
    destroy("a", "a#1");
    expect([...entries]).to.deep.equal(["from-b"]);

    destroy("b", "b#1");
    expect([...entries]).to.deep.equal([]);
  });

  it("forwards A's registration through B, replays it to B's next generation, and removes it with A", () => {
    const b = new RegisteringProxy<Register>();
    const c = new RegisteringProxy<Register>();
    const entries = new Set<string>();
    attachRegistry(c, entries, "c", "c#2");
    const attachForwarder = (owner: string) =>
      inModule("b", owner, () =>
        b.onHandlers(
          (id) => c.register(`c:${id}`),
          (id) => c.unregister(`c:${id}`),
        ),
      );

    attachForwarder("b#2");
    inModule("a", "a#2", () => b.register("x"));
    expect([...entries]).to.deep.equal(["c:x"]);

    destroy("b", "b#2");
    expect([...entries]).to.deep.equal([]);

    attachForwarder("b#3");
    expect([...entries]).to.deep.equal(["c:x"]);

    destroy("a", "a#2");
    expect([...entries]).to.deep.equal([]);
  });
});

describe("call chain: queued calls", () => {
  it("runs a call queued before the provider attached in the provider's context", async () => {
    const proxy = new AsyncProxy<() => string | undefined>();
    const pending = inModule("a", "a#3", () => proxy.call());

    inModule("b", "b#4", () => proxy.onCall(() => GetResponsibleModule()));

    expect(await pending).to.equal("b");
  });

  it("rejects a queued call whose caller was destroyed before the provider attached", async () => {
    const proxy = new AsyncProxy<() => string>();
    let served = 0;
    const pending = outcomeOf(inModule("a", "a#4", () => proxy.call()));

    destroy("a", "a#4");
    inModule("b", "b#5", () =>
      proxy.onCall(() => {
        served += 1;
        return "served";
      }),
    );

    expect(await pending).to.be.instanceOf(ModuleContextInvalidatedError);
    expect(served).to.equal(0);
  });
});

describe("call chain: context at each crossing", () => {
  it("runs a provider callback in the provider's context, across an await", async () => {
    const proxy = new AsyncProxy<() => Promise<unknown[]>>();
    inModule("b", "b#6", () =>
      proxy.onCall(async () => {
        const before = GetResponsibleModule();
        await Promise.resolve();
        return [before, GetResponsibleModule()];
      }),
    );

    const seen = await inModule("a", "a#5", () => proxy.call());

    expect(seen).to.deep.equal(["b", "b"]);
  });

  it("runs register, unregister and replay handlers in the provider's context", () => {
    const proxy = new RegisteringProxy<Register>();
    const seen: Array<string | undefined> = [];
    const attach = (owner: string) =>
      inModule("b", owner, () =>
        proxy.onHandlers(
          () => seen.push(GetModuleContext()?.owner),
          () => seen.push(GetModuleContext()?.owner),
        ),
      );

    attach("b#7");
    inModule("a", "a#6", () => proxy.register("x"));
    attach("b#8");
    inModule("a", "a#6", () => proxy.unregister("x"));

    expect(seen).to.deep.equal(["b#7", "b#8", "b#8"]);
  });

  it("runs an event handler in the context it was registered in", () => {
    const event = new EventProxy<() => void>();
    const seen: Array<string | undefined> = [];
    inModule("a", "a#7", () =>
      event.register(() => seen.push(GetResponsibleModule())),
    );

    inModule("emitter", "emitter#1", () => event.emit());

    expect(seen).to.deep.equal(["a"]);
  });

  it("runs a handler registered outside any context in the emitter's context", () => {
    const event = new EventProxy<() => void>();
    const seen: Array<string | undefined> = [];
    event.register(() => seen.push(GetResponsibleModule()));

    inModule("emitter", "emitter#2", () => event.emit());

    expect(seen).to.deep.equal(["emitter"]);
  });

  it("lets an unregister handler schedule work that enters a module context during the registrant's release", async () => {
    const proxy = new RegisteringProxy<Register>();
    let scheduled: Promise<unknown> | undefined;
    inModule("d", "d#1", () =>
      proxy.onHandlers(
        () => undefined,
        () => {
          scheduled = new Promise((resolve) => {
            setImmediate(() => {
              try {
                RunWithModuleContext({ module: "d-sync" }, () => undefined);
                resolve("entered");
              } catch (error) {
                resolve(error);
              }
            });
          });
        },
      ),
    );
    inModule("a", "a#8", () => proxy.register("page"));

    destroy("a", "a#8");

    expect(await scheduled).to.equal("entered");
  });
});

describe("call chain: an interface's own context", () => {
  const INTERFACE = {
    module: "interface-x",
    owner: "interface-x@p#instance",
    kind: "interface" as const,
  };

  it("keeps the interface's context for its own timers and event handlers", async () => {
    const event = new EventProxy<() => void>();
    const handled: Array<string | undefined> = [];
    const timer = RunWithModuleContext(INTERFACE, () => {
      event.register(() => handled.push(GetResponsibleModule()));
      return new Promise((resolve) => {
        setTimeout(() => resolve(GetModuleContext()?.owner), 0);
      });
    });

    inModule("emitter", "emitter#3", () => event.emit());

    expect(await timer).to.equal(INTERFACE.owner);
    expect(handled).to.deep.equal(["interface-x"]);
  });

  it("runs callbacks it attaches in the caller's context, so what they forward is the caller's", async () => {
    const call = new AsyncProxy<() => string | undefined>();
    const handlers = new RegisteringProxy<Register>();
    const c = new RegisteringProxy<Register>();
    const entries = new Set<string>();
    attachRegistry(c, entries, "c", "c#3");
    RunWithModuleContext(
      { ...INTERFACE, owner: "interface-y#instance" },
      () => {
        call.onCall(() => GetResponsibleModule());
        handlers.onHandlers(
          (id) => c.register(`c:${id}`),
          (id) => c.unregister(`c:${id}`),
        );
      },
    );

    expect(await inModule("a", "a#9", () => call.call())).to.equal("a");
    inModule("a", "a#9", () => handlers.register("x"));
    expect([...entries]).to.deep.equal(["c:x"]);

    destroy("a", "a#9");
    expect([...entries]).to.deep.equal([]);
  });

  it("replays a call queued before it attaches in the caller's context, so what it forwards is the caller's", async () => {
    const call = new AsyncProxy<() => string | undefined>();
    const c = new RegisteringProxy<Register>();
    const entries = new Set<string>();
    attachRegistry(c, entries, "c", "c#5");
    const pending = inModule("a", "a#16", () => call.call());

    RunWithModuleContext({ ...INTERFACE, owner: "interface-q#instance" }, () =>
      call.onCall(() => {
        c.register("queued");
        return GetResponsibleModule();
      }),
    );

    expect(await pending).to.equal("a");
    expect([...entries]).to.deep.equal(["queued"]);
    destroy("a", "a#16");
    expect([...entries]).to.deep.equal([]);
  });

  it("replays a call queued outside any context with no context", async () => {
    const call = new AsyncProxy<() => string | undefined>();
    const pending = call.call();

    RunWithModuleContext({ ...INTERFACE, owner: "interface-r#instance" }, () =>
      call.onCall(() => GetResponsibleModule()),
    );

    expect(await pending).to.equal(undefined);
  });

  it("releases only the interface's own work when its owner is released", () => {
    const own = new RegisteringProxy<Register>();
    const handlers = new RegisteringProxy<Register>();
    const ownEntries = new Set<string>();
    const forwarded = new Set<string>();
    const owner = "interface-z#instance";
    attachRegistry(own, ownEntries, "c", "c#4");
    attachRegistry(handlers, forwarded, "c", "c#4");
    RunWithModuleContext({ ...INTERFACE, owner }, () =>
      own.register("interface-entry"),
    );
    inModule("a", "a#10", () => handlers.register("a-entry"));

    ReleaseOwner(owner);

    expect([...ownEntries]).to.deep.equal([]);
    expect([...forwarded]).to.deep.equal(["a-entry"]);
  });
});

describe("call chain: values cross unchanged", () => {
  class Value {}
  const handler = () => undefined;
  const object = { handler };
  const array = [handler];
  const values = [Value, handler, object, array];

  it("hands call arguments to the provider as the very same values", async () => {
    const proxy = new AsyncProxy<(...values: unknown[]) => unknown[]>();
    inModule("b", "b#9", () => proxy.onCall((...received) => received));

    const received = await inModule("a", "a#11", () => proxy.call(...values));

    received.forEach((value, index) => expect(value).to.equal(values[index]));
  });

  it("hands register arguments to the provider as the very same values", () => {
    const proxy = new RegisteringProxy<Register>();
    let received: unknown[] = [];
    inModule("b", "b#10", () =>
      proxy.onHandlers(
        (_id, ...args) => {
          received = args;
        },
        () => undefined,
      ),
    );

    inModule("a", "a#12", () => proxy.register("x", ...values));

    received.forEach((value, index) => expect(value).to.equal(values[index]));
  });

  it("unregisters an event handler by the reference it was registered with", () => {
    const event = new EventProxy<(value: typeof object) => void>();
    const received: Array<typeof object> = [];
    const listener = (value: typeof object) => received.push(value);
    inModule("a", "a#13", () => event.register(listener));

    event.emit(object);
    inModule("a", "a#13", () => event.unregister(listener));
    event.emit(object);

    expect(received).to.have.length(1);
    expect(received[0]).to.equal(object);
  });
});

describe("call chain: fence on a destroyed generation", () => {
  it("rejects a call made from a destroyed generation without throwing", async () => {
    const proxy = new AsyncProxy<() => string>();
    inModule("b", "b#11", () => proxy.onCall(() => "served"));
    const gate = deferred();
    const outcome = inModule("a", "a#14", async () => {
      await gate.promise;
      return outcomeOf(proxy.call());
    });

    destroy("a", "a#14");
    gate.resolve();

    expect(await outcome).to.be.instanceOf(ModuleContextInvalidatedError);
  });

  it("throws on a register made from a destroyed generation", async () => {
    const proxy = new RegisteringProxy<Register>();
    const gate = deferred();
    const outcome = inModule("a", "a#15", async () => {
      await gate.promise;
      proxy.register("late");
    });

    destroy("a", "a#15");
    gate.resolve();

    expect(await outcomeOf(outcome)).to.be.instanceOf(
      ModuleContextInvalidatedError,
    );
  });
});
