import { strict as assert } from "node:assert";
import fc from "fast-check";

import { internal } from "../internal";
import { ReleaseOwner, RunWithModuleContext } from "../modules";
import {
  ImplementInterface,
  InterfaceFunction,
  MissingProviderError,
  RegisteringProxy,
} from "..";

const memberArbitrary = fc
  .record({
    groups: fc.array(fc.integer({ min: 0, max: 2 }), { maxLength: 3 }),
    kind: fc.constantFrom("sync", "async", "registering"),
    present: fc.boolean(),
    fault: fc.constantFrom(
      "valid",
      "missing",
      "number",
      "null",
      "getter",
      "unregister",
      "replay",
    ),
  })
  .map((member) => ({
    ...member,
    kind:
      member.fault === "replay" || member.fault === "unregister"
        ? "registering"
        : member.kind,
  }));

type Member = ReturnType<typeof memberArbitrary.generate>["value"];
type Observation = string | typeof MissingProviderError;
type Handler = (input: string) => string | Promise<string>;
interface RegisterHandlers {
  register(id: string): void;
  unregister(id: string): void;
}
interface FixtureTree {
  [key: string]:
    | FixtureTree
    | Handler
    | RegisteringProxy<(id: string) => void>
    | RegisterHandlers
    | number
    | null;
}
interface TreeBuilder {
  value: FixtureTree;
  groups: Map<string, TreeBuilder>;
}

function treeBuilder(): TreeBuilder {
  return { value: {}, groups: new Map() };
}

interface Probe {
  path: string;
  kind: "call" | "registering";
  call(): Promise<string>;
  dispose(): void;
}

interface BuiltMember {
  declared: Handler | RegisteringProxy<(id: string) => void>;
  candidate: Handler | RegisterHandlers;
  recovery: Handler | RegisterHandlers;
  probe: Probe;
}

function putMember(
  target: TreeBuilder,
  path: string[],
  value: FixtureTree[string],
  throwOnRead = false,
) {
  const [key, ...rest] = path;
  if (rest.length === 0) {
    Object.defineProperty(target.value, key, {
      configurable: true,
      enumerable: true,
      ...(throwOnRead
        ? {
            get() {
              throw new Error(`getter:${key}`);
            },
          }
        : { value }),
    });
    return;
  }
  const group = target.groups.get(key) ?? treeBuilder();
  target.groups.set(key, group);
  putMember(target, [key], group.value);
  putMember(group, rest, value, throwOnRead);
}

function makeMember(member: Member, path: string): BuiltMember {
  if (member.kind !== "registering" && member.fault !== "replay") {
    const call = InterfaceFunction<(input: string) => string>(path);
    const candidate =
      member.kind === "async"
        ? async (input: string) => `candidate:${path}:${input}`
        : (input: string) => `candidate:${path}:${input}`;
    return {
      declared: call,
      candidate,
      recovery: (input: string) => `recovery:${path}:${input}`,
      probe: {
        path,
        kind: "call",
        call: () => call("input"),
        dispose: () => undefined,
      },
    };
  }
  const proxy = new RegisteringProxy<(id: string) => void>(path);
  const effects: string[] = [];
  if (member.fault === "replay") {
    proxy.register("queued");
  }
  return {
    declared: proxy,
    candidate: {
      register: (id: string) => {
        if (member.fault === "replay" && id === "queued") {
          throw new Error(`replay:${path}`);
        }
        effects.push(`candidate:${path}:register`);
      },
      unregister: () => effects.push(`candidate:${path}:unregister`),
    },
    recovery: {
      register: () => effects.push(`recovery:${path}:register`),
      unregister: () => effects.push(`recovery:${path}:unregister`),
    },
    probe: {
      path,
      kind: "registering",
      call: async () => {
        effects.length = 0;
        proxy.register("probe");
        proxy.unregister("probe");
        return effects.join(",");
      },
      dispose: () => proxy.unregister("queued"),
    },
  };
}

function buildFixture(members: Member[]) {
  const declaration = treeBuilder();
  const candidate = treeBuilder();
  const recovery = treeBuilder();
  const probes: Probe[] = [];
  members.forEach((member, index) => {
    if (!member.present) {
      return;
    }
    const keys = [...member.groups.map((group) => `g${group}`), `f${index}`];
    const path = keys.join(".");
    const built = makeMember(member, path);
    if (member.fault === "unregister") {
      Object.defineProperty(built.candidate, "unregister", { value: 17 });
    }
    putMember(declaration, keys, built.declared);
    putMember(recovery, keys, built.recovery);
    probes.push(built.probe);
    if (member.fault === "missing") {
      return;
    }
    const value =
      member.fault === "number"
        ? 17
        : member.fault === "null"
          ? null
          : built.candidate;
    putMember(candidate, keys, value, member.fault === "getter");
  });
  return {
    declaration: declaration.value,
    candidate: candidate.value,
    recovery: recovery.value,
    probes,
  };
}

async function observe(probes: Probe[]): Promise<Observation[]> {
  return Promise.all(
    probes.map(async (probe) => {
      try {
        return await probe.call();
      } catch (error) {
        if (error instanceof MissingProviderError) {
          return MissingProviderError;
        }
        throw error;
      }
    }),
  );
}

function expected(probe: Probe, provider: string): string {
  return probe.kind === "call"
    ? `${provider}:${probe.path}:input`
    : `${provider}:${probe.path}:register,${provider}:${probe.path}:unregister`;
}

describe("ImplementInterface atomicity property", () => {
  for (const scenario of ["validation", "attachment replay"]) {
    it(`rejects partial attachment after ${scenario} failures`, async () => {
      await fc.assert(
        fc.asyncProperty(
          fc
            .array(memberArbitrary, { maxLength: 8 })
            .filter(
              (members) =>
                scenario !== "validation" ||
                members.every((member) => member.fault !== "replay"),
            ),
          fc.boolean(),
          async (members, reporterRethrows) => {
            const fixture = buildFixture(members);
            const previousStubMode = internal.testStubMode;
            const previousReporter = internal.runtimeErrorReporter;
            const owner = "test.atomicity-property";
            internal.testStubMode = true;
            internal.runtimeErrorReporter = (error) => {
              if (reporterRethrows) {
                throw error;
              }
            };
            try {
              let failed = false;
              try {
                RunWithModuleContext({ module: owner }, () => {
                  ImplementInterface<{}, {}>(
                    fixture.declaration,
                    fixture.candidate,
                  );
                });
              } catch {
                failed = true;
              }
              const observed = await observe(fixture.probes);
              RunWithModuleContext({ module: owner }, () => {
                ImplementInterface<{}, {}>(
                  fixture.declaration,
                  fixture.recovery,
                );
              });
              const recoveryObserved = await observe(fixture.probes);
              assert.deepEqual(
                observed,
                failed
                  ? fixture.probes.map(() => MissingProviderError)
                  : fixture.probes.map((probe) => expected(probe, "candidate")),
                "failed attachment must leave no consumer-visible handlers",
              );
              assert.deepEqual(
                recoveryObserved,
                fixture.probes.map((probe) => expected(probe, "recovery")),
                "a valid retry must replace every handler",
              );
            } finally {
              internal.runtimeErrorReporter = previousReporter;
              internal.testStubMode = previousStubMode;
              fixture.probes.forEach((probe) => probe.dispose());
              ReleaseOwner(owner);
            }
          },
        ),
        {
          seed: Number(process.env.FC_SEED ?? 20261028),
          numRuns: 500,
          verbose: true,
        },
      );
    });
  }
});
