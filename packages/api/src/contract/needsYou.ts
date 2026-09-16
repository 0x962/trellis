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
		.route({ method: "POST", path: "/needs-you/list", summary: "List personal inbox items" })
		.input(NeedsYouListInputSchema)
		.output(NeedsYouListOutputSchema),
	summary: base
		.route({ method: "POST", path: "/needs-you/summary", summary: "Count personal inbox items" })
		.input(z.object({}))
		.output(NeedsYouSummarySchema),
	update: base
		.route({ method: "POST", path: "/needs-you/update", summary: "Snooze, ignore, or restore an inbox item" })
		.input(NeedsYouUpdateInputSchema)
		.output(z.object({ id: z.string() })),
};
