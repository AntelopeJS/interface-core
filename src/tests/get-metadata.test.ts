import { expect } from "chai";

import { GetMetadata } from "..";

class Plain {
  public static readonly key = Symbol("get-metadata.plain");
  declare public first?: number;
  declare public second?: number;

  public constructor(target: Function) {
    if (target.name === "Child") {
      this.second = 20;
    }
  }
}

class Inheriting {
  public static readonly key = Symbol("get-metadata.inheriting");
  declare public first?: number;
  public received?: Inheriting;

  public constructor(readonly target: Function) {}

  public inherit(parent: Inheriting) {
    this.received = parent;
  }
}

class Base {}
class Child extends Base {}

describe("GetMetadata", () => {
  it("copies the parent's properties the child does not have, and keeps its own", () => {
    const parent = GetMetadata(Base, Plain);
    parent.first = 1;
    parent.second = 2;

    const child = GetMetadata(Child, Plain);

    expect(child.first).to.equal(1);
    expect(child.second).to.equal(20);
  });

  it("hands the parent's metadata to an inherit method instead of copying", () => {
    const parent = GetMetadata(Base, Inheriting);
    parent.first = 1;

    const child = GetMetadata(Child, Inheriting);

    expect(child.received).to.equal(parent);
    expect(child.first).to.equal(undefined);
  });

  it("does not inherit when asked not to", () => {
    class Alone {}
    class Descendant extends Alone {}
    GetMetadata(Alone, Plain).first = 1;

    expect(GetMetadata(Descendant, Plain, false).first).to.equal(undefined);
  });
});
