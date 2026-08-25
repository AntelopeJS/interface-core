import "reflect-metadata";
import type { Class } from "./decorators";
import { BindResolverFacade } from "./facades";
import {
  type ActiveModuleExecutionContext,
  type InterfaceConnection,
  internal,
} from "./internal";
import { Logging } from "./logging";
import {
  type AsyncProxy,
  type EventProxy,
  GetResponsibleModule,
  IsInterfaceProxy,
  type RegisteringProxy,
} from "./proxies";

export * from "./errors";
export type { InterfaceConnection } from "./internal";
export {
  AsyncProxy,
  EventProxy,
  GetInterfaceProxyIdentity,
  GetResponsibleModule,
  InterfaceFunction,
  IsInterfaceProxy,
  RegisteringProxy,
  RunWithResponsibleModule,
} from "./proxies";

internal.asyncContextReporter = (trace: NodeJS.CallSite[]) => {
  const lastSite = trace[trace.length - 1];
  if (lastSite?.getFileName() !== "node:internal/timers") {
    return;
  }
  const tracestr = trace
    .filter((site) => !site.getFileName()?.startsWith("node:internal/"))
    .map((site) => site.toString())
    .join("\n    - ");
  Logging.Error(
    "GetResponsibleModule called from within an async context, this will break hot reloading!\n    - " +
      tracestr,
  );
};

/**
 * Gets metadata for a target object using the specified metadata class.
 *
 * Retrieves or creates metadata associated with a target object, with optional inheritance support.
 * This is used for reflection-based operations throughout the framework.
 *
 * @param target The target object to get metadata for
 * @param meta The metadata class with a symbol key
 * @param inherit Whether to inherit metadata from the prototype chain
 * @returns The metadata instance
 */
export function GetMetadata<
  T extends Record<string, any>,
  U extends Record<string, any>,
>(target: U, meta: Class<T, [U]> & { key: symbol }, inherit = true): T {
  let data = Reflect.getOwnMetadata(meta.key, target) as T;
  if (!data) {
    data = new meta(target);
    const proto = Object.getPrototypeOf(target);
    if (inherit && proto) {
      const parent = GetMetadata(proto, meta, true);
      if ("inherit" in data && typeof data.inherit === "function") {
        data.inherit(parent);
      } else {
        for (const key of Object.getOwnPropertyNames(parent) as (keyof T)[]) {
          if (!(key in data)) {
            data[key] = parent[key];
          }
        }
      }
    }
    Reflect.defineMetadata(meta.key, data, target);
  }
  return data;
}

type Func<A extends any[] = any[], R = any> = (...args: A) => R;

type RID<T> = T extends (id: infer P, ...args: any[]) => void ? P : never;

type InterfaceImplType<T> = T extends RegisteringProxy<infer P>
  ? { register: P; unregister: (id: RID<P>) => void }
  : T extends AsyncProxy<infer P>
    ? P
    : T extends EventProxy
      ? never
      : T extends (...args: infer A) => infer R
        ? (...args: A) => Awaited<R> | R
        : T extends Record<string, any>
          ? InterfaceToImpl<T>
          : never;

type InterfaceToImpl<T> = T extends infer P
  ? {
      [K in keyof P]?: InterfaceImplType<P[K]>;
    }
  : never;

interface AsyncProxyProtocol {
  onCall(callback: Func): unknown;
  onCallFor(context: ActiveModuleExecutionContext, callback: Func): unknown;
}

interface RegisteringProxyProtocol {
  onHandlers(register: Func, unregister: Func): unknown;
  onHandlersFor(
    context: ActiveModuleExecutionContext,
    register: Func,
    unregister: Func,
  ): unknown;
}

interface AttachmentPlan {
  attach(): void;
}

