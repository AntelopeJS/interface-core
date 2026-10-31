import {
  MissingProviderError,
  ModuleContextInvalidatedError,
  ProviderQueueFullError,
} from "./errors";
import {
  type ActiveModuleExecutionContext,
  captureModuleContext,
  enterModuleContext,
  getModuleContext,
  internal,
  type InterfaceRuntime,
  invalidateModuleContext,
  isModuleContextActive,
  type ProxyBrand,
  runAsCapturedCaller,
  type RuntimeErrorDetails,
  RUNTIME_PROTOCOL_VERSION,
  runWithModuleContext,
} from "./internal";

type Func<A extends any[] = any[], R = any> = (...args: A) => R;
type RegisterFunction = (id: any, ...args: any[]) => void;
type RID<T> = T extends (id: infer P, ...args: any[]) => void ? P : never;
type RArgs<T> = T extends (id: any, ...args: infer P) => void ? P : never;
type ProxyKind = ProxyBrand["kind"];

const PROXY_BRAND = Symbol.for("@antelopejs/interface-core/proxy");
const DEFAULT_OWNER = "@antelopejs/interface-core/default-provider";
const INTERFACE_CONTEXT_KIND = "interface";

/** The handle of one provider attachment, used to detach exactly that attachment. */
export interface AttachmentLease {
  generation: number;
  owner: string;
}

interface Attachment<T> extends AttachmentLease {
  callback: T;
  context?: ActiveModuleExecutionContext;
}

interface PendingCall<T extends Func, R> {
  args: Parameters<T>;
  caller?: ActiveModuleExecutionContext;
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
  context?: ActiveModuleExecutionContext;
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

interface MaybeBranded {
  readonly [PROXY_BRAND]?: ProxyBrand;
}

function isObjectLike(
  value: Parameters<typeof IsInterfaceProxy>[0],
): value is object {
  return (typeof value === "object" || typeof value === "function") && !!value;
}

function readBrand(
  value: Parameters<typeof IsInterfaceProxy>[0],
): ProxyBrand | undefined {
  if (!isObjectLike(value)) {
    return;
  }
  const holder: MaybeBranded = value;
  const brand = holder[PROXY_BRAND];
  if (!brand || brand.protocol !== RUNTIME_PROTOCOL_VERSION) {
    return;
  }
  return brand;
}

/** Returns whether a value implements this runtime's stable proxy protocol. */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- the brand probe is documented to answer false for any non-proxy value (docs/2.proxies.md), so its parameter is the caller's untyped value; no named type narrows it without breaking callers that hold unknown.
export function IsInterfaceProxy(value: unknown, kind?: ProxyKind): boolean {
  const brand = readBrand(value);
  return Boolean(brand && (!kind || brand.kind === kind));
}

/** Returns the identity a proxy was declared with, for diagnostics. */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- the brand probe is documented to answer undefined for any non-proxy value (docs/2.proxies.md), so its parameter is the caller's untyped value; no named type narrows it without breaking callers that hold unknown.
export function GetInterfaceProxyIdentity(value: unknown): string | undefined {
  return readBrand(value)?.identity;
}

function getAttachmentOwner(): string {
  const context = getModuleContext();
  return context?.owner ?? context?.module ?? DEFAULT_OWNER;
}

function createLease(owner: string): AttachmentLease {
  return { owner, generation: internal.nextLeaseGeneration++ };
}

function captureProviderContext(): ActiveModuleExecutionContext | undefined {
  const context = captureModuleContext();
  return context?.kind === INTERFACE_CONTEXT_KIND ? undefined : context;
}

function runAttachment<T extends Func, R>(
  attachment: Attachment<T>,
  invoke: (callback: T) => R,
): R {
  return enterModuleContext(attachment.context, () =>
    invoke(attachment.callback),
  );
}

interface ExecutionOwnership {
  module?: string;
  owner?: string;
}

function getExecutionOwnership(): ExecutionOwnership {
  const context = getModuleContext();
  if (!context) {
    return {};
  }
  return { module: context.module, owner: context.owner ?? context.module };
}

type RuntimeErrorReporter = NonNullable<
  InterfaceRuntime["runtimeErrorReporter"]
>;

function reportRuntimeError(
  error: Parameters<RuntimeErrorReporter>[0],
  operation: string,
  proxyIdentity: string,
  module?: string,
  registrationId?: RuntimeErrorDetails["registrationId"],
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

  /**
   * Attaches the provider callback, replacing any previous one, and replays
   * queued calls. The callback runs in the context it was attached in.
   */
  public onCall(callback: T, manualDetach?: boolean): AttachmentLease {
    const lease = createLease(getAttachmentOwner());
    const attachment = {
      callback,
      context: captureProviderContext(),
      ...lease,
    };
    this.attachment = attachment;
    if (!manualDetach) {
      internal.addAsyncProxy(lease.owner, {
        cleanup: () => this.detach(lease),
      });
    }
    this.replayQueue(attachment);
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
    let caller: ActiveModuleExecutionContext | undefined;
    try {
      caller = captureModuleContext();
    } catch (error) {
      return Promise.reject(error);
    }
    if (this.attachment) {
      return this.invoke(this.attachment, args);
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
      this.queue.push({ args, caller, resolve, reject });
    });
  }

