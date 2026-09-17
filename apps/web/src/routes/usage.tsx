import { createFileRoute } from "@tanstack/react-router";
import { UsageDaysSchema, UsageGroupBySchema, UsageMetricSchema } from "@trellis/api";
import { z } from "zod";
import { UsagePage } from "../features/usage/UsagePage";

// The range, the metric, the grouping, the selected row, and the selected
// day live in the URL, so a link to the page opens the same view.
export const Route = createFileRoute("/usage")({
	validateSearch: z.object({
		days: UsageDaysSchema.optional().catch(undefined),
		metric: UsageMetricSchema.optional().catch(undefined),
		group: UsageGroupBySchema.optional().catch(undefined),
		row: z.string().optional().catch(undefined),
		day: z.string().optional().catch(undefined),
	}),
	component: UsagePage,
});
