import { equal } from "@antelopejs/tooling-configs/verify";
import type { Journey, VerifyConfig } from "@antelopejs/tooling-configs/verify";
import { SCENARIOS } from "./scenarios.ts";

/** Runs the named script of `scenarios.ts` against the built package and compares the JSON it prints with what the scenario expects, read against the docs page the journey names. */
function scenario(name: keyof typeof SCENARIOS, title: string, docs: string): Journey {
  return {
    title,
    entryPoint: `the built package required from a consumer, as ${docs} describes it`,
    async run(context) {
      const { script, expected } = SCENARIOS[name];
      const file = `${context.work}/${name}.cjs`;
      context.edit("write the scenario", file, script);
      const ran = await context.command(`run ${name}`, "node", [file, `${context.repo}/dist`], { timeoutMs: 60_000 });
      context.expect(ran.folder, [
        { name: "the scenario ended cleanly", pass: ran.exitCode === 0, detail: ran.stderr.slice(-300) },
        equal(`the scenario printed what ${docs} promises`, ran.stdout.trim().split("\n").at(-1) ?? "", expected),
      ]);
    },
  };
}

const TYPE_HEADER = `
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;
`;

/** Compiles a consumer file against the built declarations in strict mode; `fails` states the TypeScript error codes the file must raise, none for a file that must compile. */
function compiled(title: string, docs: string, source: (dist: string) => string, fails: string[] = []): Journey {
  return {
    title,
    entryPoint: "a TypeScript consumer compiling against the built declarations",
    async run(context) {
      const file = `${context.work}/probe.ts`;
      context.edit("write the consumer", file, `${TYPE_HEADER}\n${source(`${context.repo}/dist`)}`);
      const tsc = await context.command("compile the consumer", "node", [
        `${context.repo}/node_modules/typescript/bin/tsc`,
        "--noEmit",
        "--strict",
        "--skipLibCheck",
        "--experimentalDecorators",
        "--target",
        "es2022",
        "--module",
        "commonjs",
        "--moduleResolution",
        "node",
        file,
      ]);
      const codes = [...tsc.stdout.matchAll(/error (TS\d+)/g)].map((match) => match[1] ?? "").sort();
      context.expect(tsc.folder, [equal(`the consumer raises ${fails.length === 0 ? "no error" : fails.join(", ")} as ${docs} states`, codes, [...fails].sort())]);
    },
  };
}

const configOk = (dist: string) => `import { defineConfig } from "${dist}/config";
import type { AntelopeConfig, AntelopeModuleConfig, ConfigVars, ConfigVarProvider, ConfigVarValue, ModuleSourceLocal } from "${dist}/config";
const full: AntelopeConfig = {
  name: "p", cacheFolder: ".c",
  modules: { a: "pkg", b: { version: "1", source: { type: "git", remote: "r", branch: "b", commit: "c", installCommand: ["x"] }, config: 1, importOverrides: [{ interface: "i", source: "a", id: "x" }, { interface: "j" }], disabledExports: ["e"], exportPriority: { i: 1 }, disabled: true, optional: true } },
  logging: { enabled: true, moduleTracking: { enabled: true, includes: ["a"], excludes: [] }, channelFilter: { main: 20, db: "WARN" }, formatter: { main: "f" }, dateFormat: "x" },
  envOverrides: { A: ["b"], C: "d" }, environments: { prod: { name: "q" } },
  test: { folder: "t", setup: async () => undefined, cleanup: async () => {} },
};
const rec: AntelopeModuleConfig = { importOverrides: { i: "a" }, source: { type: "local-folder", path: "p", watchDir: ["a", "b"], reloadCommand: "x" } };
const local: ModuleSourceLocal = { type: "local", path: "p", main: "m", watchDir: "s", reloadCommand: ["a"], id: "i", ignoreCache: true };
const dyn = defineConfig(async (ctx) => ({ name: ctx.env }));
type _V = Assert<Same<ConfigVarValue, string | number | boolean>>;
type _C = Assert<Same<ConfigVars, Record<string, ConfigVarValue>>>;
type _P = Assert<Same<ConfigVarProvider<{ a: 1 }>, (config: { a: 1 }) => Promise<ConfigVars | void> | ConfigVars | void>>;
void full; void rec; void local; void dyn;
`;

const configBad = (dist: string) => `import type { AntelopeModuleConfig, ModuleSourceLocal } from "${dist}/config";
import type { ModuleDefinitionSource, ModuleInfo, ModuleDefinition } from "${dist}/modules";
const a: ModuleDefinitionSource = { type: "custom" };
const b: ModuleDefinitionSource = { type: "local", path: "p", watchDir: ["a"], package: "x", version: "1", remote: "r" };
const c: ModuleDefinitionSource = { type: "x", bogus: 1 };
const d: ModuleSourceLocal = { type: "git", path: "p" };
const e: AntelopeModuleConfig = { importOverrides: { i: ["a"] } };
const info: ModuleInfo = { source: { type: "x" }, config: 1, importOverrides: {}, disabledExports: [], status: "unknown", localPath: "p" };
const bad: ModuleInfo["status"] = "running";
void a; void b; void c; void d; void e; void info; void bad;
`;

