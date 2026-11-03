---
covers:
  - src/config.ts
docs:
  - docs/7.configuration.md
journeys:
  - define-config
  - config-types
---

# Config

`defineConfig` type-checks a project configuration and returns its input unchanged. The module also exports the configuration and config variable types.

## Sub-features

- `define-config`: the object and the function forms come back as the same value; the only runtime export is `defineConfig`.
- `config-types`: a configuration using every documented property compiles, with `ConfigVarValue`, `ConfigVars` and `ConfigVarProvider` having the documented definitions.

## How to get to it (user POV)

- `export default defineConfig({ name: "my-project", modules: { ... } })` in `antelope.config.ts`.

## Driving it with antelopejs-verify

```bash
pnpm exec antelopejs-verify journey "$RUN" config
```

## Gotchas

- Not driven: config variable resolution, `optional`, `disabled` and `exportPriority` behaviour (the core reads them); the journey checks the types only.
