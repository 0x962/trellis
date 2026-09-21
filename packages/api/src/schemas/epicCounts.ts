import { z } from "zod";
import { CountSchema } from "./primitives.ts";

// The counts and the state that an epic and a wave both derive from
// their tickets. These schemas sit in their own module because the epic
// schema reads the wave schema, and the wave schema reads them.

// The tickets by status category. `total` is the sum of the five.
export const EpicCountsSchema = z.object({
	total: CountSchema,
	todo: CountSchema,
	started: CountSchema,
	review: CountSchema,
	done: CountSchema,
	canceled: CountSchema,
});
export type EpicCounts = z.infer<typeof EpicCountsSchema>;

// `done` when the record has at least one ticket and every ticket is done or
// canceled. `open` otherwise, so a record with no ticket is open.
export const EpicStateSchema = z.enum(["open", "done"]);
export type EpicState = z.infer<typeof EpicStateSchema>;
