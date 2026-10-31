import { expect } from "chai";
import { runInNewContext } from "node:vm";

import { internal } from "../internal";
import { rejectionOf } from "./rejection";
import {
  AsyncProxy,
  ImplementInterface,
  InterfaceFunction,
  ModuleContextInvalidatedError,
  RegisteringProxy,
  ReleaseOwner,
  RunWithModuleContext,
} from "..";

type SelfReferencing = { self?: unknown };

describe("ImplementInterface validation", () => {
  afterEach(() => {
    internal.testStubMode = false;
  });

  it("validates every handler before attaching any of them", async () => {
    const first = new AsyncProxy<() => string>("test.atomic.first");
    const second = new AsyncProxy<() => string>("test.atomic.second");

    expect(() =>
      ImplementInterface(
        { first, second },
        {
          first: () => "attached",
        },
      ),
    ).to.throw("implementation.second");

    internal.testStubMode = true;
    const error = await rejectionOf(first.call(), Error);
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
    const implementation = {
      proxy: { register: () => undefined, unregister: () => undefined },
    };
    Reflect.deleteProperty(implementation.proxy, "unregister");
    expect(() => ImplementInterface({ proxy }, implementation)).to.throw(
      "implementation.proxy.unregister",
    );
  });

  it("rejects cycles in declarations and implementations", () => {
    const declaration: SelfReferencing = {};
    declaration.self = declaration;
    expect(() => ImplementInterface(declaration, {})).to.throw(
      "declaration contains a cycle",
    );

    const implementation: SelfReferencing = {};
    implementation.self = implementation;
    expect(() => ImplementInterface({}, implementation)).to.throw(
      "implementation contains a cycle",
    );
  });

  it("attaches the methods a class instance implements through its prototype", async () => {
    class Provider {
      greet() {
        return "from the prototype";
      }
    }
    const greet = new AsyncProxy<() => string>("test.class-instance.greet");

    ImplementInterface({ greet }, new Provider());

    expect(await greet.call()).to.equal("from the prototype");
  });

  it("does not take a handler from Object.prototype", () => {
    const toString = new AsyncProxy<() => string>(
      "test.object-prototype.toString",
    );

    expect(() => ImplementInterface({ toString }, {})).to.throw(
      "implementation.toString",
    );
  });

  it("awaits thenables and promises created in another realm", async () => {
    const proxy = new AsyncProxy<() => string>("test.cross-realm-promise");
    // SAFETY: runInNewContext returns any; the script returns Promise.resolve of the { proxy } object passed in as value.
    const declaration = runInNewContext("Promise.resolve(value)", {
      value: { proxy },
    }) as PromiseLike<{ proxy: AsyncProxy<() => string> }>;
    // SAFETY: runInNewContext returns any; the script evaluates to a thenable that resolves to the { proxy } object passed in as value.
    const implementation = runInNewContext(
      "({ then(resolve) { resolve(value); } })",
      { value: { proxy: () => "resolved" } },
    ) as PromiseLike<{ proxy: () => string }>;

    await ImplementInterface(declaration, implementation);
    expect(await proxy.call()).to.equal("resolved");
  });
});
