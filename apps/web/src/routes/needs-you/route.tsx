import { createFileRoute } from "@tanstack/react-router";
import { NeedsYouSortSchema, NeedsYouVisibilitySchema } from "@trellis/api";
import { z } from "zod";
import { NeedsYou } from "../../features/needs-you/NeedsYou";

export const Route = createFileRoute("/needs-you")({
	validateSearch: z.object({
		sort: NeedsYouSortSchema.optional().catch(undefined),
		visibility: NeedsYouVisibilitySchema.optional().catch(undefined),
	}),
	component: NeedsYou,
});
