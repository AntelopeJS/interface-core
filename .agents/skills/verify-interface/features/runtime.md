---
covers:
  - src/runtime.ts
docs:
  - docs/8.runtime.md
journeys:
  - runtime
---

# Runtime

`GetRuntimeInfo` and `RegisterDevServer` are interface functions the core implements; `DEV_REGISTRY_PATH` names the registry file.

## Sub-features

- `runtime`: `DEV_REGISTRY_PATH` is `.antelope/dev.json`; the package root re-exports the three exports; both functions reject with `ERR_NO_PROVIDER` in stub mode; with an implementation attached they pass the documented argument and result shapes.

## How to get to it (user POV)

- `await GetRuntimeInfo()` and `await RegisterDevServer("api", [{ protocol, host, port }])`.

## Driving it with antelopejs-verify

```bash
pnpm exec antelopejs-verify journey "$RUN" runtime
```

## Gotchas

- Not driven: writing and removing the registry file, and the `dev` flag per `ajs` command (the core does both).
