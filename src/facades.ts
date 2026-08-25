import {
  type ActiveModuleExecutionContext,
  activateModuleContext,
  assertActiveModuleContext,
  internal,
  type ModuleExecutionContext,
} from "./internal";
import {
  type AsyncProxy,
  type EventProxy,
  GetInterfaceProxyIdentity,
  type InterfaceFunctionProxy,
  IsInterfaceProxy,
  type RegisteringProxy,
} from "./proxies";

type Func<A extends any[] = any[], R = any> = (...args: A) => R;
const RESOLVER_FACADE_BINDER = Symbol.for(
  "@antelopejs/interface-core/resolver-facade-binder",
);
const activeFacadeContexts = new WeakMap<
  ModuleExecutionContext,
  ActiveModuleExecutionContext
>();

export interface InterfaceFacadeScope {
  readonly context: ModuleExecutionContext;
  assertActive(): void;
  bind<T extends Func, R = Awaited<ReturnType<T>>>(
    declaration: InterfaceFunctionProxy<T, R>,
  ): InterfaceFunctionProxy<T, R>;
  bindProxy<T extends object>(declaration: T): T;
  createFacade<T extends Record<string, unknown>>(declaration: T): T;
  onDestroy(cleanup: () => void): void;
}

export type InterfaceFacadeBuilder = (
  scope: InterfaceFacadeScope,
  facade: Record<string, unknown>,
) => Record<string, unknown>;

export type ResolverFacadeBinder<T extends Func = Func> = (
  scope: InterfaceFacadeScope,
) => T;

interface ResolverBindableFunction extends Func {
  [RESOLVER_FACADE_BINDER]?: ResolverFacadeBinder;
}

interface InterfaceFacadeDeclaration {
  BuildInterfaceFacade?: InterfaceFacadeBuilder;
}

function getSelectedProvider<T extends Func, R>(
  declaration: InterfaceFunctionProxy<T, R>,
  context: ModuleExecutionContext,
): string | undefined {
  const identity = GetInterfaceProxyIdentity(declaration.proxy);
  return identity ? context.providerRoutes?.[identity] : undefined;
}

function bindInterfaceFunction<T extends Func, R>(
  declaration: InterfaceFunctionProxy<T, R>,
  context: ActiveModuleExecutionContext,
): InterfaceFunctionProxy<T, R> {
  const provider = getSelectedProvider(declaration, context);
  const bound = (...args: Parameters<T>) => {
    try {
      assertActiveModuleContext(context);
      return declaration.proxy.callProvider(provider, ...args);
    } catch (error) {
      return Promise.reject(error);
    }
  };
  bound.proxy = bindInterfaceProxy(declaration.proxy, context);
  Object.defineProperty(bound, "name", {
    configurable: true,
    value: declaration.name,
  });
  return bound as InterfaceFunctionProxy<T, R>;
}

function bindAsyncProxy(
  declaration: AsyncProxy,
  facade: Record<string, unknown>,
  context: ActiveModuleExecutionContext,
): void {
  Object.defineProperty(facade, "call", {
    configurable: true,
    value: (...args: any[]) => declaration.callFor(context, ...args),
  });
  Object.defineProperty(facade, "onCall", {
    configurable: true,
    value: (callback: Func, manualDetach?: boolean) =>
      declaration.onCallFor(context, callback, manualDetach),
  });
}

function bindRegisteringProxy(
  declaration: RegisteringProxy,
  facade: Record<string, unknown>,
  context: ActiveModuleExecutionContext,
): void {
  Object.defineProperty(facade, "register", {
    configurable: true,
    value: (id: any, ...args: any[]) =>
      declaration.registerFor(context, id, ...args),
  });
  Object.defineProperty(facade, "unregister", {
    configurable: true,
    value: (id: any) => declaration.unregisterFor(context, id),
  });
  Object.defineProperty(facade, "onHandlers", {
    configurable: true,
    value: (register: Func, unregister: Func, manualDetach?: boolean) =>
      declaration.onHandlersFor(context, register, unregister, manualDetach),
  });
}

function bindEventProxy(
  declaration: EventProxy,
  facade: Record<string, unknown>,
  context: ActiveModuleExecutionContext,
): void {
  Object.defineProperty(facade, "register", {
    configurable: true,
    value: (callback: Func) => declaration.registerFor(context, callback),
  });
  Object.defineProperty(facade, "unregister", {
    configurable: true,
    value: (callback: Func) => declaration.unregisterFor(context, callback),
  });
}

function bindInterfaceProxy<T extends object>(
  declaration: T,
  context: ActiveModuleExecutionContext,
): T {
  const facade = Object.create(declaration) as T & Record<string, unknown>;
  if (IsInterfaceProxy(declaration, "async")) {
    bindAsyncProxy(declaration as AsyncProxy, facade, context);
    return facade;
  }
  if (IsInterfaceProxy(declaration, "registering")) {
    bindRegisteringProxy(declaration as RegisteringProxy, facade, context);
    return facade;
  }
  if (IsInterfaceProxy(declaration, "event")) {
    bindEventProxy(declaration as EventProxy, facade, context);
    return facade;
  }
  return declaration;
}

function isActiveModuleExecutionContext(
  context: ModuleExecutionContext,
): context is ActiveModuleExecutionContext {
  return (
    typeof (context as Partial<ActiveModuleExecutionContext>).ownershipToken ===
    "symbol"
  );
}

