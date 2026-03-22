// Module source types

export interface ModuleSource {
  type: "local" | "git" | "package" | "local-folder";
  id?: string;
  ignoreCache?: boolean;
}

export type ModuleInstallCommand = string | string[];
export type ModuleWatchDir = string | string[];

export interface ModuleSourceLocal extends ModuleSource {
  type: "local";
  path: string;
  main?: string;
  watchDir?: ModuleWatchDir;
  installCommand?: ModuleInstallCommand;
}

export interface ModuleSourceGit extends ModuleSource {
  type: "git";
  remote: string;
  branch?: string;
  commit?: string;
  installCommand?: ModuleInstallCommand;
}

export interface ModuleSourcePackage extends ModuleSource {
  type: "package";
  package: string;
  version: string;
}

export interface ModuleSourceLocalFolder extends ModuleSource {
  type: "local-folder";
  path: string;
  watchDir?: ModuleWatchDir;
  installCommand?: ModuleInstallCommand;
}

// Config types

export interface AntelopeTestConfig {
  folder?: string;
  setup?: () =>
    | undefined
    | Partial<AntelopeConfig>
    | Promise<undefined | Partial<AntelopeConfig>>;
  cleanup?: () => void | Promise<void>;
}

export interface AntelopeConfig {
  name: string;
  cacheFolder?: string;
  modules?: Record<string, string | AntelopeModuleConfig>;
  logging?: AntelopeLogging;
  envOverrides?: Record<string, string | string[]>;
  environments?: Record<string, Partial<AntelopeConfig>>;
  test?: AntelopeTestConfig;
}

export interface ImportOverride {
  interface: string;
  source: string;
  id?: string;
}

export interface AntelopeModuleConfig {
  version?: string;
  source?:
    | ModuleSourceLocal
    | ModuleSourceGit
    | ModuleSourcePackage
    | ModuleSourceLocalFolder;
  config?: unknown;
  importOverrides?: ImportOverride[] | Record<string, string>;
  disabledExports?: string[];
}

export interface AntelopeLogging {
  enabled?: boolean;
  moduleTracking?: {
    enabled?: boolean;
    includes?: string[];
    excludes?: string[];
  };
  channelFilter?: Record<string, number | string>;
  formatter?: Record<string, string>;
  dateFormat?: string;
}

// defineConfig

export interface ConfigContext {
  env: string;
}

export type ConfigInput =
  | AntelopeConfig
  | ((ctx: ConfigContext) => AntelopeConfig | Promise<AntelopeConfig>);

export function defineConfig(input: ConfigInput): ConfigInput {
  return input;
}
