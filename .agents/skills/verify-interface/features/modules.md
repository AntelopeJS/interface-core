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
---

# Modules

`@antelopejs/interface-core/modules` exposes the six lifecycle events, the module execution context and the management and declaration functions. Destroying a module removes the attachments, registrations and event handlers its owner made.

## Sub-features

- `module-lifecycle`: the six events and their arguments; `ModuleDestroyed` outside a context cleans the owner named like the module and inside one cleans that generation only; a destroyed owner invalidates its context (`ERR_MODULE_CONTEXT_INVALIDATED`) and a queued call of a destroyed caller rejects the same way; a callback attached in an interface-kind context runs in the caller's context, any other in the provider's; a manually detached callback outlives its generation and fails reading the context; the ten management and declaration functions reject with `ERR_NO_PROVIDER` in stub mode.
- `module-types`: `ModuleDefinitionSource` refuses unknown fields, `ModuleSourceLocal` its sibling kinds, `importOverrides` of `AntelopeModuleConfig` the array record shape, and `ModuleInfo.status` an unlisted state.

## How to get to it (user POV)

- `Events.ModuleStarted.register(...)`, `RunWithModuleContext({ module, owner }, ...)`.

## Driving it with antelopejs-verify

```bash
pnpm exec antelopejs-verify journey "$RUN" modules
```

## Gotchas

- Not driven: what the management functions do (the core implements them); they are only checked to be interface functions that wait for a provider.
- The runtime protocol check (`RUNTIME_PROTOCOL_VERSION`) in `src/internal.ts` is the contract door of the pack and is not driven by a journey.
