import { z } from "zod";
import { PullRequestEvidenceSchema } from "./evidence.ts";
import { PullRequestSchema, PullRequestSummarySchema } from "./pullRequest.ts";
import { TicketIdentifierSchema } from "./ticket.ts";

export const ReviewOverviewSchema = z.object({
	pullRequest: PullRequestSchema.omit({ files: true }),
	ticket: z.object({ identifier: TicketIdentifierSchema, title: z.string() }).nullable(),
	summary: PullRequestSummarySchema.nullable(),
	evidence: PullRequestEvidenceSchema.nullable(),
});
export type ReviewOverview = z.infer<typeof ReviewOverviewSchema>;
