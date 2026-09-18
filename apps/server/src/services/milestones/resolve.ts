import { MilestoneRefSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import type { ServiceCtx } from "../../context.ts";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { fail } from "../../errors.ts";
import { assertProjectActive } from "../refs.ts";
import { milestoneSelect, type RawMilestone } from "./rows.ts";

// A milestone ref is a ULID or `KEY/epic-slug/milestone-slug`, in any letter
// case.
export const resolveMilestone = async (_ctx: ServiceCtx, tx: Tx, ref: string): Promise<RawMilestone> => {
	const parsed = MilestoneRefSchema.safeParse(ref);
	if (!parsed.success) throw fail("NOT_FOUND", { kind: "milestone", ref });
	const canonical = MilestoneRefSchema.canonicalize(ref);
	const where =
		parsed.data.kind === "ulid"
			? sql`m.id = ${parsed.data.id}`
			: sql`root.key = ${parsed.data.key} AND e.slug = ${parsed.data.epicSlug} AND m.slug = ${parsed.data.slug}`;
	const found = await rows<RawMilestone>(tx, sql`${milestoneSelect} WHERE ${where}`);
	if (found.length === 0) throw fail("NOT_FOUND", { kind: "milestone", ref: canonical });
	return found[0]!;
};

// The milestone a ticket of `rootId` can join. The milestone sits in the
// same root, and the project of its epic accepts a mutation. The foreign key
// on `tickets.milestone_id` cannot hold the root rule, so the service holds
// it.
export const resolveMilestoneForTicket = async (ctx: ServiceCtx, tx: Tx, rootId: string, ref: string) => {
	const milestone = await resolveMilestone(ctx, tx, ref);
	if (milestone.root_id !== rootId) throw fail("CROSS_ROOT_MOVE");
	assertProjectActive(ctx, milestone.epic_project_id);
	return milestone;
};
