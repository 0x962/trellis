import { sql } from "drizzle-orm";
import type { ServiceCtx } from "../../context.ts";
import type { Tx } from "../../db/tx.ts";
import { fail } from "../../errors.ts";
import { resolveEpicForTicket } from "../epics/resolve.ts";
import { epicRefOf } from "../epics/rows.ts";
import { resolveMilestoneForTicket } from "../milestones/resolve.ts";
import { milestoneRefOf } from "../milestones/rows.ts";

// The epic and the milestone of one ticket, each as its id and its canonical
// ref. A ticket with a milestone always has the epic of that milestone.
export type Placement = {
	epicId: string | null;
	epicRef: string | null;
	milestoneId: string | null;
	milestoneRef: string | null;
};

// A ref is a canonical string. `null` clears the field, and an absent field
// asks for no change.
type PlacementInput = { epic?: string | null | undefined; milestone?: string | null | undefined };

const noMilestone = { milestoneId: null, milestoneRef: null };

// The placement a ticket of `rootId` has after a write that holds `input`.
// A `milestone` value places the ticket in the epic of that milestone, so
// one call places a ticket. An `epic` value beside it must name that same
// epic (MILESTONE_OUTSIDE_EPIC). An `epic` value that differs from the
// current epic, or `epic: null`, clears the milestone, because the milestone
// belongs to the epic that the ticket leaves.
export const resolvePlacement = async (
	ctx: ServiceCtx,
	tx: Tx,
	rootId: string,
	current: Placement,
	input: PlacementInput,
): Promise<Placement> => {
	if (typeof input.milestone === "string") {
		const milestone = await resolveMilestoneForTicket(ctx, tx, rootId, input.milestone);
		if (input.epic !== undefined) {
			const named = input.epic === null ? null : await resolveEpicForTicket(ctx, tx, rootId, input.epic);
			if (named?.id !== milestone.epic_id) throw fail("MILESTONE_OUTSIDE_EPIC");
		}
		return {
			epicId: milestone.epic_id,
			epicRef: epicRefOf({ root_key: milestone.root_key, slug: milestone.epic_slug }),
			milestoneId: milestone.id,
			milestoneRef: milestoneRefOf(milestone),
		};
	}
	let next = current;
	if (input.epic !== undefined) {
		const epic = input.epic === null ? null : await resolveEpicForTicket(ctx, tx, rootId, input.epic);
		if ((epic?.id ?? null) !== current.epicId) {
			next = { epicId: epic?.id ?? null, epicRef: epic === null ? null : epicRefOf(epic), ...noMilestone };
		}
	}
	if (input.milestone === null) next = { ...next, ...noMilestone };
	return next;
};

// The activity values and the SET clause of each placement field that
// differs between `from` and `to`, the epic first.
export const placementChanges = (from: Placement, to: Placement) => [
	...(from.epicId === to.epicId
		? []
		: [
				{
					field: "epic",
					from: from.epicRef,
					to: to.epicRef,
					meta: { fromId: from.epicId, toId: to.epicId },
					set: sql`epic_id = ${to.epicId}`,
				},
			]),
	...(from.milestoneId === to.milestoneId
		? []
		: [
				{
					field: "milestone",
					from: from.milestoneRef,
					to: to.milestoneRef,
					meta: { fromId: from.milestoneId, toId: to.milestoneId },
					set: sql`milestone_id = ${to.milestoneId}`,
				},
			]),
];
