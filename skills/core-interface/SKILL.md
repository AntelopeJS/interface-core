---
name: core-interface
description: Provides the AntelopeJS core interface primitives - AsyncProxy/EventProxy/RegisteringProxy, InterfaceFunction, ImplementInterface, GetMetadata, decorator factories, module lifecycle events, structured Logging, and defineConfig. Use when importing from "@antelopejs/interface-core" (or its /decorators, /modules, /proxies, /runtime, /config, /logging subpaths), when declaring or implementing an AntelopeJS interface, wiring cross-module calls or events, building custom decorators, subscribing to ModuleStarted/ModuleDestroyed, writing logs via Logging.Info/Error, or authoring antelope.config with defineConfig.
category: antelopejs-interface
tags: [antelopejs, interface, proxy, decorators, logging]
---

# @antelopejs/interface-core

Foundational primitives of the AntelopeJS interface system. An interface is a plain module of proxy
objects (the declaration); a provider attaches concrete behavior with `ImplementInterface`; consumers
call the declaration directly. All proxy calls cross module boundaries: they queue while no
implementation is attached and auto-detach when the providing module is unloaded. Decorator
factories, `GetMetadata`, and config types are ordinary consumer-side helpers (no proxy crossing).

## Import paths

```ts
import { InterfaceFunction, ImplementInterface, GetMetadata, GetInterfaceInstances, GetInterfaceInstance, AsyncProxy, EventProxy, RegisteringProxy, GetResponsibleModule } from "@antelopejs/interface-core";
import { MakeClassDecorator, MakeMethodDecorator, MakePropertyDecorator, MakeParameterDecorator } from "@antelopejs/interface-core/decorators"; // + many combined variants
import { Events, ListModules, GetModuleInfo, LoadModule, StartModule, StopModule, DestroyModule, ReloadModule } from "@antelopejs/interface-core/modules";
import { AsyncProxy, EventProxy, RegisteringProxy } from "@antelopejs/interface-core/proxies"; // same classes the root entry re-exports; pick one import site
import { GetRuntimeInfo, RegisterDevServer, DEV_REGISTRY_PATH } from "@antelopejs/interface-core/runtime";
import { defineConfig, type AntelopeConfig, type AntelopeModuleConfig } from "@antelopejs/interface-core/config";
import { Logging } from "@antelopejs/interface-core/logging";
```

## Declaring and implementing an interface

```ts
// declaration.ts - the interface contract
import { InterfaceFunction, EventProxy } from "@antelopejs/interface-core";

export const GetUser = InterfaceFunction<(id: string) => { name: string }>();
export const OnUserCreated = new EventProxy<(userId: string) => void>();
```

```ts
// provider module - attach the implementation
import { ImplementInterface } from "@antelopejs/interface-core";
import * as UserInterface from "./declaration";

ImplementInterface(UserInterface, {
  GetUser(id) {
    return { name: "Alice" };
  },
});
```

```ts
// consumer - call the declaration; always returns a Promise
const user = await GetUser("42");
OnUserCreated.register((userId) => Logging.Info("created", userId));
```

For a `RegisteringProxy` field, the implementation entry is an object:
`{ register: (id, ...args) => void, unregister: (id) => void }`. `EventProxy` fields are never
implemented; providers `emit` on them, consumers `register`/`unregister` handlers.

## Logging

```ts
import { Logging } from "@antelopejs/interface-core/logging";

Logging.Info("hello");                       // main channel; also Error/Warn/Debug/Trace
const ch = new Logging.Channel("database");  // named channel
ch.Debug("query", { ms: 12 });
```

## Gotchas

- `InterfaceFunction` calls always return a `Promise`, even for sync implementations. Unimplemented
  calls queue indefinitely (no timeout); an `await` before any provider attaches simply waits. In
  `ajs module test` stub mode they reject instead with "Interface function called without
  implementation in test environment. Ensure the required module is loaded in your test config.".
- Prefer the synchronous `ImplementInterface(decl, impl)`; the Promise-accepting overload is
  deprecated. Implementations may be partial - unmatched keys keep queuing.
- Module attribution (`GetResponsibleModule`) works by call-stack analysis. Attach implementations
  and register handlers synchronously during module load; doing it from a setTimeout/setInterval
  callback logs "this will break hot reloading!", and other async contexts break attribution
  silently - both defeat automatic cleanup on module unload.
- `RegisteringProxy` replays existing registrations to a newly attached provider (hot reload safe);
  `EventProxy.register` deduplicates by function identity; both auto-clean handlers of destroyed
  modules via `Events.ModuleDestroyed`.
- `GetMetadata` needs a metadata class with a static `key: symbol`; it inherits from the prototype
  chain by default (pass `inherit = false` to disable). `reflect-metadata` is loaded by the main
  entry point.
- Decorator factory callbacks split their arguments: decorator targets first (class / target+key /
  target+key+descriptor), then the factory's own parameters.

## Deeper reference

See the shipped `.d.ts` files under `dist/` for exact signatures, and the repository docs at
https://github.com/AntelopeJS/interface-core/tree/main/docs (Introduction, Proxies, Decorators,
Metadata, Modules, Logging, Configuration, Runtime) - `docs/` is not part of the npm package.
