import { createFileRoute } from "@tanstack/react-router";
import { UsageDaysInputSchema, UsageGroupBySchema, UsageMetricSchema } from "@trellis/api";
import { z } from "zod";
import { UsagePage } from "../features/usage/UsagePage";

// The active tab and the agent usage filters live in the URL, so a link to
// this route opens the same view.
export const usageSearchSchema = z.object({
	tab: z.enum(["agent", "system"]).optional().catch(undefined),
	days: UsageDaysInputSchema.optional().catch(undefined),
	metric: UsageMetricSchema.optional().catch(undefined),
	group: UsageGroupBySchema.optional().catch(undefined),
	row: z.string().optional().catch(undefined),
	day: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/)
		.optional()
		.catch(undefined),
});

export const Route = createFileRoute("/usage")({
	validateSearch: usageSearchSchema,
	component: UsagePage,
});
