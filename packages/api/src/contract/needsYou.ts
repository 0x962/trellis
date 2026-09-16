import { z } from "zod";
import {
	NeedsYouListInputSchema,
	NeedsYouListOutputSchema,
	NeedsYouSummarySchema,
	NeedsYouUpdateInputSchema,
} from "../schemas/needsYou.ts";
import { base } from "./base.ts";

export const needsYou = {
	list: base
		.route({ method: "GET", path: "/needs-you", summary: "List personal inbox items" })
		.input(NeedsYouListInputSchema)
		.output(NeedsYouListOutputSchema),
	summary: base
		.route({ method: "GET", path: "/needs-you/summary", summary: "Count personal inbox items" })
		.input(z.object({}))
		.output(NeedsYouSummarySchema),
	update: base
		.route({ method: "PATCH", path: "/needs-you/{id}", summary: "Snooze, ignore, or restore an inbox item" })
		.input(NeedsYouUpdateInputSchema)
		.output(z.object({ id: z.string() })),
};
