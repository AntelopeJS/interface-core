# Interface Core

<div align="center">
<a href="https://www.npmjs.com/package/@antelopejs/interface-core"><img src="https://img.shields.io/npm/v/@antelopejs/interface-core?style=for-the-badge&labelColor=000000&color=000000" alt="npm"></a>
<a href="./LICENSE"><img alt="License" src="https://img.shields.io/badge/License-Apache_2.0-blue.svg?style=for-the-badge&labelColor=000000"></a>
<a href="https://discord.gg/sjK28QHrA7"><img src="https://img.shields.io/badge/Discord-18181B?logo=discord&style=for-the-badge&color=000000" alt="Discord"></a>
<a href="./docs/1.introduction.md"><img src="https://img.shields.io/badge/Docs-18181B?style=for-the-badge&color=000000" alt="Documentation"></a>
</div>

The foundational primitives for building AntelopeJS interfaces. This package provides proxy classes, decorator factories, metadata utilities, module lifecycle events, configuration types, and a structured logging system. It enables type-safe, module-aware communication between decoupled components with automatic cleanup on module unload.

## Installation

```bash
npm install @antelopejs/interface-core
```

## Documentation

Detailed documentation is available in the `docs` directory:

- [Introduction](./docs/1.introduction.md) - Overview and core concepts
- [Proxies](./docs/2.proxies.md) - `AsyncProxy`, `EventProxy`, `RegisteringProxy`, and `InterfaceFunction`
- [Decorators](./docs/3.decorators.md) - Decorator factory utilities for classes, properties, methods, and parameters
- [Metadata](./docs/4.metadata.md) - Reflection-based metadata with `GetMetadata`
- [Modules](./docs/5.modules.md) - Module lifecycle events and management functions
- [Logging](./docs/6.logging.md) - Structured logging system with channels and severity levels
- [Configuration](./docs/7.configuration.md) - Configuration types and `defineConfig`

## License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.
