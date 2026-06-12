import { expect } from "chai";
import { type AsyncProxy, ImplementInterface } from "..";
import * as runtime from "../runtime";
import {
  type DevServerEndpoint,
  GetRuntimeInfo,
  RegisterDevServer,
  type RuntimeInfo,
} from "../runtime";

interface ProxiedFunction {
  proxy: AsyncProxy;
}

function drainQueuedCalls() {
  return undefined;
}

function resetProxy(func: unknown) {
  const proxy = (func as ProxiedFunction).proxy;
  proxy.onCall(drainQueuedCalls, true);
  proxy.detach();
}

describe("runtime interface", () => {
  afterEach(() => {
    resetProxy(GetRuntimeInfo);
    resetProxy(RegisterDevServer);
  });

  it("resolves GetRuntimeInfo with the implementation result", async () => {
    const info: RuntimeInfo = {
      dev: true,
      projectPath: "/tmp/project",
      env: "default",
    };
    ImplementInterface(runtime, { GetRuntimeInfo: () => info });

    expect(await GetRuntimeInfo()).to.deep.equal(info);
  });

  it("passes name and endpoints to the RegisterDevServer implementation", async () => {
    const received: Array<[string, DevServerEndpoint[]]> = [];
    ImplementInterface(runtime, {
      RegisterDevServer: (name, endpoints) => {
        received.push([name, endpoints]);
      },
    });

    const endpoints: DevServerEndpoint[] = [
      { protocol: "http", host: "localhost", port: 5011 },
    ];
    await RegisterDevServer("api", endpoints);

    expect(received).to.deep.equal([["api", endpoints]]);
  });

  it("replays calls queued before the implementation is attached", async () => {
    const pending = GetRuntimeInfo();
    const info: RuntimeInfo = {
      dev: false,
      projectPath: "/tmp/project",
      env: "production",
    };
    ImplementInterface(runtime, { GetRuntimeInfo: () => info });

    expect(await pending).to.deep.equal(info);
  });

  it("replays RegisterDevServer calls queued before the implementation is attached", async () => {
    const endpoints: DevServerEndpoint[] = [
      { protocol: "http", host: "localhost", port: 5011 },
    ];
    const pending = RegisterDevServer("api", endpoints);

    const received: Array<[string, DevServerEndpoint[]]> = [];
    ImplementInterface(runtime, {
      RegisterDevServer: (name, registered) => {
        received.push([name, registered]);
      },
    });

    await pending;
    expect(received).to.deep.equal([["api", endpoints]]);
  });
});
