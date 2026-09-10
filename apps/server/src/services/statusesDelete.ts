import type { StatusClearOutputSchema, StatusDeleteOutputSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { z } from "zod";
import type { ServiceCtx } from "../context.ts";
import type { Tx } from "../db/tx.ts";
import { fail } from "../errors.ts";
import { resolveMutableProject, resolveStatus } from "./refs.ts";
import { emitTicketUpdates, moveTicketStatus, remapScope, ticketsOn } from "./statusRemap.ts";
import { emitStatusesChanged, renumber, statusActivity } from "./statusSet.ts";
import { assertAgentMayComplete } from "./tickets/rules.ts";

type StatusDeleteOutput = z.infer<typeof StatusDeleteOutputSchema>;
type StatusClearOutput = z.infer<typeof StatusClearOutputSchema>;

export type StatusDeleteInput = { project: string; status: string; moveTo?: string; force?: boolean };

// Deletes one status of the owner's set. Its tickets move to `moveTo`, a
// status of the same set; without it a status with tickets stays. The set
// keeps at least one status. When the default goes, the lowest-position
// survivor becomes the default. The rows are renumbered without a gap. The
// move follows the agent rule of a ticket move: an agent needs `force` to
// move tickets into a done status.
const remove = async (ctx: ServiceCtx, tx: Tx, input: StatusDeleteInput): Promise<StatusDeleteOutput> => {
	const project = await resolveMutableProject(ctx, tx, input.project);
	const effective = ctx.cache.effectiveStatuses(project.id);
	const status = await resolveStatus(ctx, tx, { projectId: project.id, status: input.status });
	if (effective.statuses.length === 1) throw fail("LAST_STATUS");
	const target =
		input.moveTo === undefined ? null : await resolveStatus(ctx, tx, { projectId: project.id, status: input.moveTo });
	const tickets = await ticketsOn(tx, sql`t.status_id = ${status.id}`);
	const moveTo = target === null || target.id === status.id ? null : target;
	if (tickets.length > 0 && moveTo === null) throw fail("STATUS_IN_USE", { count: tickets.length });
	if (tickets.length > 0) assertAgentMayComplete(ctx, moveTo as NonNullable<typeof moveTo>, input.force);
	const batchId = ulid();
	for (const ticket of tickets) {
		await moveTicketStatus(ctx, tx, {
			ticket,
			to: moveTo as NonNullable<typeof moveTo>,
			batchId,
			action: "ticket.updated",
			userVisible: true,
		});
	}
	const owner = effective.ownerId;
	await tx.execute(sql`DELETE FROM statuses WHERE id = ${status.id}`);
	const survivors = effective.statuses.filter((other) => other.id !== status.id).map((other) => other.id);
	if (status.isDefault) {
		await tx.execute(sql`UPDATE statuses SET is_default = true WHERE id = ${survivors[0]}`);
	}
	await renumber(tx, survivors);
	await statusActivity(ctx, tx, owner, "status.deleted", [
		{
			field: null,
			from: status.name,
			to: null,
			meta: { statusId: status.id, moved: tickets.length, movedTo: moveTo?.id ?? null },
		},
	]);
	await ctx.cache.rebuild(tx);
	await emitTicketUpdates(
		ctx,
		tx,
		tickets.map((ticket) => ticket.id),
		batchId,
	);
	emitStatusesChanged(ctx, owner);
	return { deleted: status.id, moved: tickets.length };
};

export { remove as delete };

// Drops the own set of a sub-project, so it inherits the nearest owner's set
// again. The tickets of its scope move onto that set first, so no ticket
// points at a row the delete removes. A root keeps its set.
export const clear = async (ctx: ServiceCtx, tx: Tx, input: { project: string }): Promise<StatusClearOutput> => {
	const project = await resolveMutableProject(ctx, tx, input.project);
	if (project.parentId === null) throw fail("ROOT_STATUSES");
	const effective = ctx.cache.effectiveStatuses(project.id);
	if (effective.ownerId !== project.id) return { inheritedFrom: effective.ownerId, remapped: 0 };
	const newOwner = ctx.cache.effectiveStatuses(project.parentId).ownerId;
	const remapped = await remapScope(ctx, tx, { projectId: project.id, toOwnerId: newOwner });
	await tx.execute(sql`DELETE FROM statuses WHERE project_id = ${project.id}`);
	await statusActivity(ctx, tx, project.id, "statuses.cleared", [
		{ field: null, from: null, to: null, meta: { inheritedFrom: newOwner, remapped } },
	]);
	await ctx.cache.rebuild(tx);
	emitStatusesChanged(ctx, project.id);
	return { inheritedFrom: newOwner, remapped };
};
