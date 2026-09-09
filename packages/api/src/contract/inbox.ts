import { InboxGetInputSchema, InboxSchema } from "../schemas/inbox.ts";
import { base } from "./base.ts";

export const inbox = {
	get: base
		.route({ method: "GET", path: "/inbox", summary: "Read the Needs you sections" })
		.input(InboxGetInputSchema)
		.output(InboxSchema),
};
