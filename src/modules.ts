import {
  captureModuleContext,
  getModuleContext,
  getModuleOwners,
  internal,
  invalidateModuleContext,
  type ModuleExecutionContext,
  peekModuleContext,
  type RuntimeCleanup,
  runWithCapturedModuleContext,
  runWithModuleContext,
} from "./internal";
import { EventProxy, InterfaceFunction } from "./proxies";

type ModuleCallback<A extends any[] = any[], R = any> = (...args: A) => R;

/**
 * Runs work with module ownership and provider routing across asynchronous work.
 *
 * This is an infrastructure API for AntelopeJS Core and custom module loaders.
 * Application modules should rely on the context installed by Core and use
 * `importOverrides` to select providers instead of calling this function.
 */
export function RunWithModuleContext<T>(
  context: ModuleExecutionContext,
  callback: () => T,
): T {
  return runWithModuleContext(context, callback);
}

/**
 * Returns the active module execution context, if one exists.
 *
 * This is intended for framework and interface infrastructure. Application
 * modules do not need to inspect their execution context during normal use.
 */
export function GetModuleContext(): ModuleExecutionContext | undefined {
  return getModuleContext();
}

/**
 * Binds a callback to the active module generation and provider routes.
 *
 * Interface authors should bind callbacks received from a consumer when a
 * provider will invoke them from its own execution context, either immediately
 * or later. Ordinary module lifecycle and interface calls are already managed
 * by Core and the proxy runtime and do not need explicit binding.
 */
export function BindToCurrentModuleContext<T extends ModuleCallback>(
  callback: T,
): T {
  const context = captureModuleContext();
  if (!context) {
    return callback;
  }
  const bound = function (
    this: ThisParameterType<T>,
    ...args: Parameters<T>
  ): ReturnType<T> {
    return runWithCapturedModuleContext(context, () =>
      callback.apply(this, args),
    );
  };
  Object.defineProperty(bound, "name", {
    configurable: true,
    value: callback.name,
  });
  return bound as T;
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

function getDestroyedOwners(module: string): string[] {
  const context = peekModuleContext();
  if (context?.module === module) {
    return [context.owner ?? module];
  }
  return [...new Set([module, ...getModuleOwners(module)])];
}

function cleanupDestroyedOwner(module: string, owner: string) {
  invalidateModuleContext(owner);
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

Events.ModuleDestroyed.register((module) => {
  getDestroyedOwners(module).forEach((owner) => {
    cleanupDestroyedOwner(module, owner);
  });
});

/**
 * Configuration for defining a module to be loaded into the system.
 *
 * Contains all necessary information to locate, load, and configure a module.
 */
export interface ModuleDefinition {
  /**
   * Source location and type information for the module.
   * The type field indicates the loading mechanism to use (e.g., 'file', 'npm').
   * Additional fields depend on the source type.
   */
  source: { type: string } & Record<string, any>;

  /**
   * Optional configuration data passed to the module during initialization.
   * The structure depends on what the specific module expects.
   */
  config?: unknown;

  /**
   * Optional mapping of import paths to alternative paths.
   * Can be used to redirect imports to different modules than requested.
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
