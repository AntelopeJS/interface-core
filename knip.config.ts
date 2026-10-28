import { antelopeKnipConfig } from "@antelopejs/tooling-configs/knip";

const config = antelopeKnipConfig();

/**
 * `Logging` is exported both named and as the default, and consumers across
 * the ecosystem use both spellings, so the duplicate is published contract.
 */
config.ignoreIssues = { "src/logging/index.ts": ["duplicates"] };

export default config;
