# Feature map

One file per feature. `covers:` lists the source globs it owns, `docs:` the pages a verdict judges, `journeys:` the journeys it runs, and `seeded-breaks/<feature>.patch` the break its journeys must catch. `pnpm exec antelopejs-verify map` checks that every user-facing file is covered.

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