const implOk = (dist: string) => `import { AsyncProxy, EventProxy, RegisteringProxy, InterfaceFunction, ImplementInterface } from "${dist}/index";
import type { InterfaceToImpl } from "${dist}/index";
interface Decl { sync: AsyncProxy<() => number>; fn: ReturnType<typeof InterfaceFunction<(id: string) => { n: number }>>; ev: EventProxy<() => void>; reg: RegisteringProxy<(id: string, d: number) => void>; nested: { deep: AsyncProxy<() => string> } }
type Impl = InterfaceToImpl<Decl>;
type _Ev = Assert<Same<Impl["ev"], never | undefined>>;
type _Reg = Assert<Same<Impl["reg"], { register: (id: string, d: number) => void; unregister: (id: string) => void } | undefined>>;
type _Sync = Assert<Same<Impl["sync"], (() => number) | undefined>>;
type _Nested = Assert<Same<NonNullable<Impl["nested"]>["deep"], (() => string) | undefined>>;
const decl = {} as Decl;
ImplementInterface(decl, { fn: (id) => ({ n: id.length }), sync: () => 1 });
ImplementInterface(decl, { fn: async (id) => ({ n: id.length }) });
ImplementInterface(decl, {});
const r: { declaration: Decl } = ImplementInterface(decl, { sync: () => 2 });
void r;
`;

const implBad = (dist: string) => `import { AsyncProxy, ImplementInterface } from "${dist}/index";
interface Decl { sync: AsyncProxy<() => number> }
const decl = {} as Decl;
ImplementInterface(decl, { sync: async () => 1 });
`;

const decOk = (dist: string) => `import { MakeClassDecorator, MakeParameterDecorator } from "${dist}/decorators";
import type { ClassDecorator, Class, DecoratorTarget } from "${dist}/decorators";
class Table { rows = 0; }
const Entity = MakeClassDecorator<[string], Class<Table>>((target, name) => { const t: Table = new target(); void t.rows; void name; });
const Inject = MakeParameterDecorator((target: DecoratorTarget, key, index, token: string) => { const c: Function = target.constructor; void c; void key; void index; void token; });
const cd: ClassDecorator<Class<Table>> = (t) => t;
@Entity("x") class A extends Table {}
class B { m(@Inject("db") a: string) { void a; } }
const bare: Class = class {};
void cd; void A; void B; void bare;
`;

const decBad = (dist: string) => `import type { Class, DecoratorTarget } from "${dist}/decorators";
declare const bare: Class;
const inst = new bare();
inst.anything;
declare const target: DecoratorTarget;
new target.constructor();
`;

const config7Ok = (dist: string) => `import type { AntelopeTestConfig, AntelopeConfig, AntelopeLogging, ConfigContext, ImportOverride, ModuleSourcePackage, ModuleSourceGit } from "${dist}/config";
const a: AntelopeTestConfig = { setup: () => ({ name: "x" }) };
const b: AntelopeTestConfig = { setup: async () => ({ name: "x" }) };
const c: AntelopeTestConfig = { setup: () => undefined, cleanup: async () => {}, folder: "t" };
const d: AntelopeTestConfig = { cleanup: () => {} };
const e: ConfigContext = { env: "prod" };
const f: ImportOverride = { interface: "i" };
const g: ModuleSourcePackage = { type: "package", package: "p", version: "1" };
const h: ModuleSourceGit = { type: "git", remote: "r", commit: "c" };
const i: AntelopeLogging = {};
const j: AntelopeConfig = { name: "n", environments: { dev: { logging: { enabled: false } } } };
void a; void b; void c; void d; void e; void f; void g; void h; void i; void j;
`;

const config7Bad = (dist: string) => `import type { AntelopeTestConfig, AntelopeConfig, ModuleSourcePackage, ModuleSourceGit, ModuleSourceLocal, ImportOverride, ConfigVars } from "${dist}/config";
const a: AntelopeTestConfig = { setup: () => 5 };
const b: AntelopeConfig = { modules: {} };
const c: ModuleSourcePackage = { type: "package", package: "p" };
const d: ModuleSourceGit = { type: "git", remote: "r", path: "p" };
const e: ModuleSourceLocal = { type: "local", path: "p", commit: "c" };
const f: ImportOverride = { source: "s" };
const g: ConfigVars = { A: [1] };
const h: AntelopeConfig = { name: "n", envOverrides: { A: 5 } };
void a; void b; void c; void d; void e; void f; void g; void h;
`;

