# Feature map

One file per feature. `covers:` lists the source globs it owns, `docs:` the pages a verdict judges, and `journeys:` the journeys it runs. `pnpm exec antelopejs-verify map` checks that every user-facing file is covered.

| Feature | What the user does | Journeys |
|---|---|---|
| [proxies](proxies.md) | Declares calls, events and registrations between modules. | proxy-lifecycle |
| [implement](implement.md) | Attaches a provider to an interface declaration. | implement-interface, implement-types, implement-types-reject |
| [metadata](metadata.md) | Reads inherited metadata of a class. | metadata |
| [errors](errors.md) | Detects a missing provider by its stable code. | error-contract |
| [decorators](decorators.md) | Builds typed decorator factories. | decorator-factories, decorator-types, decorator-types-reject |
| [modules](modules.md) | Observes the lifecycle and the module context. | module-lifecycle, module-types |
| [logging](logging.md) | Writes structured logs and listens to them. | logging |
| [config](config.md) | Types a project configuration. | define-config, config-types |
| [runtime](runtime.md) | Reads the runtime mode and registers dev servers. | runtime |
| [smoke](smoke.md) | The fixed journeys every verdict runs. | exports, proxy-lifecycle, implement-interface |

The synced `SKILL.md` says the smoke feature runs `every-function`. Here it does not: smoke runs `exports`, `proxy-lifecycle` and `implement-interface`, because this package declares no interface functions to walk (see the Gotchas of [smoke](smoke.md)). The synced text is pack-owned and `sync` rewrites it, so this note is the repository-owned correction.
