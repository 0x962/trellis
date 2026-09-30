import { type Epic, EpicRefInputSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { requireActor, type ServiceCtx } from "../../../context.ts";
import { rows } from "../../../db/queries/support.ts";
import type { Tx } from "../../../db/tx.ts";
import { resolveActorId } from "../../actorIdentity";
import { assertProjectActive } from "../../refs.ts";
import { updateMany } from "../../tickets/update.ts";
import { epicView } from "../epics.ts";
import { resolveEpic } from "../resolve.ts";

export async function cancel(ctx: ServiceCtx, tx: Tx, rawInput: unknown): Promise<Epic> {
	const input = EpicRefInputSchema.parse(rawInput);
	const existing = await resolveEpic(ctx, tx, input.epic);
	assertProjectActive(ctx, existing.project_id);
	const actor = requireActor(ctx);
	const members = await rows<{ id: string }>(
		tx,
		sql`SELECT t.id FROM tickets t JOIN statuses s ON s.id = t.status_id
			WHERE t.epic_id = ${existing.id} AND s.category NOT IN ('done', 'canceled')
			ORDER BY t.number`,
	);
	if (members.length > 0) {
		await updateMany(ctx, tx, { tickets: members.map((member) => member.id), status: "category:canceled" });
	}
	if (existing.canceled_at === null || members.length > 0) {
		const actorId = await resolveActorId(ctx, tx, actor);
		await tx.execute(sql`UPDATE epics SET canceled_at = COALESCE(canceled_at, ${ctx.now}),
			autopilot = jsonb_set(autopilot, '{enabled}', 'false'::jsonb),
			actor_id = ${actorId}, actor_name = ${actor.name}, actor_kind = ${actor.kind}, updated_at = ${ctx.now}
			WHERE id = ${existing.id}`);
		ctx.emit({ type: "epics.changed", projectId: existing.project_id, id: existing.id });
	}
	return epicView(ctx, tx, existing.id);
}
