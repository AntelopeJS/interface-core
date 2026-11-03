/** Scenario scripts for the sub-rule journeys: the second parameter forms, ownership details and metadata details the docs state sentence by sentence. */
export const DETAIL_SCENARIOS = {
  "proxy-details": {
    script: String.raw`const dist = process.argv[2];
const c = require(dist + "/index.js");
const m = require(dist + "/modules.js");
const { internal } = require(dist + "/internal.js");
const out = {};
const fails = (f) => { try { f(); return null; } catch (e) { return e.code ?? e.message; } };
(async () => {
  const errOf = async (p) => { try { await p; return null; } catch (e) { return e.code ?? e.message; } };
  const a = new c.AsyncProxy();
  a.onCall(() => "x");
  a.detach();
  internal.testStubMode = true;
  out.asyncDetachNoLease = await errOf(a.call());
  const keep = new c.AsyncProxy();
  const lease = keep.onCall(() => "kept", true);
  keep.detach({ owner: lease.owner, generation: lease.generation + 99 });
  out.asyncDetachWrongLease = await keep.call();
  internal.testStubMode = false;
  const slow = new c.AsyncProxy();
  let release;
  const running = new Promise((r) => { release = r; });
  slow.onCall(() => running.then(() => "finished"));
  const inflight = slow.call();
  slow.detach();
  release();
  out.detachKeepsRunningCall = await inflight;
  const q = new c.AsyncProxy();
  q.onCall(() => "a");
  q.detach();
  const queued = q.call();
  q.onCall(() => "again");
  out.queuesAgainAfterDetach = await queued;
  const f = c.InterfaceFunction("named");
  out.interfaceFunction = [typeof f.proxy.call, c.GetInterfaceProxyIdentity(f.proxy), c.IsInterfaceProxy(f.proxy, "async")];
  const unresolved = c.InterfaceFunction();
  out.anonFn = /^async:anonymous:\d+$/.test(c.GetInterfaceProxyIdentity(unresolved.proxy));
  const ids = [
    c.GetInterfaceProxyIdentity(new c.AsyncProxy("a1")), c.GetInterfaceProxyIdentity(new c.EventProxy("ev")), c.GetInterfaceProxyIdentity(new c.RegisteringProxy("rg")),
    c.GetInterfaceProxyIdentity(new c.EventProxy()), c.GetInterfaceProxyIdentity(new c.RegisteringProxy()),
  ];
  out.identities = ids.map((s) => s.replace(/\d+$/, "N"));
  out.identityNonProxy = [c.GetInterfaceProxyIdentity(null) ?? null, c.GetInterfaceProxyIdentity("x") ?? null, c.GetInterfaceProxyIdentity(() => 1) ?? null];
  out.kindFilter = [["async", "event", "registering"].map((k) => c.IsInterfaceProxy(new c.EventProxy(), k)), c.IsInterfaceProxy(null), c.IsInterfaceProxy(5), c.IsInterfaceProxy({})];
  const ev = new c.EventProxy();
  const got = [];
  ev.emit("before");
  ev.register((x) => got.push(x));
  ev.emit("after");
  out.eventNoQueue = got;
  const asyncHandler = new c.EventProxy();
  asyncHandler.register(() => new Promise((r) => setTimeout(r, 20)));
  out.emitReturns = [asyncHandler.emit() ?? null];
  await new Promise((r) => setTimeout(r, 10));
  const none = new c.EventProxy();
  const ctxSeen = [];
  none.register(() => ctxSeen.push(c.GetResponsibleModule() ?? "none"));
  await m.RunWithModuleContext({ module: "emitter" }, async () => none.emit());
  const reg = new c.EventProxy();
  await m.RunWithModuleContext({ module: "reg" }, async () => { reg.register(() => ctxSeen.push(c.GetResponsibleModule() ?? "none")); });
  await m.RunWithModuleContext({ module: "emitter" }, async () => reg.emit());
  out.eventContext = ctxSeen;
  const own = new c.EventProxy();
  const ownSeen = [];
  await m.RunWithModuleContext({ module: "mA", owner: "mA#1" }, async () => own.register(() => ownSeen.push("A1")));
  await m.RunWithModuleContext({ module: "mA", owner: "mA#2" }, async () => own.register(() => ownSeen.push("A2")));
  await m.RunWithModuleContext({ module: "mB" }, async () => own.register(() => ownSeen.push("B")));
  own.unregisterOwner("mA#1"); own.emit(); const afterOwner = ownSeen.splice(0);
  own.unregisterModule("mA"); own.emit();
  out.eventOwnerCleanup = [afterOwner, ownSeen];
  const big = new c.RegisteringProxy();
  out.noCap = fails(() => { for (let i = 0; i < 1500; i++) big.register("k" + i); });
  const rp = new c.RegisteringProxy();
  rp.register("k", 1); rp.register("k", 2);
  const replay = [];
  rp.onHandlers((id, v) => replay.push([id, v]), () => {});
  out.reregisterReplay = replay;
  const sib = new c.RegisteringProxy();
  const sl = [];
  sib.onHandlers((id) => sl.push("r:" + id), (id) => sl.push("u:" + id));
  sib.onRegister((id) => sl.push("r2:" + id));
  sib.register("x"); sib.unregister("x");
  const sib2 = new c.RegisteringProxy();
  const sl2 = [];
  sib2.onRegister((id) => sl2.push("r:" + id));
  sib2.onUnregister((id) => sl2.push("u:" + id));
  sib2.register("y"); sib2.unregister("y");
  out.siblingsKept = [sl, sl2];
  const un = new c.RegisteringProxy();
  const ul = [];
  un.register("pre", 1);
  un.onUnregister((id) => ul.push("u:" + id));
  out.onUnregisterNoReplay = [ul.slice(), (un.register("w"), ul.slice())];
  const det = new c.RegisteringProxy();
  const dl = [];
  det.onHandlers((id) => dl.push("r:" + id), (id) => dl.push("u:" + id));
  det.register("a");
  det.detach();
  det.register("b"); det.unregister("a");
  det.onHandlers((id) => dl.push("replay:" + id), () => {});
  out.detachAll = dl;
  const sep = new c.RegisteringProxy();
  const spl = [];
  const l1 = sep.onRegister((id) => spl.push("r:" + id));
  const l2 = sep.onUnregister((id) => spl.push("u:" + id));
  sep.detach(l1);
  sep.register("p"); sep.unregister("p");
  out.detachOneLease = spl.slice();
  sep.detach(l2); sep.register("q"); sep.unregister("q");
  out.detachSecondLease = spl.slice();
  const both = new c.RegisteringProxy();
  const bl = [];
  const l3 = both.onHandlers((id) => bl.push("r:" + id), (id) => bl.push("u:" + id));
  both.detach(l3);
  both.register("z"); both.unregister("z");
  out.detachHandlersLease = bl;
  const stored = new c.RegisteringProxy();
  stored.onHandlers(() => {}, () => {});
  stored.register("kept", 1);
  stored.detach();
  const again = [];
  stored.onHandlers((id) => again.push(id), () => {});
  out.entriesSurviveDetach = again;
  const dom = new c.RegisteringProxy();
  const dlog = [];
  dom.onHandlers((id) => dlog.push("r:" + id), (id) => dlog.push("u:" + id));
  await m.RunWithModuleContext({ module: "mx", owner: "mx#1" }, async () => dom.register("e1"));
  await m.RunWithModuleContext({ module: "mx", owner: "mx#2" }, async () => dom.register("e2"));
  await m.RunWithModuleContext({ module: "my" }, async () => dom.register("e3"));
  dom.unregisterOwner("mx#1"); const o1 = dlog.splice(0);
  dom.unregisterModule("mx"); const o2 = dlog.splice(0);
  out.registeringOwnerCleanup = [o1, o2];
  const same = {};
  const seenArgs = [];
  const px = new c.AsyncProxy();
  px.onCall((v) => { seenArgs.push(v === same); return v; });
  out.valuesCrossUnchanged = [(await px.call(same)) === same, seenArgs];
  const Cls = class {};
  const ev3 = new c.EventProxy();
  ev3.register((k) => seenArgs.push(k === Cls));
  ev3.emit(Cls);
  out.classIdentity = seenArgs.slice(-1);
  console.log(JSON.stringify(out));
})();
`,
    expected: String.raw`{"asyncDetachNoLease":"ERR_NO_PROVIDER","asyncDetachWrongLease":"kept","detachKeepsRunningCall":"finished","queuesAgainAfterDetach":"again","interfaceFunction":["function","async:named",true],"anonFn":true,"identities":["async:aN","event:ev","registering:rg","event:anonymous:N","registering:anonymous:N"],"identityNonProxy":[null,null,null],"kindFilter":[[false,true,false],false,false,false],"eventNoQueue":["after"],"emitReturns":[null],"eventContext":["emitter","reg"],"eventOwnerCleanup":[["A2","B"],["B"]],"noCap":null,"reregisterReplay":[["k",2]],"siblingsKept":[["r2:x","u:x"],["r:y","u:y"]],"onUnregisterNoReplay":[[],[]],"detachAll":["r:a","replay:b"],"detachOneLease":["u:p"],"detachSecondLease":["u:p"],"detachHandlersLease":[],"entriesSurviveDetach":["kept"],"registeringOwnerCleanup":[["r:e1","r:e2","r:e3","u:e1"],["u:e2"]],"valuesCrossUnchanged":[true,[true,true]],"classIdentity":[true]}`,
  },
  "ownership-details": {
    script: String.raw`const dist = process.argv[2];
const c = require(dist + "/index.js");
const m = require(dist + "/modules.js");
const { internal } = require(dist + "/internal.js");
const out = {};
const run = (ctx, f) => m.RunWithModuleContext(ctx, f);
(async () => {
  const errOf = async (p) => { try { await p; return null; } catch (e) { return e.code ?? e.message; } };
  const throwsOf = (f) => { try { f(); return null; } catch (e) { return e.code ?? e.message; } };
  const gen = new c.AsyncProxy();
  await run({ module: "g", owner: "g#1" }, async () => gen.onCall(() => "gen1"));
  await run({ module: "g", owner: "g#2" }, async () => gen.onCall(() => "gen2"));
  await run({ module: "g", owner: "g#1" }, async () => m.Events.ModuleDestroyed.emit("g"));
  out.olderGenerationKeepsNewer = await gen.call();
  const nested = new c.AsyncProxy();
  const seen = [];
  await run({ module: "prov", owner: "prov#1" }, async () => nested.onCall(async () => {
    seen.push(c.GetResponsibleModule());
    await new Promise((r) => setTimeout(r, 5));
    seen.push(c.GetResponsibleModule());
    await Promise.resolve().then(() => seen.push(c.GetResponsibleModule()));
  }));
  await run({ module: "caller" }, async () => nested.call());
  out.providerContextAcrossAwait = seen;
  const destroyedDirect = new c.AsyncProxy();
  destroyedDirect.onCall(() => "ok");
  let outcome = null;
  await run({ module: "dd", owner: "dd#1" }, async () => {
    m.Events.ModuleDestroyed.emit("dd");
    outcome = await errOf(destroyedDirect.call());
  });
  out.directCallFromDestroyed = outcome;
  const regDestroyed = new c.RegisteringProxy();
  let regOutcome = null;
  await run({ module: "rd", owner: "rd#1" }, async () => { m.Events.ModuleDestroyed.emit("rd"); regOutcome = throwsOf(() => regDestroyed.register("x")); });
  out.registerFromDestroyed = regOutcome;
  const evDestroyed = new c.EventProxy();
  let evOutcome = "no throw";
  await run({ module: "ed", owner: "ed#1" }, async () => { m.Events.ModuleDestroyed.emit("ed"); evOutcome = throwsOf(() => evDestroyed.register(() => {})); });
  out.eventRegisterFromDestroyed = evOutcome;
  const other = new c.RegisteringProxy();
  const olog = [];
  other.onHandlers((id) => olog.push("r:" + id), (id) => olog.push("u:" + id));
  await run({ module: "alpha" }, async () => other.register("fromAlpha"));
  await run({ module: "beta" }, async () => other.register("fromBeta"));
  await run({ module: "beta" }, async () => m.Events.ModuleDestroyed.emit("alpha"));
  out.destroyedInOtherModulesContext = olog.slice();
  const ownEvents = new c.EventProxy();
  const eseen = [];
  await run({ module: "alpha" }, async () => ownEvents.register(() => eseen.push("alpha")));
  await run({ module: "beta" }, async () => ownEvents.register(() => eseen.push("beta")));
  await run({ module: "beta" }, async () => m.Events.ModuleDestroyed.emit("alpha"));
  ownEvents.emit();
  out.eventsAfterOtherContextDestroy = eseen;
  const outside = new c.AsyncProxy();
  outside.onCall(() => "default owner");
  m.Events.ModuleDestroyed.emit("whatever");
  m.ReleaseOwner("someone-else");
  out.outsideContextSurvives = await outside.call();
  const nestedCtx = [];
  nestedCtx.push(c.GetResponsibleModule() ?? "none");
  await c.RunWithResponsibleModule("outer", async () => {
    nestedCtx.push(c.GetResponsibleModule());
    try { await c.RunWithResponsibleModule("inner", async () => { nestedCtx.push(c.GetResponsibleModule()); throw new Error("x"); }); } catch {}
    nestedCtx.push(c.GetResponsibleModule());
  });
  nestedCtx.push(c.GetResponsibleModule() ?? "none");
  out.runWithResponsibleModule = nestedCtx;
  const syncCtx = c.RunWithResponsibleModule("sync", () => c.GetResponsibleModule());
  out.runWithSync = syncCtx;
  const C = new c.RegisteringProxy();
  const clog = [];
  C.onHandlers((id) => clog.push("r:" + id), (id) => clog.push("u:" + id));
  const B = new c.AsyncProxy();
  await run({ module: "B", owner: "B#1" }, async () => B.onCall(() => { C.register("viaB"); }));
  await run({ module: "A", owner: "A#1" }, async () => B.call());
  m.Events.ModuleDestroyed.emit("A");
  const afterA = clog.slice();
  await run({ module: "B", owner: "B#1" }, async () => m.Events.ModuleDestroyed.emit("B"));
  out.callerDoesNotOwnProviderWork = [afterA, clog.slice()];
  const fwdC = new c.RegisteringProxy();
  const flog = [];
  fwdC.onHandlers((id) => flog.push("C.r:" + id), (id) => flog.push("C.u:" + id));
  const fwdB = new c.RegisteringProxy();
  await run({ module: "B", owner: "B#1" }, async () => fwdB.onHandlers((id) => fwdC.register(id), (id) => fwdC.unregister(id)));
  await run({ module: "A", owner: "A#1" }, async () => fwdB.register("fromA"));
  await run({ module: "A", owner: "A#1" }, async () => m.Events.ModuleDestroyed.emit("A"));
  out.forwarding = flog;
  const reload = new c.RegisteringProxy();
  const rlog = [];
  const rr = (id) => rlog.push("r:" + id);
  reload.register("kept", 1);
  await run({ module: "P", owner: "P#1" }, async () => reload.onHandlers(rr, () => {}));
  await run({ module: "P", owner: "P#1" }, async () => m.Events.ModuleDestroyed.emit("P"));
  await run({ module: "P", owner: "P#2" }, async () => reload.onHandlers(rr, () => {}));
  out.replayToNewGeneration = rlog;
  console.log(JSON.stringify(out));
})();
`,
    expected: String.raw`{"olderGenerationKeepsNewer":"gen2","providerContextAcrossAwait":["prov","prov","prov"],"directCallFromDestroyed":"ERR_MODULE_CONTEXT_INVALIDATED","registerFromDestroyed":"ERR_MODULE_CONTEXT_INVALIDATED","eventRegisterFromDestroyed":"ERR_MODULE_CONTEXT_INVALIDATED","destroyedInOtherModulesContext":["r:fromAlpha","r:fromBeta","u:fromAlpha"],"eventsAfterOtherContextDestroy":["beta"],"outsideContextSurvives":"default owner","runWithResponsibleModule":["none","outer","inner","outer","none"],"runWithSync":"sync","callerDoesNotOwnProviderWork":[["r:viaB"],["r:viaB","u:viaB"]],"forwarding":["C.r:fromA","C.u:fromA"],"replayToNewGeneration":["r:kept","r:kept"]}`,
  },
  "metadata-details": {
    script: String.raw`const dist = process.argv[2];
const c = require(dist + "/index.js");
const out = {};
class Rec { constructor(target) { this.target = target; this.items = []; } inherit(parent) { this.items = [...parent.items]; } }
Rec.key = Symbol("Rec");
class A {} class B extends A {} class C extends B {}
c.GetMetadata(A.prototype, Rec).items.push("root");
out.chain = c.GetMetadata(C.prototype, Rec).items;
out.parentsCreated = [Reflect.hasOwnMetadata(Rec.key, B.prototype), Reflect.hasOwnMetadata(Rec.key, A.prototype), Reflect.hasOwnMetadata(Rec.key, Object.prototype)];
class Spy { constructor(t) { Spy.seen.push(t); } }
Spy.key = Symbol("Spy"); Spy.seen = [];
const target = {};
c.GetMetadata(target, Spy);
out.constructorArgument = [Spy.seen[0] === target, Spy.seen.length];
class D {}
out.ctorVsPrototype = c.GetMetadata(D, Rec) !== c.GetMetadata(D.prototype, Rec);
class P1 {} class P2 extends P1 {}
c.GetMetadata(P1.prototype, Rec).items.push("p");
const noInherit = c.GetMetadata(P2.prototype, Rec, false);
out.createdWithoutInherit = noInherit.items;
out.laterTrueDoesNotRebuild = [c.GetMetadata(P2.prototype, Rec, true) === noInherit, noInherit.items];
class Q1 {} class Q2 extends Q1 {}
c.GetMetadata(Q1.prototype, Rec).items.push("q");
const inherited = c.GetMetadata(Q2.prototype, Rec, true);
out.laterFalseKeepsInherited = [c.GetMetadata(Q2.prototype, Rec, false) === inherited, inherited.items];
class Plain { constructor() { this.own = "child"; this.arr = []; } }
Plain.key = Symbol("Plain");
class R1 {} class R2 extends R1 {}
const rp = c.GetMetadata(R1.prototype, Plain); rp.own = "parent"; rp.extra = "e"; rp.arr.push(1);
const rc = c.GetMetadata(R2.prototype, Plain);
out.defaultCopy = [rc.own, rc.extra, rc.arr, rc.arr === rp.arr];
out.storedOnTarget = Reflect.getOwnMetadata(Plain.key, R2.prototype) === rc;
const proto = {};
class H { constructor() { this.own = 1; } }
H.key = Symbol("H");
class H1 {} class H2 extends H1 {}
const hp = c.GetMetadata(H1.prototype, H);
Object.defineProperty(hp, "hidden", { value: 1, enumerable: false, writable: true, configurable: true });
const hc = c.GetMetadata(H2.prototype, H);
out.copiesNonEnumerable = [Object.hasOwn(hc, "hidden"), hc.hidden];
class N { constructor() { this.own = 1; } inherit() {} }
N.key = Symbol("N");
class N1 {} class N2 extends N1 {}
c.GetMetadata(N1.prototype, N).extra = 5;
out.inheritMethodReplacesCopy = Object.hasOwn(c.GetMetadata(N2.prototype, N), "extra");
class F1 {} class F2 extends F1 {}
c.GetMetadata(F2.prototype, H, false);
out.noInheritCreatesNothingOnParent = [Reflect.hasOwnMetadata(H.key, F1.prototype)];
class S1 {} class S2 extends S1 {}
const shared = { list: [1] };
c.GetMetadata(S1.prototype, H).shared = shared;
out.copyIsShallow = c.GetMetadata(S2.prototype, H).shared === shared;
console.log(JSON.stringify(out));
`,
    expected: String.raw`{"chain":["root"],"parentsCreated":[true,true,true],"constructorArgument":[true,2],"ctorVsPrototype":true,"createdWithoutInherit":[],"laterTrueDoesNotRebuild":[true,[]],"laterFalseKeepsInherited":[true,["q"]],"defaultCopy":["child","e",[],false],"storedOnTarget":true,"copiesNonEnumerable":[true,1],"inheritMethodReplacesCopy":false,"noInheritCreatesNothingOnParent":[false],"copyIsShallow":true}`,
  },
} satisfies { [name: string]: { script: string; expected: string } };
