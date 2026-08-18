import { expect } from "chai";
import {
  AsyncProxy,
  EventProxy,
  GetResponsibleModule,
  RegisteringProxy,
  RunWithResponsibleModule,
} from "..";
import { MissingProviderError } from "../errors";
import { internal } from "../internal";
import { Events } from "../modules";

describe("explicit module ownership", () => {
  let testStubMode: boolean;

  beforeEach(() => {
    testStubMode = internal.testStubMode;
    internal.knownAsync.clear();
    internal.knownRegisters.clear();
  });

  afterEach(() => {
    internal.testStubMode = testStubMode;
  });

  it("resolves without capturing a stack", () => {
    const captureStackTrace = Error.captureStackTrace;
    let captures = 0;
    Error.captureStackTrace = (...args) => {
      captures += 1;
      captureStackTrace(...args);
    };

    try {
      expect(
        RunWithResponsibleModule("module-a", () => GetResponsibleModule()),
      ).to.equal("module-a");
      expect(captures).to.equal(0);
    } finally {
      Error.captureStackTrace = captureStackTrace;
    }
  });

  it("retains stack resolution outside an explicit context", () => {
    const captureStackTrace = Error.captureStackTrace;
    let captures = 0;
    Error.captureStackTrace = (...args) => {
      captures += 1;
      captureStackTrace(...args);
    };

    try {
      GetResponsibleModule();
      expect(captures).to.equal(1);
    } finally {
      Error.captureStackTrace = captureStackTrace;
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