interface InterfaceFunctionDeclaration extends Func {
  proxy?: unknown;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isCommonJsDeclarationMirror(
  key: string,
  parent: Record<string, unknown>,
  child: Record<string, unknown>,
): boolean {
  if (key !== "default") {
    return false;
  }
  const entries = Object.entries(child);
  return (
    entries.length > 0 && entries.every(([key, value]) => parent[key] === value)
  );
}

function assertAcyclic(value: unknown, label: string) {
  const visited = new WeakSet<object>();
  const active = new WeakSet<object>();

  const visit = (current: unknown, path: string) => {
    if (!isObject(current) || visited.has(current)) {
      return;
    }
    if (active.has(current)) {
      throw new TypeError(`${label} contains a cycle at ${path}.`);
    }
    active.add(current);
    for (const [key, child] of Object.entries(current)) {
      visit(child, `${path}.${key}`);
    }
    active.delete(current);
    visited.add(current);
  };

  visit(value, label);
}

function requireFunction(value: unknown, path: string): Func {
  if (typeof value !== "function") {
    throw new TypeError(`Missing or malformed interface handler at ${path}.`);
  }
  return value as Func;
}

function createAsyncAttachmentPlan(
  proxy: AsyncProxyProtocol,
  callback: Func,
  context?: ActiveModuleExecutionContext,
): AttachmentPlan {
  return {
    attach: () => {
      if (context) {
        proxy.onCallFor(context, callback);
        return;
      }
      proxy.onCall(callback);
    },
  };
}

function createRegisteringAttachmentPlan(
  proxy: RegisteringProxyProtocol,
  register: Func,
  unregister: Func,
  context?: ActiveModuleExecutionContext,
): AttachmentPlan {
  return {
    attach: () => {
      if (context) {
        proxy.onHandlersFor(context, register, unregister);
        return;
      }
      proxy.onHandlers(register, unregister);
    },
  };
}

function planProxyAttachment(
  proxy: unknown,
  implementation: unknown,
  path: string,
  context?: ActiveModuleExecutionContext,
): AttachmentPlan | undefined {
  if (IsInterfaceProxy(proxy, "event")) {
    return;
  }
  if (IsInterfaceProxy(proxy, "async")) {
    const callback = requireFunction(implementation, path);
    return createAsyncAttachmentPlan(
      proxy as AsyncProxyProtocol,
      callback,
      context,
    );
  }
  if (!IsInterfaceProxy(proxy, "registering")) {
    return;
  }
  if (!isObject(implementation)) {
    throw new TypeError(`Missing or malformed interface handler at ${path}.`);
  }
  const register = requireFunction(implementation.register, `${path}.register`);
  const unregister = requireFunction(
    implementation.unregister,
    `${path}.unregister`,
  );
  return createRegisteringAttachmentPlan(
    proxy as RegisteringProxyProtocol,
    register,
    unregister,
    context,
  );
}

function getDeclaredProxy(declared: unknown): unknown {
  if (typeof declared === "function" && "proxy" in declared) {
    return (declared as InterfaceFunctionDeclaration).proxy;
  }
  return declared;
}

function planNestedAttachments(
  key: string,
  declared: unknown,
  implemented: unknown,
  declaration: Record<string, unknown>,
  path: string,
  context?: ActiveModuleExecutionContext,
): AttachmentPlan[] {
  if (
    !isObject(declared) ||
    IsInterfaceProxy(declared) ||
    isCommonJsDeclarationMirror(key, declaration, declared)
  ) {
    return [];
  }
  const nestedImplementation = isObject(implemented) ? implemented : {};
  return createAttachmentPlan(
    declared,
    nestedImplementation,
    `${path}.${key}`,
    context,
  );
}

function createAttachmentPlan(
  declaration: Record<string, unknown>,
  implementation: Record<string, unknown>,
  path = "implementation",
  context?: ActiveModuleExecutionContext,
): AttachmentPlan[] {
  const plans: AttachmentPlan[] = [];
  for (const [key, declared] of Object.entries(declaration)) {
    const implemented = implementation[key];
    const proxy = getDeclaredProxy(declared);
    const proxyPlan = planProxyAttachment(
      proxy,
      implemented,
      `${path}.${key}`,
      context,
    );
    if (proxyPlan) {
      plans.push(proxyPlan);
      continue;
    }
    plans.push(
      ...planNestedAttachments(
        key,
        declared,
        implemented,
        declaration,
        path,
        context,
      ),
    );
  }
  return plans;
}

function attachImplementation(
  declaration: Record<string, unknown>,
  implementation: Record<string, unknown>,
  context?: ActiveModuleExecutionContext,
) {
  if (!isObject(declaration) || !isObject(implementation)) {
    throw new TypeError(
      "Interface declaration and implementation must be objects.",
    );
  }
  assertAcyclic(declaration, "declaration");
  assertAcyclic(implementation, "implementation");
  const plans = createAttachmentPlan(
    declaration,
    implementation,
    "implementation",
    context,
  );
  plans.forEach((plan) => {
    plan.attach();
  });
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    (typeof value === "object" || typeof value === "function") &&
    value !== null &&
    typeof (value as PromiseLike<unknown>).then === "function"
  );
}

/**
 * Implements an interface with the provided implementation.
 *
 * Links a declared interface with its implementation, setting up the necessary proxies
 * and event handlers to enable cross-module communication.
 *
 * @param declaration The interface declaration to implement
 * @param implementation The implementation of the interface
 * @returns An object containing the declaration and implementation
 */
