import type { Check } from "@trellis/api";

// The check order the expanded row shows: every failing check first, then
// the rest in the order gh reported. A canceled check counts as a failure.
export const sortChecks = (_checks: readonly Check[]): Check[] => [];
