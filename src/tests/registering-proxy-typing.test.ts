import { expect } from "chai";

import { RegisteringProxy } from "..";

type IsUnknown<T> = 0 extends 1 & T ? false : unknown extends T ? true : false;

interface Received {
  id: unknown;
  args: unknown[];
  unknownTyped: boolean[];
}

describe("RegisteringProxy typing", () => {
  it("types an untyped proxy's callback parameters as unknown", () => {
    const proxy = new RegisteringProxy();
    const received: Received[] = [];
    proxy.onRegister((id, ...args) => {
      const unknownTyped: [
        IsUnknown<typeof id>,
        IsUnknown<(typeof args)[number]>,
      ] = [true, true];
      received.push({ id, args, unknownTyped });
    }, true);
    proxy.onUnregister((id) => {
      const unknownTyped: [IsUnknown<typeof id>] = [true];
      received.push({ id, args: [], unknownTyped });
    });

    proxy.register("entry", 1);
    proxy.unregister("entry");

    expect(received).to.deep.equal([
      { id: "entry", args: [1], unknownTyped: [true, true] },
      { id: "entry", args: [], unknownTyped: [true] },
    ]);
  });
});
