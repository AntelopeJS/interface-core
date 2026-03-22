import { defineConfig } from "./config";

export default defineConfig({
  name: "interface-core-test",
  cacheFolder: ".antelope/cache",
  modules: {},
  test: {
    folder: "dist/tests",
  },
});
