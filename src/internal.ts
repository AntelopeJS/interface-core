import { AsyncLocalStorage } from "node:async_hooks";
import { ModuleContextInvalidatedError } from "./errors";

export const RUNTIME_PROTOCOL_VERSION = 2;
export const RUNTIME_SYMBOL = Symbol.for("@antelopejs/interface-core/runtime");

export interface InterfaceConnection {
  id?: string;
  path: string;
}

export interface ModuleExecutionContext {
  module: string;
  provider?: string;
  providerRoutes?: Readonly<Record<string, string>>;
}

interface ActiveModuleExecutionContext extends ModuleExecutionContext {
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
  registeringProxies: Set<{ unregisterModule(module: string): void }>;
  knownEvents: Set<{ unregisterModule(module: string): void }>;
  interfaceConnections: Record<string, Record<string, InterfaceConnection[]>>;
  executionContext: AsyncLocalStorage<ActiveModuleExecutionContext>;
  activeModuleTokens: Map<string, symbol>;
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
    activeModuleTokens: new Map(),
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

function getModuleToken(module: string): symbol {
  const activeToken = internal.activeModuleTokens.get(module);
  if (activeToken) {
    return activeToken;
  }
  const token = Symbol(module);
  internal.activeModuleTokens.set(module, token);
  return token;
}

function assertActiveModuleContext(context: ActiveModuleExecutionContext) {
  if (
    internal.activeModuleTokens.get(context.module) !== context.ownershipToken
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
  const activeContext = {
    ...context,
    ownershipToken: getModuleToken(context.module),
  };
  return internal.executionContext.run(activeContext, callback);
}

export function getModuleContext(): ModuleExecutionContext | undefined {
  const context = internal.executionContext.getStore();
  if (context) {
    assertActiveModuleContext(context);
  }
  return context;
}

export function invalidateModuleContext(module: string) {
  internal.activeModuleTokens.delete(module);
}
