import { expect } from "chai";
import {
  AsyncProxy,
  EventProxy,
  ProviderQueueFullError,
  RegisteringProxy,
} from "..";
import {
  internal,
  type RuntimeErrorDetails,
  runWithModuleContext,
} from "../internal";
import { Events } from "../modules";

describe("bounded queues and resilient cleanup", () => {
  const originalQueueLimit = internal.maxPendingOperations;
  let originalReporter: typeof internal.runtimeErrorReporter;

  beforeEach(() => {
    originalReporter = internal.runtimeErrorReporter;
  });

  afterEach(() => {
    internal.maxPendingOperations = originalQueueLimit;
    internal.runtimeErrorReporter = originalReporter;
  });

  it("bounds missing-provider call queues while preserving queued bootstrap calls", async () => {
    internal.maxPendingOperations = 2;
    const proxy = new AsyncProxy<(value: number) => number>("test.call-bound");
    const first = proxy.call(1);
    const second = proxy.call(2);

    const error = await proxy.call(3).then(
      () => undefined,
      (reason: unknown) => reason,
    );
    expect(error).to.be.instanceOf(ProviderQueueFullError);
    proxy.onCall((value) => value * 2, true);

    expect(await Promise.all([first, second])).to.deep.equal([2, 4]);
  });

  it("bounds queued registrations", () => {
    internal.maxPendingOperations = 1;
    const proxy = new RegisteringProxy<(id: string) => void>(
      "test.registration-bound",
    );
    proxy.register("first");
    expect(() => proxy.register("second")).to.throw(ProviderQueueFullError);
  });

  it("continues registration cleanup after an unregister callback throws", () => {
    const proxy = new RegisteringProxy<(id: string) => void>(
      "test.cleanup-errors",
    );
    const unregistered: string[] = [];
    const errors: Array<{ error: unknown; details: RuntimeErrorDetails }> = [];
    internal.runtimeErrorReporter = (error, details) => {
      errors.push({ error, details });
    };
    runWithModuleContext({ module: "provider" }, () => {
      proxy.onHandlers(
        () => undefined,
        (id) => {
          unregistered.push(id);
          if (id === "first") {
            throw new Error("cleanup failed");
          }
        },
      );
    });
    runWithModuleContext({ module: "consumer" }, () => {
      proxy.register("first");
      proxy.register("second");
    });

    Events.ModuleDestroyed.emit("consumer");

    expect(unregistered).to.deep.equal(["first", "second"]);
    expect(
      errors.some(({ details }) => details.operation === "unregister"),
    ).to.equal(true);
  });

  it("continues event delivery and reports handler errors", () => {
    const event = new EventProxy<() => void>("test.event-errors");
    const calls: string[] = [];
    const operations: string[] = [];
    internal.runtimeErrorReporter = (_, details) => {
      operations.push(details.operation);
    };
    event.register(() => {
      calls.push("first");
      throw new Error("event failed");
    });
    event.register(() => calls.push("second"));

    event.emit();

    expect(calls).to.deep.equal(["first", "second"]);
    expect(operations).to.include("event-emit");
  });
});
