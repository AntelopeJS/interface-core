import { expect } from "chai";

import { internal } from "../internal";
import { MissingProviderError } from "../errors";
import { Events, RunWithModuleContext } from "../modules";
import {
  AsyncProxy,
  EventProxy,
  GetResponsibleModule,
  ModuleContextInvalidatedError,
  RegisteringProxy,
  RunWithResponsibleModule,
} from "..";

function runDetached(
  module: string,
  callback: () => void,
): Promise<Error | undefined> {
  return new Promise((resolve, reject) => {
    RunWithResponsibleModule(module, () => {
      setImmediate(() => {
        try {
          callback();
          resolve(undefined);
        } catch (error) {
          if (error instanceof Error) {
            resolve(error);
          } else {
            reject(error);
          }
        }
      });
    });
  });
}

function countStackCaptures() {
  const descriptor = Object.getOwnPropertyDescriptor(
    Error,
    "captureStackTrace",
  );
  const original = Error.captureStackTrace.bind(Error);
  let captures = 0;
  Error.captureStackTrace = (...args) => {
    captures += 1;
    original(...args);
  };
  return {
    captures: () => captures,
    restore: () => {
      if (descriptor) {
        Object.defineProperty(Error, "captureStackTrace", descriptor);
      }
    },
  };
}

function isolateRuntimeState() {
  let testStubMode: boolean;

  beforeEach(() => {
    testStubMode = internal.testStubMode;
    internal.knownAsync.clear();
    internal.knownRegisters.clear();
  });

  afterEach(() => {
    internal.testStubMode = testStubMode;
  });
}

describe("explicit module ownership", () => {
  isolateRuntimeState();

  it("resolves without capturing a stack", () => {
    const stackCaptures = countStackCaptures();

    try {
      expect(
        RunWithResponsibleModule("module-a", () => GetResponsibleModule()),
      ).to.equal("module-a");
      expect(stackCaptures.captures()).to.equal(0);
    } finally {
      stackCaptures.restore();
    }
  });

  it("reports no module outside a context, without capturing a stack", () => {
    const stackCaptures = countStackCaptures();

    try {
      expect(GetResponsibleModule()).to.equal(undefined);
      expect(stackCaptures.captures()).to.equal(0);
    } finally {
      stackCaptures.restore();
    }
  });

  it("restores nested ownership", () => {
    RunWithResponsibleModule("outer", () => {
      expect(GetResponsibleModule()).to.equal("outer");
      RunWithResponsibleModule("inner", () => {
        expect(GetResponsibleModule()).to.equal("inner");
      });
      expect(GetResponsibleModule()).to.equal("outer");
    });
  });

  it("preserves ownership across asynchronous work", async () => {
    await RunWithResponsibleModule("async-module", async () => {
      await Promise.resolve();
      expect(GetResponsibleModule()).to.equal("async-module");
    });
  });

  it("does not let detached work register after module destruction", async () => {
    const events = new EventProxy<() => void>();
    let calls = 0;
    const registration = runDetached("detached-module", () => {
      events.register(() => {
        calls += 1;
      });
    });

    Events.ModuleDestroyed.emit("detached-module");
    const error = await registration;
    events.emit();

    expect(error).to.be.instanceOf(ModuleContextInvalidatedError);
    expect(calls).to.equal(0);
  });

  it("keeps old work invalid after reloading the same module", async () => {
    const events = new EventProxy<(source: string) => void>();
    const calls: string[] = [];
    const oldRegistration = runDetached("reload-module", () => {
      RunWithResponsibleModule("reload-module", () => {
        events.register(() => calls.push("old"));
      });
    });

    Events.ModuleDestroyed.emit("reload-module");
    RunWithResponsibleModule("reload-module", () => {
      events.register(() => calls.push("new"));
    });
    const oldError = await oldRegistration;
    events.emit("event");

    expect(oldError).to.be.instanceOf(ModuleContextInvalidatedError);
    expect(calls).to.deep.equal(["new"]);
  });
});

