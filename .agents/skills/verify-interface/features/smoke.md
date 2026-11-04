---
covers:
docs:
  - README.md
  - docs/1.introduction.md
journeys:
  - exports
  - proxy-lifecycle
  - implement-interface
---

# Smoke

The fixed journeys every verdict runs, whatever the diff touches: the exports of every subpath, a proxy from queue to provider, `ImplementInterface`.

## Sub-features

- `exports`: the names each documented subpath exports.
- `proxy-lifecycle` and `implement-interface`: as in [proxies](proxies.md) and [implement](implement.md).

## How to get to it (user POV)

- A module that imports `@antelopejs/interface-core` and one of its subpaths.

## Driving it with antelopejs-verify

```bash
pnpm exec antelopejs-verify journey "$RUN" smoke
```

## Gotchas

- The smoke feature covers no glob, so it never marks a file as mapped.
- The pack's `every-function` journey is not used: it loads the package under verification as an interface behind a stub provider in `ajs project dev`, but this package is the runtime every interface is built on, so it declares no interface functions of its own to walk. `@antelopejs/core` is a dev dependency only so that `doctor` finds `ajs`. The journeys call the built package in a Node process instead.
- `minor-bump` is not in smoke. The integration branch already changes `GetMetadata`, `ImplementInterface` and the `Logging` functions against the published 0.3.0, and the head version is still 0.3.0, so the pack's rule fails for every title that is not breaking until the release bumps the version (the release notes on the branch name 0.4.0). Add it back to the journeys of this file after that release.
