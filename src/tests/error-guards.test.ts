import { expect } from "chai";
import { runInNewContext } from "node:vm";

import {
  AMBIGUOUS_PROVIDER_CODE,
  AmbiguousProviderError,
  isAmbiguousProviderError,
  isMissingProviderError,
  isModuleContextInvalidatedError,
  isProviderQueueFullError,
  MISSING_PROVIDER_CODE,
  MissingProviderError,
  MODULE_CONTEXT_INVALIDATED_CODE,
  ModuleContextInvalidatedError,
  PROVIDER_QUEUE_FULL_CODE,
  ProviderQueueFullError,
} from "..";

const GUARDS = [
  {
    name: "isMissingProviderError",
    guard: isMissingProviderError,
    code: MISSING_PROVIDER_CODE,
    create: () => new MissingProviderError(),
  },
  {
    name: "isAmbiguousProviderError",
    guard: isAmbiguousProviderError,
    code: AMBIGUOUS_PROVIDER_CODE,
    create: () => new AmbiguousProviderError("test.proxy", ["a", "b"]),
  },
  {
    name: "isProviderQueueFullError",
    guard: isProviderQueueFullError,
    code: PROVIDER_QUEUE_FULL_CODE,
    create: () => new ProviderQueueFullError("test.proxy", 2),
  },
  {
    name: "isModuleContextInvalidatedError",
    guard: isModuleContextInvalidatedError,
    code: MODULE_CONTEXT_INVALIDATED_CODE,
    create: () => new ModuleContextInvalidatedError("module"),
  },
];

describe("error guards", () => {
  for (const { name, guard, code, create } of GUARDS) {
    describe(`${name}`, () => {
      it("accepts an instance of its error", () => {
        expect(guard(create())).to.equal(true);
      });

      it("accepts an error carrying its code from a duplicated package copy", () => {
        const foreignCopy = Object.assign(new Error("other wording"), { code });
        expect(guard(foreignCopy)).to.equal(true);
      });

      it("accepts an error carrying its code from another realm", () => {
        const foreignRealmError: unknown = runInNewContext(
          "Object.assign(new Error('other realm'), { code })",
          { code },
        );
        expect(foreignRealmError instanceof Error).to.equal(false);
        expect(guard(foreignRealmError)).to.equal(true);
      });

      it("rejects the other package errors", () => {
        const others = GUARDS.filter((entry) => entry.guard !== guard).map(
          (entry) => guard(entry.create()),
        );
        expect(others).to.deep.equal([false, false, false]);
      });

      it("rejects an unrelated error, a non-error carrying its code and undefined", () => {
        expect(
          [new Error("boom"), { code }, undefined].map((value) => guard(value)),
        ).to.deep.equal([false, false, false]);
      });
    });
  }
});
