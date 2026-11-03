---
covers:
  - src/index.ts
docs:
  - docs/4.metadata.md
journeys:
  - metadata
---

# Metadata

`GetMetadata(target, MetaClass, inherit = true)` returns the same metadata instance for a target on every call, creating it on first use and, when `inherit` is true, building it from the prototype chain first.

## Sub-features

- `metadata`: repeated calls return one instance stored with `Reflect.defineMetadata`; a child without an `inherit` method copies parent properties it does not own; a class with an `inherit` method receives the parent and does not share its array; `inherit=false` skips the chain.

## How to get to it (user POV)

- `GetMetadata(UserController.prototype, RouteMetadata)` in a decorator handler.

## Driving it with antelopejs-verify

```bash
pnpm exec antelopejs-verify journey "$RUN" metadata
```

## Gotchas

- `covers` shares `src/index.ts` with `implement`; a break here edits only `GetMetadata`.
