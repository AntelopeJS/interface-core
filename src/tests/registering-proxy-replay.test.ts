import { expect } from "chai";

import { RegisteringProxy } from "..";
import { internal } from "../internal";

describe("RegisteringProxy onRegister replay", () => {
  let savedReporter: typeof internal.runtimeErrorReporter;

  beforeEach(() => {
    savedReporter = internal.runtimeErrorReporter;
  });

  afterEach(() => {
    internal.runtimeErrorReporter = savedReporter;
  });

  it("replays every entry even when an earlier callback throws", () => {
    const proxy = new RegisteringProxy<(id: string, arg: string) => void>();
    proxy.register("a", "alpha");
    proxy.register("b", "beta");
    proxy.register("c", "gamma");

    const seen: string[] = [];
    const errors: Array<{ id: unknown; err: unknown; operation: string }> = [];
    internal.runtimeErrorReporter = (err, details) =>
      errors.push({
        id: details.registrationId,
        err,
        operation: details.operation,
      });

    proxy.onRegister((id, arg) => {
      seen.push(`${id}:${arg}`);
      if (id === "a") {
        throw new Error("boom");
      }
    }, true);

    expect(seen).to.deep.equal(["a:alpha", "b:beta", "c:gamma"]);
    expect(errors).to.have.length(1);
    expect(errors[0].operation).to.equal("register-replay");
    expect(errors[0].id).to.equal("a");
    expect(errors[0].err).to.be.instanceOf(Error);
  });

  it("does not require a reporter to remain resilient", () => {
    internal.runtimeErrorReporter = undefined;
    const proxy = new RegisteringProxy<(id: string) => void>();
    proxy.register("a");
    proxy.register("b");

    const seen: string[] = [];
    proxy.onRegister((id) => {
      seen.push(String(id));
      if (id === "a") throw new Error("boom");
    }, true);

    expect(seen).to.deep.equal(["a", "b"]);
  });

  it("keeps legacy split handlers on the same manual route", () => {
    const proxy = new RegisteringProxy<(id: string) => void>(
      "test.split-manual-handlers",
    );
    const calls: string[] = [];

    proxy.onRegister((id) => calls.push(`register:${id}`), true);
    proxy.onUnregister((id) => calls.push(`unregister:${id}`));
    proxy.register("item");
    proxy.unregister("item");

    expect(calls).to.deep.equal(["register:item", "unregister:item"]);
  });
});
