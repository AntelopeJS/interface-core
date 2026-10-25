# interface-core

The primitives every AntelopeJS interface is built from, published as `@antelopejs/interface-core`. `@antelopejs/core` (AntelopeJS/antelopejs) implements it.

## Layout

- Each top-level file in `src/` is a public subpath (`decorators`, `modules`, `proxies`, `runtime`, `internal`, `config`), reached through the `./*` export; `src/logging/` is `./logging` and `./logging/*`. A new subpath also needs its `typesVersions` entry in `package.json`, or consumers on `moduleResolution: node` cannot resolve its types. Renaming or moving one of these files is a breaking change.
- `src/logging/index.ts` exports `Logging` both named and as the default. Consumers use both, so `knip.config.ts` silences the duplicate-export finding for that file only.
- `skills/` and `docs/` ship in the npm package. `docs/` is the source of interfaces.antelopejs.com/docs/core, and CI type-checks its snippets through `docs/tsconfig.json`, which maps the package name onto `src`. When a change alters a public contract, update the matching doc page and `skills/core-interface/SKILL.md`.

## Versioning

`ImplementInterface` refuses a provider that lacks a declared function. Adding a function or a member a provider must implement, or changing a signature, is therefore a breaking change for providers: release it as a new minor (`0.x.0`), never a patch. The core caps its range below the next minor, so a published core never resolves an interface it does not implement; modules that only call the interface keep wide ranges. For the current core bounds, read `dependencies["@antelopejs/interface-core"]` in [AntelopeJS/antelopejs/package.json](https://github.com/AntelopeJS/antelopejs/blob/main/package.json).

## Tests

- The unit suites live in `src/tests`. They compile with the package, and mocha runs them from `dist/tests`.
- `pnpm test` builds `dist` once, runs the unit suites, then runs `test/package-consumer.mjs`: it packs the package, installs the tarball in a temporary consumer, type-checks it with `moduleResolution: node`, and loads it through the root and through the subpaths first. `pnpm run checks` runs both.
- `src/antelope.test.ts` is the `antelopeJs.test` config that `ajs module test` reads. No script here runs it.

<!-- antelopejs-guardrails:start -->
<!-- Managed by @antelopejs/tooling-configs. `antelopejs-sync` rewrites everything between these markers; write repository-specific guidance outside them. -->

## Guardrails

Finish every change with `pnpm run checks`. It runs typecheck, lint, format, knip, tests, size, ratchet, and sync, and prints only what failed. The change is done when it prints no failure.

The tools enforce most rules, listed in the table at the end. The sections below hold the rules no tool checks.

### Comments

Say it in code. A constraint belongs in a type, a lint rule, or a test. A public item's contract belongs in TSDoc (`/** */`) on that item. The only other comments are lint directives that name their rules, `@ts-expect-error <reason>`, `SAFETY: <reason>` above a type assertion, `/*!` license headers, and bundler or formatter directives.

### Tests

Hold every test you write or keep to this checklist:

- Name the wrong implementation this test fails on. A test with no answer is deleted, not kept.
- No test reads the file it tests. Drive the behaviour through the public interface.
- An invariant over many files is a lint rule, not a test.

### Debt

`guardrails.ratchet.json` records the lint findings and oversize files this repository already had. Its numbers only go down. After you remove debt, run `pnpm run ratchet:update` and commit the lowered file. A rule listed there is off for `oxlint`. The ratchet counts it instead, and the pre-commit hook rejects it on every line you add.

### What enforces what

| Rule                                                                           | Enforced by                               |
| ------------------------------------------------------------------------------ | ----------------------------------------- |
| Formatting                                                                     | oxfmt                                     |
| Lint findings are errors; no rule warns                                        | oxlint preset                             |
| Comments are TSDoc, directives, or `SAFETY:` only                              | `antelopejs/no-comments`                  |
| Every test asserts                                                             | `antelopejs/require-assertion`            |
| Tests read no files outside fixtures, helpers, locales                         | `antelopejs/no-fs-read-in-tests`          |
| No assertion that restates a constant                                          | `antelopejs/no-constant-value-assertion`  |
| No test whose only check is "is a function"                                    | `antelopejs/no-typeof-function-only-test` |
| Params ≤ 5, function ≤ 120 lines, file ≤ 500 lines, depth ≤ 4, complexity ≤ 20 | `eslint/max-*`, `eslint/complexity`       |
| Files ≤ 20,000 bytes, tests included                                           | `antelopejs-check-size` (pre-commit)      |
| Existing debt only shrinks                                                     | `antelopejs-ratchet`                      |
| Types check                                                                    | `tsc` (pre-push)                          |
| No dead files, exports, or dependencies                                        | knip                                      |
| Managed files match the pack                                                   | `antelopejs-sync --check`                 |
| A test names the wrong implementation it catches                               | review; no tool                           |

<!-- antelopejs-guardrails:end -->
