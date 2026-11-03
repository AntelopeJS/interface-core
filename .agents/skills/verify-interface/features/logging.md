---
covers:
  - src/logging/**
docs:
  - docs/6.logging.md
journeys:
  - logging
---

# Logging

`Logging` writes structured events on named channels. Nothing keeps an event without a listener, and listeners run synchronously.

## Sub-features

- `logging`: level values; the five main-channel functions and the same five on a `Logging.Channel`, plus both `Write` forms; the entry shape `{ time, channel, levelId, args }` with arguments passed unchanged; the default export equals the named one; a listener sees only later events and stops after `unregister`; the listener runs before the logging call returns.

## How to get to it (user POV)

- `Logging.Info("Worker started")`, `new Logging.Channel("jobs")`, `eventLog.register(fn)`.

## Driving it with antelopejs-verify

```bash
pnpm exec antelopejs-verify journey "$RUN" logging
```

## Gotchas

- Not driven: the recursion hazard of logging inside a listener (it never ends by design) and the runtime's filters and formatters, which the core owns.
