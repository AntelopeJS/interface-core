import { expect } from "chai";

import { AsyncProxy, ImplementInterface, type InterfaceToImpl } from "..";

interface ClockInterface {
  now: AsyncProxy<() => number>;
}

function implementClock(
  declaration: ClockInterface,
  implementation: InterfaceToImpl<ClockInterface>,
): void {
  ImplementInterface(declaration, implementation);
}

describe("ImplementInterface typing", () => {
  it("implements a declaration typed by an interface, through the published InterfaceToImpl", async () => {
    const clock: ClockInterface = { now: new AsyncProxy<() => number>() };

    implementClock(clock, { now: () => 42 });

    expect(await clock.now.call()).to.equal(42);
  });
});
