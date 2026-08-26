import { expect } from "chai";
import * as InterfaceCore from "..";
import { InterfaceFunction } from "..";
import { ModuleContextInvalidatedError } from "../errors";
import { CreateInterfaceFacade, type InterfaceFacadeScope } from "../facades";
import { runWithModuleContext } from "../internal";
import {
  Events,
  GetModuleContext,
  type ModuleExecutionContext,
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
  it("does not queue registrations without a selected provider", () => {
    const Registrations = new InterfaceCore.RegisteringProxy<
      (id: string) => void
    >("facade.optional-registrations");
    const facade = CreateInterfaceFacade(
      { Registrations },
      { module: "optional-consumer", owner: "optional-consumer#1" },
    );
    const replayed: string[] = [];

    facade.Registrations.register("before-provider");
    const lease = Registrations.onRegister((id) => replayed.push(id), true);
    facade.Registrations.register("after-provider");

    expect(replayed).to.deep.equal(["after-provider"]);
    Registrations.detach(lease);
  });

  it("attaches and calls providers without restoring ambient callback context", async () => {
    const Read = InterfaceFunction<() => string>("facade.LexicalRead");
    const providerCore = CreateInterfaceFacade(
      InterfaceCore,
      providerContext("provider"),
    );
    const consumer = CreateInterfaceFacade(
      { Read },
      consumerContext(
        "consumer#lexical",
        "async:facade.LexicalRead",
        "provider",
      ),
    );
    let callbackContext: ModuleExecutionContext | undefined;

    providerCore.ImplementInterface(
      { Read },
      {
        Read: () => {
          callbackContext = GetModuleContext();
          return "value";
        },
      },
    );

    expect(await Promise.resolve().then(() => consumer.Read())).to.equal(
      "value",
    );
    expect(callbackContext).to.equal(undefined);
  });

  it("automatically binds root and namespace functions to each provider", async () => {
    const Call = InterfaceFunction<(value: string) => string>("facade.Call");
    const NestedCall =
      InterfaceFunction<(value: string) => string>("facade.NestedCall");
    const proxyIdentity = "async:facade.Call";
    const nestedIdentity = "async:facade.NestedCall";
    const sharedMetadata = {};
    for (const provider of ["provider-a", "provider-b"]) {
      runWithModuleContext(providerContext(provider), () => {
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
    runWithModuleContext(providerContext("provider"), () =>
      Call.proxy.onCall(() => "value", true),
    );
    const declaration = {
      BuildInterfaceFacade: (
        scope: InterfaceFacadeScope,
        facade: Record<string, unknown>,
      ) => {
        const boundCall = facade.Call as typeof Call;
        const owner = scope.context.owner;
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

  it("lets custom registration APIs clean only the destroyed facade generation", () => {
    const entries: Array<{ callback: () => void; owner: string }> = [];
    const declaration = {
      BuildInterfaceFacade: (scope: InterfaceFacadeScope) => {
        const owner = scope.context.owner as string;
        scope.onDestroy(() => {
          const retained = entries.filter((entry) => entry.owner !== owner);
          entries.splice(0, entries.length, ...retained);
        });
        return {
          Register: (callback: () => void) => {
            scope.assertActive();
            entries.push({ callback, owner });
          },
        };
      },
      Register: (_callback: () => void) => undefined,
    };
    const staleContext = {
      module: "consumer",
      owner: "consumer#custom-old",
    };
    const currentContext = {
      module: "consumer",
      owner: "consumer#custom-new",
    };
    const stale = CreateInterfaceFacade(declaration, staleContext);
    const current = CreateInterfaceFacade(declaration, currentContext);
    const calls: string[] = [];

    stale.Register(() => calls.push("old"));
    current.Register(() => calls.push("new"));
    Events.ModuleDestroyed.emit("consumer", staleContext.owner);
    entries.forEach(({ callback }) => {
      callback();
    });

    expect(calls).to.deep.equal(["new"]);
    expect(() => stale.Register(() => undefined)).to.throw(
      ModuleContextInvalidatedError,
    );
    expect(() => current.Register(() => undefined)).not.to.throw();

    Events.ModuleDestroyed.emit("consumer", currentContext.owner);
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
    runWithModuleContext(providerContext("provider"), () =>
      Call.proxy.onCall(() => "value", true),
    );
    const context = consumerContext(
      "consumer#stale",
      "async:facade.Stale",
      "provider",
    );
    const facade = CreateInterfaceFacade({ Call }, context);
    runWithModuleContext(context, () =>
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

  it("rejects unregisters from an invalidated facade generation", () => {
    const Registrations = new InterfaceCore.RegisteringProxy<
      (id: string) => void
    >("facade.StaleRegistration");
    const EventsProxy = new InterfaceCore.EventProxy<() => void>(
      "facade.StaleEvent",
    );
    const removed: string[] = [];
    Registrations.onHandlers(
      () => undefined,
      (id) => removed.push(id),
      true,
    );
    const staleContext = {
      module: "consumer",
      owner: "consumer#stale-unregister",
    };
    const currentContext = {
      module: "consumer",
      owner: "consumer#current-unregister",
    };
    const stale = CreateInterfaceFacade(
      { EventsProxy, Registrations },
      staleContext,
    );
    const current = CreateInterfaceFacade(
      { EventsProxy, Registrations },
      currentContext,
    );
    const listener = () => undefined;
    runWithModuleContext(staleContext, () =>
      Events.ModuleDestroyed.emit("consumer"),
    );
    current.Registrations.register("current");
    current.EventsProxy.register(listener);

    expect(() => stale.Registrations.unregister("current")).to.throw(
      ModuleContextInvalidatedError,
    );
    expect(() => stale.EventsProxy.unregister(listener)).to.throw(
      ModuleContextInvalidatedError,
    );

    current.Registrations.unregister("current");
    current.EventsProxy.unregister(listener);
    expect(removed).to.deep.equal(["current"]);
  });
});
