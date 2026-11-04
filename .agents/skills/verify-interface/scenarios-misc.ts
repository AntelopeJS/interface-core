/** Scenario scripts for the logging, runtime, config journeys: the Node script each runs against the built package, and what it must print (read against the docs page the journey names). */
export const MISC_SCENARIOS = {
  "config": {
    script: String.raw`const dist = process.argv[2];
const cfg = require(dist + "/config.js");
const out = { exports: Object.keys(cfg).sort() };
const obj = { name: "p", modules: { app: { source: { type: "local", path: "./m" } } } };
const fn = (ctx) => ({ name: ctx.env });
out.identity = [cfg.defineConfig(obj) === obj, cfg.defineConfig(fn) === fn];
console.log(JSON.stringify(out));
`,
    expected: String.raw`{"exports":["defineConfig"],"identity":[true,true]}`,
  },
  "logging": {
    script: String.raw`const dist = process.argv[2];
const { Logging } = require(dist + "/logging/index.js");
const def = require(dist + "/logging/index.js").default;
const eventLog = require(dist + "/logging/listener.js").default;
const out = {};
Logging.Info("before any listener");
const got = [];
const l = (log) => got.push({ channel: log.channel, levelId: log.levelId, args: log.args, timed: typeof log.time === "number" && Math.abs(Date.now() - log.time) < 5000, keys: Object.keys(log).sort().join() });
eventLog.register(l);
out.levels = { ...Logging.Level };
out.sameDefault = def === Logging;
Logging.Error("e"); Logging.Warn("w"); Logging.Info("i", 5011, { a: 1 }); Logging.Debug("d"); Logging.Trace("t");
const jobs = new Logging.Channel("jobs");
jobs.Error("je"); jobs.Warn("jw"); jobs.Info("ji", { jobId: "job-42" }); jobs.Debug("jd"); jobs.Trace("jt");
Logging.Write(25, "custom-channel", "custom"); jobs.Write(15, "inst"); Logging.Write(Logging.Level.NO_PREFIX, "main", "np");
out.channelName = jobs.channel;
out.entries = got.splice(0);
eventLog.unregister(l);
Logging.Info("after unregister");
out.afterUnregister = got.length;
const order = [];
const slow = () => order.push("listener");
eventLog.register(slow);
Logging.Info("x"); order.push("returned");
eventLog.unregister(slow);
out.synchronous = order;
console.log(JSON.stringify(out));
`,
    expected: String.raw`{"levels":{"0":"TRACE","10":"DEBUG","20":"INFO","30":"WARN","40":"ERROR","ERROR":40,"WARN":30,"INFO":20,"DEBUG":10,"TRACE":0,"NO_PREFIX":-1,"-1":"NO_PREFIX"},"sameDefault":true,"channelName":"jobs","entries":[{"channel":"main","levelId":40,"args":["e"],"timed":true,"keys":"args,channel,levelId,time"},{"channel":"main","levelId":30,"args":["w"],"timed":true,"keys":"args,channel,levelId,time"},{"channel":"main","levelId":20,"args":["i",5011,{"a":1}],"timed":true,"keys":"args,channel,levelId,time"},{"channel":"main","levelId":10,"args":["d"],"timed":true,"keys":"args,channel,levelId,time"},{"channel":"main","levelId":0,"args":["t"],"timed":true,"keys":"args,channel,levelId,time"},{"channel":"jobs","levelId":40,"args":["je"],"timed":true,"keys":"args,channel,levelId,time"},{"channel":"jobs","levelId":30,"args":["jw"],"timed":true,"keys":"args,channel,levelId,time"},{"channel":"jobs","levelId":20,"args":["ji",{"jobId":"job-42"}],"timed":true,"keys":"args,channel,levelId,time"},{"channel":"jobs","levelId":10,"args":["jd"],"timed":true,"keys":"args,channel,levelId,time"},{"channel":"jobs","levelId":0,"args":["jt"],"timed":true,"keys":"args,channel,levelId,time"},{"channel":"custom-channel","levelId":25,"args":["custom"],"timed":true,"keys":"args,channel,levelId,time"},{"channel":"jobs","levelId":15,"args":["inst"],"timed":true,"keys":"args,channel,levelId,time"},{"channel":"main","levelId":-1,"args":["np"],"timed":true,"keys":"args,channel,levelId,time"}],"afterUnregister":0,"synchronous":["listener","returned"]}`,
  },
  "runtime": {
    script: String.raw`const dist = process.argv[2];
const root = require(dist + "/index.js");
const r = require(dist + "/runtime.js");
const { internal } = require(dist + "/internal.js");
const out = {};
out.registryPath = r.DEV_REGISTRY_PATH;
out.rootReexports = ["GetRuntimeInfo", "RegisterDevServer", "DEV_REGISTRY_PATH"].map((k) => root[k] === r[k]);
(async () => {
  internal.testStubMode = true;
  const codes = [];
  for (const f of [() => r.GetRuntimeInfo(), () => r.RegisterDevServer("api", [])]) { try { await f(); codes.push(null); } catch (e) { codes.push(e.code); } }
  internal.testStubMode = false;
  out.stub = codes;
  const calls = [];
  root.ImplementInterface(r, { GetRuntimeInfo: () => ({ dev: true, projectPath: "/p", env: "default" }), RegisterDevServer: (n, e) => { calls.push([n, e]); } });
  out.info = await r.GetRuntimeInfo();
  await r.RegisterDevServer("api", [{ protocol: "http", host: "localhost", port: 5011 }]);
  out.registered = calls;
  console.log(JSON.stringify(out));
})();
`,
    expected: String.raw`{"registryPath":".antelope/dev.json","rootReexports":[true,true,true],"stub":["ERR_NO_PROVIDER","ERR_NO_PROVIDER"],"info":{"dev":true,"projectPath":"/p","env":"default"},"registered":[["api",[{"protocol":"http","host":"localhost","port":5011}]]]}`,
  },
} satisfies { [name: string]: { script: string; expected: string } };
