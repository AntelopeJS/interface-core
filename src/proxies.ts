import {
  AmbiguousProviderError,
  MissingProviderError,
  ProviderQueueFullError,
} from "./errors";
import {
  captureModuleContext,
  getModuleContext,
  internal,
  invalidateModuleContext,
  type ProxyBrand,
  RUNTIME_PROTOCOL_VERSION,
  runWithCapturedModuleContext,
  runWithModuleContext,
} from "./internal";
import { findResponsibleFile } from "./responsible-module";

type Func<A extends any[] = any[], R = any> = (...args: A) => R;
type RegisterFunction = (id: any, ...args: any[]) => void;
type RID<T> = T extends (id: infer P, ...args: any[]) => void ? P : never;
type RArgs<T> = T extends (id: any, ...args: infer P) => void ? P : never;
type ProxyKind = ProxyBrand["kind"];

const PROXY_BRAND = Symbol.for("@antelopejs/interface-core/proxy");
const DEFAULT_PROVIDER = "@antelopejs/interface-core/default-provider";

interface Attachment<T> {
  callback: T;
  generation: number;
  owner: string;
  provider: string;
}

export interface AttachmentLease {
  generation: number;
  owner: string;
  provider: string;
}

interface AttachmentRoute {
  owner: string;
  provider: string;
}

interface PendingCall<T extends Func, R> {
  args: Parameters<T>;
  provider?: string;
  resolve: (value: R | PromiseLike<R>) => void;
  reject: (reason?: any) => void;
}

interface AsyncProxyState<T extends Func, R> {
  callbacks: Map<string, Attachment<T>>;
  queue: Array<PendingCall<T, R>>;
}

interface RegisterAttachment<T extends Func> extends Attachment<T> {
  manualDetach: boolean;
}

interface RegisterCallbacks<T extends RegisterFunction> {
  provider: string;
  register?: RegisterAttachment<T>;
  unregister?: RegisterAttachment<(id: RID<T>) => void>;
}

interface AttachmentOptions {
  route: AttachmentRoute;
  manualDetach: boolean;
}

interface RegisteredEntry<T extends RegisterFunction> {
  args: RArgs<T>;
  module?: string;
  owner?: string;
  provider?: string;
}

interface RegisteringProxyState<T extends RegisterFunction> {
  callbacks: Map<string, RegisterCallbacks<T>>;
  registered: Map<RID<T>, RegisteredEntry<T>>;
}

interface EventEntry<T extends Func> {
  module?: string;
  owner?: string;
  func: T;
}

interface EventProxyState<T extends Func> {
  registered: EventEntry<T>[];
}

function createIdentity(kind: ProxyKind, identity?: string) {
  if (identity) {
    return `${kind}:${identity}`;
  }
  const nextIdentity = internal.nextProxyIdentity++;
  return `${kind}:anonymous:${nextIdentity}`;
}

function getProxyState<T>(brand: ProxyBrand, create: () => T): T {
  const existing = internal.proxyStates.get(brand.identity);
  if (existing && existing.kind !== brand.kind) {
    throw new Error(`Proxy identity ${brand.identity} has conflicting kinds.`);
  }
  if (existing) {
    return existing.value as T;
  }
  const value = create();
  internal.proxyStates.set(brand.identity, { kind: brand.kind, value });
  return value;
}

function createBrand(kind: ProxyKind, identity?: string): ProxyBrand {
  return Object.freeze({
    protocol: RUNTIME_PROTOCOL_VERSION,
    kind,
    identity: createIdentity(kind, identity),
  });
}

function readBrand(value: unknown): ProxyBrand | undefined {
  if ((typeof value !== "object" && typeof value !== "function") || !value) {
    return;
  }
  const brand = (value as Record<PropertyKey, unknown>)[PROXY_BRAND] as
    | ProxyBrand
    | undefined;
  if (!brand || brand.protocol !== RUNTIME_PROTOCOL_VERSION) {
    return;
  }
  return brand;
}

/** Returns whether a value implements this runtime's stable proxy protocol. */
export function IsInterfaceProxy(value: unknown, kind?: ProxyKind): boolean {
  const brand = readBrand(value);
  return Boolean(brand && (!kind || brand.kind === kind));
}

