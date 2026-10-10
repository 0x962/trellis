import { pickErrors } from "../errors.ts";
import {
	WaveCreateInputSchema,
	WaveDeleteInputSchema,
	WaveDeleteOutputSchema,
	WaveListOutputSchema,
	WaveReorderInputSchema,
	WaveSummarySchema,
	WaveUpdateInputSchema,
} from "../schemas/wave.ts";
import { base } from "./base.ts";

const write = pickErrors(["PROJECT_ARCHIVED", "DUPLICATE"]);

// `{+wave}` matches a ref with its slashes, so
// `PATCH /api/waves/OP/routine-runtime/phase-1` reaches the wave.
// The router reads `{+name}` as the rest of the path and drops every
// segment after it. So a route never continues after an epic ref: `create`
// and `reorder` take the epic in the body, and `order` is a fixed segment
// that the router matches before `{+wave}`.
export const waves = {
	create: base
		.errors(write)
		.route({
			method: "POST",
			path: "/waves",
			successStatus: 201,
			summary: "Add a wave at the end of an epic",
		})
		.input(WaveCreateInputSchema)
		.output(WaveSummarySchema),
	update: base
		.errors(write)
		.route({ method: "PATCH", path: "/waves/{+wave}", summary: "Change the name or the slug" })
		.input(WaveUpdateInputSchema)
		.output(WaveSummarySchema),
	reorder: base
		.errors(pickErrors(["PROJECT_ARCHIVED", "WAVE_OUTSIDE_EPIC"]))
		.route({ method: "PUT", path: "/waves/order", summary: "Set the full wave order of an epic" })
		.input(WaveReorderInputSchema)
		.output(WaveListOutputSchema),
	delete: base
		.errors(pickErrors(["PROJECT_ARCHIVED", "AGENT_CANNOT_DELETE"]))
		.route({
			method: "DELETE",
			path: "/waves/{+wave}",
			summary: "Delete a wave and detach its tickets",
		})
		.input(WaveDeleteInputSchema)
		.output(WaveDeleteOutputSchema),
};
