import { expect } from "chai";
import { activateModuleContext } from "../internal";
import {
  findResponsibleFile,
  type ModuleFolderEntry,
} from "../responsible-module";

type CallSite = NodeJS.CallSite;

function frame(
  fileName: string | null,
  opts: { functionName?: string | null; typeName?: string | null } = {},
): CallSite {
  return {
    getFileName: () => fileName,
    getFunctionName: () =>
      "functionName" in opts ? (opts.functionName ?? null) : "fn",
    getTypeName: () => opts.typeName ?? null,
  } as unknown as CallSite;
}

describe("findResponsibleFile", () => {
  it("skips node_modules frames and walks to the user module", () => {
    const entries: ModuleFolderEntry[] = [{ id: "local", dir: "/app" }];
    const trace = [
      frame("/app/node_modules/@antelopejs/interface-core/dist/proxies.js"),
      frame("/app/dist/pages/skins.js"),
    ];

    expect(findResponsibleFile(trace, entries).module).to.equal("local");
  });

  it("accepts a tracked module installed beneath node_modules", () => {
    const entries: ModuleFolderEntry[] = [
      {
        id: "api",
        dir: "/app/node_modules/.pnpm/@antelopejs+api/node_modules/@antelopejs/api",
        isImplementor: true,
      },
    ];
    const trace = [
      frame(
        "/app/node_modules/.pnpm/@antelopejs+api/node_modules/@antelopejs/api/dist/middleware.js",
      ),
    ];

    expect(findResponsibleFile(trace, entries).module).to.equal("api");
  });

  it("skips non-loader node:internal frames", () => {
    const entries: ModuleFolderEntry[] = [{ id: "local", dir: "/app" }];
    const trace = [
      frame("node:internal/timers"),
      frame("node:internal/process/task_queues"),
      frame("/app/dist/index.js"),
    ];

    expect(findResponsibleFile(trace, entries).module).to.equal("local");
  });

  it("returns the first non-implementor match even when an implementor appears earlier", () => {
    const context = activateModuleContext({
      module: "playground",
      owner: "playground#1",
      providerRoutes: { route: "provider" },
    });
    const entries: ModuleFolderEntry[] = [
      { id: "cms", dir: "/project/cms", isImplementor: true },
      {
        id: "playground",
        dir: "/project/cms/playground",
        context,
      },
    ];
    const trace = [
      frame("/project/cms/dist/interfaces/cms/page.js"),
      frame("/project/cms/dist/interfaces/cms/page.js"),
      frame("/project/cms/playground/dist/table-view/drawer/page.js"),
    ];

    const result = findResponsibleFile(trace, entries);
    expect(result.module).to.equal("playground");
    expect(result.context).to.equal(context);
  });

  it("falls back to the first implementor match when no consumer frame matches", () => {
    const entries: ModuleFolderEntry[] = [
      { id: "cms", dir: "/project/cms", isImplementor: true },
    ];
    const trace = [
      frame("/project/cms/dist/interfaces/cms/page.js"),
      frame("/project/cms/dist/implementations/cms/hooks.js"),
    ];

    expect(findResponsibleFile(trace, entries).module).to.equal("cms");
  });

  it("returns undefined when no frame matches any module", () => {
    const entries: ModuleFolderEntry[] = [{ id: "local", dir: "/app" }];
    const trace = [frame("/some/unrelated/file.js"), frame("/other/path.js")];

    expect(findResponsibleFile(trace, entries).module).to.equal(undefined);
  });

  it("picks the longest matching folder on a single frame", () => {
    const entries: ModuleFolderEntry[] = [
      { id: "cms", dir: "/project/cms", isImplementor: true },
      { id: "playground", dir: "/project/cms/playground" },
    ];
    const trace = [
      frame("/project/cms/playground/dist/table-view/drawer/page.js"),
    ];

    expect(findResponsibleFile(trace, entries).module).to.equal("playground");
  });

  it("returns the consumer when the implementor lives inside its cache folder", () => {
    const entries: ModuleFolderEntry[] = [
      { id: "local", dir: "/home/user/app" },
      {
        id: "cms",
        dir: "/home/user/app/.antelope/cache/@antelopejs-private/cms",
        isImplementor: true,
      },
    ];
    const trace = [
      frame(
        "/home/user/app/.antelope/cache/@antelopejs-private/cms/dist/interfaces/cms/page.js",
      ),
      frame("/home/user/app/dist/pages/skins.js"),
    ];

    expect(findResponsibleFile(trace, entries).module).to.equal("local");
  });

  it("walks past unregistered intermediate frames between implementor and consumer", () => {
    const entries: ModuleFolderEntry[] = [
      { id: "cms", dir: "/project/cms", isImplementor: true },
      { id: "playground", dir: "/project/cms/playground" },
    ];
    const trace = [
      frame("/project/cms/dist/interfaces/cms/page.js"),
      frame("/third-party/anon.js", { functionName: null, typeName: "Proxy" }),
      frame("/project/cms/playground/dist/page.js"),
    ];

    expect(findResponsibleFile(trace, entries).module).to.equal("playground");
  });

  it("stops at the module-loader boundary so top-level side effects are attributed to the loading module, not the requirer", () => {
    const entries: ModuleFolderEntry[] = [
      { id: "cms", dir: "/project/cms", isImplementor: true },
      { id: "playground", dir: "/project/cms/playground" },
    ];
    const trace = [
      frame("/project/cms/dist/interfaces/cms/page.js"),
      frame("/project/cms/dist/interfaces/cms/page.js"),
      frame("node:internal/modules/cjs/loader"),
      frame("node:internal/modules/helpers"),
      frame("/project/cms/playground/dist/table-view/category.js"),
    ];

    expect(findResponsibleFile(trace, entries).module).to.equal("cms");
  });
});
