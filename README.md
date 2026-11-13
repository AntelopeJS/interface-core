<a href="https://github.com/AntelopeJS/antelopejs"><img data-illustration src="./.github/readme/strip.svg" width="100%" alt="INTERFACE · CORE: part of AntelopeJS, hexagonal architecture beyond your own code. A glowing button reads Star AntelopeJS."></a>

<div align="center">

# `@antelopejs/interface-core`

<a href="https://www.npmjs.com/package/@antelopejs/interface-core"><img data-illustration alt="npm" src="https://img.shields.io/npm/v/@antelopejs/interface-core?style=for-the-badge&labelColor=000000&color=000000"></a> <a href="./LICENSE"><img data-illustration alt="License" src="https://img.shields.io/npm/l/@antelopejs/interface-core?style=for-the-badge&labelColor=000000&color=000000"></a> <a href="https://discord.gg/g4pFt6eXqu"><img data-illustration alt="Discord" src="https://img.shields.io/badge/Discord-18181B?logo=discord&style=for-the-badge&color=000000"></a> <a href="https://interfaces.antelopejs.com/docs/core"><img data-illustration alt="Docs" src="https://img.shields.io/badge/Docs-18181B?style=for-the-badge&color=000000"></a> <a href="https://github.com/AntelopeJS/antelopejs"><img data-illustration alt="Star AntelopeJS" src="https://img.shields.io/github/stars/AntelopeJS/antelopejs?label=Star%20AntelopeJS&style=for-the-badge&labelColor=000000&color=000000&logo=github"></a>

**The primitives every AntelopeJS interface is built from, including proxies, decorators, module lifecycle events, logging and configuration.**

