export const MISSING_PROVIDER_CODE = "ERR_NO_PROVIDER";

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
 * Type guard for {@link MissingProviderError}.
 *
 * Checks the stable `code` property instead of `instanceof`, so detection
 * survives realm boundaries and duplicated copies of this package.
 */
export function isMissingProviderError(
  error: unknown,
): error is MissingProviderError {
  return (
    error instanceof Error &&
    (error as MissingProviderError).code === MISSING_PROVIDER_CODE
  );
}
