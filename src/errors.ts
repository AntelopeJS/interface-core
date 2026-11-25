export const MISSING_PROVIDER_CODE = "ERR_NO_PROVIDER";
export const AMBIGUOUS_PROVIDER_CODE = "ERR_AMBIGUOUS_PROVIDER";
export const PROVIDER_QUEUE_FULL_CODE = "ERR_PROVIDER_QUEUE_FULL";
export const MODULE_CONTEXT_INVALIDATED_CODE = "ERR_MODULE_CONTEXT_INVALIDATED";

const MISSING_PROVIDER_MESSAGE =
  "Interface function called without implementation in test environment. " +
  "Ensure the required module is loaded in your test config.";

/**
 * Error emitted when a proxy is used without an attached provider in test
 * stub mode.
 *
 * The detection contract is the stable `code` property, not the message text:
 * detect it with {@link isMissingProviderError}, which also holds across realms
 * and duplicated copies of this package, where `instanceof` fails.
 */
export class MissingProviderError extends Error {
  public readonly code = MISSING_PROVIDER_CODE;

  public constructor(detail?: string) {
    super(detail ?? MISSING_PROVIDER_MESSAGE);
    this.name = "MissingProviderError";
  }
}

/**
 * Error emitted when a call cannot be routed between multiple providers.
 *
 * Detect it with {@link isAmbiguousProviderError}, not `instanceof`.
 */
export class AmbiguousProviderError extends Error {
  public readonly code = AMBIGUOUS_PROVIDER_CODE;

  public constructor(proxyIdentity: string, providers: string[]) {
    super(
      `Interface proxy ${proxyIdentity} has multiple providers (${providers.join(", ")}); run the call in a module execution context with an explicit provider route.`,
    );
    this.name = "AmbiguousProviderError";
  }
}

/**
 * Error emitted when an unattached async proxy has too many pending calls.
 *
 * Detect it with {@link isProviderQueueFullError}, not `instanceof`.
 */
export class ProviderQueueFullError extends Error {
  public readonly code = PROVIDER_QUEUE_FULL_CODE;

  public constructor(proxyIdentity: string, limit: number) {
    super(
      `Interface proxy ${proxyIdentity} has ${limit} pending operations without a provider.`,
    );
    this.name = "ProviderQueueFullError";
  }
}

/**
 * Error emitted when work inherited ownership from a destroyed module.
 *
 * Detect it with {@link isModuleContextInvalidatedError}, not `instanceof`.
 */
export class ModuleContextInvalidatedError extends Error {
  public readonly code = MODULE_CONTEXT_INVALIDATED_CODE;

  public constructor(module: string) {
    super(`Module context has been invalidated: ${module}`);
    this.name = "ModuleContextInvalidatedError";
  }
}

/**
 * Whether the value is an error, including one built in another realm.
 *
 * `instanceof Error` is realm-bound: an error crossing a vm context, worker or
 * iframe boundary carries a different `Error.prototype` and fails it. The brand
 * check holds across realms while still rejecting plain objects; `instanceof`
 * covers the reverse case of an object created from `Error.prototype`.
 */
function isError(value: unknown): value is NodeJS.ErrnoException {
  return (
    Object.prototype.toString.call(value) === "[object Error]" ||
    value instanceof Error
  );
}

/**
 * Type guard for {@link MissingProviderError}.
 *
 * Checks the stable `code` property instead of `instanceof`, so detection
 * survives realm boundaries and duplicated copies of this package.
 */
export function isMissingProviderError(
  error: unknown,
): error is MissingProviderError {
  return isError(error) && error.code === MISSING_PROVIDER_CODE;
}

/**
 * Type guard for {@link AmbiguousProviderError}.
 *
 * Checks the stable `code` property instead of `instanceof`, so detection
 * survives realm boundaries and duplicated copies of this package.
 */
export function isAmbiguousProviderError(
  error: unknown,
): error is AmbiguousProviderError {
  return isError(error) && error.code === AMBIGUOUS_PROVIDER_CODE;
}

/**
 * Type guard for {@link ProviderQueueFullError}.
 *
 * Checks the stable `code` property instead of `instanceof`, so detection
 * survives realm boundaries and duplicated copies of this package.
 */
export function isProviderQueueFullError(
  error: unknown,
): error is ProviderQueueFullError {
  return isError(error) && error.code === PROVIDER_QUEUE_FULL_CODE;
}

/**
 * Type guard for {@link ModuleContextInvalidatedError}.
 *
 * Checks the stable `code` property instead of `instanceof`, so detection
 * survives realm boundaries and duplicated copies of this package.
 */
export function isModuleContextInvalidatedError(
  error: unknown,
): error is ModuleContextInvalidatedError {
  return isError(error) && error.code === MODULE_CONTEXT_INVALIDATED_CODE;
}
