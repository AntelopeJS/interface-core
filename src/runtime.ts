import { InterfaceFunction } from ".";

/**
 * Information about the runtime environment of the running Antelope project.
 */
export interface RuntimeInfo {
  /**
   * Whether the project is running in development mode (`ajs project dev`).
   * False for `ajs project start` and `ajs project run`.
   */
  dev: boolean;

  /**
   * Absolute path to the root of the running project.
   */
  projectPath: string;

  /**
   * Name of the active configuration environment.
   */
  env: string;
}

/**
 * Network endpoint exposed by a development server.
 */
export interface DevServerEndpoint {
  /**
   * Protocol of the endpoint (e.g. 'http', 'https').
   */
  protocol: string;

  /**
   * Host the endpoint is bound to (e.g. 'localhost').
   */
  host: string;

  /**
   * Port the endpoint is listening on.
   */
  port: number;
}

/**
 * Entry for a single registered development server in the dev registry file.
 */
export interface DevServerEntry {
  /**
   * Endpoints the server is listening on.
   */
  endpoints: DevServerEndpoint[];
}

/**
 * Shape of the dev registry file written at {@link DEV_REGISTRY_PATH}.
 *
 * The file is only valid while the process identified by `pid` exists.
 * If that process is gone, the file is orphaned and must be ignored or overwritten.
 */
export interface DevServerRegistry {
  /**
   * PID of the process that owns the registry file.
   */
  pid: number;

  /**
   * ISO 8601 timestamp of when the process started.
   */
  startedAt: string;

  /**
   * Registered development servers, keyed by server name.
   */
  servers: Record<string, DevServerEntry>;
}

/**
 * Project-relative path of the dev registry file.
 */
export const DEV_REGISTRY_PATH = ".antelope/dev.json";

/**
 * Retrieve information about the runtime environment of the running project.
 *
 * @returns Runtime information including dev mode, project path and environment
 */
export const GetRuntimeInfo = InterfaceFunction<() => RuntimeInfo>();

/**
 * Register a development server and the endpoints it is listening on.
 *
 * In development mode, the registration is merged into the dev registry file
 * at {@link DEV_REGISTRY_PATH} in the project root, and the file is removed
 * when the project shuts down. Outside development mode, this is a no-op.
 *
 * @param name Unique name of the server (e.g. 'api')
 * @param endpoints Endpoints the server is listening on
 */
export const RegisterDevServer =
  InterfaceFunction<(name: string, endpoints: DevServerEndpoint[]) => void>();
