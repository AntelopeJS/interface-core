import { internal } from "./internal";

const STUB_NOT_IMPLEMENTED =
  "Interface function called without implementation in test environment. " +
  "Ensure the required module is loaded in your test config.";

type Func<A extends any[] = any[], R = any> = (...args: A) => R;

/**
 * Proxy for an asynchronous function.
 *
 * Queues up calls while unattached, automatically unattaches when the source module is unloaded.
 * Provides a mechanism for delayed execution and module-aware function binding.
 */
export class AsyncProxy<T extends Func = Func, R = Awaited<ReturnType<T>>> {
  private callback?: T;
  private queue: Array<{
    args: Parameters<T>;
    resolve: (value: R | PromiseLike<R>) => void;
    reject: (reason?: any) => void;
  }> = [];

  /**
   * Attaches a callback to the proxy
   *
   * Automatically detached if the module calling this function gets unloaded and manualDetach is not set to true.
   * When attached, any queued calls will be executed immediately.
   *
   * @param callback Function to attach
   * @param manualDetach Don't detach automatically when module is unloaded
   */
  public onCall(callback: T, manualDetach?: boolean) {
    this.callback = callback;
    if (!manualDetach) {
      const caller = GetResponsibleModule();
      if (caller) {
        internal.addAsyncProxy(caller, this);
      }
    }
    if (this.queue.length > 0) {
      this.queue.forEach(({ args, resolve, reject }) => {
        try {
          resolve(callback(...args));
        } catch (err) {
          reject(err);
        }
      });
      this.queue.splice(0, this.queue.length);
    }
  }

  /**
   * Manually detach the callback on this proxy.
   */
  public detach() {
    this.callback = undefined;
  }

  /**
   * Call the function attached to this proxy.
   *
   * If a callback has not been attached yet, the call is queued up for later.
   */
  public call(...args: Parameters<T>): Promise<R> {
    if (this.callback) {
      return Promise.resolve(this.callback(...args));
    }
    if (internal.testStubMode) {
      return Promise.reject(new Error(STUB_NOT_IMPLEMENTED));
    }
    return new Promise<R>((resolve, reject) =>
      this.queue.push({ args, resolve, reject }),
    );
  }
}

type RegisterFunction = (id: any, ...args: any[]) => void;
type RID<T> = T extends (id: infer P, ...args: any[]) => void ? P : never;
type RArgs<T> = T extends (id: any, ...args: infer P) => void ? P : never;

/**
 * Proxy for a pair of register/unregister functions.
 *
 * Manages registration of handlers and ensures proper cleanup when modules are unloaded.
 * This allows for module-aware event registration with automatic cleanup.
 */
export class RegisteringProxy<T extends RegisterFunction = RegisterFunction> {
  private registerCallback?: T;
  private unregisterCallback?: (id: RID<T>) => void;
  private registered = new Map<
    RID<T>,
    {
      module?: string;
      args: RArgs<T>;
    }
  >();

  /**
   * Attaches a register callback to the proxy
   *
   * Automatically detached if the module calling this function gets unloaded and manualDetach is not set to true.
   *
   * @param callback Function to attach as the register callback
   * @param manualDetach Don't detach automatically
   */
  public onRegister(callback: T, manualDetach?: boolean) {
    this.registerCallback = callback;
    if (!manualDetach) {
      const caller = GetResponsibleModule();
      if (caller) {
        internal.addRegisteringProxy(caller, this);
      }
    }
    for (const [id, { args }] of this.registered) {
      callback(id, ...args);
    }
  }

  /**
   * Attaches an unregister callback to the proxy
   *
   * Detached at the same time as the register callback.
   *
   * @param callback Function to attach as the unregister callback
   */
  public onUnregister(callback: (id: RID<T>) => void) {
    this.unregisterCallback = callback;
  }

  /**
   * Manually detach the callbacks on this proxy.
   */
  public detach() {
    this.registerCallback = undefined;
    this.unregisterCallback = undefined;
  }

  /**
   * Call the register callback attached to this proxy.
   *
   * If a callback has not been attached yet, the call is queued up for later.
   *
   * @param id Unique identifier used to unregister
   * @param args Extra arguments
   */
  public register(id: RID<T>, ...args: RArgs<T>) {
    if (!this.registerCallback && internal.testStubMode) {
      throw new Error(STUB_NOT_IMPLEMENTED);
    }
    const module = GetResponsibleModule();
    this.registered.set(id, { module, args });
    if (this.registerCallback) {
      this.registerCallback(id, ...args);
    }
  }

