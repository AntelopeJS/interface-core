/** Scenario script for the effects the TSDoc and docs/3 promise: validation before attaching, the real descriptor reaching method decorators, listener cleanup, queueing after a provider is destroyed and the objects ImplementInterface returns. */
export const TSDOC_SCENARIOS = {
  "tsdoc-details": {
    script: String.raw`const dist = process.argv[2];
const c = require(dist + "/index.js");
const d = require(dist + "/decorators.js");
const m = require(dist + "/modules.js");
const { Logging } = require(dist + "/logging/index.js");
const eventLog = require(dist + "/logging/listener.js").default;
const out = {};
const run = (ctx, f) => m.RunWithModuleContext(ctx, f);
const destroy = (id) => m.Events.ModuleDestroyed.emit(id);
const pending = (p) => Promise.race([p.then((v) => "resolved:" + v, (e) => "rejected:" + (e.code ?? e.message)), new Promise((r) => setTimeout(() => r("pending"), 80))]);
(async () => {
  const spy = [];
  const rp = new c.RegisteringProxy();
  rp.register("a");
  const first = c.InterfaceFunction("first"), second = c.InterfaceFunction("second");
  const queued = first();
  let thrown = null;
  try { c.ImplementInterface({ R: rp, first, second }, { R: { register: (id) => spy.push(id), unregister() {} }, first: () => "x" }); } catch (e) { thrown = e.constructor.name; }
  out.validatesBeforeAttaching = [thrown, await pending(queued), spy];
  const impl = { f: () => 1 };
  const decl = { f: c.InterfaceFunction("ident") };
  const res = c.ImplementInterface(decl, impl);
  out.returnsSameObjects = [res.implementation === impl, res.declaration === decl, Object.keys(res)];
  const log = (kind) => (_t, key, descriptor, level) => { const original = descriptor.value; descriptor.value = function (...a) { return "[" + level + "]" + kind + ":" + original.apply(this, a); }; };
  out.methodDescriptor = {};
  for (const name of Object.keys(d).filter((k) => /Method/.test(k)).sort()) {
    class K { m(x) { return "orig" + x; } }
    const desc = Object.getOwnPropertyDescriptor(K.prototype, "m");
    let seen = null;
    const decorator = d[name]((t, k, descriptor, level) => { seen = descriptor === desc; log(name)(t, k, descriptor, level); })("lv");
    Object.defineProperty(K.prototype, "m", decorator(K.prototype, "m", desc) || desc);
    out.methodDescriptor[name] = [seen, new K().m(1)];
  }
  const Sub = d.MakeClassDecorator((target) => class extends target { tag() { return "replaced"; } })();
  let Base = class Base {}; 
  const Replaced = Sub(Base) || Base;
  out.classDecoratorReturn = [Replaced !== Base, new Replaced().tag()];
  const Swap = d.MakeMethodDecorator(() => ({ value: () => "swapped", configurable: true, writable: true }))();
  class W { m() { return "orig"; } }
  Object.defineProperty(W.prototype, "m", Swap(W.prototype, "m", Object.getOwnPropertyDescriptor(W.prototype, "m")));
  out.methodDecoratorReturn = new W().m();
  const got = [];
  const fn = (l) => got.push(l.args[0]);
  await run({ module: "L" }, async () => eventLog.register(fn));
  Logging.Info("before");
  destroy("L");
  Logging.Info("after");
  out.logListenerCleanup = got;
  const proxy = new c.AsyncProxy();
  await run({ module: "P" }, async () => proxy.onCall(() => "old provider"));
  const served = await proxy.call();
  destroy("P");
  const waiting = proxy.call();
  const state = await pending(waiting);
  proxy.onCall(() => "new provider");
  out.queuesAfterProviderDestroyed = [served, state, await waiting];
  const { Info, Write } = Logging;
  const bound = [];
  const l2 = (l) => bound.push([l.channel, l.levelId, l.args]);
  eventLog.register(l2); Info("x"); Write(7, "ch", "y"); eventLog.unregister(l2);
  out.detachedLoggingFunctionsWork = bound;
  console.log(JSON.stringify(out));
})();
`,
    expected: String.raw`{"validatesBeforeAttaching":["TypeError","pending",[]],"returnsSameObjects":[true,true,["declaration","implementation"]],"methodDescriptor":{"MakeMethodAndClassDecorator":[true,"[lv]MakeMethodAndClassDecorator:orig1"],"MakeMethodAndPropertyAndClassDecorator":[true,"[lv]MakeMethodAndPropertyAndClassDecorator:orig1"],"MakeMethodAndPropertyDecorator":[true,"[lv]MakeMethodAndPropertyDecorator:orig1"],"MakeMethodDecorator":[true,"[lv]MakeMethodDecorator:orig1"],"MakeParameterAndMethodAndClassDecorator":[true,"[lv]MakeParameterAndMethodAndClassDecorator:orig1"],"MakeParameterAndMethodAndPropertyAndClassDecorator":[true,"[lv]MakeParameterAndMethodAndPropertyAndClassDecorator:orig1"],"MakeParameterAndMethodAndPropertyDecorator":[true,"[lv]MakeParameterAndMethodAndPropertyDecorator:orig1"],"MakeParameterAndMethodDecorator":[true,"[lv]MakeParameterAndMethodDecorator:orig1"]},"classDecoratorReturn":[true,"replaced"],"methodDecoratorReturn":"swapped","logListenerCleanup":["before"],"queuesAfterProviderDestroyed":["old provider","pending","new provider"],"detachedLoggingFunctionsWork":[["main",20,["x"]],["ch",7,["y"]]]}`,
  },
} satisfies { [name: string]: { script: string; expected: string } };
