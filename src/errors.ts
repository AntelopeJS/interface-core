export const MISSING_PROVIDER_CODE = "ERR_NO_PROVIDER";
export const MODULE_CONTEXT_INVALIDATED_CODE = "ERR_MODULE_CONTEXT_INVALIDATED";

const MISSING_PROVIDER_MESSAGE =
  "Interface function called without implementation in test environment. " +
  "Ensure the required module is loaded in your test config.";

/**
 * Error emitted when a proxy is used without an attached provider in test
 * stub mode.
 *
 * The detection contract is the type and the stable `code` property, not the
 * message text: use `instanceof MissingProviderError` or, across duplicated
 * copies of this package, {@link isMissingProviderError}.
 */
export class MissingProviderError extends Error {
  public readonly code = MISSING_PROVIDER_CODE;

  public constructor(detail?: string) {
    super(detail ?? MISSING_PROVIDER_MESSAGE);
    this.name = "MissingProviderError";
  }
}

/**
 * Error emitted when work inherited ownership from a destroyed module.
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
function isError(value: unknown): value is Error {
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
  return (
    isError(error) &&
    (error as MissingProviderError).code === MISSING_PROVIDER_CODE
  );
}
