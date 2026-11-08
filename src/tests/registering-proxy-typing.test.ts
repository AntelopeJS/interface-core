import { expect } from "chai";

import { RegisteringProxy } from "..";

type IsAny<T> = 0 extends 1 & T ? true : false;

interface Received {
  id: unknown;
  args: unknown[];
  anyTyped: boolean[];
}

describe("RegisteringProxy typing", () => {
  it("types an untyped proxy's callback parameters as unknown, not any", () => {
    const proxy = new RegisteringProxy();
    const received: Received[] = [];
    proxy.onRegister((id, ...args) => {
      const anyTyped: [IsAny<typeof id>, IsAny<(typeof args)[number]>] = [
        false,
        false,
      ];
      received.push({ id, args, anyTyped });
    }, true);
    proxy.onUnregister((id) => {
      const anyTyped: [IsAny<typeof id>] = [false];
      received.push({ id, args: [], anyTyped });
    });

    proxy.register("entry", 1);
    proxy.unregister("entry");

    expect(received).to.deep.equal([
      { id: "entry", args: [1], anyTyped: [false, false] },
      { id: "entry", args: [], anyTyped: [false] },
    ]);
  });
});