function createFacadeScope(
  context: ModuleExecutionContext,
): InterfaceFacadeScope {
  let activeContext: ActiveModuleExecutionContext;
  if (isActiveModuleExecutionContext(context)) {
    activeContext = context;
    assertActiveModuleContext(activeContext);
  } else {
    const existing = activeFacadeContexts.get(context);
    if (existing) {
      assertActiveModuleContext(existing);
      activeContext = existing;
    } else {
      activeContext = activateModuleContext(context);
      activeFacadeContexts.set(context, activeContext);
    }
  }
  return {
    context: activeContext,
    assertActive: () => assertActiveModuleContext(activeContext),
    bind: (declaration) => bindInterfaceFunction(declaration, activeContext),
    bindProxy: (declaration) => bindInterfaceProxy(declaration, activeContext),
    createFacade: (declaration) =>
      CreateInterfaceFacade(declaration, activeContext),
    onDestroy: (cleanup) => {
      assertActiveModuleContext(activeContext);
      internal.addOwnerCleanup(activeContext.owner, cleanup);
    },
  };
}

function isInterfaceFunction(
  value: unknown,
): value is InterfaceFunctionProxy<Func> {
  if (typeof value !== "function" || !("proxy" in value)) {
    return false;
  }
  return IsInterfaceProxy(value.proxy, "async");
}

function isNamespaceObject(value: object): boolean {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

interface FacadeVisit {
  facade: object;
  result?: object;
}

function bindFacadeProperty(
  value: object,
  key: PropertyKey,
  facade: object,
  scope: InterfaceFacadeScope,
  seen: WeakMap<object, FacadeVisit>,
): boolean {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor) {
    return false;
  }
  const original: unknown =
    "value" in descriptor ? descriptor.value : Reflect.get(value, key);
  const bound = bindInterfaceFunctions(original, scope, seen);
  Object.defineProperty(
    facade,
    key,
    bound === original
      ? descriptor
      : {
          configurable: descriptor.configurable,
          enumerable: descriptor.enumerable,
          value: bound,
          writable: "writable" in descriptor ? descriptor.writable : false,
        },
  );
  return bound !== original && !(original === value && bound === facade);
}

function bindNamespaceObject(
  value: object,
  scope: InterfaceFacadeScope,
  seen: WeakMap<object, FacadeVisit>,
): object {
  const existing = seen.get(value);
  if (existing) {
    return existing.result ?? existing.facade;
  }
  const facade = Object.create(Object.getPrototypeOf(value));
  const visit: FacadeVisit = { facade };
  seen.set(value, visit);
  const changed = Reflect.ownKeys(value)
    .map((key) => bindFacadeProperty(value, key, facade, scope, seen))
    .some(Boolean);
  const result = changed ? facade : value;
  visit.result = result;
  return result;
}

function bindInterfaceFunctions(
  value: unknown,
  scope: InterfaceFacadeScope,
  seen = new WeakMap<object, FacadeVisit>(),
): unknown {
  if (isInterfaceFunction(value)) {
    return scope.bind(value);
  }
  if (typeof value === "function") {
    const binder = (value as ResolverBindableFunction)[RESOLVER_FACADE_BINDER];
    return binder ? binder(scope) : value;
  }
  if (typeof value !== "object" || value === null) {
    return value;
  }
  if (IsInterfaceProxy(value)) {
    return bindInterfaceProxy(
      value,
      scope.context as ActiveModuleExecutionContext,
    );
  }
  if (!isNamespaceObject(value)) {
    return value;
  }
  return bindNamespaceObject(value, scope, seen);
}

function applyOverrides<T extends Record<string, unknown>>(
  facade: T,
  overrides: Record<string, unknown>,
): T {
  const result = Object.create(Object.getPrototypeOf(facade));
  const overrideKeys = new Set(Reflect.ownKeys(overrides));
  for (const key of Reflect.ownKeys(facade)) {
    const descriptor = Object.getOwnPropertyDescriptor(facade, key);
    if (!descriptor) {
      continue;
    }
    if (!overrideKeys.has(key)) {
      Object.defineProperty(
        result,
        key,
        "value" in descriptor && descriptor.value === facade
          ? { ...descriptor, value: result }
          : descriptor,
      );
      continue;
    }
    Object.defineProperty(result, key, {
      configurable: descriptor.configurable,
      enumerable: descriptor.enumerable,
      value: Reflect.get(overrides, key),
      writable: "writable" in descriptor ? descriptor.writable : false,
    });
    overrideKeys.delete(key);
  }
  for (const key of overrideKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(overrides, key);
    if (descriptor) {
      Object.defineProperty(result, key, descriptor);
    }
  }
  return result;
}

export function CreateInterfaceFacade<T extends Record<string, unknown>>(
  declaration: T,
  context: ModuleExecutionContext,
  builder?: InterfaceFacadeBuilder,
): T {
  const scope = createFacadeScope(context);
  const facade = bindInterfaceFunctions(declaration, scope) as T;
  const factory =
    builder ?? (declaration as InterfaceFacadeDeclaration).BuildInterfaceFacade;
  if (!factory) {
    return facade;
  }
  const overrides = factory(scope, facade);
  if (Reflect.ownKeys(overrides).length === 0) {
    return facade;
  }
  return applyOverrides(facade, overrides);
}

/** @internal Adds a lexical resolver binding to an infrastructure function. */
export function BindResolverFacade<T extends Func>(
  declaration: T,
  binder: ResolverFacadeBinder<T>,
): void {
  Object.defineProperty(declaration, RESOLVER_FACADE_BINDER, {
    configurable: false,
    enumerable: false,
    value: binder,
  });
}
