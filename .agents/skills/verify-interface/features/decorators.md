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
  - tsdoc-details
---

# Decorators

The decorator factories turn a handler into a TypeScript legacy decorator factory. The handler receives the target first and the factory arguments after it.

## Sub-features

- `decorator-factories`: the four single-target factories pass `(target, ...args)`, `(target, key, ...args)`, `(target, key, descriptor, ...args)` and `(target, key, index, ...args)`; the fifteen factory names; a combined factory passes `undefined` key and descriptor on a class and all three on a method.
- `decorator-types`: `Class<T>`, `ClassDecorator<C>`, `DecoratorTarget` compile as documented.
- `decorator-types-reject`: a bare `Class` has no instance members and `DecoratorTarget.constructor` is not constructable.
- `surface-details`: all fifteen factories on every target they name: the handler receives `(target)` for a class factory, `(target, key, descriptor)` for a method, `(target, key, undefined)` for a property and `(target, key, index)` for a parameter, then the factory arguments; a combined factory on a class passes `undefined` key and descriptor.
- `tsdoc-details`: every factory with a method target hands the handler the property descriptor it was given (identity), and the docs' `Log` and `Track` wrap of `descriptor.value` takes effect when applied as TypeScript applies decorators (the method returns the wrapped result); a class decorator's returned class replaces the class and a method decorator's returned descriptor replaces the method.

## How to get to it (user POV)

- `MakeClassDecorator((target, name: string) => ...)` then `@Label("users")`.

## Driving it with antelopejs-verify

```bash
pnpm exec antelopejs-verify journey "$RUN" decorators
```

## Gotchas

- The standard (non-legacy) decorator context is not supported and is not driven.
- Sentence sweep of docs/3.decorators.md: driven by `decorator-factories`, `surface-details`, `decorator-types` and `decorator-types-reject`, except these rows. Not driven: that the factories run nothing at request time (an absence); `experimentalDecorators` and `import "reflect-metadata"` needs (compiler and bundling facts, type-checked in CI); the `docs-check` snippet; the `Func`, `PropertyDecorator`, `MethodDecorator` and `ParameterDecorator` rows beyond what `decorator-types` compiles.
- TSDoc sweep of `src/decorators.ts` (round 5): the claims about effects are observed, not only the argument shape: the method descriptor identity and the wrap of `descriptor.value` (`tsdoc-details`), the order of arguments per target (`surface-details`), and the replacement a class or method decorator returns (`tsdoc-details`). Not driven: the `@template` and `@param` type descriptions (type level, `decorator-types`); the claim that factories give 'type safety' (type level).
