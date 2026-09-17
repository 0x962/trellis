import { z } from "zod";
import { HarnessPresetSchema } from "../harness/harness.ts";
import { base } from "./base.ts";

export const models = {
	list: base
		.route({
			method: "GET",
			path: "/models",
			summary: "List canonical model IDs. Filter by harness before you select a model for an assignment.",
		})
		.input(z.strictObject({ harness: HarnessPresetSchema.optional() }))
		.output(z.array(z.object({ id: z.string(), name: z.string() }))),
};
