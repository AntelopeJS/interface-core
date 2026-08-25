import { type ActiveModuleExecutionContext, internal } from "./internal";

export interface ModuleFolderEntry {
  dir: string;
  id: string;
  isImplementor?: boolean;
  context?: ActiveModuleExecutionContext;
}

export interface ResponsibleModuleResult {
  module?: string;
  context?: ActiveModuleExecutionContext;
  lastInterface: string;
}

function findMatchingEntry(
  fileName: string,
  entries: ModuleFolderEntry[],
): ModuleFolderEntry | undefined {
  let best: ModuleFolderEntry | undefined;
  let bestLen = 0;
  for (const entry of entries) {
    if (
      entry.dir.length <= bestLen ||
      (fileName !== entry.dir &&
        !fileName.startsWith(`${entry.dir}/`) &&
        !fileName.startsWith(`${entry.dir}\\`))
    ) {
      continue;
    }
    const relativePath = fileName.slice(entry.dir.length + 1);
    if (relativePath.split(/[/\\]/).includes("node_modules")) {
      continue;
    }
    best = entry;
    bestLen = entry.dir.length;
  }
  return best;
}

/**
 * Walk the trace to decide which module is responsible for the current call.
 *
 * Rules:
 *   1. Generic `node:internal/` frames and dependencies nested below a tracked
 *      module are skipped. A module whose own root is in `node_modules` is
 *      still eligible.
 *   2. `node:internal/modules/...` (the require loader) is a hard boundary:
 *      frames above it belong to the module currently being loaded (owning
 *      the side effect); frames below it belong to whoever triggered the
 *      require and must not be credited.
 *   3. The first non-implementor match wins — that is user code. If only
 *      implementor modules match, the first implementor is used as a
 *      fallback so framework-level registrations still have an owner.
 */
export function findResponsibleFile(
  trace: NodeJS.CallSite[],
  entries: ModuleFolderEntry[] = internal.moduleByFolder,
): ResponsibleModuleResult {
  const lastInterface = "";
  let implementorMatch: ModuleFolderEntry | undefined;

  for (const site of trace) {
    const fileName = site.getFileName();
    if (fileName?.startsWith("node:internal/modules/")) {
      break;
    }
    if (!fileName || fileName.startsWith("node:internal/")) {
      continue;
    }
    const match = findMatchingEntry(fileName, entries);
    if (!match) {
      continue;
    }
    if (!match.isImplementor) {
      return {
        module: match.id,
        context: match.context,
        lastInterface,
      };
    }
    implementorMatch = match;
  }

  if (implementorMatch) {
    return {
      module: implementorMatch.id,
      context: implementorMatch.context,
      lastInterface,
    };
  }
  return { lastInterface };
}
