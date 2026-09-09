import { z } from "zod";
import { ProjectRefStringSchema } from "../refs.ts";
import { CountSchema } from "./primitives.ts";
import { TicketSummarySchema } from "./ticket.ts";

export const InboxGetInputSchema = z.strictObject({
	project: ProjectRefStringSchema.optional(),
});
export type InboxGetInput = z.input<typeof InboxGetInputSchema>;

// Each section holds at most 100 rows; `total` is the whole section.
export const InboxSectionSchema = z.object({
	items: z.array(TicketSummarySchema),
	total: CountSchema,
});
export type InboxSection = z.infer<typeof InboxSectionSchema>;

export const InboxSchema = z.object({
	review: InboxSectionSchema,
	failingCi: InboxSectionSchema,
	stalled: InboxSectionSchema,
	doneByAgentsToday: InboxSectionSchema,
});
export type Inbox = z.infer<typeof InboxSchema>;
