# @antelopejs/interface-core

<div align="center">
<a href="https://www.npmjs.com/package/@antelopejs/interface-core"><img alt="npm" src="https://img.shields.io/npm/v/@antelopejs/interface-core?style=for-the-badge&labelColor=000000&color=000000"></a>
<a href="./LICENSE"><img alt="License" src="https://img.shields.io/npm/l/@antelopejs/interface-core?style=for-the-badge&labelColor=000000&color=000000"></a>
<a href="https://discord.gg/sjK28QHrA7"><img alt="Discord" src="https://img.shields.io/badge/Discord-18181B?logo=discord&style=for-the-badge&color=000000"></a>
<a href="https://interfaces.antelopejs.com/docs/core"><img alt="Docs" src="https://img.shields.io/badge/Docs-18181B?style=for-the-badge&color=000000"></a>
</div>

The primitives every AntelopeJS interface is built from: proxies that cross module boundaries, decorator factories, module lifecycle events, structured logging and project configuration.

## What it offers

- `InterfaceFunction` declares a contract function; `ImplementInterface` attaches a module's implementation to it. Calls made before the implementation attaches wait in a queue.
- `AsyncProxy`, `EventProxy` and `RegisteringProxy` carry calls, events and registrations between modules, and detach when a module unloads.
- `@antelopejs/interface-core/decorators` builds typed class, method, property and parameter decorators.
- `@antelopejs/interface-core/modules` exposes lifecycle events and module management functions.
- `@antelopejs/interface-core/logging` writes structured logs on named channels; `@antelopejs/interface-core/config` provides `defineConfig` for `antelope.config.ts`.

## Implementations

| Module                                                         | Notes                                                         |
| -------------------------------------------------------------- | ------------------------------------------------------------- |
| [`@antelopejs/core`](https://github.com/AntelopeJS/antelopejs) | The AntelopeJS runtime and `ajs` CLI implement this interface |

## Install

Add the package to any module that declares or implements an interface:

```bash
pnpm add @antelopejs/interface-core
```

No extra module is needed: the core provides the implementation.

## Quick start

Declare a contract:

```ts
// src/interface/index.ts
import { InterfaceFunction } from "@antelopejs/interface-core";

export const GetGreeting = InterfaceFunction<(name: string) => string>();
```

Implement it and call it from a module:

```ts
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

- [Introduction](https://interfaces.antelopejs.com/docs/core/introduction)
- [Proxies](https://interfaces.antelopejs.com/docs/core/proxies)
- [Decorators](https://interfaces.antelopejs.com/docs/core/decorators)
- [Metadata](https://interfaces.antelopejs.com/docs/core/metadata)
- [Modules](https://interfaces.antelopejs.com/docs/core/modules)
- [Logging](https://interfaces.antelopejs.com/docs/core/logging)
- [Configuration](https://interfaces.antelopejs.com/docs/core/configuration)
- [Runtime](https://interfaces.antelopejs.com/docs/core/runtime)

## Compatibility

`@antelopejs/core` implements this package. Use the line your core version declares:

| `@antelopejs/core`   | `@antelopejs/interface-core` |
| -------------------- | ---------------------------- |
| `1.12.x` to `1.13.x` | `0.1.x`                      |
| `1.14.x` to `1.15.1` | `0.2.x`                      |
| `1.15.2`             | `>=0.2.3 <0.3.0`             |

## Contributing

Read [CONTRIBUTING.md](./CONTRIBUTING.md) before you open a pull request. The local checks are:

```bash
pnpm install
pnpm lint
pnpm test
```

## License

[Apache-2.0](./LICENSE)
