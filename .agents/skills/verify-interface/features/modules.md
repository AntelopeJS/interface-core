---
covers:
  - src/modules.ts
  - src/internal.ts
docs:
  - docs/2.proxies.md
  - docs/5.modules.md
journeys:
  - module-lifecycle
  - module-types
  - ownership-details
  - module-info-types
  - module-info-reject
---

# Modules

`@antelopejs/interface-core/modules` exposes the six lifecycle events, the module execution context and the management and declaration functions. Destroying a module removes the attachments, registrations and event handlers its owner made.

## Sub-features

- `module-lifecycle`: the six events and their arguments; `ModuleDestroyed` outside a context cleans the owner named like the module and inside one cleans that generation only; a destroyed owner invalidates its context (`ERR_MODULE_CONTEXT_INVALIDATED`) and a queued call of a destroyed caller rejects the same way; a callback attached in an interface-kind context runs in the caller's context, any other in the provider's; a manually detached callback outlives its generation and fails reading the context; the ten management and declaration functions reject with `ERR_NO_PROVIDER` in stub mode.
- `module-types`: `ModuleDefinitionSource` refuses unknown fields, `ModuleSourceLocal` its sibling kinds, `importOverrides` of `AntelopeModuleConfig` the array record shape, and `ModuleInfo.status` an unlisted state.
- `ownership-details`: as in [proxies](proxies.md), the half that concerns `ModuleDestroyed` and the module context.
- `surface-details`: the six event argument counts (four pass the module ID, `ModulesStarted` and `ModulesStopping` none); `RunWithModuleContext` defaults `owner` to the module ID and the kind to a module's; `GetModuleContext` is `undefined` outside a context; a context without a module ID throws.
- `module-info-types` and `module-info-reject`: `ModuleInfo` requires `source`, `config`, `importOverrides`, `disabledExports`, `status` and `localPath`; `ModuleDefinition` needs only `source`.

## How to get to it (user POV)

- `Events.ModuleStarted.register(...)`, `RunWithModuleContext({ module, owner }, ...)`.

## Driving it with antelopejs-verify

```bash
pnpm exec antelopejs-verify journey "$RUN" modules
```

## Gotchas

- Not driven: what the management functions do (the core implements them); they are only checked to be interface functions that wait for a provider.
- The runtime protocol check (`RUNTIME_PROTOCOL_VERSION`) in `src/internal.ts` is the contract door of the pack and is not driven by a journey.
- Sentence sweep of docs/5.modules.md and the TSDoc of `src/modules.ts`: driven by `module-lifecycle`, `ownership-details`, `surface-details`, `module-types`, `module-info-types` and `module-info-reject`, except these rows. Not driven: the lifecycle state diagram and the meaning of each state (the core moves modules between them); that `StartModule` or `StopModule` does nothing in the wrong state and `ReloadModule` unloads code and keeps the definition the module was loaded with (core implementations); `LoadModule` `autostart` default false (core); the declaration functions' file edits (`SaveModuleDeclaration` keeps comments, `RemoveModuleDeclaration` keeps the project running) (core); `ReleaseOwner` is `@internal`.
