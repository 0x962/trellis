import { pickErrors } from "../errors.ts";
import {
	MilestoneCreateInputSchema,
	MilestoneDeleteInputSchema,
	MilestoneDeleteOutputSchema,
	MilestoneListOutputSchema,
	MilestoneReorderInputSchema,
	MilestoneSummarySchema,
	MilestoneUpdateInputSchema,
} from "../schemas/milestone.ts";
import { base } from "./base.ts";

const write = pickErrors(["PROJECT_ARCHIVED", "DUPLICATE"]);

// `{+milestone}` matches a ref with its slashes, so
// `PATCH /api/milestones/OP/routine-runtime/phase-1` reaches the milestone.
// The router reads `{+name}` as the rest of the path and drops every
// segment after it. So a route never continues after an epic ref: `create`
// and `reorder` take the epic in the body, and `order` is a fixed segment
// that the router matches before `{+milestone}`.
export const milestones = {
	create: base
		.errors(write)
		.route({
			method: "POST",
			path: "/milestones",
			successStatus: 201,
			summary: "Add a milestone at the end of an epic",
		})
		.input(MilestoneCreateInputSchema)
		.output(MilestoneSummarySchema),
	update: base
		.errors(write)
		.route({ method: "PATCH", path: "/milestones/{+milestone}", summary: "Change the name or the slug" })
		.input(MilestoneUpdateInputSchema)
		.output(MilestoneSummarySchema),
	reorder: base
		.errors(pickErrors(["PROJECT_ARCHIVED", "MILESTONE_OUTSIDE_EPIC"]))
		.route({ method: "PUT", path: "/milestones/order", summary: "Set the full milestone order of an epic" })
		.input(MilestoneReorderInputSchema)
		.output(MilestoneListOutputSchema),
	delete: base
		.errors(pickErrors(["PROJECT_ARCHIVED", "AGENT_CANNOT_DELETE"]))
		.route({
			method: "DELETE",
			path: "/milestones/{+milestone}",
			summary: "Delete a milestone and detach its tickets",
		})
		.input(MilestoneDeleteInputSchema)
		.output(MilestoneDeleteOutputSchema),
};
