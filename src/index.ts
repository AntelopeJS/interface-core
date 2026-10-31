import "reflect-metadata";

import type { ConfigVarProvider } from "./config";
import type { Class } from "./decorators";
import { type InterfaceConnection, internal } from "./internal";
import {
  type AsyncProxy,
  type AttachmentLease,
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

function hasInherit<T extends object>(
  data: T,
): data is T & { inherit(parent: T): void } {
  return "inherit" in data && typeof data.inherit === "function";
}

function copyMissingProperties<T extends Record<string, any>>(
  data: T,
  parent: T,
) {
  const target: Record<string, T[keyof T]> = data;
  const source: Record<string, T[keyof T]> = parent;
  for (const key of Object.getOwnPropertyNames(source)) {
    if (!Object.hasOwn(target, key)) {
      target[key] = source[key];
    }
  }
}

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
  // SAFETY: Reflect.getOwnMetadata returns any; meta.key is the metadata class's own key, so it holds an instance of that class, stored by this function or by another copy of it, or nothing.
  let data = Reflect.getOwnMetadata(meta.key, target) as T | undefined;
  if (!data) {
    data = new meta(target);
    // SAFETY: Object.getPrototypeOf returns any; the recursion below walks the prototype chain with the same metadata class, which accepts a target's prototype in place of the target.
    const proto = Object.getPrototypeOf(target) as U | null;
    if (inherit && proto) {
      const parent = GetMetadata(proto, meta, true);
      if (hasInherit(data)) {
        data.inherit(parent);
      } else {
        copyMissingProperties(data, parent);
      }
    }
    Reflect.defineMetadata(meta.key, data, target);
  }
  return data;
}

type Func<A extends any[] = any[], R = any> = (...args: A) => R;

type RID<T> = T extends (id: infer P, ...args: any[]) => void ? P : never;

type InterfaceImplType<T> =
  T extends RegisteringProxy<infer P>
    ? { register: P; unregister: (id: RID<P>) => void }
    : T extends AsyncProxy<infer P>
      ? P
      : T extends EventProxy
        ? never
        : T extends (...args: infer A) => infer R
          ? (...args: A) => Awaited<R> | R
          : T extends object
            ? InterfaceToImpl<T>
            : never;

type InterfaceToImpl<T> = T extends infer P
  ? {
      [K in keyof P]?: InterfaceImplType<P[K]>;
    }
  : never;

interface AsyncProxyProtocol {
  onCall(callback: Func): AttachmentLease;
  detach(lease: AttachmentLease): void;
}

interface RegisteringProxyProtocol {
  onHandlers(register: Func, unregister: Func): AttachmentLease;
  detach(lease: AttachmentLease): void;
}

interface AttachmentPlan {
  attach(): () => void;
}

function leasedPlan(
  proxy: { detach(lease: AttachmentLease): void },
  attach: () => AttachmentLease,
): AttachmentPlan {
  return {
    attach: () => {
      const lease = attach();
      return () => proxy.detach(lease);
    },
  };
}

type Unparsed = Parameters<ConfigVarProvider>[0];

type UnparsedRecord = Record<string, Unparsed>;

function isRecord(value: Unparsed): value is UnparsedRecord {
  return typeof value === "object" && value !== null;
}

