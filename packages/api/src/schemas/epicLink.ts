import { z } from "zod";
import { UlidSchema } from "./primitives.ts";

// The epic fields a ticket row carries. `ref` is the canonical epic ref,
// `OP/routine-runtime`. This schema sits in its own module because the
// ticket schema reads it and the epic schema reads the ticket schema.
export const EpicLinkSchema = z.object({
	id: UlidSchema,
	ref: z.string().min(1),
	name: z.string().min(1),
});
export type EpicLink = z.infer<typeof EpicLinkSchema>;
