import type {
  AntelopeModuleConfig,
  ModuleSource,
  ModuleSourceGit,
  ModuleSourceLocal,
  ModuleSourceLocalFolder,
  ModuleSourcePackage,
} from "./config";
import { EventProxy, InterfaceFunction } from "./proxies";
import {
  getModuleContext,
  internal,
  invalidateModuleContext,
  type ModuleExecutionContext,
  peekModuleContext,
  type RuntimeCleanup,
  runWithModuleContext,
} from "./internal";

/** Runs work with module ownership and an optional provider route across awaits. */
export function RunWithModuleContext<T>(
  context: ModuleExecutionContext,
  callback: () => T,
): T {
  return runWithModuleContext(context, callback);
}

/** Returns the active module execution context, if one exists. */
export function GetModuleContext(): ModuleExecutionContext | undefined {
  return getModuleContext();
}

export type { ModuleExecutionContext } from "./internal";

/**
 * Contains events related to module lifecycle management.
 *
 * These events allow subscribers to be notified when modules change state,
 * enabling coordinated actions during module transitions.
 */
export namespace Events {
  /**
   * Event triggers when a module is constructed.
   *
   * Fires after the module's code has been loaded and a module instance has been created,
   * but before the module is started.
   *
   * @param module Module ID
   */
  export const ModuleConstructed = new EventProxy<(module: string) => void>(
    "modules.ModuleConstructed",
  );

  /**
   * Event triggers when a module is started.
   *
   * Fires after the module's start method has been called and completed successfully.
   * At this point, the module is fully operational and available for use.
   *
   * @param module Module ID
   */
  export const ModuleStarted = new EventProxy<(module: string) => void>(
    "modules.ModuleStarted",
  );

  /**
   * Event triggers when a module is stopped.
   *
   * Fires after the module's stop method has been called and completed successfully.
   * The module still exists but is no longer active or providing services.
   *
   * @param module Module ID
   */
  export const ModuleStopped = new EventProxy<(module: string) => void>(
    "modules.ModuleStopped",
  );

  /**
   * Event triggers when a module is destroyed.
   *
   * Fires after the module instance has been destroyed and all its resources
   * have been released. The module's code may still be loaded, but the instance is gone.
   *
   * @param module Module ID
   */
  export const ModuleDestroyed = new EventProxy<(module: string) => void>(
    "modules.ModuleDestroyed",
  );

  /**
   * Event triggers once every module the core was asked to start has started.
   *
   * Fires after the last `start()` of a project start (or reload) completed
   * successfully: the project as a whole is ready to serve. It does not fire
   * when a module fails to start.
   */
  export const ModulesStarted = new EventProxy<() => void>(
    "modules.ModulesStarted",
  );

  /**
   * Event triggers before the first module stops.
   *
   * Fires once per stop following a {@link ModulesStarted}: stopping every
   * module of a project, or reloading one, is a single "stopping".
   */
  export const ModulesStopping = new EventProxy<() => void>(
    "modules.ModulesStopping",
  );
}

function runCleanup(
  cleanup: RuntimeCleanup | { detach(): void },
  module: string,
  operation: string,
) {
  try {
    if ("cleanup" in cleanup) {
      cleanup.cleanup();
    } else {
      cleanup.detach();
    }
  } catch (error) {
    internal.runtimeErrorReporter?.(error, { operation, module });
  }
}

function getDestroyedOwner(module: string): string {
  const context = peekModuleContext();
  if (context?.module !== module) {
    return module;
  }
  return context.owner ?? module;
}

/**
 * Takes a destroyed module's registrations back down, while the owner's
 * context is still valid: the disposers call interface functions bound to it.
 */
function releaseOwnerRegistrations(module: string, owner: string) {
  for (const cleanup of internal.knownAsync.get(owner) ?? []) {
    runCleanup(cleanup, owner, "detach-async-provider");
  }
  internal.knownAsync.delete(owner);
  for (const cleanup of internal.knownRegisters.get(owner) ?? []) {
    runCleanup(cleanup, owner, "detach-registering-provider");
  }
  internal.knownRegisters.delete(owner);
  for (const proxy of internal.registeringProxies) {
    try {
      proxy.unregisterOwner(owner);
    } catch (error) {
      internal.runtimeErrorReporter?.(error, {
        operation: "unregister-module",
        module,
      });
    }
  }
  for (const proxy of internal.knownEvents) {
    try {
      proxy.unregisterOwner(owner);
    } catch (error) {
      internal.runtimeErrorReporter?.(error, {
        operation: "unregister-event-module",
        module,
      });
    }
  }
}

function releaseOwner(module: string, owner: string) {
  try {
    releaseOwnerRegistrations(module, owner);
  } finally {
    invalidateModuleContext(owner);
  }
}

Events.ModuleDestroyed.register((module) => {
  releaseOwner(module, getDestroyedOwner(module));
});

/**
 * Releases everything an owner that is not a module generation attached or
 * registered, and invalidates its context, as a module's destruction does.
 *
 * @internal Used by the core to retire an interface instance's own owner.
 */
export function ReleaseOwner(owner: string): void {
  releaseOwner(owner, owner);
}

/**
 * Where a module is loaded from: a `type` naming the loader, plus the optional
 * fields of the built-in source kinds (`local`, `git`, `package` and
 * `local-folder`). Fields outside that set are rejected, and a source known
 * only by its `type` is accepted.
 */
export type ModuleDefinitionSource = Omit<ModuleSource, "type"> & {
  type: string;
} & Partial<Omit<ModuleSourceLocal, "type">> &
  Partial<Omit<ModuleSourceGit, "type">> &
  Partial<Omit<ModuleSourcePackage, "type">> &
  Partial<Omit<ModuleSourceLocalFolder, "type">>;

