---
name: formal-implement-interface
description: Checks ImplementInterface atomic attachment with generated declaration trees. Use when changing interface validation, attachment planning, proxy attachment or replay, or module ownership during attachment.
---

# Check ImplementInterface atomicity

Run this check when a change touches the coverage record below, including callers that change the inputs to `ImplementInterface`.

The property requires a successful `ImplementInterface` call to route every declared handler to its implementation, and a failed call to leave none attached and permit a clean valid retry.
Partial attachment lets a consumer call a provider that failed to initialize.

## Run the check

From the repository root, run:

```sh
pnpm run build && pnpm exec mocha dist/tests/implement-interface-atomicity.test.js
```

The test uses fast-check 4.3.0 from the pinned devDependency and lockfile. Each of the two scenarios requests 500 runs. The default seed is `20261028`. Set `FC_SEED` to the integer printed by a failure to reproduce another run. Keep the generator and fast-check version unchanged when replaying a seed. Fast-check prints the shrink path and final counterexample.

The validation scenario excludes replay faults so that a new validation regression remains visible even when attachment replay already fails. The attachment replay scenario includes all faults. Both use the same consumer oracle and retry check.

## Judge the result

1. Read the shrunk member list and reporter flag. Member `fN` sits below its `g0`, `g1`, or `g2` group path. `present: false` omits an optional member from both objects. A declared member is required at runtime, even if a TypeScript implementation type marks it optional.
2. Confirm that fixture construction finishes and the failure comes from a consumer assertion or valid retry. A failure in `treeBuilder`, `putMember`, or `makeMember` is a generator error until reproduced through the public interface.
3. Check the observable result. Function probes must return the provider marker and input. Registering probes must invoke both register and unregister. Only `MissingProviderError` means unattached. Other consumer errors fail the property.
4. A replay fault queues a registration before attachment. Its implementation throws for that queued ID only. A generated flag chooses whether `internal.runtimeErrorReporter` returns or rethrows. A rethrow is an attachment exception in the real `RegisteringProxy`, not a mocked attachment method.
5. Keep a product failure as a finding. Report the counterexample before proposing a product fix, excluding inputs, skipping the test, or accepting an expected failure. A failure makes the verification verdict FAIL.

The test calls the public `ImplementInterface` with explicit empty-object generic parameters because it deliberately supplies dynamically generated malformed implementations. It observes public interface calls, not attachment maps. It uses `internal.testStubMode` only to turn missing-provider queues into immediate `MissingProviderError` results. It restores that flag and the reporter, removes queued registrations, and releases the provider owner after every run and shrink.

## Bounds and exclusions

The generator chooses zero to eight member slots. Each present member has zero to three nested groups, with three group names at each level. Names `fN` cannot collide with group names. Leaves use sync handlers, async handlers, or `RegisteringProxy` handler pairs. Faults include a missing member, a number, null, an enumerable getter that throws, a malformed unregister handler, and a throw during registration replay. `valid` has weight 6 and `replay` weight 2 against 1 for each other fault, so trees where a replay throws after other handlers attached come up often. With equal weights, 500 runs missed a dropped outer rollback.

The sync and async handlers both use `InterfaceFunction`, whose consumer contract always returns a promise. Successful recovery uses a distinct provider marker. The oracle checks the candidate before the retry and checks every recovered handler afterward.

This is randomized testing of real TypeScript code, not an exhaustive proof. It does not cover arbitrary cycles, shared declaration nodes, event subscriptions, pre-existing providers (one case, a released owner failing to replace a healthy provider, is a fixed regression test in `implement-interface-validation.test.ts`), deprecated thenable inputs, concurrent attachment, module destruction interleavings, or rollback of external side effects already performed by a provider callback. The error reporter is part of the generated environment. A returning reporter absorbs replay errors and allows the remaining attachments to proceed.

## Coverage record

Last code synchronization is the commit that makes rollback lease-specific, the head of the pull request that adds this skill.

| File | Covered functions and role |
| --- | --- |
| `src/index.ts` | `ImplementInterface`, `attachImplementation` and its rollback, `leasedPlan`, `assertAcyclic`, `createAttachmentPlan`, `planProxyAttachment`, `requireFunction`, and object recognition during tree validation and attachment. |
| `src/proxies.ts` | `InterfaceFunction`, `AsyncProxy.onCall`, `AsyncProxy.call`, `AsyncProxy.invoke`, `RegisteringProxy.onHandlers`, `RegisteringProxy.replayOrDetach`, `RegisteringProxy.register`, `RegisteringProxy.unregister`, `RegisteringProxy.replayRegistrations`, `reportRuntimeError`, and attachment ownership capture. |
| `src/internal.ts` | `runWithModuleContext`, `captureModuleContext`, and runtime flags and reporter hooks used during attachment. |
| `src/modules.ts` | `RunWithModuleContext` supplies provider ownership. `ReleaseOwner` cleans up the fixture, but lifecycle correctness is not verified. |
| `src/tests/implement-interface-atomicity.test.ts` | Generated trees, candidate and recovery implementations, consumer probes, seed, and both property scenarios. |

`src/runtime.ts` declares interface functions through `InterfaceFunction` but owns no attachment logic. Changes that alter how those declarations are built can still require this check.

After covered code changes, compare its behavior with these assumptions and rerun the property. Move the synchronization commit forward only after confirming that the test still describes the new code. Use `pstack:maintain-formal-verification-skill` for a drift pass. A known product failure does not justify claiming a passing result.

## Finding and fix

At `1fa59c6`, validation passed 500 runs and attachment replay failed with seed `20261028`, shrink path `1:1:1:1`, after two generated cases and three shrinks:

```text
[[{"groups":[],"kind":"registering","present":true,"fault":"replay"}],true]
```

The declaration contains `f0`, a real `RegisteringProxy`. A consumer registers `queued` before attachment. `ImplementInterface` installs both handlers, replays `queued`, and the handler throws. The runtime error reporter rethrows, so `ImplementInterface` throws, yet a later consumer still reached `candidate:f0:register,candidate:f0:unregister` instead of `MissingProviderError`. With an interface function before the throwing proxy and another after it, the first answered and the second did not: a partial provider.

The fix has two parts. `RegisteringProxy.onHandlers` and `onRegister` detach their own lease when replay throws. `attachImplementation` keeps one detach function per handler that returned a lease, and calls them in reverse when a later handler throws. A handler that threw before it returned a lease is never detached by `attachImplementation`, so a failed call cannot clear a provider that another call attached. A first version detached with no lease in that case. It cleared a healthy provider when a released owner's call failed while capturing its context, which a cross-model review found and the regression test now covers.

## Mutation evidence

Each scratch change below was applied to the fixed code, caught, and removed. The check then reported `2 passing` again. On `main`, the check reports `1 passing`, `1 failing` with the counterexample above.

| Scratch change | Result |
| --- | --- |
| Remove the reverse detach loop in `attachImplementation` | 1 failing, `[[{"groups":[],"kind":"sync","present":true,"fault":"valid"},{"groups":[],"kind":"registering","present":true,"fault":"replay"}],true]` |
| Remove `this.detach(lease)` from `replayOrDetach` | 1 failing, `[[{"groups":[],"kind":"registering","present":true,"fault":"replay"}],true]` |
| Call `proxyPlan.attach()` while planning, in `createAttachmentPlan` | 2 failing, validation shrinks to `[[{"groups":[],"kind":"sync","present":true,"fault":"valid"},{"groups":[],"kind":"sync","present":true,"fault":"null"}],false]` |
