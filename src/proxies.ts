import { findResponsibleFile } from "./responsible-module";
import { bindCallerArguments, bindCallerFunction } from "./caller-binding";
import { MissingProviderError, ProviderQueueFullError } from "./errors";
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

type Func<A extends any[] = any[], R = any> = (...args: A) => R;
type RegisterFunction = (id: any, ...args: any[]) => void;
type RID<T> = T extends (id: infer P, ...args: any[]) => void ? P : never;
type RArgs<T> = T extends (id: any, ...args: infer P) => void ? P : never;
type ProxyKind = ProxyBrand["kind"];

const PROXY_BRAND = Symbol.for("@antelopejs/interface-core/proxy");
const DEFAULT_OWNER = "@antelopejs/interface-core/default-provider";

/** The handle of one provider attachment, used to detach exactly that attachment. */
export interface AttachmentLease {
  generation: number;
  owner: string;
}

interface Attachment<T> extends AttachmentLease {
  callback: T;
}

interface PendingCall<T extends Func, R> {
  args: Parameters<T>;
  resolve: (value: R | PromiseLike<R>) => void;
  reject: (reason?: any) => void;
}

interface RegisterAttachment<T extends Func> extends Attachment<T> {
  manualDetach: boolean;
}

interface RegisterHandlers<T extends RegisterFunction> {
  register?: RegisterAttachment<T>;
  unregister?: RegisterAttachment<(id: RID<T>) => void>;
}

interface AttachmentOptions {
  owner: string;
  manualDetach: boolean;
}

interface RegisteredEntry<T extends RegisterFunction> {
  args: RArgs<T>;
  module?: string;
  owner?: string;
}

interface EventEntry<T extends Func> {
  module?: string;
  owner?: string;
  func: T;
  handler: T;
}

