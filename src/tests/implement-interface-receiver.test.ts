import { expect } from "chai";

import { AsyncProxy, ImplementInterface } from "..";

describe("ImplementInterface receivers", () => {
  it("reads a class getter with the instance as its receiver", async () => {
    class Provider {
      readonly handler = () => "from the instance";
      get greet() {
        return this.handler;
      }
    }
    const greet = new AsyncProxy<() => string>("test.class-getter.greet");

    ImplementInterface({ greet }, new Provider());

    expect(await greet.call()).to.equal("from the instance");
  });

  it("reads a getter backed by a private field", async () => {
    class Provider {
      readonly #handler = () => "from the private field";
      get greet() {
        return this.#handler;
      }
    }
    const greet = new AsyncProxy<() => string>("test.private-getter.greet");

    ImplementInterface({ greet }, new Provider());

    expect(await greet.call()).to.equal("from the private field");
  });

  it("reads a base-class getter with the subclass instance as its receiver", async () => {
    class Base {
      readonly who: string = "base";
      get greet() {
        return () => this.who;
      }
    }
    class Derived extends Base {
      override readonly who = "derived";
    }
    const greet = new AsyncProxy<() => string>("test.base-getter.greet");

    ImplementInterface({ greet }, new Derived());

    expect(await greet.call()).to.equal("derived");
  });

  it("answers from a Proxy's get trap rather than its target's prototype", async () => {
    class Target {
      greet() {
        return "from the target";
      }
    }
    const greet = new AsyncProxy<() => string>("test.proxy.greet");
    const provider = new Proxy(new Target(), {
      get: (_target, key) =>
        key === "greet" ? () => "from the trap" : undefined,
    });

    ImplementInterface({ greet }, provider);

    expect(await greet.call()).to.equal("from the trap");
  });
});
