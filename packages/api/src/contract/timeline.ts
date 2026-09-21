import { TimelineListInputSchema, TimelineListOutputSchema } from "../schemas/activity.ts";
import { base } from "./base.ts";

export const timeline = {
	list: base
		.route({
			method: "GET",
			path: "/tickets/{ticket}/timeline",
			summary: "Read the activity of a ticket, newest first",
		})
		.input(TimelineListInputSchema)
		.output(TimelineListOutputSchema),
};
