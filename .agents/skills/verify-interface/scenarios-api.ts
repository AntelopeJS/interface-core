/** Scenario script for the API details: decorator targets, nested validation, log references, rejected throws, event arity and module context defaults. */
export const API_SCENARIOS = {
  "surface-details": {
    script: String.raw`const dist = process.argv[2];
const c = require(dist + "/index.js");
const d = require(dist + "/decorators.js");
const m = require(dist + "/modules.js");
const { Logging } = require(dist + "/logging/index.js");
const eventLog = require(dist + "/logging/listener.js").default;
const { internal } = require(dist + "/internal.js");
const out = {};
const label = (x) => x === undefined ? "undefined" : typeof x === "function" ? "class" : typeof x === "object" ? (x.value ? "descriptor" : "proto") : String(x);
class K { m(p) {} }
const desc = () => Object.getOwnPropertyDescriptor(K.prototype, "m");
const apply = { Class: (f) => f(K), Property: (f) => f(K.prototype, "p", undefined), Method: (f) => f(K.prototype, "m", desc()), Parameter: (f) => f(K.prototype, "m", 0) };
out.factories = {};
for (const name of Object.keys(d).filter((k) => /^Make/.test(k)).sort()) {
  const kinds = name.replace(/^Make|Decorator$/g, "").split("And");
  out.factories[name] = {};
  for (const kind of kinds) {
    const seen = [];
    const decorator = d[name]((...a) => seen.push(a.map(label).join(",")))("tag");
    apply[kind](decorator);
    out.factories[name][kind] = seen;
  }
}
const t = (f) => { try { f(); return null; } catch (e) { return e.constructor.name; } };
(async () => {
  out.nested = [
    t(() => c.ImplementInterface({ nested: { F: c.InterfaceFunction() } }, {})),
    t(() => c.ImplementInterface({ nested: { F: c.InterfaceFunction() } }, { nested: 5 })),
    t(() => c.ImplementInterface({ nested: { F: c.InterfaceFunction() } }, { nested: { F: () => 1 } })),
  ];
  const obj = { a: 1 }; const arr = [1, 2];
  const got = [];
  const l = (log) => got.push([log.args[0] === obj, log.args[1] === arr, log.args.length]);
  eventLog.register(l);
  Logging.Info(obj, arr); new Logging.Channel("x").Warn(obj, arr); Logging.Write(5, "c", obj, arr);
  Logging.Info(); 
  eventLog.unregister(l);
  out.logRefs = got;
  out.channelMethods = Object.getOwnPropertyNames(Logging.Channel.prototype).sort();
  out.loggingKeys = Object.keys(Logging).sort();
  const p = new c.AsyncProxy();
  p.onCall(() => { throw new Error("sync boom"); });
  let threw = "no throw"; let rejected = null;
  try { const pr = p.call(); threw = pr instanceof Promise; rejected = await pr.catch((e) => e.message); } catch { threw = "threw"; }
  out.syncThrow = [threw, rejected];
  const f = c.InterfaceFunction();
  c.ImplementInterface({ f }, { f: () => { throw new Error("fn boom"); } });
  let fr = "no throw"; try { const pr = f(); fr = [pr instanceof Promise, await pr.catch((e) => e.message)]; } catch { fr = "threw"; }
  const g = c.InterfaceFunction();
  c.ImplementInterface({ g }, { g: async () => { throw new Error("async boom"); } });
  out.interfaceFunctionThrow = [fr, await g().catch((e) => e.message)];
  const s = c.InterfaceFunction();
  c.ImplementInterface({ s }, { s: (n) => "Hello, " + n });
  const sp = s("Ada");
  out.alwaysPromise = [sp instanceof Promise, await sp];
  const r = new c.AsyncProxy();
  r.onCall(() => "first"); r.onCall(() => "second");
  out.onCallReplaces = await r.call();
  const e = new c.EventProxy();
  const seen = [];
  e.register(() => { throw new Error("h1"); });
  e.register(() => Promise.reject(new Error("async h")).catch(() => {}) && seen.push("async started"));
  e.register(() => seen.push("last"));
  const reported = [];
  internal.runtimeErrorReporter = (cause, details) => reported.push(details.operation + ":" + cause.message);
  e.emit();
  internal.runtimeErrorReporter = undefined;
  out.emitContinues = [seen, reported];
  const states = [];
  for (const k of ["ModuleConstructed", "ModuleStarted", "ModuleStopped", "ModuleDestroyed"]) m.Events[k].register((...a) => states.push(k + ":" + a.length));
  for (const k of ["ModulesStarted", "ModulesStopping"]) m.Events[k].register((...a) => states.push(k + ":" + a.length));
  for (const k of Object.keys(m.Events)) m.Events[k].emit(...(/^Modules/.test(k) ? [] : ["id"]));
  out.eventArity = states.sort();
  const ctx = await m.RunWithModuleContext({ module: "mod" }, async () => m.GetModuleContext());
  out.contextDefaults = [ctx.module, ctx.owner, ctx.kind ?? "module-by-default"];
  out.noContext = m.GetModuleContext() ?? null;
  out.requiresModuleId = t(() => m.RunWithModuleContext({}, () => 1));
  console.log(JSON.stringify(out));
})();
`,
    expected: String.raw`{"factories":{"MakeClassDecorator":{"Class":["class,tag"]},"MakeMethodAndClassDecorator":{"Method":["proto,m,descriptor,tag"],"Class":["class,undefined,undefined,tag"]},"MakeMethodAndPropertyAndClassDecorator":{"Method":["proto,m,descriptor,tag"],"Property":["proto,p,undefined,tag"],"Class":["class,undefined,undefined,tag"]},"MakeMethodAndPropertyDecorator":{"Method":["proto,m,descriptor,tag"],"Property":["proto,p,undefined,tag"]},"MakeMethodDecorator":{"Method":["proto,m,descriptor,tag"]},"MakeParameterAndClassDecorator":{"Parameter":["proto,m,0,tag"],"Class":["class,undefined,undefined,tag"]},"MakeParameterAndMethodAndClassDecorator":{"Parameter":["proto,m,0,tag"],"Method":["proto,m,descriptor,tag"],"Class":["class,undefined,undefined,tag"]},"MakeParameterAndMethodAndPropertyAndClassDecorator":{"Parameter":["proto,m,0,tag"],"Method":["proto,m,descriptor,tag"],"Property":["proto,p,undefined,tag"],"Class":["class,undefined,undefined,tag"]},"MakeParameterAndMethodAndPropertyDecorator":{"Parameter":["proto,m,0,tag"],"Method":["proto,m,descriptor,tag"],"Property":["proto,p,undefined,tag"]},"MakeParameterAndMethodDecorator":{"Parameter":["proto,m,0,tag"],"Method":["proto,m,descriptor,tag"]},"MakeParameterAndPropertyAndClassDecorator":{"Parameter":["proto,m,0,tag"],"Property":["proto,p,undefined,tag"],"Class":["class,undefined,undefined,tag"]},"MakeParameterAndPropertyDecorator":{"Parameter":["proto,m,0,tag"],"Property":["proto,p,undefined,tag"]},"MakeParameterDecorator":{"Parameter":["proto,m,0,tag"]},"MakePropertyAndClassDecorator":{"Property":["proto,p,tag"],"Class":["class,undefined,tag"]},"MakePropertyDecorator":{"Property":["proto,p,tag"]}},"nested":["TypeError","TypeError",null],"logRefs":[[true,true,2],[true,true,2],[true,true,2],[false,false,0]],"channelMethods":["Debug","Error","Info","Trace","Warn","Write","constructor"],"loggingKeys":["Channel","Debug","Error","Info","Level","Trace","Warn","Write"],"syncThrow":[true,"sync boom"],"interfaceFunctionThrow":[[true,"fn boom"],"async boom"],"alwaysPromise":[true,"Hello, Ada"],"onCallReplaces":"second","emitContinues":[["async started","last"],["event-emit:h1"]],"eventArity":["ModuleConstructed:1","ModuleDestroyed:1","ModuleStarted:1","ModuleStopped:1","ModulesStarted:0","ModulesStopping:0"],"contextDefaults":["mod","mod","module-by-default"],"noContext":null,"requiresModuleId":"Error"}`,
  },
} satisfies { [name: string]: { script: string; expected: string } };
