import { expect } from "chai";
import { AsyncProxy } from "..";

describe("AsyncProxy call", () => {
  it("rejects instead of throwing synchronously when the callback throws", async () => {
    const proxy = new AsyncProxy<() => never>();
    const boom = new Error("boom");
    proxy.onCall(() => {
      throw boom;
    }, true);

    // Must return a rejected promise, never throw synchronously: a sync throw
    // here would propagate on this line and fail the test.
    const result = proxy.call();
    expect(result).to.be.instanceOf(Promise);

    const err = await result.then(
      () => expect.fail("expected call() to reject"),
      (e) => e,
    );
    expect(err).to.equal(boom);
  });

  it("resolves with the callback return value", async () => {
    const proxy = new AsyncProxy<() => number>();
    proxy.onCall(() => 42, true);

    expect(await proxy.call()).to.equal(42);
  });

  it("converts a queued call that throws on replay into a rejection", async () => {
    const proxy = new AsyncProxy<() => never>();
    const boom = new Error("queued boom");

    const pending = proxy.call();
    proxy.onCall(() => {
      throw boom;
    }, true);

    const err = await pending.then(
      () => expect.fail("expected queued call to reject"),
      (e) => e,
    );
    expect(err).to.equal(boom);
  });
});
