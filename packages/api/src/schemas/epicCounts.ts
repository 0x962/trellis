import { z } from "zod";
import { CountSchema } from "./primitives.ts";

// Epics and waves share ticket counts. This module lets both schemas read
// those counts without a circular import.

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

// Explicit cancellation sets `canceled`. Other epics are `done` when every
// ticket is done or canceled, and `open` when empty or with unfinished work.
export const EpicStateSchema = z.enum(["open", "done", "canceled"]);
export type EpicState = z.infer<typeof EpicStateSchema>;
