import { antelopeKnipConfig } from "@antelopejs/tooling-configs/knip";

export default {
  ...antelopeKnipConfig(),
  // src/logging/index.ts exports the Logging namespace both named and as the
  // default, and consumers across the ecosystem use both spellings, so the
  // duplicate is published contract rather than an oversight. Knip's `tags`
  // filter does not reach the duplicate-export check, so the issue is silenced
  // by path: the check stays on for the rest of the repository.
  ignoreIssues: { "src/logging/index.ts": ["duplicates"] },
};
