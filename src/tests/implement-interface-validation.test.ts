import { runInNewContext } from "node:vm";
import { expect } from "chai";
import { AsyncProxy, ImplementInterface, RegisteringProxy } from "..";
import { internal } from "../internal";

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
