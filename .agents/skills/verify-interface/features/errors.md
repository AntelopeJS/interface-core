---
covers:
  - src/errors.ts
docs:
  - docs/2.proxies.md
journeys:
  - error-contract
---

# Errors

The package root exports four error classes with stable `code` values and the `isMissingProviderError` guard, which also holds across realms.

## Sub-features

- `error-contract`: the four code constants and values; `name`, `code`, `Error` ancestry and messages of every class; `MissingProviderError` accepts a custom message; the guard accepts an error from another realm and rejects plain objects, other codes, `null` and strings; in stub mode `AsyncProxy.call` rejects and `RegisteringProxy.register` throws `ERR_NO_PROVIDER`.

## How to get to it (user POV)

- `isMissingProviderError(error)` in a `catch` block.

## Driving it with antelopejs-verify

```bash
pnpm exec antelopejs-verify journey "$RUN" errors
```

## Gotchas

- Message texts other than the ones printed are not part of the contract; the expectation file pins the current ones.
