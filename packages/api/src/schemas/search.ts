import { z } from "zod";
import { ProjectRefStringSchema } from "../refs.ts";
import { PageSummarySchema } from "./page.ts";
import { ProjectSummarySchema } from "./project.ts";
import { TicketSummarySchema } from "./ticket.ts";

export const SearchQuerySchema = z.strictObject({
	q: z.string().min(1, "Enter the text to search for."),
	project: ProjectRefStringSchema.optional(),
	rankProject: ProjectRefStringSchema.optional(),
	limit: z.coerce
		.number()
		.int("Enter a whole number for the limit.")
		.min(1, "Enter a limit of 1 to 50.")
		.max(50, "Enter a limit of 1 to 50.")
		.default(20),
});
export type SearchQueryInput = z.input<typeof SearchQuerySchema>;

export const SearchOutputSchema = z.object({
	tickets: z.array(TicketSummarySchema),
	pages: z.array(PageSummarySchema),
	projects: z.array(ProjectSummarySchema),
});
export type SearchOutput = z.infer<typeof SearchOutputSchema>;
