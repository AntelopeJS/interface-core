/** Scenario scripts for the modules, decorators, exports journeys: the Node script each runs against the built package, and what it must print (read against the docs page the journey names). */
export const SURFACE_SCENARIOS = {
  "decorators": {
    script: String.raw`const dist = process.argv[2];
const c = require(dist + "/index.js");
const d = require(dist + "/decorators.js");
const out = {};
const calls = [];
const rec = (kind) => (...a) => calls.push([kind, ...a.map((x) => typeof x === "function" ? "fn:" + x.name : typeof x === "number" ? x : typeof x === "object" && x && "value" in x ? "desc" : typeof x === "object" ? "proto" : String(x))]);
function apply(decorator, kind) {
  class K { m(p) {} }
  K.prototype.prop = undefined;
  const proto = K.prototype;
  if (kind === "class") decorator(K);
  if (kind === "property") decorator(proto, "prop", undefined);
  if (kind === "method") decorator(proto, "m", Object.getOwnPropertyDescriptor(proto, "m"));
  if (kind === "param") decorator(proto, "m", 0);
}
apply(d.MakeClassDecorator(rec("class"))("a"), "class");
apply(d.MakePropertyDecorator(rec("property"))("b"), "property");
apply(d.MakeMethodDecorator(rec("method"))("c"), "method");
apply(d.MakeParameterDecorator(rec("param"))("e"), "param");
out.single = calls.splice(0);
const names = Object.keys(d).filter((k) => /^Make/.test(k)).sort();
out.factories = names;
const both = d.MakeMethodAndClassDecorator((...a) => calls.push(a.map((x) => x === undefined ? "undefined" : typeof x === "function" ? "class" : typeof x === "object" && "value" in x ? "descriptor" : typeof x === "object" ? "proto" : String(x))))("tag");
class K { m() {} }
both(K, undefined, undefined);
both(K.prototype, "m", Object.getOwnPropertyDescriptor(K.prototype, "m"));
out.combined = calls.splice(0);
console.log(JSON.stringify(out));
`,
    expected: String.raw`{"single":[["class","fn:K","a"],["property","proto","prop","b"],["method","proto","m","desc","c"],["param","proto","m",0,"e"]],"factories":["MakeClassDecorator","MakeMethodAndClassDecorator","MakeMethodAndPropertyAndClassDecorator","MakeMethodAndPropertyDecorator","MakeMethodDecorator","MakeParameterAndClassDecorator","MakeParameterAndMethodAndClassDecorator","MakeParameterAndMethodAndPropertyAndClassDecorator","MakeParameterAndMethodAndPropertyDecorator","MakeParameterAndMethodDecorator","MakeParameterAndPropertyAndClassDecorator","MakeParameterAndPropertyDecorator","MakeParameterDecorator","MakePropertyAndClassDecorator","MakePropertyDecorator"],"combined":[["class","undefined","undefined","tag"],["proto","m","descriptor","tag"]]}`,
  },
  "exports": {
    script: String.raw`const dist = process.argv[2];
const entries = ["index", "decorators", "modules", "proxies", "runtime", "internal", "config", "logging/index", "logging/listener"];
const out = {};
for (const e of entries) out[e] = Object.keys(require(dist + "/" + e + ".js")).sort();
console.log(JSON.stringify(out));
`,
    expected: String.raw`{"index":["AMBIGUOUS_PROVIDER_CODE","AmbiguousProviderError","AsyncProxy","DEV_REGISTRY_PATH","DestroyModule","EventProxy","Events","GetInterfaceInstance","GetInterfaceInstances","GetInterfaceProxyIdentity","GetMetadata","GetModuleContext","GetModuleInfo","GetResponsibleModule","GetRuntimeInfo","ImplementInterface","InterfaceFunction","IsInterfaceProxy","ListModuleDeclarations","ListModules","LoadModule","MISSING_PROVIDER_CODE","MODULE_CONTEXT_INVALIDATED_CODE","MissingProviderError","ModuleContextInvalidatedError","PROVIDER_QUEUE_FULL_CODE","ProviderQueueFullError","RegisterDevServer","RegisteringProxy","ReleaseOwner","ReloadModule","RemoveModuleDeclaration","RunWithModuleContext","RunWithResponsibleModule","SaveModuleDeclaration","StartModule","StopModule","isMissingProviderError"],"decorators":["MakeClassDecorator","MakeMethodAndClassDecorator","MakeMethodAndPropertyAndClassDecorator","MakeMethodAndPropertyDecorator","MakeMethodDecorator","MakeParameterAndClassDecorator","MakeParameterAndMethodAndClassDecorator","MakeParameterAndMethodAndPropertyAndClassDecorator","MakeParameterAndMethodAndPropertyDecorator","MakeParameterAndMethodDecorator","MakeParameterAndPropertyAndClassDecorator","MakeParameterAndPropertyDecorator","MakeParameterDecorator","MakePropertyAndClassDecorator","MakePropertyDecorator"],"modules":["DestroyModule","Events","GetModuleContext","GetModuleInfo","ListModuleDeclarations","ListModules","LoadModule","ReleaseOwner","ReloadModule","RemoveModuleDeclaration","RunWithModuleContext","SaveModuleDeclaration","StartModule","StopModule"],"proxies":["AsyncProxy","EventProxy","GetInterfaceProxyIdentity","GetResponsibleModule","InterfaceFunction","InvalidateResponsibleModule","IsInterfaceProxy","RegisteringProxy","RunWithResponsibleModule"],"runtime":["DEV_REGISTRY_PATH","GetRuntimeInfo","RegisterDevServer"],"internal":["RUNTIME_PROTOCOL_VERSION","RUNTIME_SYMBOL","captureModuleContext","enterModuleContext","getModuleContext","internal","invalidateModuleContext","isModuleContextActive","peekModuleContext","runAsCapturedCaller","runWithCapturedModuleContext","runWithModuleContext"],"config":["defineConfig"],"logging/index":["Logging","default"],"logging/listener":["default"]}`,
  },
  "modules": {
    script: String.raw`const dist = process.argv[2];
const c = require(dist + "/index.js");
const m = require(dist + "/modules.js");
const { internal } = require(dist + "/internal.js");
const out = {};
out.events = Object.keys(m.Events).sort();
const seen = [];
for (const k of out.events) m.Events[k].register((id) => seen.push(k + ":" + id));
m.Events.ModuleStarted.emit("a"); m.Events.ModulesStarted.emit(); m.Events.ModulesStopping.emit();
out.emitted = seen.splice(0);
(async () => {
  const reg = new c.RegisteringProxy();
  const log = [];
  const ev = new c.EventProxy();
  const evSeen = [];
  await m.RunWithModuleContext({ module: "prov", owner: "prov#1" }, async () => {
    reg.onHandlers((id) => log.push("r:" + id), (id) => log.push("u:" + id));
  });
  const callerCtx = {};
  await m.RunWithModuleContext({ module: "cons", owner: "cons#1" }, async () => {
    reg.register("mine", 1);
    ev.register(() => evSeen.push("cons-handler"));
  });
  await m.RunWithModuleContext({ module: "cons", owner: "cons#2" }, async () => { reg.register("newer", 1); });
  m.Events.ModuleDestroyed.emit("cons");
  out.destroyOwnerless = [log.slice(), evSeen.slice()];
  ev.emit();
  out.eventAfterOwnerless = evSeen.slice();
  await m.RunWithModuleContext({ module: "cons", owner: "cons#2" }, async () => { m.Events.ModuleDestroyed.emit("cons"); });
  out.destroyInContext = log.slice();
  let invalid = null;
  await m.RunWithModuleContext({ module: "late", owner: "late#1" }, async () => {
    let open; const gate = new Promise((r) => { open = r; });
    const work = (async () => { await gate; return m.GetModuleContext(); })();
    m.Events.ModuleDestroyed.emit("late");
    open();
    try { await work; } catch (e) { invalid = [e.code, e.constructor.name]; }
  });
  out.invalidated = invalid;
  const ctxInfo = await m.RunWithModuleContext({ module: "x", kind: "interface" }, () => m.GetModuleContext());
  out.ctx = [m.GetModuleContext() ?? null, ctxInfo.module, ctxInfo.owner, ctxInfo.kind];
  const proxy = new c.AsyncProxy();
  await m.RunWithModuleContext({ module: "ifc", kind: "interface" }, async () => { proxy.onCall(() => c.GetResponsibleModule() ?? "none"); });
  out.interfaceKindRunsInCaller = [await m.RunWithModuleContext({ module: "caller" }, () => proxy.call()), await proxy.call()];
  const prov = new c.AsyncProxy();
  await m.RunWithModuleContext({ module: "provmod" }, async () => { prov.onCall(() => c.GetResponsibleModule()); });
  out.moduleKindRunsInProvider = await m.RunWithModuleContext({ module: "caller" }, () => prov.call());
  const auto = new c.AsyncProxy();
  await m.RunWithModuleContext({ module: "gone", owner: "gone#1" }, async () => { auto.onCall(() => "alive"); });
  const before = await auto.call();
  await m.RunWithModuleContext({ module: "gone", owner: "gone#1" }, async () => { m.Events.ModuleDestroyed.emit("gone"); });
  internal.testStubMode = true;
  let after = null; try { await auto.call(); } catch (e) { after = e.code; }
  out.destroyDetaches = [before, after];
  internal.testStubMode = false;
  const queued = new c.AsyncProxy();
  let queuedOutcome = null;
  let pendingCall;
  await m.RunWithModuleContext({ module: "waiter", owner: "waiter#1" }, async () => { pendingCall = queued.call(); m.Events.ModuleDestroyed.emit("waiter"); });
  queued.onCall(() => "ran");
  try { queuedOutcome = await pendingCall; } catch (e) { queuedOutcome = e.code; }
  out.queuedCallerDestroyed = queuedOutcome;
  const manual = new c.AsyncProxy();
  await m.RunWithModuleContext({ module: "keeper", owner: "keeper#1" }, async () => { manual.onCall(() => { try { return String(m.GetModuleContext().owner); } catch (e) { return e.code; } }, true); });
  await m.RunWithModuleContext({ module: "keeper", owner: "keeper#1" }, async () => { m.Events.ModuleDestroyed.emit("keeper"); });
  out.manualDetachSurvives = await manual.call();
  internal.testStubMode = true;
  const names = ["ListModules", "GetModuleInfo", "LoadModule", "StartModule", "StopModule", "DestroyModule", "ReloadModule", "ListModuleDeclarations", "SaveModuleDeclaration", "RemoveModuleDeclaration"];
  const codes = [];
  for (const n of names) { try { await m[n]("x"); codes.push(null); } catch (e) { codes.push(e.code); } }
  internal.testStubMode = false;
  out.management = names.filter((n, i) => codes[i] === "ERR_NO_PROVIDER").length === names.length ? names : codes;
  out.releaseOwner = typeof m.ReleaseOwner;
  console.log(JSON.stringify(out));
})();
`,
    expected: String.raw`{"events":["ModuleConstructed","ModuleDestroyed","ModuleStarted","ModuleStopped","ModulesStarted","ModulesStopping"],"emitted":["ModuleStarted:a","ModulesStarted:undefined","ModulesStopping:undefined"],"destroyOwnerless":[["r:mine","r:newer"],[]],"eventAfterOwnerless":["cons-handler"],"destroyInContext":["r:mine","r:newer","u:newer"],"invalidated":["ERR_MODULE_CONTEXT_INVALIDATED","ModuleContextInvalidatedError"],"ctx":[null,"x","x","interface"],"interfaceKindRunsInCaller":["caller","none"],"moduleKindRunsInProvider":"provmod","destroyDetaches":["alive","ERR_NO_PROVIDER"],"queuedCallerDestroyed":"ERR_MODULE_CONTEXT_INVALIDATED","manualDetachSurvives":"ERR_MODULE_CONTEXT_INVALIDATED","management":["ListModules","GetModuleInfo","LoadModule","StartModule","StopModule","DestroyModule","ReloadModule","ListModuleDeclarations","SaveModuleDeclaration","RemoveModuleDeclaration"],"releaseOwner":"function"}`,
  },
} satisfies { [name: string]: { script: string; expected: string } };
