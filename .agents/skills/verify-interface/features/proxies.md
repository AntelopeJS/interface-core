---
covers:
  - src/proxies.ts
docs:
  - docs/1.introduction.md
  - docs/2.proxies.md
journeys:
  - proxy-lifecycle
---

# Proxies

A module author declares calls with `AsyncProxy` and `InterfaceFunction`, notifies with `EventProxy` and stores registrations with `RegisteringProxy`. Calls queue (at most 1,000) until a provider attaches, a stale lease cannot detach a newer provider, events reach only current listeners, registrations replay when handlers attach, and a rethrowing error reporter detaches the lease before the error propagates.

## Sub-features

- `proxy-lifecycle`: a call made before `onCall` waits and then runs; a later call runs at once; `detach(oldLease)` leaves the current provider; the 1,001st pending call rejects with `ERR_PROVIDER_QUEUE_FULL` and the 1,000 queued calls run on attach; `GetInterfaceProxyIdentity` and `IsInterfaceProxy` answer for proxies and not for the function `InterfaceFunction` returns; `EventProxy` ignores a second registration of one function, keeps going after a throwing handler and reports it; `RegisteringProxy` replays stored entries, re-register calls the callback again, `onRegister` and `onUnregister` attach separately, a throwing `unregister` still removes the entry, and a replay failure is reported and skipped (rethrown: detached).

## How to get to it (user POV)

- `new AsyncProxy<F>()`, `InterfaceFunction<F>()`, `new EventProxy<F>()`, `new RegisteringProxy<F>()` imported from `@antelopejs/interface-core`.

## Driving it with antelopejs-verify

```bash
pnpm exec antelopejs-verify journey "$RUN" proxies
```

## Gotchas

- Ownership (`unregisterModule`, `unregisterOwner`, destroyed generations) is driven by the `modules` feature, which owns the module context.
- Not driven: the `docs-check` snippets of the page (CI type-checks them through `docs/tsconfig.json`); the wording of the provider-ambiguity paragraph (`AmbiguousProviderError` is never thrown by these classes, and the core owns multi-provider evaluation).
