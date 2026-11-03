---
covers:
  - src/decorators.ts
docs:
  - docs/3.decorators.md
journeys:
  - decorator-factories
  - decorator-types
  - decorator-types-reject
---

# Decorators

The decorator factories turn a handler into a TypeScript legacy decorator factory. The handler receives the target first and the factory arguments after it.

## Sub-features

- `decorator-factories`: the four single-target factories pass `(target, ...args)`, `(target, key, ...args)`, `(target, key, descriptor, ...args)` and `(target, key, index, ...args)`; the fifteen factory names; a combined factory passes `undefined` key and descriptor on a class and all three on a method.
- `decorator-types`: `Class<T>`, `ClassDecorator<C>`, `DecoratorTarget` compile as documented.
- `decorator-types-reject`: a bare `Class` has no instance members and `DecoratorTarget.constructor` is not constructable.

## How to get to it (user POV)

- `MakeClassDecorator((target, name: string) => ...)` then `@Label("users")`.

## Driving it with antelopejs-verify

```bash
pnpm exec antelopejs-verify journey "$RUN" decorators
```

## Gotchas

- The standard (non-legacy) decorator context is not supported and is not driven.
