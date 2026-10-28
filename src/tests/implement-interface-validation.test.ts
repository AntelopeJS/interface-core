import { expect } from "chai";
import { runInNewContext } from "node:vm";

import { internal } from "../internal";
import {
  AsyncProxy,
  ImplementInterface,
  InterfaceFunction,
  ModuleContextInvalidatedError,
  RegisteringProxy,
  ReleaseOwner,
  RunWithModuleContext,
} from "..";

describe("ImplementInterface validation", () => {
  afterEach(() => {
    internal.testStubMode = false;
  });

  it("validates every handler before attaching any of them", async () => {
    const first = new AsyncProxy<() => string>("test.atomic.first");
    const second = new AsyncProxy<() => string>("test.atomic.second");

    expect(() =>
      ImplementInterface({ first, second }, {
        first: () => "attached",
      } as never),
    ).to.throw("implementation.second");

    internal.testStubMode = true;
    const error = await first.call().then(
      () => undefined,
      (reason: unknown) => reason,
    );
    expect(error).to.be.instanceOf(Error);
  });

  it("keeps the current provider when a released owner fails to implement", async () => {
    const declaration = {
      greet: InterfaceFunction<() => string>("test.stale-owner.greet"),
    };
    RunWithModuleContext({ module: "provider", owner: "provider#2" }, () =>
      ImplementInterface(declaration, { greet: () => "healthy" }),
    );

    RunWithModuleContext({ module: "provider", owner: "provider#1" }, () => {
      ReleaseOwner("provider#1");
      expect(() =>
        ImplementInterface(declaration, { greet: () => "stale" }),
      ).to.throw(ModuleContextInvalidatedError);
    });

    internal.testStubMode = true;
    expect(await declaration.greet()).to.equal("healthy");
    ReleaseOwner("provider#2");
  });

  it("rejects malformed registering handlers atomically", () => {
    const proxy = new RegisteringProxy<(id: string) => void>(
      "test.malformed-registering",
    );
    expect(() =>
      ImplementInterface({ proxy }, {
        proxy: { register: () => undefined },
      } as never),
    ).to.throw("implementation.proxy.unregister");
  });

  it("rejects cycles in declarations and implementations", () => {
    const declaration: Record<string, unknown> = {};
    declaration.self = declaration;
    expect(() => ImplementInterface(declaration, {})).to.throw(
      "declaration contains a cycle",
    );

    const implementation: Record<string, unknown> = {};
    implementation.self = implementation;
    expect(() => ImplementInterface({}, implementation)).to.throw(
      "implementation contains a cycle",
    );
  });

  it("awaits thenables and promises created in another realm", async () => {
    const proxy = new AsyncProxy<() => string>("test.cross-realm-promise");
    const declaration = runInNewContext("Promise.resolve(value)", {
      value: { proxy },
    }) as PromiseLike<{ proxy: AsyncProxy<() => string> }>;
    const implementation = runInNewContext(
      "({ then(resolve) { resolve(value); } })",
      { value: { proxy: () => "resolved" } },
    ) as PromiseLike<{ proxy: () => string }>;

    await ImplementInterface(declaration as never, implementation as never);
    expect(await proxy.call()).to.equal("resolved");
  });
});
