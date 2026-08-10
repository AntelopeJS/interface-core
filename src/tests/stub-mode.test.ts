import { runInNewContext } from "node:vm";
import { expect } from "chai";
import {
  AsyncProxy,
  isMissingProviderError,
  MISSING_PROVIDER_CODE,
  MissingProviderError,
  RegisteringProxy,
} from "..";
import { internal } from "../internal";

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

      expect(thrown).to.be.instanceOf(MissingProviderError);
      expect((thrown as MissingProviderError).code).to.equal(
        MISSING_PROVIDER_CODE,
      );
      expect((thrown as Error).message).to.include("without implementation");
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

      expect(thrown).to.be.instanceOf(MissingProviderError);
      expect((thrown as MissingProviderError).code).to.equal(
        MISSING_PROVIDER_CODE,
      );
    });

    it("still queues registration when stub mode is off", () => {
      const proxy = new RegisteringProxy<(id: string) => void>();
      proxy.register("id1");
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

  describe("isMissingProviderError", () => {
    it("accepts a MissingProviderError instance", () => {
      expect(isMissingProviderError(new MissingProviderError())).to.equal(true);
    });

    it("accepts an error carrying the code from a duplicated package copy", () => {
      const foreignCopy = Object.assign(new Error("other wording"), {
        code: MISSING_PROVIDER_CODE,
      });
      expect(isMissingProviderError(foreignCopy)).to.equal(true);
    });

    it("accepts an error carrying the code from another realm", () => {
      const foreignRealmError = runInNewContext(
        "Object.assign(new Error('other realm'), { code })",
        { code: MISSING_PROVIDER_CODE },
      ) as Error;

      expect(foreignRealmError instanceof Error).to.equal(false);
      expect(isMissingProviderError(foreignRealmError)).to.equal(true);
    });

    it("rejects unrelated errors and non-errors", () => {
      expect(isMissingProviderError(new Error("boom"))).to.equal(false);
      expect(isMissingProviderError({ code: MISSING_PROVIDER_CODE })).to.equal(
        false,
      );
      expect(isMissingProviderError(undefined)).to.equal(false);
    });
  });
});
