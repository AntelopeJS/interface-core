import { expect } from "chai";
import { InterfaceFunction } from "..";
import { ModuleContextInvalidatedError } from "../errors";
import { CreateInterfaceFacade, type InterfaceFacadeScope } from "../facades";
import {
  Events,
  type ModuleExecutionContext,
  RunWithModuleContext,
} from "../modules";

class SharedResult {}

function providerContext(provider: string): ModuleExecutionContext {
  return {
    module: provider,
    owner: `${provider}#1`,
    provider,
  };
}

function consumerContext(
  owner: string,
  proxyIdentity: string,
  provider: string,
): ModuleExecutionContext {
  return {
    module: "consumer",
    owner,
    providerRoutes: { [proxyIdentity]: provider },
  };
}

describe("interface facades", () => {
  it("automatically binds root and namespace functions to each provider", async () => {
    const Call = InterfaceFunction<(value: string) => string>("facade.Call");
    const NestedCall =
      InterfaceFunction<(value: string) => string>("facade.NestedCall");
    const proxyIdentity = "async:facade.Call";
    const nestedIdentity = "async:facade.NestedCall";
    const sharedMetadata = {};
    for (const provider of ["provider-a", "provider-b"]) {
      RunWithModuleContext(providerContext(provider), () => {
        Call.proxy.onCall((value) => `${provider}:${value}`, true);
        NestedCall.proxy.onCall((value) => `${provider}:nested:${value}`, true);
      });
    }
    const declaration: Record<string, any> = {
      Call,
      internal: { NestedCall },
      metadataA: sharedMetadata,
      metadataB: sharedMetadata,
      SharedResult,
    };
    declaration.default = declaration;
    const first = CreateInterfaceFacade(declaration, {
      ...consumerContext("consumer#1", proxyIdentity, "provider-a"),
      providerRoutes: {
        [proxyIdentity]: "provider-a",
        [nestedIdentity]: "provider-a",
      },
    });
    const second = CreateInterfaceFacade(declaration, {
      ...consumerContext("consumer#2", proxyIdentity, "provider-b"),
      providerRoutes: {
        [proxyIdentity]: "provider-b",
        [nestedIdentity]: "provider-b",
      },
    });

    await Promise.resolve();

    expect(await first.Call("value")).to.equal("provider-a:value");
    expect(await second.Call("value")).to.equal("provider-b:value");
    expect(await first.internal.NestedCall("value")).to.equal(
      "provider-a:nested:value",
    );
    expect(await second.internal.NestedCall("value")).to.equal(
      "provider-b:nested:value",
    );
    expect(first.SharedResult).to.equal(SharedResult);
    expect(second.SharedResult).to.equal(SharedResult);
    expect(first.metadataA).to.equal(sharedMetadata);
    expect(first.metadataB).to.equal(sharedMetadata);
    expect(first.default).to.equal(first);
    expect(second.default).to.equal(second);
  });

  it("lets interface builders derive cold APIs from automatic bindings", async () => {
    const Call = InterfaceFunction<() => string>("facade.Derived");
    RunWithModuleContext(providerContext("provider"), () =>
      Call.proxy.onCall(() => "value", true),
    );
    const declaration = {
      BuildInterfaceFacade: (
        scope: InterfaceFacadeScope,
        facade: Record<string, unknown>,
      ) => {
        const boundCall = facade.Call as typeof Call;
        const owner = scope.run(() => scope.context.owner);
        return { Read: () => boundCall(), ReadOwner: () => owner };
      },
      Call,
      Read: () => Promise.resolve("unbound"),
      ReadOwner: () => undefined as string | undefined,
    };
    const facade = CreateInterfaceFacade(
      declaration,
      consumerContext("consumer#cold", "async:facade.Derived", "provider"),
    );

    expect(await facade.Read()).to.equal("value");
    expect(facade.ReadOwner()).to.equal("consumer#cold");
  });

  it("returns declarations unchanged when they need no facade", () => {
    const declaration = { SharedResult };

    expect(
      CreateInterfaceFacade(declaration, {
        module: "consumer",
        owner: "consumer#plain",
      }),
    ).to.equal(declaration);
  });

  it("rejects calls from an invalidated facade generation", async () => {
    const Call = InterfaceFunction<() => string>("facade.Stale");
    RunWithModuleContext(providerContext("provider"), () =>
      Call.proxy.onCall(() => "value", true),
    );
    const context = consumerContext(
      "consumer#stale",
      "async:facade.Stale",
      "provider",
    );
    const facade = CreateInterfaceFacade({ Call }, context);
    RunWithModuleContext(context, () =>
      Events.ModuleDestroyed.emit("consumer"),
    );

    const error = await facade.Call().then(
      () => undefined,
      (reason: unknown) => reason,
    );

    expect(error).to.be.instanceOf(ModuleContextInvalidatedError);
    expect(() => CreateInterfaceFacade({ Call }, context)).to.throw(
      ModuleContextInvalidatedError,
    );
  });
});
