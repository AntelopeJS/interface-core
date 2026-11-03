import { CALL_SCENARIOS } from "./scenarios-calls.ts";
import { MISC_SCENARIOS } from "./scenarios-misc.ts";
import { SURFACE_SCENARIOS } from "./scenarios-surface.ts";

/** Every scenario script by name. */
export const SCENARIOS = { ...CALL_SCENARIOS, ...SURFACE_SCENARIOS, ...MISC_SCENARIOS };
