---
covers:
  - src/logging/**
docs:
  - docs/6.logging.md
journeys:
  - logging
  - surface-details
  - tsdoc-details
---

# Logging

`Logging` writes structured events on named channels. Nothing keeps an event without a listener, and listeners run synchronously.

## Sub-features

- `logging`: level values; the five main-channel functions and the same five on a `Logging.Channel`, plus both `Write` forms; the entry shape `{ time, channel, levelId, args }` with arguments passed unchanged; the default export equals the named one; a listener sees only later events and stops after `unregister`; the listener runs before the logging call returns.
- `surface-details`: object and array arguments reach a listener as the identical references, with `Logging.Info()` giving an empty `args`, on the main channel, a named channel and `Write`; `Logging.Channel` has exactly Error, Warn, Info, Debug, Trace and Write; the `Logging` namespace exports exactly those functions plus `Channel` and `Level`.
- `tsdoc-details`: a listener registered in a module's context stops receiving events when that module is destroyed (and receives them before); `Logging.Info` and `Logging.Write` keep working when taken off the namespace.

## How to get to it (user POV)

- `Logging.Info("Worker started")`, `new Logging.Channel("jobs")`, `eventLog.register(fn)`.

## Driving it with antelopejs-verify

```bash
pnpm exec antelopejs-verify journey "$RUN" logging
```

## Gotchas

- Not driven: the recursion hazard of logging inside a listener (it never ends by design) and the runtime's filters and formatters, which the core owns.
- Sentence sweep of docs/6.logging.md and the TSDoc of `src/logging/**`: driven by `logging` and `surface-details`, except: the advice to log identifiers and not credentials (guidance, no behaviour: the interface redacts nothing, which the identical-reference check pins); the runtime's filters, formatters and `NO_PREFIX` display (core); the recursion hazard (never ends by design); the `docs-check` snippet.
- TSDoc sweep of `src/logging/**` (round 5): the listener event is module-aware, so a destroyed module's listeners stop receiving events (`tsdoc-details`, observed before and after); arguments pass unchanged (`surface-details`); the main-channel functions work detached from the namespace (`tsdoc-details`). Not driven: the TSDoc phrase 'will be serialized appropriately' (the interface serializes nothing, which the identical-reference check pins).