/** Returns the stable identity used to bind a proxy to a provider route. */
export function GetInterfaceProxyIdentity(value: unknown): string | undefined {
  return readBrand(value)?.identity;
}

function getAttachmentRoute(manualDetach?: boolean) {
  const context = getModuleContext();
  const responsible =
    manualDetach || context?.module ? undefined : GetResponsibleModule();
  const owner =
    context?.owner ?? context?.module ?? responsible ?? DEFAULT_PROVIDER;
  return { owner, provider: context?.provider ?? owner };
}

function getRequestedProvider(proxyIdentity: string) {
  const context = getModuleContext();
  return context?.providerRoutes?.[proxyIdentity] ?? context?.provider;
}

function bindProviderCallback<T extends Func>(callback: T): T {
  const context = captureModuleContext();
  if (!context) {
    return callback;
  }
  return ((...args: Parameters<T>) =>
    runWithCapturedModuleContext(context, () => callback(...args))) as T;
}

interface ExecutionOwnership {
  module?: string;
  owner?: string;
}

function getExecutionOwnership(): ExecutionOwnership {
  const context = getModuleContext();
  if (context) {
    return { module: context.module, owner: context.owner ?? context.module };
  }
  const module = GetResponsibleModule();
  return { module, owner: module };
}

function selectProvider<T>(
  callbacks: Map<string, T>,
  proxyIdentity: string,
  requested?: string,
): T | undefined {
  if (requested) {
    const callback = callbacks.get(requested);
    if (!callback && callbacks.size > 0) {
      throw new MissingProviderError(
        `Interface proxy ${proxyIdentity} has no provider for route ${requested}.`,
      );
    }
    return callback;
  }
  if (callbacks.size <= 1) {
    return callbacks.values().next().value;
  }
  throw new AmbiguousProviderError(proxyIdentity, [...callbacks.keys()]);
}

function reportRuntimeError(
  error: unknown,
  operation: string,
  proxyIdentity: string,
  module?: string,
  registrationId?: unknown,
) {
  internal.runtimeErrorReporter?.(error, {
    operation,
    module,
    proxyIdentity,
    registrationId,
  });
}

function matchesLease(
  attachment: Attachment<unknown> | undefined,
  lease: AttachmentLease,
) {
  return (
    attachment?.generation === lease.generation &&
    attachment.owner === lease.owner
  );
}

/** @internal */
export function InvalidateResponsibleModule(module: string): void {
  invalidateModuleContext(module);
}

/** Runs work with explicit module ownership across asynchronous boundaries. */
export function RunWithResponsibleModule<T>(
  module: string,
  callback: () => T,
): T {
  return runWithModuleContext({ module }, callback);
}

/** Proxy for an asynchronous interface function. */
export class AsyncProxy<T extends Func = Func, R = Awaited<ReturnType<T>>> {
  public readonly [PROXY_BRAND]: ProxyBrand;
  private readonly state: AsyncProxyState<T, R>;

  public constructor(identity?: string) {
    this[PROXY_BRAND] = createBrand("async", identity);
    this.state = getProxyState(this[PROXY_BRAND], () => ({
      callbacks: new Map(),
      queue: [],
    }));
  }

  /** Attaches a provider callback and replays compatible queued calls. */
  public onCall(callback: T, manualDetach?: boolean): AttachmentLease {
    const route = getAttachmentRoute(manualDetach);
    const lease = { ...route, generation: internal.nextLeaseGeneration++ };
    const providerCallback = bindProviderCallback(callback);
    this.state.callbacks.set(route.provider, {
      callback: providerCallback,
      ...lease,
    });
    if (!manualDetach) {
      internal.addAsyncProxy(route.owner, {
        cleanup: () => this.detach(lease),
      });
    }
    this.replayQueue(route.provider, providerCallback);
    return lease;
  }

