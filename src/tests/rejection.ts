import { expect } from "chai";

/** Whether the value is an `Error`. */
export function isError(value: unknown): value is Error {
  return value instanceof Error;
}

/** Awaits a promise that must reject with a value `isExpected` accepts and returns that rejection. */
export async function rejectionOf<E>(
  promise: PromiseLike<unknown>,
  isExpected: (reason: unknown) => reason is E,
): Promise<E> {
  const [settled] = await Promise.allSettled([promise]);
  if (settled.status === "fulfilled") {
    expect.fail(`expected a rejection accepted by ${isExpected.name}`);
  }
  if (isExpected(settled.reason)) {
    return settled.reason;
  }
  return expect.fail(`expected a rejection accepted by ${isExpected.name}`);
}
