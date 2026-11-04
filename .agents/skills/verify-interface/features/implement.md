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
  - surface-details
  - tsdoc-details
---

# Implement

A provider module calls `ImplementInterface(declaration, implementation)`. Validation runs before anything attaches, so a missing handler, a malformed registering pair, a non-object or a cycle throws `TypeError` and leaves no handler attached. Event proxies need nothing. `GetInterfaceInstances` and `GetInterfaceInstance` read the connections of the module whose work is running.

## Sub-features

- `implement-interface`: the synchronous overload returns `{ declaration, implementation }` and nested objects, async functions and registering pairs attach; an event proxy needs no implementation; a missing function, a missing `unregister`, a null or numeric argument, a cycle on either side and an `Object.prototype` name without an own value each throw `TypeError`; an implementation missing one of two handlers attaches neither; the deprecated promise overload resolves; the lookups return `[]` and `undefined` outside a module and the module's connections inside one; `GetResponsibleModule` and `RunWithResponsibleModule` report the active module.
- `implement-types`: `InterfaceToImpl` keys are optional, an event is `never`, a registering proxy takes `{ register, unregister }`, a nested object recurses.
- `implement-types-reject`: a synchronous `AsyncProxy<() => number>` takes no `async` function.
- `surface-details`: a nested declaration with no implementation, or with `5` where an object belongs, throws `TypeError`; the same declaration with its handler attaches; a provider that throws synchronously makes the call reject, also through `InterfaceFunction`, and an async rejection passes through; an interface function with a synchronous provider still returns a promise (README, docs/1 and docs/2).
- `tsdoc-details`: a failing `ImplementInterface` leaves a call queued before it pending and never calls a registering handler's `register` (validation runs before any attachment, observed through the queued call and the spy, not only the end state); the call returns the very `declaration` and `implementation` objects it received.

## How to get to it (user POV)

- `ImplementInterface(Greeting, { GetGreeting: (name) => ... })` in a module's `construct`.

## Driving it with antelopejs-verify

```bash
pnpm exec antelopejs-verify journey "$RUN" implement
```

## Gotchas

- Rollback when attaching throws partway (replay failure with a rethrowing reporter) is the covered behaviour of the `formal-implement-interface` check, which `antelopejs-verify formal` runs; this feature drives the validation half.
- Not driven: connections the core builds from `importOverrides` (the core owns them; the journey writes `internal.interfaceConnections` directly).
- Sentence sweep of the README, docs/1.introduction.md and the TSDoc of `src/index.ts`: driven by `implement-interface`, `implement-types`, `implement-types-reject`, `metadata`, `metadata-details` and `exports`, except these rows. Not driven: the role table and next-step links of docs/1 (navigation); the 1,000-call default is driven in `proxy-lifecycle`; the README install and contributing commands; the badge links; `docs-check` snippets.
- TSDoc sweep of `src/index.ts` (round 5): validation before attaching is observed through a queued call and a registering spy (`tsdoc-details`); the rollback by lease on a later throw is the formal check's; the returned objects are the inputs (`tsdoc-details`); `@throws TypeError` for malformed arguments, objects cycles and missing handlers (`implement-interface`, `surface-details`); `GetMetadata` and the lookups as in their journeys. Not driven: the `@deprecated` mark on the promise overload (type level).