  /**
   * Call the unregister callback attached to this proxy.
   *
   * @param id Unique identifier to unregister
   */
  public unregister(id: RID<T>) {
    if (this.registered.has(id)) {
      if (this.unregisterCallback) {
        this.unregisterCallback(id);
      }
      this.registered.delete(id);
    }
  }

  /**
   * Unregister all entries created by the given module
   * @internal
   *
   * @param mod Module ID
   */
  public unregisterModule(mod: string) {
    for (const [id, { module }] of this.registered) {
      if (module === mod) {
        if (this.unregisterCallback) {
          this.unregisterCallback(id);
        }
        this.registered.delete(id);
      }
    }
  }
}

type EventFunction = (...args: any[]) => void;
/**
 * Event handler list that automatically removes handlers from unloaded modules.
 *
 * Provides a module-aware event system that cleans up event handlers when modules are unloaded,
 * preventing memory leaks and ensuring proper modularity.
 */
export class EventProxy<T extends EventFunction = EventFunction> {
  private registered: Array<{
    module?: string;
    func: T;
  }> = [];

  public constructor() {
    internal.knownEvents.push(this);
  }

  /**
   * Call all the event handlers with the specified arguments.
   *
   * @param args Arguments
   */
  public emit(...args: Parameters<T>) {
    for (const { func } of this.registered) {
      func(...args);
    }
  }

  /**
   * Register a new handler for this event.
   *
   * @param func Handler
   */
  public register(func: T) {
    if (this.registered.some((existing) => existing.func === func)) {
      return;
    }
    const module = GetResponsibleModule();
    this.registered.push({ module, func });
  }

  /**
   * Unregister a handler on this event.
   *
   * @param fn The handler that was passed to {@link register}
   */
  public unregister(fn: T) {
    this.registered = this.registered.filter(({ func }) => func !== fn);
  }

  /**
   * Unregister all handlers created by the given module.
   * @internal
   *
   * @param mod Module ID
   */
  public unregisterModule(mod: string) {
    this.registered = this.registered.filter(({ module }) => module !== mod);
  }
}

function captureCallStack(startFrame = 0): NodeJS.CallSite[] {
  const oldHandler = Error.prepareStackTrace;
  const oldLimit = Error.stackTraceLimit;
  Error.stackTraceLimit = Infinity;
  Error.prepareStackTrace = (_, trace) => trace;
  const errObj = {} as { stack: Array<string> };
  Error.captureStackTrace(errObj, GetResponsibleModule);
  const trace = errObj.stack as unknown as NodeJS.CallSite[];
  Error.prepareStackTrace = oldHandler;
  Error.stackTraceLimit = oldLimit;
  return trace.slice(startFrame);
}

interface ResponsibleModuleResult {
  module?: string;
  lastInterface: string;
}

function findResponsibleFile(
  trace: NodeJS.CallSite[],
): ResponsibleModuleResult {
  let currentFound = "";
  const lastInterface = "";
  let currentBestMatch = 0;

  for (const site of trace) {
    const fileName = site.getFileName();
    if (
      !fileName ||
      fileName.startsWith("node:internal/") ||
      fileName.match(/[/\\]node_modules[/\\]/)
    ) {
      continue;
    }
    for (const { dir, id } of internal.moduleByFolder) {
      if (fileName.startsWith(dir) && dir.length > currentBestMatch) {
        currentFound = id;
        currentBestMatch = dir.length;
      }
    }
    if (currentFound) {
      return { module: currentFound, lastInterface };
    }
    if (!site.getFunctionName() && site.getTypeName()) {
      break;
    }
  }

  return { lastInterface };
}

/**
 * Gets the responsible module for the current execution context.
 *
 * Determines which module is responsible for the current code execution by analyzing the call stack.
 * This is used for automatic proxy detachment and event handler cleanup.
 *
 * @param startFrame The starting frame in the stack trace to analyze
 * @returns The module ID or undefined if no module is found
 */
export function GetResponsibleModule(startFrame = 0): string | undefined {
  const trace = captureCallStack(startFrame);
  const responsible = findResponsibleFile(trace);
  if (responsible.module) {
    return responsible.module;
  }
  internal.asyncContextReporter?.(trace);
  return responsible.lastInterface;
}