[Documentation](https://interfaces.antelopejs.com/docs/core) · [Implementations](#implementations) · [All interfaces and providers](https://github.com/AntelopeJS/antelopejs#ecosystem)

</div>

This package holds the primitives every AntelopeJS interface is built from. It provides proxies that cross module boundaries, decorator factories, module lifecycle events, structured logging, and project configuration.

## What it offers

- `InterfaceFunction` declares a contract function. `ImplementInterface` attaches a module's implementation to it, typed by `InterfaceToImpl`. Calls made before the implementation attaches wait in a queue.
- `AsyncProxy`, `EventProxy` and `RegisteringProxy` carry calls, events and registrations between modules, and detach when a module unloads.
- `@antelopejs/interface-core/decorators` builds typed class, method, property and parameter decorators.
- `@antelopejs/interface-core/modules` exposes lifecycle events and module management functions.
- `@antelopejs/interface-core/logging` writes structured logs on named channels.
- `@antelopejs/interface-core/config` provides `defineConfig` for `antelope.config.ts`.

## Implementations

| Module                                                         | Notes                                                         |
| -------------------------------------------------------------- | ------------------------------------------------------------- |
| [`@antelopejs/core`](https://github.com/AntelopeJS/antelopejs) | The AntelopeJS runtime and `ajs` CLI implement this interface |

## Install

Add the package to every module that declares or implements an interface:

```bash
pnpm add @antelopejs/interface-core
```

You need no extra module, because `@antelopejs/core` provides the implementation.

## Quick start

Declare a contract:

```ts
// src/interface/index.ts
import { InterfaceFunction } from "@antelopejs/interface-core";

export const GetGreeting = InterfaceFunction<(name: string) => string>();
```

Implement it and call it from a module:

```ts fragment
// src/index.ts
import { ImplementInterface } from "@antelopejs/interface-core";
import { Logging } from "@antelopejs/interface-core/logging";
import * as Greeting from "./interface";

export function construct() {
  ImplementInterface(Greeting, {
    GetGreeting: (name: string) => `Hello, ${name}`,
  });
}

export async function start() {
  Logging.Info(await Greeting.GetGreeting("Ada"));
}
```

An interface function always returns a promise, even when the implementation is synchronous.

## Documentation

- [Introduction](./docs/1.introduction.md)
- [Proxies, attachment leases and errors](./docs/2.proxies.md)
- [Decorators](./docs/3.decorators.md)
- [Metadata](./docs/4.metadata.md)
- [Modules](./docs/5.modules.md)
- [Logging](./docs/6.logging.md)
- [Configuration](./docs/7.configuration.md)
- [Runtime](./docs/8.runtime.md)

## Compatibility

`@antelopejs/core` implements this package. Each core release declares the `@antelopejs/interface-core` range it works with in the `dependencies` of its `package.json`.

## Contributing

Read [CONTRIBUTING.md](./CONTRIBUTING.md) before you open a pull request. The local checks are:

```bash
pnpm install
pnpm lint
pnpm test
```

## Part of AntelopeJS

[AntelopeJS](https://github.com/AntelopeJS/antelopejs) is a TypeScript framework where modules depend on contracts and the application chooses the provider that implements each one, and the open-source back office [AntelopeJS DMS](https://github.com/AntelopeJS/dms) is built on it.

<!-- antelopejs-framework-modules:start -->

| Area         | Contracts                                                                                                                                                                                                                                                                                                                                                                                                                  | Providers                                                                                                                                                                                                                                           |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API          | [`interface-api`](https://github.com/AntelopeJS/interface-api) · [`interface-api-util`](https://github.com/AntelopeJS/interface-api-util) · [`interface-data-api`](https://github.com/AntelopeJS/interface-data-api)                                                                                                                                                                                                       | [`api`](https://github.com/AntelopeJS/api)                                                                                                                                                                                                          |
| Auth         | [`interface-auth`](https://github.com/AntelopeJS/interface-auth)                                                                                                                                                                                                                                                                                                                                                           | [`auth-jwt`](https://github.com/AntelopeJS/auth-jwt)                                                                                                                                                                                                |
| Database     | [`interface-database`](https://github.com/AntelopeJS/interface-database) · [`interface-database-decorators`](https://github.com/AntelopeJS/interface-database-decorators) · [`interface-database-catalog`](https://github.com/AntelopeJS/interface-database-catalog) · [`interface-mongodb`](https://github.com/AntelopeJS/interface-mongodb) · [`interface-rethinkdb`](https://github.com/AntelopeJS/interface-rethinkdb) | [`postgres`](https://github.com/AntelopeJS/postgres) · [`mysql`](https://github.com/AntelopeJS/mysql) · [`mongodb`](https://github.com/AntelopeJS/mongodb) · [`rethinkdb`](https://github.com/AntelopeJS/rethinkdb)                                 |
| Redis        | [`interface-redis`](https://github.com/AntelopeJS/interface-redis) · [`interface-redis-scheduler`](https://github.com/AntelopeJS/interface-redis-scheduler)                                                                                                                                                                                                                                                                | [`redis`](https://github.com/AntelopeJS/redis)                                                                                                                                                                                                      |
| Email        | [`interface-email`](https://github.com/AntelopeJS/interface-email)                                                                                                                                                                                                                                                                                                                                                         | [`nodemailer`](https://github.com/AntelopeJS/nodemailer) · [`brevo`](https://github.com/AntelopeJS/brevo)                                                                                                                                           |
| File storage | [`interface-file-storage`](https://github.com/AntelopeJS/interface-file-storage)                                                                                                                                                                                                                                                                                                                                           | [`file-storage-local`](https://github.com/AntelopeJS/file-storage-local) · [`file-storage-s3`](https://github.com/AntelopeJS/file-storage-s3)                                                                                                       |
| Payments     | [`interface-payment`](https://github.com/AntelopeJS/interface-payment) · [`interface-subscriptions`](https://github.com/AntelopeJS/interface-subscriptions) · [`interface-stripe`](https://github.com/AntelopeJS/interface-stripe)                                                                                                                                                                                         | [`stripe`](https://github.com/AntelopeJS/stripe) · [`mollie`](https://github.com/AntelopeJS/mollie) · [`checkout-com`](https://github.com/AntelopeJS/checkout-com) · [`payment-subscriptions`](https://github.com/AntelopeJS/payment-subscriptions) |

<!-- antelopejs-framework-modules:end -->

## License

[Apache-2.0](./LICENSE)
