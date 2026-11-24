import { expect } from "chai";

import { internal } from "../internal";
import { RunWithModuleContext } from "../modules";
import {
  GetInterfaceInstance,
  GetInterfaceInstances,
  type InterfaceConnection,
} from "..";

describe("interface connection metadata", () => {
  afterEach(() => {
    delete internal.interfaceConnections.consumer;
  });

  it("publishes provider and selection metadata", () => {
    const connections: InterfaceConnection[] = [
      {
        id: "primary",
        path: "@antelopejs/interface-example",
        provider: "provider-a",
        selected: true,
      },
      {
        path: "@antelopejs/interface-example",
        provider: "provider-b",
        selected: false,
      },
    ];
    internal.interfaceConnections.consumer = {
      "@antelopejs/interface-example": connections,
    };

    const result = RunWithModuleContext(
      { module: "consumer", owner: "consumer#metadata" },
      () => ({
        all: GetInterfaceInstances("@antelopejs/interface-example"),
        selected: GetInterfaceInstance(
          "@antelopejs/interface-example",
          "primary",
        ),
      }),
    );

    expect(result.all).to.deep.equal(connections);
    expect(result.selected).to.deep.equal(connections[0]);
  });

  it("answers nothing for module and interface ids named like Object.prototype keys", () => {
    for (const id of ["constructor", "toString", "__proto__"]) {
      const result = RunWithModuleContext(
        { module: id, owner: `${id}#inherited` },
        () => ({
          all: GetInterfaceInstances("x"),
          one: GetInterfaceInstance("x", "y"),
        }),
      );
      expect(result.all).to.deep.equal([]);
      expect(result.one).to.equal(undefined);
    }
    internal.interfaceConnections.consumer = {};
    const result = RunWithModuleContext(
      { module: "consumer", owner: "consumer#inherited" },
      () => ({
        all: GetInterfaceInstances("constructor"),
        one: GetInterfaceInstance("constructor", "y"),
      }),
    );
    expect(result.all).to.deep.equal([]);
    expect(result.one).to.equal(undefined);
  });
});