export function ImplementInterface<
  T extends Record<string, unknown>,
  T2 extends InterfaceToImpl<T>,
>(declaration: T, implementation: T2): { declaration: T; implementation: T2 };

/**
 * @deprecated Please use the non-async version of this function.
 */
export function ImplementInterface<
  T extends Record<string, unknown>,
  T2 extends InterfaceToImpl<T>,
>(
  declaration: T | PromiseLike<T>,
  implementation: T2 | PromiseLike<T2>,
): Promise<{ declaration: Awaited<T>; implementation: T2 }>;

export function ImplementInterface<
  T extends Record<string, any>,
  T2 extends Record<string, any>,
>(
  declaration: T | PromiseLike<T>,
  implementation: T2 | PromiseLike<T2>,
):
  | { declaration: T; implementation: T2 }
  | Promise<{ declaration: T; implementation: T2 }> {
  if (isThenable(declaration) || isThenable(implementation)) {
    return Promise.all([declaration, implementation]).then(([decl, impl]) => {
      attachImplementation(decl, impl);
      return { declaration: decl, implementation: impl as T2 };
    });
  }
  const decl = declaration;
  const impl = implementation as Record<string, any>;
  attachImplementation(decl, impl);
  return { declaration: decl, implementation: impl as T2 };
}

BindResolverFacade(ImplementInterface, (scope) => {
  const context = scope.context as ActiveModuleExecutionContext;
  return ((
    declaration: Record<string, unknown> | PromiseLike<Record<string, unknown>>,
    implementation:
      | Record<string, unknown>
      | PromiseLike<Record<string, unknown>>,
  ) => {
    if (isThenable(declaration) || isThenable(implementation)) {
      return Promise.all([declaration, implementation]).then(([decl, impl]) => {
        attachImplementation(decl, impl, context);
        return { declaration: decl, implementation: impl };
      });
    }
    attachImplementation(declaration, implementation, context);
    return { declaration, implementation };
  }) as typeof ImplementInterface;
});

BindResolverFacade(GetResponsibleModule, (scope) => {
  return ((_startFrame?: number) =>
    scope.context.module) as typeof GetResponsibleModule;
});

function getInterfaceInstancesFor(
  module: string | undefined,
  interfaceID: string,
): InterfaceConnection[] {
  if (!module || !(module in internal.interfaceConnections)) return [];
  return internal.interfaceConnections[module][interfaceID] ?? [];
}

/**
 * Gets all instances of a specific interface across the system.
 *
 * Retrieves all connections to implementations of the specified interface.
 *
 * @param interfaceID The ID of the interface to get instances for
 * @returns Array of interface connections
 */
export function GetInterfaceInstances(
  interfaceID: string,
): InterfaceConnection[] {
  return getInterfaceInstancesFor(GetResponsibleModule(), interfaceID);
}

BindResolverFacade(GetInterfaceInstances, (scope) => {
  return ((interfaceID: string) =>
    getInterfaceInstancesFor(
      scope.context.module,
      interfaceID,
    )) as typeof GetInterfaceInstances;
});

/**
 * Gets a specific instance of an interface by ID.
 *
 * Retrieves a specific connection to an implementation of the specified interface.
 *
 * @param interfaceID The ID of the interface to get an instance for
 * @param connectionID The ID of the specific connection to retrieve
 * @returns The interface connection or undefined if not found
 */
export function GetInterfaceInstance(
  interfaceID: string,
  connectionID: string,
): InterfaceConnection | undefined {
  return getInterfaceInstanceFor(
    GetResponsibleModule(),
    interfaceID,
    connectionID,
  );
}

function getInterfaceInstanceFor(
  module: string | undefined,
  interfaceID: string,
  connectionID: string,
): InterfaceConnection | undefined {
  return getInterfaceInstancesFor(module, interfaceID).find(
    (connection) => connection.id === connectionID,
  );
}

BindResolverFacade(GetInterfaceInstance, (scope) => {
  return ((interfaceID: string, connectionID: string) =>
    getInterfaceInstanceFor(
      scope.context.module,
      interfaceID,
      connectionID,
    )) as typeof GetInterfaceInstance;
});

export {
  DestroyModule,
  Events,
  GetModuleInfo,
  ListModules,
  LoadModule,
  type ModuleDefinition,
  type ModuleInfo,
  ReloadModule,
  StartModule,
  StopModule,
} from "./modules";
export {
  DEV_REGISTRY_PATH,
  type DevServerEndpoint,
  type DevServerEntry,
  type DevServerRegistry,
  GetRuntimeInfo,
  RegisterDevServer,
  type RuntimeInfo,
} from "./runtime";