const moduleInfoOk = (dist: string) => `import type { ModuleInfo, ModuleDefinition } from "${dist}/modules";
const full: ModuleInfo = { source: { type: "x" }, config: 1, importOverrides: {}, disabledExports: [], status: "active", localPath: "/p" };
const def: ModuleDefinition = { source: { type: "x" } };
const states: ModuleInfo["status"][] = ["loaded", "constructed", "active", "unknown"];
void states; void full; void def;
`;

const moduleInfoBad = (dist: string) => `import type { ModuleInfo } from "${dist}/modules";
const noConfig: ModuleInfo = { source: { type: "x" }, importOverrides: {}, disabledExports: [], status: "active", localPath: "/p" };
const noOverrides: ModuleInfo = { source: { type: "x" }, config: 1, disabledExports: [], status: "active", localPath: "/p" };
const noExports: ModuleInfo = { source: { type: "x" }, config: 1, importOverrides: {}, status: "active", localPath: "/p" };
const noPath: ModuleInfo = { source: { type: "x" }, config: 1, importOverrides: {}, disabledExports: [], status: "active" };
const noStatus: ModuleInfo = { source: { type: "x" }, config: 1, importOverrides: {}, disabledExports: [], localPath: "/p" };
void noConfig; void noOverrides; void noExports; void noPath; void noStatus;
`;

const proxyTypesOk = (dist: string) => `import type { AttachmentLease } from "${dist}/proxies";
import { AsyncProxy } from "${dist}/index";
const lease: AttachmentLease = { owner: "o", generation: 1 };
const issued: AttachmentLease = new AsyncProxy<() => void>().onCall(() => {});
void lease; void issued;
`;

const proxyTypesBad = (dist: string) => `import { IsInterfaceProxy } from "${dist}/index";
import type { AttachmentLease } from "${dist}/index";
declare const x: unknown;
declare const lease: AttachmentLease;
if (IsInterfaceProxy(x)) {
  x.anything;
}
void lease;
`;

const runtimeTypesOk = (dist: string) => `import type { DevServerRegistry, DevServerEntry, DevServerEndpoint, RuntimeInfo } from "${dist}/runtime";
const endpoint: DevServerEndpoint = { protocol: "http", host: "localhost", port: 5011 };
const entry: DevServerEntry = { endpoints: [endpoint] };
const registry: DevServerRegistry = { pid: 1, startedAt: "2026-06-12T10:00:00Z", servers: { api: entry } };
const info: RuntimeInfo = { dev: true, projectPath: "/p", env: "default" };
void registry; void info;
`;

const runtimeTypesBad = (dist: string) => `import type { DevServerRegistry, DevServerEndpoint, RuntimeInfo } from "${dist}/runtime";
const noPid: DevServerRegistry = { startedAt: "x", servers: {} };
const portText: DevServerEndpoint = { protocol: "http", host: "h", port: "5011" };
const noEnv: RuntimeInfo = { dev: true, projectPath: "/p" };
const noProjectPath: RuntimeInfo = { dev: true, env: "default" };
const noDev: RuntimeInfo = { projectPath: "/p", env: "default" };
void noPid; void portText; void noEnv; void noProjectPath; void noDev;
`;