  /** Detaches one leased provider, or every provider when called without a lease. */
  public detach(lease?: AttachmentLease) {
    if (!lease) {
      this.state.callbacks.clear();
      return;
    }
    const current = this.state.callbacks.get(lease.provider);
    if (
      current?.generation === lease.generation &&
      current.owner === lease.owner
    ) {
      this.state.callbacks.delete(lease.provider);
    }
  }

  /** Calls the provider selected by the current module execution context. */
  public call(...args: Parameters<T>): Promise<R> {
    let requested: string | undefined;
    let attachment: Attachment<T> | undefined;
    try {
      requested = getRequestedProvider(this[PROXY_BRAND].identity);
      attachment = selectProvider(
        this.state.callbacks,
        this[PROXY_BRAND].identity,
        requested,
      );
    } catch (error) {
      return Promise.reject(error);
    }
    if (attachment) {
      return this.invoke(attachment.callback, args);
    }
    if (internal.testStubMode) {
      return Promise.reject(new MissingProviderError());
    }
    if (this.state.queue.length >= internal.maxPendingOperations) {
      return Promise.reject(
        new ProviderQueueFullError(
          this[PROXY_BRAND].identity,
          internal.maxPendingOperations,
        ),
      );
    }
    return new Promise<R>((resolve, reject) => {
      this.state.queue.push({ args, provider: requested, resolve, reject });
    });
  }

  private invoke(callback: T, args: Parameters<T>): Promise<R> {
    try {
      return Promise.resolve(callback(...args));
    } catch (error) {
      return Promise.reject(error);
    }
  }

  private replayQueue(provider: string, callback: T) {
    const remaining: Array<PendingCall<T, R>> = [];
    for (const pending of this.state.queue) {
      if (pending.provider && pending.provider !== provider) {
        remaining.push(pending);
        continue;
      }
      this.invoke(callback, pending.args).then(pending.resolve, pending.reject);
    }
    this.state.queue = remaining;
  }
}

/** Creates an interface function backed by an asynchronous proxy. */
export function InterfaceFunction<
  T extends Func = Func,
  R = Awaited<ReturnType<T>>,
>(identity?: string): (...args: Parameters<T>) => Promise<R> {
  const proxy = new AsyncProxy<T, R>(identity);
  const func = (...args: Parameters<T>) => proxy.call(...args);
  func.proxy = proxy;
  return func;
}

/** Proxy for provider-aware register and unregister handlers. */
export class RegisteringProxy<T extends RegisterFunction = RegisterFunction> {
  public readonly [PROXY_BRAND]: ProxyBrand;
  private readonly state: RegisteringProxyState<T>;

  public constructor(identity?: string) {
    this[PROXY_BRAND] = createBrand("registering", identity);
    this.state = getProxyState(this[PROXY_BRAND], () => ({
      callbacks: new Map(),
      registered: new Map(),
    }));
    internal.registeringProxies.add(this);
  }

  /** Attaches a register callback. */
  public onRegister(callback: T, manualDetach?: boolean): AttachmentLease {
    const route = getAttachmentRoute(manualDetach);
    return this.attachRegister(
      bindProviderCallback(callback),
      route,
      Boolean(manualDetach),
    );
  }

  /** Attaches an unregister callback to the current provider route. */
  public onUnregister(callback: (id: RID<T>) => void): AttachmentLease {
    const context = getModuleContext();
    const requested = context?.provider ?? context?.module;
    const current = selectProvider(
      this.state.callbacks,
      this[PROXY_BRAND].identity,
      requested,
    );
    const contextOwner = context?.owner ?? context?.module;
    const attachments = [current?.unregister, current?.register];
    const sibling = contextOwner
      ? attachments.find((attachment) => attachment?.owner === contextOwner)
      : attachments.find((attachment) => Boolean(attachment));
    const canExtendCurrent = current && sibling;
    const options: AttachmentOptions = canExtendCurrent
      ? {
          route: { owner: sibling.owner, provider: current.provider },
          manualDetach: sibling.manualDetach,
        }
      : { route: getAttachmentRoute(), manualDetach: false };
    return this.attachUnregister(bindProviderCallback(callback), options);
  }

