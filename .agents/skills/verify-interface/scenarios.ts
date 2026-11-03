import { CALL_SCENARIOS } from "./scenarios-calls.ts";
import { API_SCENARIOS } from "./scenarios-api.ts";
import { DETAIL_SCENARIOS } from "./scenarios-detail.ts";
import { MISC_SCENARIOS } from "./scenarios-misc.ts";
import { SURFACE_SCENARIOS } from "./scenarios-surface.ts";

/** Every scenario script by name. */
export const SCENARIOS = { ...CALL_SCENARIOS, ...SURFACE_SCENARIOS, ...MISC_SCENARIOS, ...DETAIL_SCENARIOS, ...API_SCENARIOS };
