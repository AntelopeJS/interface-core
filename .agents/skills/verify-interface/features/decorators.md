---
covers:
  - src/decorators.ts
docs:
  - docs/3.decorators.md
journeys:
  - decorator-factories
  - decorator-types
  - decorator-types-reject
  - surface-details
---

# Decorators

The decorator factories turn a handler into a TypeScript legacy decorator factory. The handler receives the target first and the factory arguments after it.

## Sub-features

- `decorator-factories`: the four single-target factories pass `(target, ...args)`, `(target, key, ...args)`, `(target, key, descriptor, ...args)` and `(target, key, index, ...args)`; the fifteen factory names; a combined factory passes `undefined` key and descriptor on a class and all three on a method.
- `decorator-types`: `Class<T>`, `ClassDecorator<C>`, `DecoratorTarget` compile as documented.
- `decorator-types-reject`: a bare `Class` has no instance members and `DecoratorTarget.constructor` is not constructable.
- `surface-details`: all fifteen factories on every target they name: the handler receives `(target)` for a class factory, `(target, key, descriptor)` for a method, `(target, key, undefined)` for a property and `(target, key, index)` for a parameter, then the factory arguments; a combined factory on a class passes `undefined` key and descriptor.

## How to get to it (user POV)

- `MakeClassDecorator((target, name: string) => ...)` then `@Label("users")`.

## Driving it with antelopejs-verify

```bash
pnpm exec antelopejs-verify journey "$RUN" decorators
```

## Gotchas

- The standard (non-legacy) decorator context is not supported and is not driven.
- Sentence sweep of docs/3.decorators.md: driven by `decorator-factories`, `surface-details`, `decorator-types` and `decorator-types-reject`, except these rows. Not driven: that the factories run nothing at request time (an absence); `experimentalDecorators` and `import "reflect-metadata"` needs (compiler and bundling facts, type-checked in CI); the `docs-check` snippet; the `Func`, `PropertyDecorator`, `MethodDecorator` and `ParameterDecorator` rows beyond what `decorator-types` compiles.
