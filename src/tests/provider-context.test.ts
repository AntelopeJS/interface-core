import { expect } from "chai";
import {
  AsyncProxy,
  GetInterfaceProxyIdentity,
  ModuleContextInvalidatedError,
  RegisteringProxy,
} from "..";
import { runWithModuleContext } from "../internal";
import { Events, GetModuleContext } from "../modules";

interface ContextObservation {
  module?: string;
  owner?: string;
  provider?: string;
}

function observeContext(): ContextObservation {
  const context = GetModuleContext();
  return {
    module: context?.module,
    owner: context?.owner,
    provider: context?.provider,
  };
}

describe("internal provider callback context", () => {
  it("restores async provider context across awaits and nested calls", async () => {
    const nested = new AsyncProxy<() => string>("context.nested");
    const outer = new AsyncProxy<() => Promise<ContextObservation[]>>(
      "context.outer",
    );
    const nestedIdentity = GetInterfaceProxyIdentity(nested) as string;
    const outerIdentity = GetInterfaceProxyIdentity(outer) as string;
    runWithModuleContext(
      { module: "nested-owner", owner: "nested#1", provider: "nested" },
      () => nested.onCall(() => `${observeContext().owner}:value`),
    );
    runWithModuleContext(
      {
        module: "provider-owner",
        owner: "provider-owner#1",
        provider: "provider-a",
        providerRoutes: { [nestedIdentity]: "nested" },
      },
      () =>
        outer.onCall(async () => {
          const beforeAwait = observeContext();
          await Promise.resolve();
          const afterAwait = observeContext();
          expect(await nested.call()).to.equal("nested#1:value");
          return [beforeAwait, afterAwait, observeContext()];
        }),
    );

    const observations = await runWithModuleContext(
      {
        module: "consumer",
        owner: "consumer#1",
        providerRoutes: { [outerIdentity]: "provider-a" },
      },
      () => outer.call(),
    );

    expect(observations).to.deep.equal(
      Array.from({ length: 3 }, () => ({
        module: "provider-owner",
        owner: "provider-owner#1",
        provider: "provider-a",
      })),
    );
  });

  it("restores registering context for replay, register and unregister", () => {
    const proxy = new RegisteringProxy<(id: string) => void>(
      "context.registering",
    );
    const identity = GetInterfaceProxyIdentity(proxy) as string;
    const observations: Array<{
      operation: string;
      context: ContextObservation;
    }> = [];
    runWithModuleContext({ module: "consumer", owner: "consumer#1" }, () => {
      proxy.register("queued");
    });
    runWithModuleContext(
      { module: "provider-owner", owner: "provider#1", provider: "provider" },
      () => {
        proxy.onHandlers(
          (id) =>
            observations.push({
              operation: `register:${id}`,
              context: observeContext(),
            }),
          (id) =>
            observations.push({
              operation: `unregister:${id}`,
              context: observeContext(),
            }),
        );
      },
    );
    runWithModuleContext(
      {
        module: "consumer",
        owner: "consumer#1",
        providerRoutes: { [identity]: "provider" },
      },
      () => {
        proxy.register("direct");
        proxy.unregister("queued");
        proxy.unregister("direct");
      },
    );

    expect(observations.map(({ operation }) => operation)).to.deep.equal([
      "register:queued",
      "register:direct",
      "unregister:queued",
      "unregister:direct",
    ]);
    expect(observations.map(({ context }) => context)).to.deep.equal(
      Array.from({ length: 4 }, () => ({
        module: "provider-owner",
        owner: "provider#1",
        provider: "provider",
      })),
    );
  });

  it("preserves synchronous registering callback throws", () => {
    const proxy = new RegisteringProxy<(id: string) => void>(
      "context.registering-throw",
    );
    const failure = new Error("register failed");
    runWithModuleContext(
      { module: "provider", owner: "provider-throw#1", provider: "provider" },
      () =>
        proxy.onHandlers(
          () => {
            expect(observeContext().owner).to.equal("provider-throw#1");
            throw failure;
          },
          () => undefined,
        ),
    );

    expect(() => proxy.register("item")).to.throw(failure);
  });

  it("rejects callbacks captured from an invalidated owner", async () => {
    const proxy = new AsyncProxy<() => string>("context.invalidated");
    const identity = GetInterfaceProxyIdentity(proxy) as string;
    runWithModuleContext(
      { module: "provider", owner: "provider-old#1", provider: "provider" },
      () => {
        proxy.onCall(() => "stale", true);
        Events.ModuleDestroyed.emit("provider");
      },
    );

    const error = await runWithModuleContext(
      {
        module: "consumer",
        owner: "consumer#1",
        providerRoutes: { [identity]: "provider" },
      },
      () =>
        proxy.call().then(
          () => undefined,
          (reason: unknown) => reason,
        ),
    );

    expect(error).to.be.instanceOf(ModuleContextInvalidatedError);
  });

  it("rejects registering handlers captured from an invalidated owner", () => {
    const proxy = new RegisteringProxy<(id: string) => void>(
      "context.invalidated-registering",
    );
    runWithModuleContext(
      {
        module: "provider",
        owner: "provider-register#old",
        provider: "provider",
      },
      () => {
        proxy.onHandlers(
          () => undefined,
          () => undefined,
          true,
        );
        Events.ModuleDestroyed.emit("provider");
      },
    );

    expect(() => proxy.register("item")).to.throw(
      ModuleContextInvalidatedError,
    );
  });
});
