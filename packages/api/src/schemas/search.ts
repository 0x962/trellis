import { z } from "zod";
import { ProjectRefStringSchema } from "../refs.ts";
import { ProjectSummarySchema } from "./project.ts";
import { TicketSummarySchema } from "./ticket.ts";

export const SearchQuerySchema = z.strictObject({
	q: z.string().min(1),
	project: ProjectRefStringSchema.optional(),
	limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type SearchQueryInput = z.input<typeof SearchQuerySchema>;

export const SearchOutputSchema = z.object({
	tickets: z.array(TicketSummarySchema),
	projects: z.array(ProjectSummarySchema),
});
export type SearchOutput = z.infer<typeof SearchOutputSchema>;
