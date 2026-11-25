import { expect } from "chai";

import { Logging } from "../logging";

function foreignChannel(channel: string | number) {
  return {
    channel,
    Error() {},
    Warn() {},
    Info() {},
    Debug() {},
    Trace() {},
    Write() {},
  };
}

describe("Logging.isChannel", () => {
  it("accepts a Logging.Channel instance", () => {
    expect(Logging.isChannel(new Logging.Channel("jobs"))).to.equal(true);
  });

  it("accepts a channel built by a duplicated package copy", () => {
    expect(Logging.isChannel(foreignChannel("jobs"))).to.equal(true);
  });

  it("rejects a channel-shaped object whose name is not a string", () => {
    expect(Logging.isChannel(foreignChannel(42))).to.equal(false);
  });

  it("rejects an object whose writer method is missing or not a function", () => {
    expect(
      [
        { ...foreignChannel("jobs"), Write: undefined },
        { ...foreignChannel("jobs"), Trace: "trace" },
      ].map((value) => Logging.isChannel(value)),
    ).to.deep.equal([false, false]);
  });

  it("rejects primitives and null", () => {
    expect(
      ["jobs", null, undefined].map((value) => Logging.isChannel(value)),
    ).to.deep.equal([false, false, false]);
  });
});
