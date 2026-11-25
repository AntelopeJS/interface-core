import { assert, expect } from "chai";

import { internal } from "../internal";
import { AsyncProxy, isMissingProviderError, RegisteringProxy } from "..";

describe("test stub mode", () => {
  afterEach(() => {
    internal.testStubMode = false;
  });

  describe("AsyncProxy", () => {
    it("rejects with error when called without callback in stub mode", async () => {
      internal.testStubMode = true;
      const proxy = new AsyncProxy();

      let thrown: unknown;
      try {
        await proxy.call();
      } catch (error) {
        thrown = error;
      }

      assert(isMissingProviderError(thrown));
      expect(thrown.message).to.include("without implementation");
    });

    it("still queues calls when stub mode is off", () => {
      const proxy = new AsyncProxy();
      const promise = proxy.call("arg");
      expect(promise).to.be.instanceOf(Promise);
    });

    it("calls callback normally when attached in stub mode", async () => {
      internal.testStubMode = true;
      const proxy = new AsyncProxy<(value: string) => string>();
      proxy.onCall((value) => value.toUpperCase(), true);

      const result = await proxy.call("hello");
      expect(result).to.equal("HELLO");
    });
  });

  describe("RegisteringProxy", () => {
    it("throws MissingProviderError when registering without callback in stub mode", () => {
      internal.testStubMode = true;
      const proxy = new RegisteringProxy<(id: string) => void>();

      let thrown: unknown;
      try {
        proxy.register("id1");
      } catch (error) {
        thrown = error;
      }

      assert(isMissingProviderError(thrown));
    });

    it("still queues registration when stub mode is off", () => {
      const proxy = new RegisteringProxy<(id: string) => void>();
      proxy.register("id1");

      const replayed: string[] = [];
      proxy.onRegister((id) => replayed.push(id), true);

      expect(replayed).to.deep.equal(["id1"]);
    });

    it("registers normally when callback attached in stub mode", () => {
      internal.testStubMode = true;
      const proxy = new RegisteringProxy<(id: string) => void>();
      const registered: string[] = [];
      proxy.onRegister((id) => registered.push(id), true);

      proxy.register("id1");

      expect(registered).to.deep.equal(["id1"]);
    });
  });
});
