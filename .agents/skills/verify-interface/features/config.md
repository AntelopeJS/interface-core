---
covers:
  - src/config.ts
docs:
  - docs/7.configuration.md
journeys:
  - define-config
  - config-types
  - config-test-types
  - config-reject-types
---

# Config

`defineConfig` type-checks a project configuration and returns its input unchanged. The module also exports the configuration and config variable types.

## Sub-features

- `define-config`: the object and the function forms come back as the same value; the only runtime export is `defineConfig`.
- `config-types`: a configuration using every documented property compiles, with `ConfigVarValue`, `ConfigVars` and `ConfigVarProvider` having the documented definitions.
- `config-test-types`: `AntelopeTestConfig.setup` returning a partial config, synchronously or asynchronously, or `undefined`, compiles, with the other optional properties.
- `config-reject-types`: a `setup` returning a non-config, an `AntelopeConfig` without `name`, a package source without `version`, a git source with `path`, a local source with `commit`, an `ImportOverride` without `interface`, a config variable that is an array, and an `envOverrides` number each fail to compile.

## How to get to it (user POV)

- `export default defineConfig({ name: "my-project", modules: { ... } })` in `antelope.config.ts`.

## Driving it with antelopejs-verify

```bash
pnpm exec antelopejs-verify journey "$RUN" config
```

## Gotchas

- Not driven: config variable resolution, `optional`, `disabled` and `exportPriority` behaviour (the core reads them); the journey checks the types only.
- Sentence sweep of docs/7.configuration.md and the TSDoc of `src/config.ts`: driven by `define-config`, `config-types`, `config-test-types` and `config-reject-types`, except these rows. Not driven: how the core resolves `${@module.VAR}`, orders `exportPriority`, loads `optional` modules or honours `disabled` (core, listed above); that `provide` runs before `construct` and deadlocks on another module's interface (core); the `docs-check` snippet; the dynamic-configuration example (`defineConfig` returning a function is driven by identity).
