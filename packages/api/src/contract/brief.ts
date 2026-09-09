import { BriefGetInputSchema, BriefSchema } from "../schemas/brief.ts";
import { base } from "./base.ts";

export const brief = {
	get: base
		.route({ method: "GET", path: "/tickets/{ticket}/brief", summary: "Read the markdown brief an agent starts from" })
		.input(BriefGetInputSchema)
		.output(BriefSchema),
};