const config: VerifyConfig = {
  doors: {
    data: null,
    format: null,
    contract: {
      globs: ["src/**", "package.json"],
      funnels: [],
      containments: [],
      why: "the proxies, ImplementInterface, error codes, subpaths and runtime protocol are what every interface and the core load; src/internal.ts also carries the cross-copy protocol version",
    },
    outbound: null,
    exposure: null,
    publish: {
      globs: ["package.json", ".release-it.json", "changelogen.config.json", ".github/workflows/release.yml"],
      funnels: [],
      containments: [],
      why: "the package name and release workflow claim @antelopejs/interface-core on npm",
    },
  },
  journeys: {
    "proxy-lifecycle": scenario("proxy-lifecycle", "proxies queue, attach, detach by lease, emit and replay as docs/2.proxies.md states", "docs/2.proxies.md"),
    "proxy-details": scenario("proxy-details", "detach forms, sibling callbacks, event context, re-registration, identities and owner cleanup behave as docs/2.proxies.md states", "docs/2.proxies.md"),
    "ownership-details": scenario("ownership-details", "generations, destroyed contexts and forwarded registrations behave as docs/2.proxies.md and docs/5.modules.md state", "docs/2.proxies.md"),
    "metadata-details": scenario("metadata-details", "GetMetadata walks the whole chain, hands the target to the constructor and ignores a later inherit flag as docs/4.metadata.md states", "docs/4.metadata.md"),
    "surface-details": scenario("surface-details", "combined decorator factories, nested validation, log references, rejected provider throws, replaced callbacks, emit continuing and event arity behave as docs/2, 3, 5, 6 and the README state", "docs/3.decorators.md"),
    "config-test-types": compiled("AntelopeTestConfig, ImportOverride and the source kinds accept the documented shapes", "docs/7.configuration.md", config7Ok),
    "config-reject-types": compiled("the configuration types refuse what docs/7.configuration.md refuses", "docs/7.configuration.md", config7Bad, ["TS2322", "TS2322", "TS2322", "TS2353", "TS2353", "TS2741", "TS2741", "TS2741"]),
    "module-info-types": compiled("ModuleInfo and ModuleDefinition accept the documented shapes", "docs/5.modules.md", moduleInfoOk),
    "module-info-reject": compiled("ModuleInfo requires every ModuleDefinition field, status and localPath", "docs/5.modules.md", moduleInfoBad, ["TS2322", "TS2322", "TS2322", "TS2322", "TS2322"]),
    "rule-details": scenario("round4-details", "re-registration, queue and replay order, onUnregister sibling choice, callback contexts, a second copy of the package and subpath identity behave as docs/2.proxies.md states", "docs/2.proxies.md"),
    "proxy-types": compiled("AttachmentLease imports from the proxies subpath and onCall returns one", "docs/2.proxies.md", proxyTypesOk),
    "proxy-types-reject": compiled("IsInterfaceProxy does not narrow and the root does not re-export AttachmentLease", "docs/2.proxies.md", proxyTypesBad, ["TS18046", "TS2305"]),
    "runtime-types": compiled("the dev registry types accept the documented shapes", "docs/8.runtime.md", runtimeTypesOk),
    "runtime-types-reject": compiled("the dev registry types refuse a missing pid, a text port and a missing env, projectPath or dev", "docs/8.runtime.md", runtimeTypesBad, ["TS2322", "TS2741", "TS2741", "TS2741", "TS2741"]),
    "tsdoc-details": scenario("tsdoc-details", "validation before attaching, the real descriptor for method decorators, listener cleanup, queueing after a provider is destroyed and the returned objects behave as the TSDoc and docs/1, 3, 6 state", "the TSDoc of src/ and docs/3.decorators.md"),
    "implement-interface": scenario("implement", "ImplementInterface validates first, attaches all or none, and the lookups answer as docs/2.proxies.md states", "docs/2.proxies.md"),
    "implement-types": compiled("InterfaceToImpl types each member as docs/2.proxies.md states", "docs/2.proxies.md", implOk),
    "implement-types-reject": compiled("a synchronous proxy takes no async implementation", "docs/2.proxies.md", implBad, ["TS2769"]),
    metadata: scenario("metadata", "GetMetadata creates once, inherits through the prototype chain and honours inherit=false", "docs/4.metadata.md"),
    "error-contract": scenario("errors", "the error classes, codes and isMissingProviderError answer as docs/2.proxies.md states", "docs/2.proxies.md"),
    "decorator-factories": scenario("decorators", "the decorator factories hand the documented arguments to their handler", "docs/3.decorators.md"),
    "decorator-types": compiled("the decorator types compile as docs/3.decorators.md states", "docs/3.decorators.md", decOk),
    "decorator-types-reject": compiled("a bare Class promises no members and a DecoratorTarget constructor is not constructable", "docs/3.decorators.md", decBad, ["TS2339", "TS2351"]),
    "module-lifecycle": scenario("modules", "lifecycle events, ownership cleanup and the module context behave as docs/5.modules.md states", "docs/5.modules.md"),
    "module-types": compiled("ModuleDefinitionSource, ModuleInfo and the import override shapes reject what docs/5.modules.md rejects", "docs/5.modules.md", configBad, ["TS2322", "TS2322", "TS2322", "TS2353"]),
    logging: scenario("logging", "levels, channels, Write and the log listener behave as docs/6.logging.md states", "docs/6.logging.md"),
    "define-config": scenario("config", "defineConfig returns its input unchanged", "docs/7.configuration.md"),
    "config-types": compiled("the configuration types accept the documented shapes", "docs/7.configuration.md", configOk),
    runtime: scenario("runtime", "the runtime functions, the registry path and the root re-exports behave as docs/8.runtime.md states", "docs/8.runtime.md"),
    exports: scenario("exports", "every subpath exports what the docs list", "README.md"),
  },
  formal: [
    {
      name: "formal-implement-interface",
      covers: ["src/index.ts", "src/proxies.ts", "src/internal.ts", "src/modules.ts"],
      files: [".agents/skills/formal-implement-interface/**", "src/tests/implement-interface-atomicity.test.ts"],
      command: ["sh", "-c", "pnpm run build && pnpm exec mocha dist/tests/implement-interface-atomicity.test.js"],
      violation: null,
      passing: null,
      behaviour: { kind: "emit" },
    },
  ],
};

export default config;
