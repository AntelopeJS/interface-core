---
covers:
  - src/proxies.ts
docs:
  - docs/1.introduction.md
  - docs/2.proxies.md
journeys:
  - proxy-lifecycle
  - proxy-details
  - ownership-details
  - surface-details
  - rule-details
  - proxy-types
  - proxy-types-reject
---

# Proxies

A module author declares calls with `AsyncProxy` and `InterfaceFunction`, notifies with `EventProxy` and stores registrations with `RegisteringProxy`. Calls queue (at most 1,000) until a provider attaches, a stale lease cannot detach a newer provider, events reach only current listeners, registrations replay when handlers attach, and a rethrowing error reporter detaches the lease before the error propagates.

## Sub-features

- `proxy-lifecycle`: a call made before `onCall` waits and then runs; a later call runs at once; `detach(oldLease)` leaves the current provider; the 1,001st pending call rejects with `ERR_PROVIDER_QUEUE_FULL` and the 1,000 queued calls run on attach; `GetInterfaceProxyIdentity` and `IsInterfaceProxy` answer for proxies and not for the function `InterfaceFunction` returns; `EventProxy` ignores a second registration of one function, keeps going after a throwing handler and reports it; `RegisteringProxy` replays stored entries, re-register calls the callback again, `onRegister` and `onUnregister` attach separately, a throwing `unregister` still removes the entry, and a replay failure is reported and skipped (rethrown: detached).
- `proxy-details`: `detach()` with no lease removes the current callback of an `AsyncProxy` (a later call rejects `ERR_NO_PROVIDER` in stub mode) and both callbacks of a `RegisteringProxy`, while a lease that does not match removes nothing and a running call finishes; a call after `detach()` queues again; the entries stay stored and replay when handlers attach again; `onRegister` keeps an existing unregister callback and `onUnregister` keeps the register callback and replays nothing; `detach(lease)` removes only the callbacks of that lease; a second `register` of one ID replays only the latest arguments; the identity helpers prefix `async:`, `event:` and `registering:` (anonymous ones as `<kind>:anonymous:<n>`), return `undefined` for non-proxies, and `IsInterfaceProxy` filters by kind; an `EventProxy` keeps no emission for later listeners, runs a handler in the context it registered in (the emitter's when it registered outside any context), returns nothing from `emit`, and `unregisterOwner` and `unregisterModule` remove the matching handlers and entries; 1,500 stored registrations never throw; arguments and classes cross by identity.
- `ownership-details`: a destroyed older generation leaves a newer provider attached; a provider callback keeps its context across `await`; a direct `call`, a `register` or an event `register` from a destroyed generation rejects or throws `ERR_MODULE_CONTEXT_INVALIDATED`; `ModuleDestroyed` emitted in another module's context cleans the module named in the event and leaves the emitting module's work; work outside any context survives every module release; `RunWithResponsibleModule` restores the parent context after a nested call, also when it throws; what a provider registers while serving a call is the provider's, so destroying the caller removes nothing; a registration forwarded by a provider is unregistered through the provider when its origin is destroyed; a new generation receives the stored entries by replay.
- `surface-details`: `onCall` replaces an earlier callback; `emit` reports a throwing handler to the runtime reporter and still runs the later ones, an asynchronous handler is not awaited; a provider's synchronous throw rejects the call.
- `rule-details`: re-registering an ID from another module moves ownership (destroying the first module leaves the entry, destroying the second unregisters it); stored registrations and queued calls replay first in, first out, and queued promises settle in that order; `onHandlers` has the unregister callback in place during replay, so an unregister from inside replay reaches it; `onUnregister` takes its owner and manual-detach setting from the unregister attachment first and the register attachment second (in a module context, and with no context through the default owner), takes the context owner with automatic cleanup when no attachment belongs to it, and leaves the register callback alone; `onRegister(cb, true)` survives its owner and without the flag does not; the register and unregister callbacks run in the context they were attached in, also when a registrar's destruction triggers the unregister; a destroyed generation's callback fails with `ERR_MODULE_CONTEXT_INVALIDATED` when it registers or reads the context; a registration made outside any context survives every release; a function argument runs in the provider's context; a second copy of the built package recognises proxies of the first (`IsInterfaceProxy`, `GetInterfaceProxyIdentity`) and attaches providers to its declarations, both ways; the root and the `/proxies` and `/modules` subpaths export the same objects.
- `proxy-types` and `proxy-types-reject`: `AttachmentLease` imports from `/proxies` and `onCall` returns one; a value checked only with `IsInterfaceProxy` is still `unknown` (TS18046); the root does not re-export `AttachmentLease` (TS2305).

## How to get to it (user POV)

- `new AsyncProxy<F>()`, `InterfaceFunction<F>()`, `new EventProxy<F>()`, `new RegisteringProxy<F>()` imported from `@antelopejs/interface-core`.

## Driving it with antelopejs-verify

```bash
pnpm exec antelopejs-verify journey "$RUN" proxies
```

## Gotchas

- Ownership (`unregisterModule`, `unregisterOwner`, destroyed generations) is driven by the `modules` feature, which owns the module context.
- Not driven: the `docs-check` snippets of the page (CI type-checks them through `docs/tsconfig.json`); the wording of the provider-ambiguity paragraph (`AmbiguousProviderError` is never thrown by these classes, and the core owns multi-provider evaluation).
- Clause sweep of docs/2.proxies.md, section by section (overview, lifecycle table, `AsyncProxy`, `InterfaceFunction`, `EventProxy`, `RegisteringProxy`, identity helpers, ownership, `ImplementInterface`, `MissingProviderError`, errors, lookups, `GetResponsibleModule`, `RunWithResponsibleModule`). Every clause with a testable claim, the "otherwise", "first", "already" and "without" clauses included, is driven by `proxy-lifecycle`, `proxy-details`, `ownership-details`, `surface-details`, `rule-details`, `implement-interface`, `error-contract`, `proxy-types` or `proxy-types-reject`, except these rows:

- Not driven, core behaviour: that interface package code is never an owner and that the core releases an interface instance's own owner when it discards it; the limits about lazily started work and about packages loaded through ES `import` (both depend on how the core loads packages); that a project with several providers gets one evaluated interface instance per provider; what requiring a connection's `path` returns.
- Not driven, absence: that `AmbiguousProviderError` is never thrown by the proxy classes (no input reaches it); that `GetResponsibleModule` never inspects the call stack.
- Not driven, covered by the formal check: that a failed `ImplementInterface` call leaves a provider attached by another call in place and that the rethrowing-reporter rollback detaches every handler it attached (`formal-implement-interface`, run by `antelopejs-verify formal`).
- Not driven, not observable: that provider callbacks' side effects are not rolled back, and that detaching registration callbacks does not release provider resources (nothing in the package holds those resources).
- Not driven, CI: the `docs-check` snippets and the illustration of the lifecycle table.
