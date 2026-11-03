---
covers:
  - src/index.ts
docs:
  - docs/1.introduction.md
  - docs/2.proxies.md
journeys:
  - implement-interface
  - implement-types
  - implement-types-reject
---

# Implement

A provider module calls `ImplementInterface(declaration, implementation)`. Validation runs before anything attaches, so a missing handler, a malformed registering pair, a non-object or a cycle throws `TypeError` and leaves no handler attached. Event proxies need nothing. `GetInterfaceInstances` and `GetInterfaceInstance` read the connections of the module whose work is running.

## Sub-features

- `implement-interface`: the synchronous overload returns `{ declaration, implementation }` and nested objects, async functions and registering pairs attach; an event proxy needs no implementation; a missing function, a missing `unregister`, a null or numeric argument, a cycle on either side and an `Object.prototype` name without an own value each throw `TypeError`; an implementation missing one of two handlers attaches neither; the deprecated promise overload resolves; the lookups return `[]` and `undefined` outside a module and the module's connections inside one; `GetResponsibleModule` and `RunWithResponsibleModule` report the active module.
- `implement-types`: `InterfaceToImpl` keys are optional, an event is `never`, a registering proxy takes `{ register, unregister }`, a nested object recurses.
- `implement-types-reject`: a synchronous `AsyncProxy<() => number>` takes no `async` function.

## How to get to it (user POV)

- `ImplementInterface(Greeting, { GetGreeting: (name) => ... })` in a module's `construct`.

## Driving it with antelopejs-verify

```bash
pnpm exec antelopejs-verify journey "$RUN" implement
```

## Gotchas

- Rollback when attaching throws partway (replay failure with a rethrowing reporter) is the covered behaviour of the `formal-implement-interface` check, which `antelopejs-verify formal` runs; this feature drives the validation half.
- Not driven: connections the core builds from `importOverrides` (the core owns them; the journey writes `internal.interfaceConnections` directly).
