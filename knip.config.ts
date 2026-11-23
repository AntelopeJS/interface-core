import { antelopeKnipConfig } from "@antelopejs/tooling-configs/knip";

/**
 * `Logging` is exported both named and as the default, and consumers across
 * the ecosystem use both spellings, so the duplicate is published contract.
 */
const loggingDuplicateIssues = { "src/logging/index.ts": ["duplicates"] };

const config = antelopeKnipConfig();
config.ignoreIssues = loggingDuplicateIssues;

export default config;
