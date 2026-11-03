---
covers:
  - src/runtime.ts
docs:
  - docs/8.runtime.md
journeys:
  - runtime
  - runtime-types
  - runtime-types-reject
  - rule-details
---

# Runtime

`GetRuntimeInfo` and `RegisterDevServer` are interface functions the core implements; `DEV_REGISTRY_PATH` names the registry file.

## Sub-features

- `runtime`: `DEV_REGISTRY_PATH` is `.antelope/dev.json`; the package root re-exports the three exports; both functions reject with `ERR_NO_PROVIDER` in stub mode; with an implementation attached they pass the documented argument and result shapes.
- `runtime-types` and `runtime-types-reject`: `DevServerRegistry`, `DevServerEntry`, `DevServerEndpoint` and `RuntimeInfo` accept the documented shapes and refuse a missing `pid`, a text port and a missing `env`.
- `rule-details`: the functions the root and `/runtime` export are the same objects.

## How to get to it (user POV)

- `await GetRuntimeInfo()` and `await RegisterDevServer("api", [{ protocol, host, port }])`.

## Driving it with antelopejs-verify

```bash
pnpm exec antelopejs-verify journey "$RUN" runtime
```

## Gotchas

- Not driven: writing and removing the registry file, and the `dev` flag per `ajs` command (the core does both).
- Clause sweep of docs/8.runtime.md (overview, check the current mode, import, `GetRuntimeInfo`, `RegisterDevServer`, dev registry file): driven by `runtime`, `runtime-types`, `runtime-types-reject` and `rule-details`, except: the `dev` value per `ajs` command, merging the registration into the registry file, removing it on shutdown, and the no-op outside development mode (the core implements the functions); that the file is valid only while `pid` exists (a rule for readers of the file); the `docs-check` snippet.
