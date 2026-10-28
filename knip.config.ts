import { antelopeKnipConfig } from "@antelopejs/tooling-configs/knip";

export default {
  ...antelopeKnipConfig(),
  /**
   * `Logging` is exported both named and as the default, and consumers across
   * the ecosystem use both spellings, so the duplicate is published contract.
   */
  ignoreIssues: { "src/logging/index.ts": ["duplicates"] },
};
