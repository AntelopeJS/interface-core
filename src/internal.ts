import { AsyncLocalStorage } from "node:async_hooks";
import { ModuleContextInvalidatedError } from "./errors";

export const RUNTIME_PROTOCOL_VERSION = 3;
export const RUNTIME_SYMBOL = Symbol.for("@antelopejs/interface-core/runtime");

/** Provider connection metadata visible to an interface consumer. */
export interface InterfaceConnection {
  /** Optional connection alias. */
  id?: string;
  /** Resolved interface package path. */
  path: string;
  /** Module ID of the provider represented by this connection. */
  provider: string;
  /** Whether this provider is selected for unqualified interface calls. */
  selected: boolean;
}

/** Module identity and provider routes propagated through asynchronous work. */
export interface ModuleExecutionContext {
  /** Stable module ID used by existing lifecycle and attribution APIs. */
  module: string;
  /** Unique lifecycle generation ID. Defaults to the module ID when omitted. */
  owner?: string;
  /** Provider ID used when attaching implementations. */
  provider?: string;
  /** Provider selections keyed by stable interface proxy identity. */
  providerRoutes?: Readonly<Record<string, string>>;
}

interface ActiveModuleExecutionContext extends ModuleExecutionContext {
  owner: string;
  ownershipToken: symbol;
}

export interface ProxyBrand {
  protocol: number;
  kind: "async" | "registering" | "event";
  identity: string;
}

export interface RuntimeProxyState {
  kind: ProxyBrand["kind"];
  value: unknown;
}

export interface RuntimeCleanup {
  cleanup(): void;
  unregisterModule?(module: string): void;
}

export interface RuntimeErrorDetails {
  operation: string;
  module?: string;
  proxyIdentity?: string;
  registrationId?: unknown;
}

export interface InterfaceRuntime {
  protocol: number;
  moduleByFolder: Array<{
    dir: string;
    id: string;
    isImplementor?: boolean;
  }>;
  testStubMode: boolean;
  knownAsync: Map<string, Set<RuntimeCleanup | { detach(): void }>>;
  knownRegisters: Map<string, Set<RuntimeCleanup | { detach(): void }>>;
  registeringProxies: Set<{
    unregisterModule(module: string): void;
    unregisterOwner(owner: string): void;
  }>;
  knownEvents: Set<{
    unregisterModule(module: string): void;
    unregisterOwner(owner: string): void;
  }>;
  interfaceConnections: Record<string, Record<string, InterfaceConnection[]>>;
  executionContext: AsyncLocalStorage<ActiveModuleExecutionContext>;
  activeOwnerTokens: Map<string, symbol>;
  moduleOwners: Map<string, Set<string>>;
  proxyStates: Map<string, RuntimeProxyState>;
  nextProxyIdentity: number;
  nextLeaseGeneration: number;
  maxPendingOperations: number;
  asyncContextReporter?: (trace: NodeJS.CallSite[]) => void;
  runtimeErrorReporter?: (error: unknown, details: RuntimeErrorDetails) => void;
  replayErrorReporter?: (id: unknown, error: unknown) => void;
  addAsyncProxy(
    module: string,
    proxy: RuntimeCleanup | { detach(): void },
  ): void;
  addRegisteringProxy(
    module: string,
    proxy: RuntimeCleanup | { detach(): void },
  ): void;
}

function addToMapSet<T>(map: Map<string, Set<T>>, key: string, value: T) {
  const values = map.get(key) ?? new Set<T>();
  values.add(value);
  map.set(key, values);
}

