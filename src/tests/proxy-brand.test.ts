import { expect } from "chai";

import { RUNTIME_PROTOCOL_VERSION } from "../internal";
import { AsyncProxy, GetInterfaceProxyIdentity, IsInterfaceProxy } from "..";

const BRAND = Symbol.for("@antelopejs/interface-core/proxy");

describe("proxy brand", () => {
  it("recognises a brand of this runtime's protocol on any object", () => {
    const branded = {
      [BRAND]: {
        protocol: RUNTIME_PROTOCOL_VERSION,
        kind: "async",
        identity: "async:brand.current",
      },
    };

    expect(IsInterfaceProxy(branded, "async")).to.equal(true);
    expect(GetInterfaceProxyIdentity(branded)).to.equal("async:brand.current");
  });

  it("ignores a brand written by another protocol version", () => {
    const foreign = {
      [BRAND]: {
        protocol: RUNTIME_PROTOCOL_VERSION + 1,
        kind: "async",
        identity: "async:brand.foreign",
      },
    };

    expect(IsInterfaceProxy(foreign)).to.equal(false);
    expect(GetInterfaceProxyIdentity(foreign)).to.equal(undefined);
  });

  it("separates the proxy kinds", () => {
    const proxy = new AsyncProxy("brand.kind");

    expect(IsInterfaceProxy(proxy, "async")).to.equal(true);
    expect(IsInterfaceProxy(proxy, "event")).to.equal(false);
  });
});
