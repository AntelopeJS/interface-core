# Upgrade notes

Each section is the upgrade-notes block of one release. Paste it into the GitHub release body and under the release's heading in `CHANGELOG.md`. The changelog generator writes only commit subjects.

## v0.4.0

- **`InterfaceToImpl<T>` is exported.** It was already in the published declarations as the private alias that `ImplementInterface` names. A host can now type an implementation by its interface declaration ([#65](https://github.com/AntelopeJS/interface-core/pull/65)).
- **`ImplementInterface` accepts declarations typed with `interface`.** The declaration constraint widens from `T extends Record<string, unknown>` to `T extends object` in both overloads, so a declaration without an index signature can be passed. Every call that compiled before still compiles, and the runtime is unchanged ([#65](https://github.com/AntelopeJS/interface-core/pull/65)).