function createRuntime(): InterfaceRuntime {
  const runtime: InterfaceRuntime = {
    protocol: RUNTIME_PROTOCOL_VERSION,
    moduleByFolder: [],
    testStubMode: false,
    knownAsync: new Map(),
    knownRegisters: new Map(),
    registeringProxies: new Set(),
    knownEvents: new Set(),
    interfaceConnections: Object.create(null) as Record<
      string,
      Record<string, InterfaceConnection[]>
    >,
    executionContext: new AsyncLocalStorage<ActiveModuleExecutionContext>(),
    activeOwnerTokens: new Map(),
    moduleOwners: new Map(),
    proxyStates: new Map(),
    nextProxyIdentity: 1,
    nextLeaseGeneration: 1,
    maxPendingOperations: 1_000,
    addAsyncProxy(module, proxy) {
      addToMapSet(runtime.knownAsync, module, proxy);
    },
    addRegisteringProxy(module, proxy) {
      addToMapSet(runtime.knownRegisters, module, proxy);
    },
  };
  return runtime;
}

function getRuntime(): InterfaceRuntime {
  const globals = globalThis as Record<PropertyKey, unknown>;
  const existing = globals[RUNTIME_SYMBOL] as InterfaceRuntime | undefined;
  if (existing && existing.protocol !== RUNTIME_PROTOCOL_VERSION) {
    throw new Error(
      `Incompatible @antelopejs/interface-core runtime protocol: expected ${RUNTIME_PROTOCOL_VERSION}, received ${existing.protocol}`,
    );
  }
  if (existing) {
    existing.moduleOwners ??= new Map();
    return existing;
  }
  const runtime = createRuntime();
  Object.defineProperty(globals, RUNTIME_SYMBOL, {
    configurable: false,
    enumerable: false,
    writable: false,
    value: runtime,
  });
  return runtime;
}

/** @internal */
export const internal = getRuntime();

function getOwnerToken(owner: string): symbol {
  const activeToken = internal.activeOwnerTokens.get(owner);
  if (activeToken) {
    return activeToken;
  }
  const token = Symbol(owner);
  internal.activeOwnerTokens.set(owner, token);
  return token;
}

function trackModuleOwner(module: string, owner: string) {
  addToMapSet(internal.moduleOwners, module, owner);
}

function assertActiveModuleContext(context: ActiveModuleExecutionContext) {
  if (
    internal.activeOwnerTokens.get(context.owner) !== context.ownershipToken
  ) {
    throw new ModuleContextInvalidatedError(context.module);
  }
}

export function runWithModuleContext<T>(
  context: ModuleExecutionContext,
  callback: () => T,
): T {
  const inheritedContext = internal.executionContext.getStore();
  if (inheritedContext) {
    assertActiveModuleContext(inheritedContext);
  }
  if (!context.module) {
    throw new Error("Module execution context requires a module ID.");
  }
  const owner = context.owner ?? context.module;
  trackModuleOwner(context.module, owner);
  const activeContext = {
    ...context,
    owner,
    ownershipToken: getOwnerToken(owner),
  };
  return internal.executionContext.run(activeContext, callback);
}

export function captureModuleContext():
  | ActiveModuleExecutionContext
  | undefined {
  const context = internal.executionContext.getStore();
  if (context) {
    assertActiveModuleContext(context);
    trackModuleOwner(context.module, context.owner);
  }
  return context;
}

export function runWithCapturedModuleContext<T>(
  context: ActiveModuleExecutionContext,
  callback: () => T,
): T {
  assertActiveModuleContext(context);
  return internal.executionContext.run(context, callback);
}

export function peekModuleContext(): ModuleExecutionContext | undefined {
  return internal.executionContext.getStore();
}

export function getModuleContext(): ModuleExecutionContext | undefined {
  return captureModuleContext();
}

function removeOwnerFromModules(owner: string) {
  for (const [module, owners] of internal.moduleOwners) {
    owners.delete(owner);
    if (!owners.size) {
      internal.moduleOwners.delete(module);
    }
  }
}

export function getModuleOwners(module: string): ReadonlySet<string> {
  return internal.moduleOwners.get(module) ?? new Set();
}

export function invalidateModuleContext(owner: string) {
  internal.activeOwnerTokens.delete(owner);
  removeOwnerFromModules(owner);
}
