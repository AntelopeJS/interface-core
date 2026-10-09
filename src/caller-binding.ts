import { types as utilTypes } from "node:util";

import { captureModuleContext, runWithCapturedModuleContext } from "./internal";

type CapturedContext = NonNullable<ReturnType<typeof captureModuleContext>>;
type Callable = (...args: unknown[]) => unknown;
type PlainContainer = Record<PropertyKey, unknown> | unknown[];
type BindableValue = PlainContainer | Callable;

const bindingsBySource = new WeakMap<
  BindableValue,
  WeakMap<CapturedContext, BindableValue>
>();
const boundValues = new WeakSet<BindableValue>();

function hasPlainPrototype(value: NonNullable<unknown>): boolean {
  if (Array.isArray(value)) {
    return true;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isBindableContainer(value: unknown): value is PlainContainer {
  return (
    typeof value === "object" &&
    value !== null &&
    !utilTypes.isProxy(value) &&
    hasPlainPrototype(value)
  );
}

function holdsFunction(value: unknown, visited: Set<object>): boolean {
  if (typeof value === "function") {
    return true;
  }
  if (!isBindableContainer(value) || visited.has(value)) {
    return false;
  }
  visited.add(value);
  return Object.values(value).some((member) => holdsFunction(member, visited));
}

function needsBinding(value: unknown): value is BindableValue {
  if (typeof value === "function") {
    return !boundValues.has(value as Callable);
  }
  return (
    isBindableContainer(value) &&
    !boundValues.has(value) &&
    holdsFunction(value, new Set())
  );
}

function createFunctionBinding(
  target: Callable,
  context: CapturedContext,
): Callable {
  return new Proxy(target, {
    apply: (callable, thisArg, argumentsList: unknown[]) =>
      runWithCapturedModuleContext(context, () =>
        callable.apply(thisArg, argumentsList),
      ),
    construct: (callable, argumentsList, newTarget) =>
      runWithCapturedModuleContext(context, () =>
        Reflect.construct(callable, argumentsList, newTarget),
      ),
  });
}

function createContainerBinding(
  target: PlainContainer,
  context: CapturedContext,
): PlainContainer {
  return new Proxy(target, {
    get: (container: Record<PropertyKey, unknown>, property) => {
      const member = container[property];
      const descriptor = Reflect.getOwnPropertyDescriptor(container, property);
      const isFixed =
        descriptor !== undefined &&
        !descriptor.configurable &&
        "value" in descriptor &&
        !descriptor.writable;
      return isFixed ? member : bindValue(member, context);
    },
  });
}

function bindValue(value: unknown, context: CapturedContext): unknown {
  if (!needsBinding(value)) {
    return value;
  }
  const cached = bindingsBySource.get(value)?.get(context);
  if (cached) {
    return cached;
  }
  const bound =
    typeof value === "function"
      ? createFunctionBinding(value as Callable, context)
      : createContainerBinding(value, context);
  const contexts =
    bindingsBySource.get(value) ??
    new WeakMap<CapturedContext, BindableValue>();
  contexts.set(context, bound);
  bindingsBySource.set(value, contexts);
  boundValues.add(bound);
  return bound;
}

/**
 * Binds the functions a caller hands to an interface proxy to the caller's
 * module context, so they run as the caller's work whoever invokes them.
 *
 * Functions, and functions held in plain objects and arrays, are bound; plain
 * data, class instances and proxies cross unchanged. A value is bound once per
 * context, and a value that is already bound keeps its original context.
 */
export function bindCallerArguments<T extends unknown[]>(args: T): T {
  const context = captureModuleContext();
  if (!context) {
    return args;
  }
  return args.map((argument) => bindValue(argument, context)) as T;
}

/** Binds a single caller function to the caller's module context. */
export function bindCallerFunction<T extends (...args: any[]) => unknown>(
  callback: T,
): T {
  const context = captureModuleContext();
  return context ? (bindValue(callback, context) as T) : callback;
}