function createIdentity(kind: ProxyKind, identity?: string) {
  if (identity) {
    return `${kind}:${identity}`;
  }
  const nextIdentity = internal.nextProxyIdentity++;
  return `${kind}:anonymous:${nextIdentity}`;
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

/** Returns the identity a proxy was declared with, for diagnostics. */
export function GetInterfaceProxyIdentity(value: unknown): string | undefined {
  return readBrand(value)?.identity;
}

function getAttachmentOwner(manualDetach?: boolean): string {
  const context = getModuleContext();
  const responsible =
    manualDetach || context?.module ? undefined : GetResponsibleModule();
  return context?.owner ?? context?.module ?? responsible ?? DEFAULT_OWNER;
}

function createLease(owner: string): AttachmentLease {
  return { owner, generation: internal.nextLeaseGeneration++ };
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
  attachment: AttachmentLease | undefined,
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

/** Proxy for an asynchronous interface function, served by a single provider. */
export class AsyncProxy<T extends Func = Func, R = Awaited<ReturnType<T>>> {
  public readonly [PROXY_BRAND]: ProxyBrand;
  private attachment?: Attachment<T>;
  private queue: Array<PendingCall<T, R>> = [];

  public constructor(identity?: string) {
    this[PROXY_BRAND] = createBrand("async", identity);
  }

  /** Attaches the provider callback, replacing any previous one, and replays queued calls. */
  public onCall(callback: T, manualDetach?: boolean): AttachmentLease {
    const lease = createLease(getAttachmentOwner(manualDetach));
    const providerCallback = bindProviderCallback(callback);
    this.attachment = { callback: providerCallback, ...lease };
    if (!manualDetach) {
      internal.addAsyncProxy(lease.owner, {
        cleanup: () => this.detach(lease),
      });
    }
    this.replayQueue(providerCallback);
    return lease;
  }

  /** Detaches the leased attachment, or the current one when called without a lease. */
  public detach(lease?: AttachmentLease) {
    if (!lease || matchesLease(this.attachment, lease)) {
      this.attachment = undefined;
    }
  }

  /** Calls the provider, or queues the call until a provider attaches. */
  public call(...args: Parameters<T>): Promise<R> {
    const callerArgs = bindCallerArguments(args);
    if (this.attachment) {
      return this.invoke(this.attachment.callback, callerArgs);
    }
    if (internal.testStubMode) {
      return Promise.reject(new MissingProviderError());
    }
    if (this.queue.length >= internal.maxPendingOperations) {
      return Promise.reject(
        new ProviderQueueFullError(
          this[PROXY_BRAND].identity,
          internal.maxPendingOperations,
        ),
      );
    }
    return new Promise<R>((resolve, reject) => {
      this.queue.push({ args: callerArgs, resolve, reject });
    });
  }

  private invoke(callback: T, args: Parameters<T>): Promise<R> {
    try {
      return Promise.resolve(callback(...args));
    } catch (error) {
      return Promise.reject(error);
    }
  }

  private replayQueue(callback: T) {
    const pending = this.queue;
    this.queue = [];
    for (const call of pending) {
      this.invoke(callback, call.args).then(call.resolve, call.reject);
    }
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

/** Proxy for register and unregister handlers, served by a single provider. */
export class RegisteringProxy<T extends RegisterFunction = RegisterFunction> {
  public readonly [PROXY_BRAND]: ProxyBrand;
  private handlers: RegisterHandlers<T> = {};
  private readonly registered = new Map<RID<T>, RegisteredEntry<T>>();

  public constructor(identity?: string) {
    this[PROXY_BRAND] = createBrand("registering", identity);
    internal.registeringProxies.add(this);
  }

  /** Attaches a register callback. */
  public onRegister(callback: T, manualDetach?: boolean): AttachmentLease {
    return this.attachRegister(bindProviderCallback(callback), {
      owner: getAttachmentOwner(manualDetach),
      manualDetach: Boolean(manualDetach),
    });
  }

  /** Attaches an unregister callback, sharing the register callback's owner when it is the caller's. */
  public onUnregister(callback: (id: RID<T>) => void): AttachmentLease {
    const context = getModuleContext();
    const contextOwner = context?.owner ?? context?.module;
    const attachments = [this.handlers.unregister, this.handlers.register];
    const sibling = contextOwner
      ? attachments.find((attachment) => attachment?.owner === contextOwner)
      : attachments.find((attachment) => Boolean(attachment));
    const options: AttachmentOptions = sibling
      ? { owner: sibling.owner, manualDetach: sibling.manualDetach }
      : { owner: getAttachmentOwner(), manualDetach: false };
    return this.attachUnregister(bindProviderCallback(callback), options);
  }

  /** Atomically attaches both registration handlers. */
  public onHandlers(
    register: T,
    unregister: (id: RID<T>) => void,
    manualDetach?: boolean,
  ): AttachmentLease {
    const lease = createLease(getAttachmentOwner(manualDetach));
    const boundRegister = bindProviderCallback(register);
    const boundUnregister = bindProviderCallback(unregister);
    this.handlers = {
      register: this.createAttachment(boundRegister, lease, manualDetach),
      unregister: this.createAttachment(boundUnregister, lease, manualDetach),
    };
    this.trackAttachment(lease, Boolean(manualDetach));
    this.replayRegistrations(boundRegister);
    return lease;
  }

  /** Detaches the leased handlers, or both handlers when called without a lease. */
  public detach(lease?: AttachmentLease) {
    if (!lease) {
      this.handlers = {};
      return;
    }
    if (matchesLease(this.handlers.register, lease)) {
      this.handlers.register = undefined;
    }
    if (matchesLease(this.handlers.unregister, lease)) {
      this.handlers.unregister = undefined;
    }
  }

  /** Registers an entry with the provider and keeps it for replay on (re)attach. */
  public register(id: RID<T>, ...args: RArgs<T>) {
    const callerArgs = bindCallerArguments(args);
    const callback = this.handlers.register;
    if (!callback && internal.testStubMode) {
      throw new MissingProviderError();
    }
    this.registered.set(id, { ...getExecutionOwnership(), args: callerArgs });
    callback?.callback(id, ...callerArgs);
  }

  /** Unregisters an entry from the provider. */
  public unregister(id: RID<T>) {
    if (!this.registered.has(id)) {
      return;
    }
    try {
      this.handlers.unregister?.callback(id);
    } finally {
      this.registered.delete(id);
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
    for (const [id, entry] of this.registered) {
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
        this.registered.delete(id);
      }
    }
  }

  private attachRegister(
    callback: T,
    options: AttachmentOptions,
  ): AttachmentLease {
    const lease = createLease(options.owner);
    this.handlers.register = this.createAttachment(
      callback,
      lease,
      options.manualDetach,
    );
    this.trackAttachment(lease, options.manualDetach);
    this.replayRegistrations(callback);
    return lease;
  }

  private attachUnregister(
    callback: (id: RID<T>) => void,
    options: AttachmentOptions,
  ): AttachmentLease {
    const lease = createLease(options.owner);
    this.handlers.unregister = this.createAttachment(
      callback,
      lease,
      options.manualDetach,
    );
    this.trackAttachment(lease, options.manualDetach);
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

  private createAttachment<F extends Func>(
    callback: F,
    lease: AttachmentLease,
    manualDetach?: boolean,
  ): RegisterAttachment<F> {
    return { callback, ...lease, manualDetach: Boolean(manualDetach) };
  }

  private replayRegistrations(callback: T) {
    for (const [id, entry] of this.registered) {
      try {
        callback(id, ...entry.args);
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

/** Module-aware event handler collection; each handler runs in its registrant's context. */
export class EventProxy<T extends EventFunction = EventFunction> {
  public readonly [PROXY_BRAND]: ProxyBrand;
  private registered: EventEntry<T>[] = [];

  public constructor(identity?: string) {
    this[PROXY_BRAND] = createBrand("event", identity);
    internal.knownEvents.add(this);
  }

  /** Emits to every handler, reporting failures without aborting later handlers. */
  public emit(...args: Parameters<T>) {
    for (const { handler, module } of this.registered) {
      try {
        handler(...args);
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
    if (this.registered.some((existing) => existing.func === func)) {
      return;
    }
    this.registered.push({
      ...getExecutionOwnership(),
      func,
      handler: bindCallerFunction(func),
    });
  }

  /** Unregisters a handler. */
  public unregister(fn: T) {
    this.registered = this.registered.filter(({ func }) => func !== fn);
  }

  /** Unregisters handlers owned by a destroyed module. */
  public unregisterModule(module: string) {
    this.registered = this.registered.filter(
      (entry) => entry.module !== module,
    );
  }

  /** Unregisters handlers owned by a destroyed module generation. */
  public unregisterOwner(owner: string) {
    this.registered = this.registered.filter((entry) => entry.owner !== owner);
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
