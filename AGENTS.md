# interface-core

## Versioning

`@antelopejs/core` implements this interface, and `ImplementInterface` refuses a provider that lacks a declared function. Adding a function or a member a provider must implement, or changing a signature, is therefore a breaking change for providers: release it as a new minor (`0.x.0`), never a patch. The core caps its range below the next minor, so a published core never resolves an interface it does not implement; modules that only call the interface keep wide ranges. For the current core bounds, read `dependencies["@antelopejs/interface-core"]` in [AntelopeJS/antelopejs/package.json](https://github.com/AntelopeJS/antelopejs/blob/main/package.json).

## Code conventions

- Write code, identifiers, and comments in English.
- Use pnpm for package management and repository scripts.
- Follow the repository's lint and formatting configuration.
- Prefer the smallest change that solves the task; generalize for an existing need.
- Keep functions focused. Extract helpers when they clarify a responsibility, not just to meet a line count.
- Explain non-obvious constraints and decisions in comments; avoid restating the code. Document public contracts with TSDoc.
- Use objects, maps, or arrays instead of `switch/case`.
- Use named interfaces or types instead of anonymous object types.
- Give non-obvious values named constants.
- Prefer early returns to deeply nested branches, and reuse existing logic rather than duplicating it.
- Name identifiers for their role; use boolean names such as `isActive` or `shouldRefresh`.
- In index files, prefer `export * from './module'` over named re-exports.