function assertAcyclic(value: Unparsed, label: string) {
  const visited = new WeakSet<object>();
  const active = new WeakSet<object>();

  const visit = (current: Unparsed, path: string) => {
    if (!isRecord(current) || visited.has(current)) {
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

function carriesProxy(value: Unparsed): value is Func & { proxy: unknown } {
  return typeof value === "function" && "proxy" in value;
}

function assertFunction(value: Unparsed, path: string): asserts value is Func {
  if (typeof value !== "function") {
    throw new TypeError(`Missing or malformed interface handler at ${path}.`);
  }
}

function planProxyAttachment(
  proxy: Unparsed,
  implementation: Unparsed,
  path: string,
): AttachmentPlan | undefined {
  if (IsInterfaceProxy(proxy, "event")) {
    return;
  }
  if (IsInterfaceProxy(proxy, "async")) {
    assertFunction(implementation, path);
    // SAFETY: IsInterfaceProxy(proxy, "async") above checked the AsyncProxy brand.
    const asyncProxy = proxy as AsyncProxyProtocol;
    return leasedPlan(asyncProxy, () => asyncProxy.onCall(implementation));
  }
  if (!IsInterfaceProxy(proxy, "registering")) {
    return;
  }
  if (!isRecord(implementation)) {
    throw new TypeError(`Missing or malformed interface handler at ${path}.`);
  }
  const register = implementation.register;
  assertFunction(register, `${path}.register`);
  const unregister = implementation.unregister;
  assertFunction(unregister, `${path}.unregister`);
  // SAFETY: IsInterfaceProxy(proxy, "registering") above checked the RegisteringProxy brand.
  const registeringProxy = proxy as RegisteringProxyProtocol;
  return leasedPlan(registeringProxy, () =>
    registeringProxy.onHandlers(register, unregister),
  );
}

/**
 * The value an implementation answers under a key, read as `implementation[key]`
 * so getters and Proxy traps see the implementation as their receiver. A key
 * that is an `Object.prototype` name, is not the implementation's own, and
 * resolves to that root's own value is treated as not implemented.
 */
function implementedAt(implementation: UnparsedRecord, key: string): Unparsed {
  const answeredByRoot =
    Object.hasOwn(Object.prototype, key) &&
    !Object.hasOwn(implementation, key) &&
    implementation[key] ===
      Object.getOwnPropertyDescriptor(Object.prototype, key)?.value;
  return answeredByRoot ? undefined : implementation[key];
}

function createAttachmentPlan(
  declaration: UnparsedRecord,
  implementation: UnparsedRecord,
  path = "implementation",
): AttachmentPlan[] {
  const plans: AttachmentPlan[] = [];
  for (const [key, declared] of Object.entries(declaration)) {
    const implemented = implementedAt(implementation, key);
    const proxy = carriesProxy(declared) ? declared.proxy : declared;
    const proxyPlan = planProxyAttachment(proxy, implemented, `${path}.${key}`);
    if (proxyPlan) {
      plans.push(proxyPlan);
      continue;
    }
    if (isRecord(declared) && !IsInterfaceProxy(declared)) {
      const nestedImplementation = isRecord(implemented) ? implemented : {};
      plans.push(
        ...createAttachmentPlan(
          declared,
          nestedImplementation,
          `${path}.${key}`,
        ),
      );
    }
  }
  return plans;
}

function attachImplementation(declaration: Unparsed, implementation: Unparsed) {
  if (!isRecord(declaration) || !isRecord(implementation)) {
    throw new TypeError(
      "Interface declaration and implementation must be objects.",
    );
  }
  assertAcyclic(declaration, "declaration");
  assertAcyclic(implementation, "implementation");
  const plans = createAttachmentPlan(declaration, implementation);
  const detachers: Array<() => void> = [];
  try {
    for (const plan of plans) {
      detachers.push(plan.attach());
    }
  } catch (error) {
    for (const detach of detachers.reverse()) {
      detach();
    }
    throw error;
  }
}

interface MaybeThenable {
  readonly then?: unknown;
}

function isThenable(value: Unparsed): value is PromiseLike<unknown> {
  if ((typeof value !== "object" && typeof value !== "function") || !value) {
    return false;
  }
  const holder: MaybeThenable = value;
  return typeof holder.then === "function";
}

/**
 * Implements an interface with the provided implementation.
 *
 * Links a declared interface with its implementation, setting up the necessary proxies
 * for cross-module communication. EventProxy declarations need no implementation.
 * Validates all required handlers before attaching: async proxies need a function,
 * and registering proxies need both register and unregister callbacks.
 * When attaching a handler throws, every handler this call attached is detached
 * by its own lease before the error propagates. A provider attached by another
 * call stays attached.
 *
 * @param declaration The interface declaration to implement
 * @param implementation The implementation of the interface
 * @returns An object containing the declaration and implementation
 * @throws {TypeError} For malformed arguments, object cycles, or missing handlers.
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
      return { declaration: decl, implementation: impl };
    });
  }
  const decl = declaration;
  attachImplementation(decl, implementation);
  return { declaration: decl, implementation };
}

/**
 * Gets the connections to the implementations of an interface, as seen by the
 * module whose work is running.
 *
 * @param interfaceID The ID of the interface to get instances for
 * @returns Array of interface connections; empty outside a module context
 */
export function GetInterfaceInstances(
  interfaceID: string,
): InterfaceConnection[] {
  const module = GetResponsibleModule();
  if (!module || !(module in internal.interfaceConnections)) return [];
  return internal.interfaceConnections[module][interfaceID] ?? [];
}

/**
 * Gets one connection to an implementation of an interface, as seen by the
 * module whose work is running.
 *
 * @param interfaceID The ID of the interface to get an instance for
 * @param connectionID The ID of the specific connection to retrieve
 * @returns The interface connection, or undefined if not found or outside a module context
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

export * from "./modules";
export * from "./runtime";
