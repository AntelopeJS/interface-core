export interface InterfaceConnection {
  id?: string;
  path: string;
}

function addToMapArray(map: Map<string, Array<any>>, key: string, value: any) {
  if (!map.has(key)) {
    map.set(key, []);
  }
  map.get(key)?.push(value);
}

/** @internal */
export const internal = {
  moduleByFolder: [] as { dir: string; id: string }[],
  testStubMode: false,
  knownAsync: new Map<string, Array<any>>(),
  knownRegisters: new Map<string, Array<any>>(),
  knownEvents: [] as any[],
  interfaceConnections: {} as Record<
    string,
    Record<string, InterfaceConnection[]>
  >,
  asyncContextReporter: undefined as
    | ((trace: NodeJS.CallSite[]) => void)
    | undefined,

  addAsyncProxy(module: string, proxy: any) {
    addToMapArray(internal.knownAsync, module, proxy);
  },

  addRegisteringProxy(module: string, proxy: any) {
    addToMapArray(internal.knownRegisters, module, proxy);
  },
};
