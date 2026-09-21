import { z } from "zod";
import { TicketRefStringSchema } from "../refs.ts";
import { IsoDateTimeSchema } from "./primitives.ts";

export const BriefGetInputSchema = z.strictObject({
	ticket: TicketRefStringSchema,
});

// The markdown an agent starts from: the ticket, its PRs, and the CLI cheat
// sheet.
export const BriefSchema = z.object({
	markdown: z.string(),
	generatedAt: IsoDateTimeSchema,
});
export type Brief = z.infer<typeof BriefSchema>;
