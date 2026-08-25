import {
  type ActiveModuleExecutionContext,
  activateModuleContext,
  assertActiveModuleContext,
  type ModuleExecutionContext,
  runWithCapturedModuleContext,
} from "./internal";
import {
  GetInterfaceProxyIdentity,
  type InterfaceFunctionProxy,
  IsInterfaceProxy,
} from "./proxies";

type Func<A extends any[] = any[], R = any> = (...args: A) => R;
const activeFacadeContexts = new WeakMap<
  ModuleExecutionContext,
  ActiveModuleExecutionContext
>();

export interface InterfaceFacadeScope {
  readonly context: ModuleExecutionContext;
  bind<T extends Func>(declaration: InterfaceFunctionProxy<T>): T;
  run<T>(callback: () => T): T;
}

export type InterfaceFacadeBuilder = (
  scope: InterfaceFacadeScope,
  facade: Record<string, unknown>,
) => Record<string, unknown>;

interface InterfaceFacadeDeclaration {
  BuildInterfaceFacade?: InterfaceFacadeBuilder;
}

function getSelectedProvider<T extends Func>(
  declaration: InterfaceFunctionProxy<T>,
  context: ModuleExecutionContext,
): string | undefined {
  const identity = GetInterfaceProxyIdentity(declaration.proxy);
  return identity ? context.providerRoutes?.[identity] : undefined;
}

function bindInterfaceFunction<T extends Func>(
  declaration: InterfaceFunctionProxy<T>,
  context: ActiveModuleExecutionContext,
): T {
  const provider = getSelectedProvider(declaration, context);
  const bound = (...args: Parameters<T>) => {
    try {
      assertActiveModuleContext(context);
      return declaration.proxy.callProvider(provider, ...args);
    } catch (error) {
      return Promise.reject(error);
    }
  };
  bound.proxy = declaration.proxy;
  Object.defineProperty(bound, "name", {
    configurable: true,
    value: declaration.name,
  });
  return bound as unknown as T;
}

function createFacadeScope(
  context: ModuleExecutionContext,
): InterfaceFacadeScope {
  let activeContext = activeFacadeContexts.get(context);
  if (activeContext) {
    assertActiveModuleContext(activeContext);
  } else {
    activeContext = activateModuleContext(context);
    activeFacadeContexts.set(context, activeContext);
  }
  return {
    context: activeContext,
    bind: (declaration) => bindInterfaceFunction(declaration, activeContext),
    run: (callback) => runWithCapturedModuleContext(activeContext, callback),
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

function bindInterfaceFunctions(
  value: unknown,
  scope: InterfaceFacadeScope,
  seen = new WeakMap<object, FacadeVisit>(),
): unknown {
  if (isInterfaceFunction(value)) {
    return scope.bind(value);
  }
  if (typeof value !== "object" || value === null) {
    return value;
  }
  if (!isNamespaceObject(value)) {
    return value;
  }
  const existing = seen.get(value);
  if (existing) {
    return existing.result ?? existing.facade;
  }

  const facade = Object.create(Object.getPrototypeOf(value));
  const visit: FacadeVisit = { facade };
  seen.set(value, visit);
  let changed = false;
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor) {
      continue;
    }
    const original: unknown =
      "value" in descriptor ? descriptor.value : Reflect.get(value, key);
    const bound = bindInterfaceFunctions(original, scope, seen);
    const isSelfReference = original === value && bound === facade;
    if (bound !== original && !isSelfReference) {
      changed = true;
    }
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
  }
  visit.result = changed ? facade : value;
  return visit.result;
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
): T {
  const scope = createFacadeScope(context);
  const facade = bindInterfaceFunctions(declaration, scope) as T;
  const factory = (declaration as InterfaceFacadeDeclaration)
    .BuildInterfaceFacade;
  if (!factory) {
    return facade;
  }
  const overrides = factory(scope, facade);
  if (Reflect.ownKeys(overrides).length === 0) {
    return facade;
  }
  return applyOverrides(facade, overrides);
}
