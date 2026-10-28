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

Finish every change with `pnpm run checks`. It runs typecheck, lint, format, knip, tests, size, ratchet, suppressions, and sync, and prints only what failed. The change is done when it prints no failure.

The tools enforce most rules, listed in the table at the end. The sections below hold the rules no tool checks.

### Comments

Say it in code. A constraint belongs in a type, a lint rule, or a test. A public item's contract belongs in TSDoc (`/** */`) on that item. The only other comments are lint directives that name their rules, `@ts-expect-error <reason>`, `SAFETY: <reason>` above a type assertion, `/*!` license headers, and bundler or formatter directives.

Before suppressing a type rule, try inference or a type derived from its owner with `Parameters`, `ReturnType`, or indexed access. A private alias can still appear in a published declaration. Keep a suppression only after checking the published contract and the unchecked boundary it protects.

Check each directive reason against the current line and its callers. Returning a value is not the same as awaiting and discarding it. A reason must describe what the code does now.

### Tests

Hold every test you write or keep to this checklist:

- Name the wrong implementation this test fails on. A test with no answer is deleted, not kept.
- No test reads the file it tests. Drive the behaviour through the public interface.
- An invariant over many files is a lint rule, not a test.

### Cleanup proof

A behaviour-preserving cleanup PR shows `antelopejs-api-diff <base-ref>` passing. Published declarations and built runtime exports stay unchanged; pass `--allow-added <glob>` (repeatable, e.g. `'**/internal/**'`) to let added entries under that glob pass when their module is `@internal`, and copy its "Added (allowed)" list. A comment-only PR shows `antelopejs-comment-proof <base-ref>` passing instead of a verifier. Both compare committed HEAD.

Copy counts from the proof's base and HEAD table. Never type counts by hand. Keep the command and the committed head beside the copied output. The table counts a lint directive once per rule it names, inline directives included.

Pass `--probe <file.cjs>` to api-diff when changing receivers, positional calls, or modules that no published entry reaches. The same captured script runs against both worktree roots, supplied as `argv[2]`, and prints JSON observations. Matching metadata alone does not prove those behaviours.

An entry-only rule exempts only its own module. Add a second module entry rather than exempting another importer. A no-upward rule must reject peers in the same tier as well as higher tiers. Probe the rank decision with an import, not just a reading of the configuration.

### Suppression budget

`guardrails.suppressions.json` caps the suppressions in authored code: lint directives per rule they name (`*` for none), `@ts-expect-error`, `@ts-ignore` and `SAFETY:` comments. A suppression over its ceiling fails: fix the code, or remove another suppression of the same kind. A rule that keeps needing suppressions should be changed in the preset. Never raise or remove a number in that file: the check fails a ceiling higher than on the pull request base, and only the operator approves a raise. After you remove suppressions, run `pnpm run suppressions:update` and commit the lowered file.

### Debt

`guardrails.ratchet.json` records the lint findings and oversize files this repository already had. Its numbers only go down. After you remove debt, run `pnpm run ratchet:update` and commit the lowered file. A rule listed there is off for `oxlint`. The ratchet counts it instead, and the pre-commit hook rejects it on every line you add.

### What enforces what

| Rule                                                                           | Enforced by                                         |
| ------------------------------------------------------------------------------ | --------------------------------------------------- |
| Formatting                                                                     | oxfmt                                               |
| Lint findings are errors; no rule warns                                        | oxlint preset                                       |
| Comments are TSDoc, directives, or `SAFETY:` only                              | `antelopejs/no-comments`                            |
| Every test asserts                                                             | `antelopejs/require-assertion`                      |
| Tests read no files outside fixtures, helpers, locales                         | `antelopejs/no-fs-read-in-tests`                    |
| No assertion that restates a constant                                          | `antelopejs/no-constant-value-assertion`            |
| No test whose only check is "is a function"                                    | `antelopejs/no-typeof-function-only-test`           |
| Params ≤ 5, function ≤ 120 lines, file ≤ 500 lines, depth ≤ 4, complexity ≤ 20 | `eslint/max-*`, `eslint/complexity`                 |
| Cleanup preserves declarations and built runtime export metadata               | `antelopejs-api-diff <base-ref>`                    |
| Comment-only changes preserve JavaScript emit                                  | `antelopejs-comment-proof <base-ref>`               |
| PR-body counts come from tracked code files                                    | api-diff and comment-proof tables                   |
| Receiver, positional and unpublished-module behaviour                          | `antelopejs-api-diff <base-ref> --probe <file.cjs>` |
| Type suppressions and directive reasons are justified                          | review; no tool                                     |
| No-upward rules reject same-tier peers                                         | review and import probes                            |
| No `@ts-ignore`                                                                | `typescript/ban-ts-comment`                         |
| Files ≤ 20,000 bytes, tests included                                           | `antelopejs-check-size` (pre-commit)                |
| Suppressions stay within `guardrails.suppressions.json`                        | `antelopejs-suppressions` (pre-commit, checks)      |
| Types check                                                                    | `tsc` (pre-push)                                    |
| No dead files, exports, or dependencies                                        | knip                                                |
| Managed files match the pack                                                   | `antelopejs-sync --check`                           |
| Entry-only rules exempt no tracked outsider                                    | `antelopejs-sync --check`                           |
| A test names the wrong implementation it catches                               | review; no tool                                     |
| Existing debt only shrinks                                                     | `antelopejs-ratchet`                                |

<!-- antelopejs-guardrails:end -->
