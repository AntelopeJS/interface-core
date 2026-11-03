---
covers:
  - src/index.ts
docs:
  - docs/4.metadata.md
journeys:
  - metadata
  - metadata-details
---

# Metadata

`GetMetadata(target, MetaClass, inherit = true)` returns the same metadata instance for a target on every call, creating it on first use and, when `inherit` is true, building it from the prototype chain first.

## Sub-features

- `metadata`: repeated calls return one instance stored with `Reflect.defineMetadata`; a child without an `inherit` method copies parent properties it does not own; a class with an `inherit` method receives the parent and does not share its array; `inherit=false` skips the chain.
- `metadata-details`: a three-level chain carries the root's value through an `inherit` method; the parents get their own metadata; the constructor receives the target; a constructor and its prototype are separate targets; a later call with another `inherit` value returns the existing instance unchanged; the default copy keeps a child's own property and shares no array with the parent.
- `metadata-details` (round 4): the default copy lists parent keys with `Object.getOwnPropertyNames`, so a non-enumerable parent property is copied; a class with an `inherit` method gets no default copy; `inherit=false` creates nothing on the parent prototype; the default copy is shallow (the child shares the parent's object).

## How to get to it (user POV)

- `GetMetadata(UserController.prototype, RouteMetadata)` in a decorator handler.

## Driving it with antelopejs-verify

```bash
pnpm exec antelopejs-verify journey "$RUN" metadata
```

## Gotchas

- `covers` shares `src/index.ts` with `implement`; a break here edits only `GetMetadata`.
- Clause sweep of docs/4.metadata.md, section by section (overview, store a value, import, signature and parameters, return value, define a class, retrieve, inheritance, disable inheritance). Every clause with a testable claim, including "Otherwise", "first", "only where the child has no own property" and "without an `inherit` method", is driven by `metadata` or `metadata-details`, except these rows:

- Not driven, type level: the signature, the parameter table and the `Class<T, [U]> & { key: symbol }` constraint (CI type-checks the page through `docs/tsconfig.json`).
- Not driven, CI: the `docs-check` snippet and the fragment examples.