  /** Atomically attaches both registration handlers. */
  public onHandlers(
    register: T,
    unregister: (id: RID<T>) => void,
    manualDetach?: boolean,
  ): AttachmentLease {
    const route = getAttachmentRoute(manualDetach);
    const lease = this.createLease(route);
    const boundRegister = bindProviderCallback(register);
    const boundUnregister = bindProviderCallback(unregister);
    this.state.callbacks.set(route.provider, {
      provider: route.provider,
      register: this.createAttachment(boundRegister, lease, manualDetach),
      unregister: this.createAttachment(boundUnregister, lease, manualDetach),
    });
    this.trackAttachment(lease, Boolean(manualDetach));
    this.replayRegistrations(route.provider, boundRegister);
    return lease;
  }

  /** Detaches one leased provider, or every provider when called without a lease. */
  public detach(lease?: AttachmentLease) {
    if (!lease) {
      this.state.callbacks.clear();
      return;
    }
    const current = this.state.callbacks.get(lease.provider);
    if (!current) {
      return;
    }
    if (matchesLease(current.register, lease)) {
      current.register = undefined;
    }
    if (matchesLease(current.unregister, lease)) {
      current.unregister = undefined;
    }
    if (!current.register && !current.unregister) {
      this.state.callbacks.delete(lease.provider);
    }
  }

  /** Registers an entry with the selected provider or queues it for bootstrap. */
  public register(id: RID<T>, ...args: RArgs<T>) {
    const requested = getRequestedProvider(this[PROXY_BRAND].identity);
    const callback = selectProvider(
      this.state.callbacks,
      this[PROXY_BRAND].identity,
      requested,
    );
    if (!callback && internal.testStubMode) {
      throw new MissingProviderError();
    }
    if (
      !callback &&
      !this.state.registered.has(id) &&
      this.state.registered.size >= internal.maxPendingOperations
    ) {
      throw new ProviderQueueFullError(
        this[PROXY_BRAND].identity,
        internal.maxPendingOperations,
      );
    }
    const ownership = getExecutionOwnership();
    this.state.registered.set(id, {
      ...ownership,
      provider: requested ?? callback?.provider,
      args,
    });
    callback?.register?.callback(id, ...args);
  }

  /** Unregisters an entry from the provider that accepted it. */
  public unregister(id: RID<T>) {
    const entry = this.state.registered.get(id);
    if (!entry) {
      return;
    }
    const callback = selectProvider(
      this.state.callbacks,
      this[PROXY_BRAND].identity,
      entry.provider,
    );
    try {
      callback?.unregister?.callback(id);
    } finally {
      this.state.registered.delete(id);
    }
  }

  /** Unregisters every entry owned by a destroyed module. */
  public unregisterModule(module: string) {
    this.unregisterMatching((entry) => entry.module === module, module);
  }

  /** Unregisters every entry owned by a destroyed module generation. */
  public unregisterOwner(owner: string) {
    this.unregisterMatching((entry) => entry.owner === owner, owner);
  }

  private unregisterMatching(
    matches: (entry: RegisteredEntry<T>) => boolean,
    owner: string,
  ) {
    for (const [id, entry] of this.state.registered) {
      if (!matches(entry)) {
        continue;
      }
      try {
        this.unregister(id);
      } catch (error) {
        reportRuntimeError(
          error,
          "unregister",
          this[PROXY_BRAND].identity,
          owner,
          id,
        );
      } finally {
        this.state.registered.delete(id);
      }
    }
  }

  private attachRegister(
    callback: T,
    route: AttachmentRoute,
    manualDetach: boolean,
  ): AttachmentLease {
    const lease = this.createLease(route);
    const current = this.state.callbacks.get(route.provider);
    this.state.callbacks.set(route.provider, {
      provider: route.provider,
      register: this.createAttachment(callback, lease, manualDetach),
      unregister: current?.unregister,
    });
    this.trackAttachment(lease, manualDetach);
    this.replayRegistrations(route.provider, callback);
    return lease;
  }

  private attachUnregister(
    callback: (id: RID<T>) => void,
    options: AttachmentOptions,
  ): AttachmentLease {
    const { route, manualDetach } = options;
    const lease = this.createLease(route);
    const current = this.state.callbacks.get(route.provider);
    this.state.callbacks.set(route.provider, {
      provider: route.provider,
      register: current?.register,
      unregister: this.createAttachment(callback, lease, manualDetach),
    });
    this.trackAttachment(lease, manualDetach);
    return lease;
  }

