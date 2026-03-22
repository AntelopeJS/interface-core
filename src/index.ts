import "reflect-metadata";
import type { Class } from "./decorators";
import { internal } from "./internal";
import { Logging } from "./logging";
import {
  AsyncProxy,
  EventProxy,
  GetResponsibleModule,
  RegisteringProxy,
} from "./proxies";

export {
  AsyncProxy,
  EventProxy,
  GetResponsibleModule,
  RegisteringProxy,
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

/**
 * Creates an interface function proxy.
 *
 * Returns a function that routes calls through an AsyncProxy, allowing for module-aware
 * asynchronous function calls that can be implemented by other modules.
 *
 * @returns A function that proxies calls to the implementation when available
 */
export function InterfaceFunction<
  T extends Func = Func,
  R = Awaited<ReturnType<T>>,
>(): (...args: Parameters<T>) => Promise<R> {
  const proxy = new AsyncProxy<T, R>();
  const func = (...args: Parameters<T>) => proxy.call(...args);
  func.proxy = proxy;
  return func;
}

type RegisterFunction = (id: any, ...args: any[]) => void;
type RID<T> = T extends (id: infer P, ...args: any[]) => void ? P : never;

type InterfaceImplType<T> = T extends RegisteringProxy<infer P>
  ? { register: P; unregister: (id: RID<P>) => void }
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

function implement(decl: Record<string, any>, impl: Record<string, any>) {
  for (const key in decl) {
    if (key in impl) {
      const val = decl[key];
      if (val instanceof RegisteringProxy) {
        val.onRegister(impl[key].register);
        val.onUnregister(impl[key].unregister);
      } else if (typeof val === "function" && val.proxy instanceof AsyncProxy) {
        (<AsyncProxy>val.proxy).onCall(impl[key]);
      } else if (val instanceof AsyncProxy) {
        val.onCall(impl[key]);
      } else if (!(val instanceof EventProxy)) {
        implement(val, impl[key]);
      }
    }
  }
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
  declaration: T | Promise<T>,
  implementation: T2 | Promise<T2>,
): Promise<{ declaration: Awaited<T>; implementation: T2 }>;

export function ImplementInterface<
  T extends Record<string, any>,
  T2 extends Record<string, any>,
>(
  declaration: T | Promise<T>,
  implementation: T2 | Promise<T2>,
):
  | { declaration: T; implementation: T2 }
  | Promise<{ declaration: T; implementation: T2 }> {
  if (declaration instanceof Promise || implementation instanceof Promise) {
    return Promise.all([declaration, implementation]).then(([decl, impl]) => {
      implement(decl, impl);
      return { declaration: decl, implementation: impl as T2 };
    });
  }
  const decl = declaration;
  const impl = implementation as Record<string, any>;
  implement(decl, impl);
  return { declaration: decl, implementation: impl as T2 };
}

interface InterfaceConnection {
  id?: string;
  path: string;
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
  const module = GetResponsibleModule();
  if (!module || !(module in internal.interfaceConnections)) return [];
  const connections = internal.interfaceConnections[module];
  return connections[interfaceID] ?? [];
}

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
  const module = GetResponsibleModule();
  if (!module || !(module in internal.interfaceConnections)) return;
  const connections = internal.interfaceConnections[module];
  return (connections[interfaceID] ?? []).find(
    (connection) => connection.id === connectionID,
  );
}
