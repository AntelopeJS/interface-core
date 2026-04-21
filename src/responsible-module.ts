import { internal } from "./internal";

export interface ModuleFolderEntry {
  dir: string;
  id: string;
  isImplementor?: boolean;
}

export interface ResponsibleModuleResult {
  module?: string;
  lastInterface: string;
}

function findMatchingEntry(
  fileName: string,
  entries: ModuleFolderEntry[],
): ModuleFolderEntry | undefined {
  let best: ModuleFolderEntry | undefined;
  let bestLen = 0;
  for (const entry of entries) {
    if (fileName.startsWith(entry.dir) && entry.dir.length > bestLen) {
      best = entry;
      bestLen = entry.dir.length;
    }
  }
  return best;
}

/**
 * Walk the trace to decide which module is responsible for the current call.
 *
 * Rules:
 *   1. `node_modules` and generic `node:internal/` frames are skipped.
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
  let implementorMatch: string | undefined;

  for (const site of trace) {
    const fileName = site.getFileName();
    if (fileName?.startsWith("node:internal/modules/")) {
      break;
    }
    if (
      !fileName ||
      fileName.startsWith("node:internal/") ||
      fileName.match(/[/\\]node_modules[/\\]/)
    ) {
      continue;
    }
    const match = findMatchingEntry(fileName, entries);
    if (!match) {
      continue;
    }
    if (!match.isImplementor) {
      return { module: match.id, lastInterface };
    }
    if (!implementorMatch) {
      implementorMatch = match.id;
    }
  }

  if (implementorMatch) {
    return { module: implementorMatch, lastInterface };
  }
  return { lastInterface };
}