/**
 * Configuration for defining a module to be loaded into the system.
 *
 * Contains all necessary information to locate, load, and configure a module.
 */
export interface ModuleDefinition {
  /**
   * Source location and type information for the module.
   * The type field indicates the loading mechanism to use.
   * Additional fields depend on the source type.
   */
  source: ModuleDefinitionSource;

  /**
   * Optional configuration data passed to the module during initialization.
   * The structure depends on what the specific module expects.
   */
  config?: unknown;

  /**
   * Runtime import override map with array values.
   * This differs intentionally from AntelopeModuleConfig.importOverrides,
   * the project-file contract used by defineConfig and SaveModuleDeclaration.
   */
  importOverrides?: Record<string, string[]>;

  /**
   * Optional list of exports that should not be exposed by this module.
   * Can be used to restrict what functionality a module provides.
   */
  disabledExports?: string[];
}

/**
 * Complete information about a loaded module in the system.
 *
 * Extends ModuleDefinition with runtime information about the module's state and location.
 */
export type ModuleInfo = Required<ModuleDefinition> & {
  /**
   * Current lifecycle status of the module.
   * - 'loaded': Module code has been loaded but not constructed
   * - 'constructed': Module instance exists but is not started
   * - 'active': Module is fully started and running
   * - 'unknown': Module status cannot be determined
   */
  status: "loaded" | "constructed" | "active" | "unknown";

  /**
   * File system path where the module is located.
   */
  localPath: string;
};

/**
 * List all loaded modules.
 *
 * Retrieves the identifiers of all modules currently loaded in the system,
 * regardless of their status.
 *
 * @returns Array of module IDs
 */
export const ListModules = InterfaceFunction<() => string[]>(
  "modules.ListModules",
);

/**
 * Retrieve the configuration and status information of a loaded module.
 *
 * Provides comprehensive information about a specific module, including its
 * configuration, status, and location.
 *
 * @param module The module ID to get information for
 * @returns Complete module information object
 */
export const GetModuleInfo = InterfaceFunction<(module: string) => ModuleInfo>(
  "modules.GetModuleInfo",
);

/**
 * Load a new module with the given ID and configuration.
 *
 * Loads the module code and optionally constructs and starts the module.
 * If the module is already loaded, this may update its configuration.
 *
 * @param module Unique identifier for the module
 * @param configuration Module configuration including source information
 * @param autostart Whether to automatically start the module after loading (default: false)
 */
export const LoadModule =
  InterfaceFunction<
    (
      module: string,
      configuration: ModuleDefinition,
      autostart?: boolean,
    ) => string[]
  >("modules.LoadModule");

/**
 * Start a loaded but inactive module.
 *
 * Transitions a module from 'loaded' or 'constructed' state to 'active'.
 * Has no effect if the module is already active.
 *
 * @param module The module ID to start
 * @throws Error if the module is not loaded or cannot be started
 */
export const StartModule = InterfaceFunction<(module: string) => void>(
  "modules.StartModule",
);

/**
 * Stop an active module.
 *
 * Transitions a module from 'active' state to 'constructed'.
 * Has no effect if the module is not active.
 *
 * @param module The module ID to stop
 * @throws Error if the module is not loaded or cannot be stopped
 */
export const StopModule =
  InterfaceFunction<(module: string) => void>("modules.StopModule");

/**
 * Destroy a stopped module.
 *
 * Releases all resources associated with the module instance.
 * The module remains loaded but transitions to 'loaded' state from 'constructed'.
 *
 * @param module The module ID to destroy
 * @throws Error if the module is active or not loaded
 */
export const DestroyModule = InterfaceFunction<(module: string) => void>(
  "modules.DestroyModule",
);

/**
 * Unload a module and retrigger its source mechanism.
 *
 * First stops and destroys the module if needed, then unloads the module code
 * and reloads it from the source. Useful for updating modules without restarting
 * the entire application.
 *
 * @param module The module ID to reload
 * @throws Error if the module cannot be reloaded
 */
export const ReloadModule = InterfaceFunction<(module: string) => void>(
  "modules.ReloadModule",
);

/**
 * A module as the project's configuration file declares it, under its key in
 * `modules`, with the shorthand forms expanded.
 */
export type ModuleDeclaration = Pick<
  AntelopeModuleConfig,
  "source" | "config" | "disabled" | "optional"
>;

/**
 * The fields of a module's declaration to write. A field left out keeps what
 * the file already holds.
 */
export type ModuleDeclarationChanges = Partial<ModuleDeclaration>;

/**
 * List the modules the project's configuration file declares, by key,
 * disabled ones included.
 *
 * @returns The declarations of the top-level `modules` of the file
 */
export const ListModuleDeclarations = InterfaceFunction<
  () => Record<string, ModuleDeclaration>
>("modules.ListModuleDeclarations");

/**
 * Write a module's declaration into the project's configuration file.
 *
 * Only the given fields of the module's entry are rewritten, and the entry is
 * added when the file has none: every other line of the file, comments and
 * expressions included, stays as it was. The running project is not
 * restarted for this write; the caller loads, stops or reloads the module
 * itself.
 *
 * @param module The module's key in `modules`
 * @param changes The fields to write
 * @throws Error if the file has no `modules` object it can edit, such as a
 *   configuration built by a function
 */
export const SaveModuleDeclaration = InterfaceFunction<
  (module: string, changes: ModuleDeclarationChanges) => void
>("modules.SaveModuleDeclaration");

/**
 * Remove a module's entry from the project's configuration file, leaving the
 * rest of the file as it was and the running project unrestarted.
 *
 * @param module The module's key in `modules`
 */
export const RemoveModuleDeclaration = InterfaceFunction<
  (module: string) => void
>("modules.RemoveModuleDeclaration");
