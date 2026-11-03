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
---

# Proxies

A module author declares calls with `AsyncProxy` and `InterfaceFunction`, notifies with `EventProxy` and stores registrations with `RegisteringProxy`. Calls queue (at most 1,000) until a provider attaches, a stale lease cannot detach a newer provider, events reach only current listeners, registrations replay when handlers attach, and a rethrowing error reporter detaches the lease before the error propagates.

## Sub-features

- `proxy-lifecycle`: a call made before `onCall` waits and then runs; a later call runs at once; `detach(oldLease)` leaves the current provider; the 1,001st pending call rejects with `ERR_PROVIDER_QUEUE_FULL` and the 1,000 queued calls run on attach; `GetInterfaceProxyIdentity` and `IsInterfaceProxy` answer for proxies and not for the function `InterfaceFunction` returns; `EventProxy` ignores a second registration of one function, keeps going after a throwing handler and reports it; `RegisteringProxy` replays stored entries, re-register calls the callback again, `onRegister` and `onUnregister` attach separately, a throwing `unregister` still removes the entry, and a replay failure is reported and skipped (rethrown: detached).
- `proxy-details`: `detach()` with no lease removes the current callback of an `AsyncProxy` (a later call rejects `ERR_NO_PROVIDER` in stub mode) and both callbacks of a `RegisteringProxy`, while a lease that does not match removes nothing and a running call finishes; a call after `detach()` queues again; the entries stay stored and replay when handlers attach again; `onRegister` keeps an existing unregister callback and `onUnregister` keeps the register callback and replays nothing; `detach(lease)` removes only the callbacks of that lease; a second `register` of one ID replays only the latest arguments; the identity helpers prefix `async:`, `event:` and `registering:` (anonymous ones as `<kind>:anonymous:<n>`), return `undefined` for non-proxies, and `IsInterfaceProxy` filters by kind; an `EventProxy` keeps no emission for later listeners, runs a handler in the context it registered in (the emitter's when it registered outside any context), returns nothing from `emit`, and `unregisterOwner` and `unregisterModule` remove the matching handlers and entries; 1,500 stored registrations never throw; arguments and classes cross by identity.
- `ownership-details`: a destroyed older generation leaves a newer provider attached; a provider callback keeps its context across `await`; a direct `call`, a `register` or an event `register` from a destroyed generation rejects or throws `ERR_MODULE_CONTEXT_INVALIDATED`; `ModuleDestroyed` emitted in another module's context cleans the module named in the event and leaves the emitting module's work; work outside any context survives every module release; `RunWithResponsibleModule` restores the parent context after a nested call, also when it throws; what a provider registers while serving a call is the provider's, so destroying the caller removes nothing; a registration forwarded by a provider is unregistered through the provider when its origin is destroyed; a new generation receives the stored entries by replay.

## How to get to it (user POV)

- `new AsyncProxy<F>()`, `InterfaceFunction<F>()`, `new EventProxy<F>()`, `new RegisteringProxy<F>()` imported from `@antelopejs/interface-core`.

## Driving it with antelopejs-verify

```bash
pnpm exec antelopejs-verify journey "$RUN" proxies
```

## Gotchas

- Ownership (`unregisterModule`, `unregisterOwner`, destroyed generations) is driven by the `modules` feature, which owns the module context.
- Not driven: the `docs-check` snippets of the page (CI type-checks them through `docs/tsconfig.json`); the wording of the provider-ambiguity paragraph (`AmbiguousProviderError` is never thrown by these classes, and the core owns multi-provider evaluation).
- Sub-rule sweep of docs/2.proxies.md: every sentence with a testable claim is driven by `proxy-lifecycle`, `proxy-details`, `ownership-details`, `implement-interface` or `error-contract`, except the rows below.
- Not driven (docs/2): the claim that interface package code is never an owner, and its release when the core discards an interface instance (the core evaluates those packages); the limits about lazily started work and ES `import` of an interface package (core behaviour); that `AmbiguousProviderError` is never thrown by the proxy classes (an absence, no input reaches it); that a function argument runs in the context of whoever calls it (Node async context, not this package); brand detection across copies of the package (pinned by the repository unit test `proxy-brand`, not by a journey); type-level notes (`IsInterfaceProxy` does not narrow, `AttachmentLease` is not re-exported by the root).