  private invoke(attachment: Attachment<T>, args: Parameters<T>): Promise<R> {
    try {
      return Promise.resolve(
        runAttachment(
          attachment,
          // SAFETY: T extends Func types the call as any; the proxy's contract declares the result of a provider callback typed T to be R, or a promise of R.
          (callback) => callback(...args) as R | PromiseLike<R>,
        ),
      );
    } catch (error) {
      return Promise.reject(error);
    }
  }

  private replayQueue(attachment: Attachment<T>) {
    const pending = this.queue;
    this.queue = [];
    for (const call of pending) {
      if (call.caller && !isModuleContextActive(call.caller)) {
        call.reject(new ModuleContextInvalidatedError(call.caller.module));
        continue;
      }
      runAsCapturedCaller(call.caller, () =>
        this.invoke(attachment, call.args),
      ).then(call.resolve, call.reject);
    }
  }
}

/**
 * Creates a callable interface function backed by an asynchronous proxy.
 * The typed contract always returns a Promise. Use ImplementInterface to attach
 * a provider; the runtime-only `.proxy` property is absent from the return type.
 * Construct AsyncProxy directly when typed attachment/lease control is needed.
 *
 * @param identity Optional diagnostic name for the underlying proxy.
 */
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

  /**
   * Attaches only the register callback, run in the context it was attached in,
   * then replays stored registrations. Returns a lease for this callback; an
   * existing unregister callback remains.
   */
  public onRegister(callback: T, manualDetach?: boolean): AttachmentLease {
    return this.attachRegister(callback, {
      owner: getAttachmentOwner(),
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
    return this.attachUnregister(callback, options);
  }

  /**
   * Installs both callbacks under one lease before replaying registrations.
   * Replay reports synchronous failures and continues. When the runtime error
   * reporter rethrows, this lease's callbacks are detached before the error
   * propagates; provider side effects are not rolled back. Pass the returned
   * lease to detach both callbacks safely.
   */
  public onHandlers(
    register: T,
    unregister: (id: RID<T>) => void,
    manualDetach?: boolean,
  ): AttachmentLease {
    const lease = createLease(getAttachmentOwner());
    const registerAttachment = this.createAttachment(
      register,
      lease,
      manualDetach,
    );
    this.handlers = {
      register: registerAttachment,
      unregister: this.createAttachment(unregister, lease, manualDetach),
    };
    this.trackAttachment(lease, Boolean(manualDetach));
    this.replayOrDetach(registerAttachment, lease);
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
    const attachment = this.handlers.register;
    if (!attachment && internal.testStubMode) {
      throw new MissingProviderError();
    }
    this.registered.set(id, { ...getExecutionOwnership(), args });
    if (attachment) {
      runAttachment(attachment, (callback) => callback(id, ...args));
    }
  }

  /** Unregisters an entry from the provider. */
  public unregister(id: RID<T>) {
    if (!this.registered.has(id)) {
      return;
    }
    const attachment = this.handlers.unregister;
    try {
      if (attachment) {
        runAttachment(attachment, (callback) => callback(id));
      }
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
    const attachment = this.createAttachment(
      callback,
      lease,
      options.manualDetach,
    );
    this.handlers.register = attachment;
    this.trackAttachment(lease, options.manualDetach);
    this.replayOrDetach(attachment, lease);
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
    return {
      callback,
      context: captureProviderContext(),
      ...lease,
      manualDetach: Boolean(manualDetach),
    };
  }

  private replayOrDetach(
    attachment: RegisterAttachment<T>,
    lease: AttachmentLease,
  ) {
    try {
      this.replayRegistrations(attachment);
    } catch (error) {
      this.detach(lease);
      throw error;
    }
  }

  private replayRegistrations(attachment: RegisterAttachment<T>) {
    for (const [id, entry] of this.registered) {
      try {
        runAttachment(attachment, (callback) => callback(id, ...entry.args));
      } catch (error) {
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

/** Module-aware event handler collection; each handler runs in the context it was registered in. */
export class EventProxy<T extends EventFunction = EventFunction> {
  public readonly [PROXY_BRAND]: ProxyBrand;
  private registered: EventEntry<T>[] = [];

  public constructor(identity?: string) {
    this[PROXY_BRAND] = createBrand("event", identity);
    internal.knownEvents.add(this);
  }

  /** Emits to every handler, reporting failures without aborting later handlers. */
  public emit(...args: Parameters<T>) {
    for (const { func, context, module } of this.registered) {
      try {
        enterModuleContext(context, () => func(...args));
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
      context: captureModuleContext(),
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

/** Gets the module whose work is running, from the async module context. */
export function GetResponsibleModule(): string | undefined {
  return getModuleContext()?.module;
}
