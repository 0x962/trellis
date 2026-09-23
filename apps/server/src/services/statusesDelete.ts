import type { StatusDeleteOutputSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { z } from "zod";
import type { ServiceCtx } from "../context.ts";
import type { Tx } from "../db/tx.ts";
import { fail } from "../errors.ts";
import { resolveMutableProject, resolveStatus } from "./refs.ts";
import { emitTicketUpdates, moveTicketStatus, ticketsOn } from "./statusMoves.ts";
import { emitStatusesChanged, renumber, statusActivity } from "./statusSet.ts";

type StatusDeleteOutput = z.infer<typeof StatusDeleteOutputSchema>;

export type StatusDeleteInput = { project: string; status: string; moveTo?: string; force?: boolean };

// Deletes one status of a project. Its tickets move to `moveTo`, a status
// of the same set; without it a status with tickets stays. The set keeps at
// least one status. When the default goes, the lowest-position survivor
// becomes the default. The rows are renumbered without a gap.
const remove = async (ctx: ServiceCtx, tx: Tx, input: StatusDeleteInput): Promise<StatusDeleteOutput> => {
	const project = await resolveMutableProject(ctx, tx, input.project);
	const before = ctx.cache.statusesOf(project.id);
	const status = await resolveStatus(ctx, tx, { projectId: project.id, status: input.status });
	if (before.length === 1) throw fail("LAST_STATUS");
	const target =
		input.moveTo === undefined ? null : await resolveStatus(ctx, tx, { projectId: project.id, status: input.moveTo });
	const tickets = await ticketsOn(tx, sql`t.status_id = ${status.id}`);
	const moveTo = target === null || target.id === status.id ? null : target;
	if (tickets.length > 0 && moveTo === null) throw fail("STATUS_IN_USE", { count: tickets.length });
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
	await tx.execute(sql`DELETE FROM statuses WHERE id = ${status.id}`);
	const survivors = before.filter((other) => other.id !== status.id).map((other) => other.id);
	if (status.isDefault) {
		await tx.execute(sql`UPDATE statuses SET is_default = true WHERE id = ${survivors[0]}`);
	}
	await renumber(tx, survivors);
	await statusActivity(ctx, tx, project.id, "status.deleted", [
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
	emitStatusesChanged(ctx, project.id);
	return { deleted: status.id, moved: tickets.length };
};

export { remove as delete };
