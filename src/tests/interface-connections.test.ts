import { expect } from "chai";
import {
  GetInterfaceInstance,
  GetInterfaceInstances,
  type InterfaceConnection,
} from "..";
import { internal } from "../internal";
import { RunWithModuleContext } from "../modules";

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
});
