/** Scenario scripts for the proxy-lifecycle, implement, metadata, errors journeys: the Node script each runs against the built package, and what it must print (read against the docs page the journey names). */
export const CALL_SCENARIOS = {
  "errors": {
    script: String.raw`const dist = process.argv[2];
const c = require(dist + "/index.js");
const out = {};
out.codes = [c.MISSING_PROVIDER_CODE, c.AMBIGUOUS_PROVIDER_CODE, c.PROVIDER_QUEUE_FULL_CODE, c.MODULE_CONTEXT_INVALIDATED_CODE];
const m = new c.MissingProviderError();
out.missing = [m.code, m.name, m instanceof Error, c.isMissingProviderError(m)];
out.custom = new c.MissingProviderError("detail").message;
out.others = [new c.AmbiguousProviderError("p", ["a", "b"]), new c.ProviderQueueFullError("p", 3), new c.ModuleContextInvalidatedError("mod")].map((e) => [e.name, e.code, e.message]);
const vm = require("node:vm");
const foreign = vm.runInNewContext("(() => { const e = new Error('x'); e.code = 'ERR_NO_PROVIDER'; return e; })()");
out.guard = [c.isMissingProviderError(foreign), foreign instanceof Error, c.isMissingProviderError({ code: "ERR_NO_PROVIDER" }), c.isMissingProviderError(Object.assign(new Error("y"), { code: "OTHER" })), c.isMissingProviderError(null), c.isMissingProviderError("ERR_NO_PROVIDER")];
const { internal } = require(dist + "/internal.js");
internal.testStubMode = true;
(async () => {
  let a = null; try { await new c.AsyncProxy().call(); } catch (e) { a = e.code; }
  let r = null; try { new c.RegisteringProxy().register("x"); } catch (e) { r = e.code; }
  internal.testStubMode = false;
  out.stub = [a, r];
  console.log(JSON.stringify(out));
})();
`,
    expected: String.raw`{"codes":["ERR_NO_PROVIDER","ERR_AMBIGUOUS_PROVIDER","ERR_PROVIDER_QUEUE_FULL","ERR_MODULE_CONTEXT_INVALIDATED"],"missing":["ERR_NO_PROVIDER","MissingProviderError",true,true],"custom":"detail","others":[["AmbiguousProviderError","ERR_AMBIGUOUS_PROVIDER","Interface proxy p has multiple providers (a, b); run the call in a module execution context with an explicit provider route."],["ProviderQueueFullError","ERR_PROVIDER_QUEUE_FULL","Interface proxy p has 3 pending operations without a provider."],["ModuleContextInvalidatedError","ERR_MODULE_CONTEXT_INVALIDATED","Module context has been invalidated: mod"]],"guard":[true,false,false,false,false,false],"stub":["ERR_NO_PROVIDER","ERR_NO_PROVIDER"]}`,
  },
  "implement": {
    script: String.raw`const dist = process.argv[2];
const c = require(dist + "/index.js");
const mods = require(dist + "/modules.js");
const t = (f) => { try { f(); return null; } catch (e) { return e.constructor.name + ":" + e.message.split(" at ")[0].replace(/\.$/, ""); } };
const out = {};
const GetItem = c.InterfaceFunction("GetItem");
const OnAdded = new c.EventProxy();
const Reg = new c.RegisteringProxy();
const decl = { GetItem, OnAdded, Reg, nested: { Deep: c.InterfaceFunction("Deep") } };
const store = new Map();
const r = c.ImplementInterface(decl, { GetItem: (id) => ({ name: "Item " + id }), Reg: { register: (id, d) => store.set(id, d), unregister: (id) => store.delete(id) }, nested: { Deep: () => 7 } });
out.returned = [r.declaration === decl, Object.keys(r.implementation)];
(async () => {
  out.call = await GetItem("1");
  out.deep = await decl.nested.Deep();
  Reg.register("k", 5);
  out.registered = [...store.entries()];
  out.eventSkipped = t(() => c.ImplementInterface({ E: new c.EventProxy() }, {}));
  out.missingFn = t(() => c.ImplementInterface({ A: c.InterfaceFunction() }, {}));
  out.missingUnreg = t(() => c.ImplementInterface({ R: new c.RegisteringProxy() }, { R: { register() {} } }));
  out.notObject = [t(() => c.ImplementInterface(null, {})), t(() => c.ImplementInterface({}, 5))];
  const cyc = {}; cyc.self = cyc;
  out.cycle = [t(() => c.ImplementInterface(cyc, {})), t(() => c.ImplementInterface({}, cyc))];
  const first = c.InterfaceFunction("first"); const second = c.InterfaceFunction("second");
  const bad = t(() => c.ImplementInterface({ first, second }, { first: () => "x" }));
  const notAttached = await Promise.race([first().then(() => "attached"), new Promise((res) => setTimeout(() => res("still queued"), 100))]);
  out.atomic = [bad, notAttached];
  const p = c.ImplementInterface(Promise.resolve({ P: c.InterfaceFunction("P") }), Promise.resolve({ P: () => "async overload" }));
  out.thenable = [typeof p.then, (await p).implementation.P()];
  out.protoKey = t(() => c.ImplementInterface({ toString: c.InterfaceFunction("ts") }, {}));
  out.instances = [c.GetInterfaceInstances("x"), c.GetInterfaceInstance("x", "y") ?? null, c.GetResponsibleModule() ?? null];
  await mods.RunWithModuleContext({ module: "mod-a" }, async () => { out.responsible = c.GetResponsibleModule(); out.inModule = c.GetInterfaceInstances("none"); });
  const { internal } = require(dist + "/internal.js");
  internal.interfaceConnections.consumer = { database: [{ id: "primary", path: "/p", provider: "db-a", selected: true }, { path: "/q", selected: false }] };
  await mods.RunWithModuleContext({ module: "consumer" }, async () => { out.connections = [c.GetInterfaceInstances("database"), c.GetInterfaceInstance("database", "primary"), c.GetInterfaceInstance("database", "none") ?? null, c.GetInterfaceInstances("other")]; });
  delete internal.interfaceConnections.consumer;
  out.runWith = await c.RunWithResponsibleModule("mod-b", async () => c.GetResponsibleModule());
  console.log(JSON.stringify(out));
})();
`,
    expected: String.raw`{"returned":[true,["GetItem","Reg","nested"]],"call":{"name":"Item 1"},"deep":7,"registered":[["k",5]],"eventSkipped":null,"missingFn":"TypeError:Missing or malformed interface handler","missingUnreg":"TypeError:Missing or malformed interface handler","notObject":["TypeError:Interface declaration and implementation must be objects","TypeError:Interface declaration and implementation must be objects"],"cycle":["TypeError:declaration contains a cycle","TypeError:implementation contains a cycle"],"atomic":["TypeError:Missing or malformed interface handler","still queued"],"thenable":["function","async overload"],"protoKey":"TypeError:Missing or malformed interface handler","instances":[[],null,null],"responsible":"mod-a","inModule":[],"connections":[[{"id":"primary","path":"/p","provider":"db-a","selected":true},{"path":"/q","selected":false}],{"id":"primary","path":"/p","provider":"db-a","selected":true},null,[]],"runWith":"mod-b"}`,
  },
  "metadata": {
    script: String.raw`const dist = process.argv[2];
const c = require(dist + "/index.js");
const out = {};
class Meta { constructor(t) { this.own = []; this.t = t === undefined; } }
Meta.key = Symbol("Meta");
class Base {} class Child extends Base {}
const a = c.GetMetadata(Base.prototype, Meta);
a.own.push("base");
out.same = c.GetMetadata(Base.prototype, Meta) === a;
const ch = c.GetMetadata(Child.prototype, Meta);
out.childDefault = [ch !== a, ch.own];
class InhMeta { constructor() { this.mw = []; } inherit(p) { this.mw = [...p.mw]; } }
InhMeta.key = Symbol("InhMeta");
class B2 {} class C2 extends B2 {}
c.GetMetadata(B2.prototype, InhMeta).mw.push("auth");
const c2 = c.GetMetadata(C2.prototype, InhMeta);
c2.mw.push("admin");
out.inherit = [c2.mw, c.GetMetadata(B2.prototype, InhMeta).mw];
class Plain { constructor() { this.x = 1; } }
Plain.key = Symbol("Plain");
class B3 {} class C3 extends B3 {}
c.GetMetadata(B3.prototype, Plain).y = 2;
out.copy = Object.keys(c.GetMetadata(C3.prototype, Plain)).sort();
class B4 {} class C4 extends B4 {}
c.GetMetadata(B4.prototype, Plain).y = 2;
out.noInherit = Object.keys(c.GetMetadata(C4.prototype, Plain, false)).sort();
const target = {};
out.reflect = [c.GetMetadata(target, Plain) === Reflect.getOwnMetadata(Plain.key, target)];
console.log(JSON.stringify(out));
`,
    expected: String.raw`{"same":true,"childDefault":[true,[]],"inherit":[["auth","admin"],["auth"]],"copy":["x","y"],"noInherit":["x"],"reflect":[true]}`,
  },
  "proxy-lifecycle": {
    script: String.raw`const dist = process.argv[2];
const c = require(dist + "/index.js");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const err = async (p) => { try { await p; return null; } catch (e) { return e.code ?? e.message; } };
(async () => {
  const out = {};
  const p = new c.AsyncProxy("greeting");
  const early = p.call("Alice");
  const lease = p.onCall((n) => "Hello, " + n + "!");
  out.queued = await early;
  out.later = await p.call("Bob");
  const old = p.onCall(() => "old", true);
  const cur = p.onCall(() => "current", true);
  p.detach(old);
  out.staleLease = await p.call();
  p.detach(cur);
  const q = new c.AsyncProxy();
  const pend = [];
  for (let i = 0; i < 1000; i++) pend.push(q.call(i));
  out.full = await err(q.call(1000));
  q.onCall((i) => i);
  out.drained = (await Promise.all(pend)).length;
  out.leaseShape = Object.keys(cur).sort();
  const f = c.InterfaceFunction("fn");
  out.identity = [c.GetInterfaceProxyIdentity(f.proxy), c.GetInterfaceProxyIdentity({}), c.GetInterfaceProxyIdentity(f), c.IsInterfaceProxy(f.proxy, "async"), c.IsInterfaceProxy(f.proxy, "event"), c.IsInterfaceProxy(f), c.IsInterfaceProxy(new c.EventProxy(), "event"), c.IsInterfaceProxy(new c.RegisteringProxy(), "registering")];
  out.anon = /^async:anonymous:\d+$/.test(c.GetInterfaceProxyIdentity(new c.AsyncProxy()));
  const e = new c.EventProxy();
  const seen = [];
  const h1 = (a) => { seen.push("h1:" + a); };
  const h2 = (a) => { seen.push("h2:" + a); };
  e.register(h1); e.register(h1); e.register(() => { throw new Error("x"); }); e.register(h2);
  e.emit("a");
  e.unregister(h1);
  e.emit("b");
  out.event = seen;
  const reg = new c.RegisteringProxy();
  reg.register("a", 1); reg.register("b", 2);
  const log = [];
  reg.onHandlers((id, v) => log.push("r:" + id + v), (id) => log.push("u:" + id));
  reg.unregister("a"); reg.unregister("zzz");
  reg.register("b", 3);
  out.registering = log;
  const lone = new c.RegisteringProxy();
  const log2 = [];
  lone.register("x", 1);
  lone.onRegister((id) => log2.push("r:" + id));
  lone.onUnregister((id) => log2.push("u:" + id));
  lone.unregister("x");
  out.separate = log2;
  const thrower = new c.RegisteringProxy();
  thrower.onHandlers(() => { throw new Error("boom"); }, () => { throw new Error("un"); });
  let direct = null; try { thrower.register("i", 1); } catch (x) { direct = x.message; }
  let still = true; try { thrower.unregister("i"); } catch (x) { still = x.message; }
  out.throwing = [direct, still];
  const again = new c.RegisteringProxy();
  const log3 = [];
  again.onHandlers((id, v) => log3.push("r:" + id + v), (id) => log3.push("u:" + id));
  again.register("k", 1); again.register("k", 2);
  out.reregister = log3;
  const reported = [];
  const { internal } = require(dist + "/internal.js");
  internal.runtimeErrorReporter = (cause, details) => reported.push(details.operation + ":" + cause.message);
  const ev2 = new c.EventProxy();
  const ran = [];
  ev2.register(() => { throw new Error("bad"); }); ev2.register(() => ran.push("later"));
  ev2.emit();
  const replayed = new c.RegisteringProxy();
  replayed.register("a", 1); replayed.register("b", 2);
  const got = [];
  replayed.onHandlers((id) => { if (id === "a") throw new Error("replay-a"); got.push(id); }, () => {});
  out.reporter = [ran, got, reported];
  internal.runtimeErrorReporter = undefined;
  const g2 = new c.RegisteringProxy();
  const seen2 = [];
  g2.register("z", 1);
  internal.runtimeErrorReporter = (cause) => { throw cause; };
  let replayThrew = null; try { g2.onHandlers((id) => { seen2.push(id); throw new Error("replay-z"); }, () => {}); } catch (e) { replayThrew = e.message; }
  internal.runtimeErrorReporter = undefined;
  g2.register("late", 1);
  out.rethrowDetaches = [replayThrew, seen2];
  const un = new c.RegisteringProxy();
  const ulog = [];
  un.onHandlers(() => {}, (id) => { ulog.push("u:" + id); throw new Error("u"); });
  un.register("e", 1);
  try { un.unregister("e"); } catch {}
  un.unregister("e");
  out.unregisterThrows = ulog;
  console.log(JSON.stringify(out));
})();
`,
    expected: String.raw`{"queued":"Hello, Alice!","later":"Hello, Bob!","staleLease":"current","full":"ERR_PROVIDER_QUEUE_FULL","drained":1000,"leaseShape":["generation","owner"],"identity":["async:fn",null,null,true,false,false,true,true],"anon":true,"event":["h1:a","h2:a","h2:b"],"registering":["r:a1","r:b2","u:a","r:b3"],"separate":["r:x","u:x"],"throwing":["boom","un"],"reregister":["r:k1","r:k2"],"reporter":[["later"],["b"],["event-emit:bad","register-replay:replay-a"]],"rethrowDetaches":["replay-z",["z"]],"unregisterThrows":["u:e"]}`,
  },
} satisfies { [name: string]: { script: string; expected: string } };