  private trackAttachment(lease: AttachmentLease, manualDetach: boolean) {
    if (!manualDetach) {
      internal.addRegisteringProxy(lease.owner, {
        cleanup: () => this.detach(lease),
        unregisterModule: (module: string) => this.unregisterModule(module),
      });
    }
  }

  private createLease(route: AttachmentRoute): AttachmentLease {
    return { ...route, generation: internal.nextLeaseGeneration++ };
  }

  private createAttachment<F extends Func>(
    callback: F,
    lease: AttachmentLease,
    manualDetach?: boolean,
  ): RegisterAttachment<F> {
    return { callback, ...lease, manualDetach: Boolean(manualDetach) };
  }

  private replayRegistrations(provider: string, callback: T) {
    for (const [id, entry] of this.state.registered) {
      if (entry.provider && entry.provider !== provider) {
        continue;
      }
      try {
        callback(id, ...entry.args);
        entry.provider = provider;
      } catch (error) {
        internal.replayErrorReporter?.(id, error);
        reportRuntimeError(
          error,
          "register-replay",
          this[PROXY_BRAND].identity,
          entry.module,
          id,
        );
      }
    }
  }
}

type EventFunction = (...args: any[]) => void;

/** Module-aware event handler collection. */
export class EventProxy<T extends EventFunction = EventFunction> {
  public readonly [PROXY_BRAND]: ProxyBrand;
  private readonly state: EventProxyState<T>;

  public constructor(identity?: string) {
    this[PROXY_BRAND] = createBrand("event", identity);
    this.state = getProxyState(this[PROXY_BRAND], () => ({ registered: [] }));
    internal.knownEvents.add(this);
  }

  /** Emits to every handler, reporting failures without aborting later handlers. */
  public emit(...args: Parameters<T>) {
    for (const { func, module } of this.state.registered) {
      try {
        func(...args);
      } catch (error) {
        reportRuntimeError(
          error,
          "event-emit",
          this[PROXY_BRAND].identity,
          module,
        );
      }
    }
  }

  /** Registers a handler once. */
  public register(func: T) {
    if (this.state.registered.some((existing) => existing.func === func)) {
      return;
    }
    this.state.registered.push({ ...getExecutionOwnership(), func });
  }

  /** Unregisters a handler. */
  public unregister(fn: T) {
    this.state.registered = this.state.registered.filter(
      ({ func }) => func !== fn,
    );
  }

  /** Unregisters handlers owned by a destroyed module. */
  public unregisterModule(module: string) {
    this.state.registered = this.state.registered.filter(
      (entry) => entry.module !== module,
    );
  }

  /** Unregisters handlers owned by a destroyed module generation. */
  public unregisterOwner(owner: string) {
    this.state.registered = this.state.registered.filter(
      (entry) => entry.owner !== owner,
    );
  }
}

function captureCallStack(startFrame = 0): NodeJS.CallSite[] {
  const oldHandler = Error.prepareStackTrace;
  const oldLimit = Error.stackTraceLimit;
  Error.stackTraceLimit = Infinity;
  Error.prepareStackTrace = (_, trace) => trace;
  const error = {} as { stack: string[] };
  Error.captureStackTrace(error, GetResponsibleModule);
  const trace = error.stack as unknown as NodeJS.CallSite[];
  Error.prepareStackTrace = oldHandler;
  Error.stackTraceLimit = oldLimit;
  return trace.slice(startFrame);
}

/** Gets the responsible module from explicit async context or the call stack. */
export function GetResponsibleModule(startFrame = 0): string | undefined {
  const contextModule = getModuleContext()?.module;
  if (contextModule) {
    return contextModule;
  }
  const trace = captureCallStack(startFrame);
  const responsible = findResponsibleFile(trace);
  if (responsible.module) {
    return responsible.module;
  }
  internal.asyncContextReporter?.(trace);
  return responsible.lastInterface;
}
