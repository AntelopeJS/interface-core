# interface-core

The primitives every AntelopeJS interface is built from, published as `@antelopejs/interface-core`. `@antelopejs/core` (AntelopeJS/antelopejs) implements it.

## Layout

- The supported subpaths are the ones with a `typesVersions` entry in `package.json`: `decorators`, `modules`, `proxies`, `runtime`, `internal`, `config`, `logging` and `logging/*`. Their sources are the matching files in `src/`. A new subpath needs that entry too, or consumers on `moduleResolution: node` cannot resolve its types. Renaming or moving one of these files is a breaking change. `src/errors.ts` is public only through the root re-export in `src/index.ts`.
- `src/logging/index.ts` exports `Logging` both named and as the default, and both spellings are published contract. `knip.config.ts` silences the duplicate-export finding for that file only.
- `skills/` and `docs/` ship in the npm package. `docs/` is the source of interfaces.antelopejs.com/docs/core, and CI type-checks its snippets through `docs/tsconfig.json`, which maps the package name onto `src`. When a change alters a public contract, update the matching doc page and `skills/core-interface/SKILL.md`.

## Versioning

`ImplementInterface` refuses a provider that lacks a declared function. Adding a function or a member a provider must implement, or changing a signature, is therefore a breaking change for providers: release it as a new minor (`0.x.0`), never a patch. The core caps its range below the next minor, so a published core never resolves an interface it does not implement; modules that only call the interface keep wide ranges. For the current core bounds, read `dependencies["@antelopejs/interface-core"]` in [AntelopeJS/antelopejs/package.json](https://github.com/AntelopeJS/antelopejs/blob/main/package.json).

## Test suites

- The unit suites live in `src/tests`. They compile with the package, and mocha runs them from `dist/tests`.
- `pnpm test` builds `dist` once, runs the unit suites, then runs `test/package-consumer.mjs`: it packs the package, installs the tarball in a temporary consumer, type-checks it with `moduleResolution: node`, and loads it through the root and through the subpaths first. `pnpm run checks` runs both.
- `pnpm run checks` does not run the docs check (Markdown links and the `docs/` snippets type-checked through `docs/tsconfig.json`). Only CI runs it, through the `docs-files` and `docs-typescript-project` inputs of `ci.yml`.
- `src/antelope.test.ts` is the `antelopeJs.test` config that `ajs module test` reads. It points at the same `dist/tests` suites. No script here runs it; run it with the `ajs` CLI from `@antelopejs/core` after `pnpm run build`.

<!-- antelopejs-guardrails:start -->
<!-- Managed by @antelopejs/tooling-configs. `antelopejs-sync` rewrites everything between these markers; write repository-specific guidance outside them. -->

## Guardrails

CI runs `pnpm run checks` in full on every pull request and reports what failed. The commit hook formats and lints the staged files. Locally, run only the fast check for what you touched:

- `pnpm run typecheck` after you change types or signatures.
- `pnpm exec oxlint <files>` and `pnpm exec oxfmt <files>` on the files you changed.
- One test file, not the suite. In a module that tests with `ajs module test`: `pnpm run build`, then `pnpm exec ajs module test . -f dist/<path>.test.js`.

Prove a change works with the verification skill in [`.agents/skills/verify-interface/SKILL.md`](.agents/skills/verify-interface/SKILL.md) before you call it done.

### Comments

Say it in code: a constraint in a type, a lint rule or a test, a public item's contract in TSDoc. Other comments are lint directives naming their rules, `@ts-expect-error <reason>`, `SAFETY: <reason>` above a type assertion, and license or tool directives. A reason states what the code does now.

### Tests

Each test names the wrong implementation it fails on, or is deleted. Drive behaviour through the public interface. An invariant over many files is a lint rule.

### Review

No tool checks these:

- A type guard checks the nested elements and values it claims.
- A no-upward import rule rejects same-tier peers; probe it with an import.
- A finding only an evasion or a patched internal can trigger goes under Attention and never blocks.

### Suppressions

`guardrails.suppressions.json` caps lint directives, `@ts-expect-error`, `SAFETY:` comments and rules a lint config turns off. Over a cap, fix the code or remove another suppression of that kind; only the operator raises a number. After removing suppressions, run `pnpm run suppressions:update` and commit the file.

<!-- antelopejs-guardrails:end -->