describe("explicit module ownership of concurrent and nested work", () => {
  isolateRuntimeState();

  it("invalidates concurrent work from the destroyed generation", async () => {
    const events = new EventProxy<() => void>();
    const first = runDetached("concurrent-module", () =>
      events.register(() => undefined),
    );
    const second = runDetached("concurrent-module", () =>
      events.register(() => undefined),
    );

    Events.ModuleDestroyed.emit("concurrent-module");

    expect(await first).to.be.instanceOf(ModuleContextInvalidatedError);
    expect(await second).to.be.instanceOf(ModuleContextInvalidatedError);
  });

  it("invalidates only the destroyed nested context", async () => {
    const calls: string[] = [];
    const events = new EventProxy<() => void>();
    let inner: Promise<unknown> | undefined;
    const outer = RunWithResponsibleModule("outer-module", () => {
      inner = runDetached("inner-module", () =>
        events.register(() => calls.push("inner")),
      );
      return runDetached("outer-module", () =>
        events.register(() => calls.push("outer")),
      );
    });

    Events.ModuleDestroyed.emit("outer-module");
    expect(await outer).to.be.instanceOf(ModuleContextInvalidatedError);
    expect(await inner).to.equal(undefined);
    events.emit();
    expect(calls).to.deep.equal(["inner"]);
  });

  it("does not let stale providers replace a reloaded provider", async () => {
    const proxy = new AsyncProxy<() => string>();
    const staleAttachment = runDetached("provider-module", () =>
      proxy.onCall(() => "stale"),
    );

    Events.ModuleDestroyed.emit("provider-module");
    RunWithResponsibleModule("provider-module", () =>
      proxy.onCall(() => "reloaded"),
    );

    expect(await staleAttachment).to.be.instanceOf(
      ModuleContextInvalidatedError,
    );
    expect(await proxy.call()).to.equal("reloaded");
  });

  it("invalidates provider-aware module contexts", async () => {
    const proxy = new AsyncProxy<() => string>();
    const staleAttachment = new Promise<unknown>((resolve) => {
      RunWithModuleContext(
        { module: "routed-module", provider: "routed-provider" },
        () => {
          setImmediate(() => {
            try {
              proxy.onCall(() => "stale");
              resolve(undefined);
            } catch (error) {
              resolve(error);
            }
          });
        },
      );
    });

    Events.ModuleDestroyed.emit("routed-module");

    expect(await staleAttachment).to.be.instanceOf(
      ModuleContextInvalidatedError,
    );
  });
});

describe("explicit module ownership of providers", () => {
  isolateRuntimeState();

  it("restores ownership when nested work throws", () => {
    RunWithResponsibleModule("outer", () => {
      expect(() =>
        RunWithResponsibleModule("inner", () => {
          throw new Error("boom");
        }),
      ).to.throw("boom");
      expect(GetResponsibleModule()).to.equal("outer");
    });
  });

  it("detaches an async provider during module destruction", async () => {
    const proxy = new AsyncProxy<() => string>();
    RunWithResponsibleModule("provider", () => proxy.onCall(() => "ready"));
    expect(await proxy.call()).to.equal("ready");

    Events.ModuleDestroyed.emit("provider");
    internal.testStubMode = true;

    let rejection: unknown;
    try {
      await proxy.call();
    } catch (error) {
      rejection = error;
    }
    expect(rejection).to.be.instanceOf(MissingProviderError);
  });

  it("cleans handlers and preserves replay attribution", () => {
    const registrations = new RegisteringProxy<(id: string) => void>();
    const events = new EventProxy<() => void>();
    const registered: string[] = [];
    const unregistered: string[] = [];
    let eventCalls = 0;

    RunWithResponsibleModule("consumer", () => {
      registrations.register("entry");
      events.register(() => {
        eventCalls += 1;
      });
    });
    RunWithResponsibleModule("provider", () => {
      registrations.onRegister((id) => registered.push(id));
      registrations.onUnregister((id) => unregistered.push(id));
    });

    expect(registered).to.deep.equal(["entry"]);
    Events.ModuleDestroyed.emit("consumer");
    events.emit();

    expect(eventCalls).to.equal(0);
    expect(registered).to.deep.equal(["entry"]);
    expect(unregistered).to.deep.equal(["entry"]);
  });

  it("detaches registering providers during hot reload", () => {
    const proxy = new RegisteringProxy<(id: string) => void>();
    const registrations: string[] = [];
    RunWithResponsibleModule("provider", () =>
      proxy.onRegister(() => undefined),
    );

    Events.ModuleDestroyed.emit("provider");
    internal.testStubMode = true;

    expect(() => proxy.register("entry")).to.throw();

    RunWithResponsibleModule("provider", () =>
      proxy.onRegister((id) => registrations.push(id)),
    );
    RunWithResponsibleModule("consumer", () => proxy.register("reloaded"));
    expect(registrations).to.deep.equal(["reloaded"]);
  });
});
