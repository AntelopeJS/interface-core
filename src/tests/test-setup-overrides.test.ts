import { expect } from "chai";
import { join } from "node:path";
import ts from "typescript";

const configModule = join(__dirname, "..", "config").replaceAll("\\", "/");
const consumerFile = join(__dirname, "setup-consumer.ts");

function diagnosticsFor(setupBody: string): string[] {
  const source = [
    `import { defineConfig } from ${JSON.stringify(configModule)};`,
    `export default defineConfig({ name: "app", test: { setup: () => (${setupBody}) } });`,
  ].join("\n");
  const options: ts.CompilerOptions = {
    noEmit: true,
    strict: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
    types: [],
  };
  const host = ts.createCompilerHost(options);
  const readFile = host.readFile.bind(host);
  const getSourceFile = host.getSourceFile.bind(host);
  host.readFile = (file) => (file === consumerFile ? source : readFile(file));
  host.getSourceFile = (file, languageVersion) =>
    file === consumerFile
      ? ts.createSourceFile(file, source, languageVersion)
      : getSourceFile(file, languageVersion);
  const program = ts.createProgram([consumerFile], options, host);
  return ts
    .getPreEmitDiagnostics(program)
    .map((diagnostic) =>
      ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
    );
}

describe("AntelopeTestConfig.setup", () => {
  it("accepts overrides of the project configuration", () => {
    expect(diagnosticsFor(`{ cacheFolder: ".cache/test" }`)).to.deep.equal([]);
  });

  it("rejects a test section in the overrides, which the core ignores", () => {
    const diagnostics = diagnosticsFor(`{ test: { folder: "other" } }`);

    expect(diagnostics).to.have.length.greaterThan(0);
  });
});
