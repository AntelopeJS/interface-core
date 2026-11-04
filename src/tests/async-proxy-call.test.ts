import { expect } from "chai";

import { AsyncProxy } from "..";
import { rejectionOf } from "./rejection";

describe("AsyncProxy call", () => {
  it("rejects instead of throwing synchronously when the callback throws", async () => {
    const proxy = new AsyncProxy<() => never>();
    const boom = new Error("boom");
    proxy.onCall(() => {
      throw boom;
    }, true);

    const result = proxy.call();
    expect(result).to.be.instanceOf(Promise);

    const err = await rejectionOf(result, Error);
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

    const err = await rejectionOf(pending, Error);
    expect(err).to.equal(boom);
  });
});
